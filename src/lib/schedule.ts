/**
 * The scheduling engine. Pure functions only — no Vue imports, no side effects — so
 * the whole thing is trivially testable and can be reasoned about independently of
 * the UI.
 *
 * An event is a list of days. A one-day qualifier is simply the one-day case of that
 * model: every day has its own clock, its own opening sequence, and whichever match
 * blocks are assigned to it. Two-day regional championships and premier events — eight
 * or more qualification matches per team, judging that fills a day on its own — are the
 * reason the list exists.
 *
 * Times on a `Block` are minutes since midnight *of that block's own day*, with `day`
 * saying which day that is. Comparing two blocks that might sit on different days means
 * going through `absMinute`.
 */

import {
  allianceCountForTeams,
  DEFAULT_PLAYOFF_TIMING,
  MATCH_PLAY_SECONDS,
  playoffMinutes,
  playoffTimeline,
  qualMatchCount,
  surrogateCount,
  TEAMS_PER_MATCH,
  type AllianceCount,
  type PlayoffTiming,
} from './manual'
import { addDaysIso, parseTime } from './format'

/** Used to fold a (day, clock time) pair into one comparable number. */
const MINUTES_PER_DAY = 1440

/* ------------------------------------------------------------------- Config */

/**
 * One day of the event. The day list is what makes an event multi-day, and everything
 * that is genuinely per-day lives here rather than on the event: a second day has its
 * own start time, its own pits-open window, its own drivers meeting, and its own target
 * finish.
 */
export type EventDay = {
  id: string
  /** "Day 1", "Friday — Judging & Practice". Shown wherever the day is named. */
  label: string
  /** "YYYY-MM-DD". */
  date: string
  /** "HH:MM" — when this day starts (pits open / check-in). */
  startTime: string
  /** "HH:MM" — this day is flagged if it runs past this. */
  targetEndTime: string
  /** The opening pits-open window, before the day's first scheduled activity. */
  openMinutes: number
  /** Drivers meeting, run immediately before this day's opening ceremony. */
  driversMeetingMinutes: number
  openingCeremonyMinutes: number
}

/**
 * How a match block's size is determined:
 *   'count'     — a fixed number of matches
 *   'remaining' — absorbs whatever the sized blocks leave over
 *   'window'    — runs until a wall-clock end time, the way FTC Live lets you lay out a
 *                 day; the match count falls out of the available span and cycle time
 *
 * A block's start is never specified: it's wherever its day has got to by the time the
 * block is reached, which is determined by everything before it on that day. Only the
 * end is the director's to choose.
 */
export type BlockSizing = 'count' | 'remaining' | 'window'

export type MatchBlock = {
  id: string
  label: string
  /** Index into `EventConfig.days`. Blocks run in day order, then in list order. */
  day: number
  sizing: BlockSizing
  /** Used when sizing is 'count'. */
  matchCount: number
  /** "HH:MM", used when sizing is 'window'. The block runs until this time. */
  endTime: string
  /** Minutes per match, independent per block. */
  cycleMinutes: number
  breakAfter: { label: string; minutes: number } | null
}

/** A block's size and placement, once the event's layout is known. */
export type ResolvedBlock = {
  day: number
  count: number
  /** Minutes since midnight of `day`. */
  start: number
  end: number
}

export type JudgingMode = 'dedicated' | 'concurrent'

export type EventConfig = {
  eventName: string

  /** At least one. Everything with a clock time hangs off one of these. */
  days: EventDay[]

  numTeams: number
  qualsPerTeam: number
  /**
   * Number of competition fields. Only one MATCH is ever played at a time; extra
   * fields let the next one be reset and staged in parallel, which lowers the
   * achievable cycle time. This value therefore only drives a *suggestion*.
   */
  numFields: number
  /**
   * Championship-level and Premier events schedule more than the standard 5–6
   * qualification matches per team, at FIRST HQ's discretion (§13.6.1). Setting this
   * says the extra rounds are sanctioned, which turns that check from a warning into a
   * note; it changes nothing about the timing.
   */
  championshipLevel: boolean

  matchBlocks: MatchBlock[]

  checkIn: {
    /**
     * 'deadline'       — I102 as written: check-in closes 45 min before qualification
     *                    matches, and the schedule is checked against that.
     * 'before-judging' — check-in stays open all morning and a team just has to be
     *                    checked in before its own judging slot. I102 permits this
     *                    ("unless otherwise specified or approved by the Event
     *                    Director"); it's how Massachusetts runs, among others.
     */
    mode: 'deadline' | 'before-judging'
  }
  allianceSelectionMinutes: number
  /**
   * Playoff bracket timing. Defaults reproduce Tables 13-3…13-6 exactly; each field
   * rescales one kind of gap in those tables. See `playoffTimeline` in manual.ts.
   */
  playoff: PlayoffTiming

  judging: {
    mode: JudgingMode
    /** Which day interviews run on — or whose matches they run alongside. */
    day: number
    panels: number
    interviewMinutes: number
    gapMinutes: number
  }

  inspection: {
    /** Which day inspection runs on. Usually the first, so day two can start on time. */
    day: number
    tables: number
    minutesPerTeam: number
    /** When false, inspection is an open window and no per-team slots are generated. */
    scheduled: boolean
  }

  practice: {
    enabled: boolean
    day: number
    matchesPerTeam: number
    cycleMinutes: number
    /**
     * Run practice matches alongside inspection and judging rather than after them.
     * Common at events with an open practice field: teams cycle through the practice
     * queue while waiting for their inspection or interview slot. Only meaningful when
     * judging is in 'dedicated' mode — in 'concurrent' mode there is no pre-quals
     * window for practice to overlap with, so this is ignored.
     */
    concurrent: boolean
  }

  /** Override Table 13-2's alliance count. null = follow the table. */
  allianceCountOverride: AllianceCount | null
  /** Budget time for the "if required" second final. */
  includeIfRequiredFinal: boolean
}

/* -------------------------------------------------------------------- Output */

export type BlockKind =
  | 'checkin'
  | 'inspection'
  | 'judging'
  | 'ceremony'
  | 'practice'
  | 'quals'
  | 'playoff'
  | 'break'

export type Block = {
  id: string
  kind: BlockKind
  label: string
  /** Index into `EventConfig.days`. */
  day: number
  /** Minutes since midnight of `day`. */
  start: number
  end: number
  detail: string
  /**
   * Concurrent activities (judging/inspection running alongside matches) get a
   * lane > 0 so the Gantt can stack them and the table can indent them.
   */
  lane: number
}

export type TeamSlot = {
  team: number
  judgingDay: number
  judgingStart: number | null
  judgingPanel: number | null
  inspectionDay: number
  inspectionStart: number | null
  inspectionTable: number | null
}

/** What a single day of the event worked out to. */
export type DerivedDay = {
  index: number
  label: string
  date: string
  /** Minutes since midnight. */
  start: number
  end: number
  lengthMinutes: number
  /** The day's target finish, in minutes since midnight. 0 when unset. */
  targetEnd: number
  /** Qualification matches assigned to this day. */
  matchCount: number
  /** Minutes this day spends on qualification matches, breaks excluded. */
  matchMinutes: number
}

export type Derived = {
  /** Per-block size and placement, aligned by index with `config.matchBlocks`. */
  resolvedBlocks: ResolvedBlock[]
  days: DerivedDay[]
  qualMatchCount: number
  surrogateCount: number
  scheduledMatchCount: number
  suggestedCycleMinutes: number
  judgingMinutes: number
  inspectionMinutes: number
  allianceCount: AllianceCount
  playoffMinutes: number
  /** Shortest gap a team can expect between its own matches, across all blocks. */
  minTeamBreakMinutes: number
  /** Absolute minutes (see `absMinute`) for the first and last qualification match. */
  qualsStart: number
  qualsEnd: number
  qualsStartDay: number
  qualsEndDay: number
  /** Absolute minutes for the first and last moment of the event. */
  eventStart: number
  eventEnd: number
  /** Sum of every day's own length — not the span from `eventStart` to `eventEnd`. */
  scheduledMinutes: number
  matchPlaySeconds: number
}

export type Schedule = {
  blocks: Block[]
  teamSlots: TeamSlot[]
  derived: Derived
}

/* ------------------------------------------------------------------ Helpers */

/**
 * Fold a (day index, minutes since midnight) pair into a single number so two blocks on
 * different days can be compared and subtracted. Day lengths are notional 24-hour ones:
 * nothing here needs calendar arithmetic, only a consistent ordering.
 */
export function absMinute(day: number, minute: number): number {
  return day * MINUTES_PER_DAY + minute
}

/** A block's start on the absolute scale. */
export function blockStart(block: Block): number {
  return absMinute(block.day, block.start)
}

/** A block's end on the absolute scale. */
export function blockEnd(block: Block): number {
  return absMinute(block.day, block.end)
}

/**
 * Coerce a stored day index into the current day list. Day indices arrive from
 * localStorage and shared links, and the day they pointed at may since have been
 * deleted, so every read of one goes through here.
 */
export function clampDay(day: unknown, dayCount: number): number {
  const n = typeof day === 'number' && Number.isFinite(day) ? Math.floor(day) : 0
  return Math.min(Math.max(0, n), Math.max(0, dayCount - 1))
}

/**
 * Suggested minutes per match for a given field count. Two fields lands on 6 minutes,
 * which is the cadence the manual's own playoff timing tables use. Advisory only.
 */
export function suggestedCycleMinutes(numFields: number): number {
  if (numFields <= 1) return 7
  if (numFields === 2) return 6
  return 5
}

/**
 * Block indices in the order they are actually played: day by day, and within a day in
 * list order. The editor's array order and the event's chronology are only the same
 * thing on a single-day event, so everything that walks blocks sequentially walks this.
 */
export function blockOrder(blocks: readonly MatchBlock[], dayCount: number): number[] {
  const order: number[] = []
  for (let day = 0; day < Math.max(1, dayCount); day++) {
    blocks.forEach((block, i) => {
      if (clampDay(block.day, dayCount) === day) order.push(i)
    })
  }
  return order
}

/**
 * Walk the blocks in the order they're played, working out how many matches each holds
 * and when it runs.
 *
 * This has to be a single sequential pass because a window block's size depends on
 * where its day has actually got to by the time it starts, which depends on every block
 * before it. `dayMatchStart` supplies each day's opening position — when matches can
 * first start, once that day's check-in, judging window and ceremonies are placed.
 *
 * A 'remaining' block takes whatever is still unscheduled at that point, minus any
 * fixed-count blocks that come after it anywhere in the event. Window blocks later on
 * can't be accounted for — their size isn't known until the cursor reaches them — so a
 * 'remaining' block placed before a window block will over-claim. That ordering is
 * unusual, and `validate` flags the resulting coverage mismatch.
 */
export function resolveBlocks(
  blocks: readonly MatchBlock[],
  totalMatches: number,
  dayMatchStart: readonly number[],
): ResolvedBlock[] {
  const dayCount = Math.max(1, dayMatchStart.length)
  const order = blockOrder(blocks, dayCount)
  const out: ResolvedBlock[] = blocks.map((block) => ({
    day: clampDay(block.day, dayCount),
    count: 0,
    start: 0,
    end: 0,
  }))

  let scheduled = 0
  let cursorDay = -1
  let cursor = 0

  order.forEach((index, position) => {
    const block = blocks[index]
    const day = clampDay(block.day, dayCount)

    // Each day restarts the clock at its own first-match position.
    if (day !== cursorDay) {
      cursorDay = day
      cursor = dayMatchStart[day] ?? 0
    }

    let count: number

    if (block.sizing === 'count') {
      count = Math.max(0, Math.floor(block.matchCount))
    } else if (block.sizing === 'window') {
      const span = parseTime(block.endTime) - cursor
      count = span > 0 && block.cycleMinutes > 0 ? Math.floor(span / block.cycleMinutes) : 0
    } else {
      const laterFixed = order
        .slice(position + 1)
        .reduce(
          (sum, i) => sum + (blocks[i].sizing === 'count' ? Math.max(0, Math.floor(blocks[i].matchCount)) : 0),
          0,
        )
      count = Math.max(0, totalMatches - scheduled - laterFixed)
    }

    const start = cursor
    const end = start + count * block.cycleMinutes
    out[index] = { day, count, start, end }

    cursor = end + (block.breakAfter?.minutes ?? 0)
    scheduled += count
  })

  return out
}

/**
 * How long a team waits between its own matches. With one match at a time, a team
 * plays roughly once per "round" of `teams / 4` matches, so the gap is that many
 * matches' worth of cycle time.
 */
function teamBreakMinutes(teams: number, cycleMinutes: number): number {
  const matchesPerRound = Math.max(1, Math.floor(teams / TEAMS_PER_MATCH))
  // The team is not waiting through its own match, hence the -1.
  return Math.max(0, (matchesPerRound - 1) * cycleMinutes)
}

let blockSeq = 0
function nextId(prefix: string): string {
  blockSeq += 1
  return `${prefix}-${blockSeq}`
}

/* ----------------------------------------------------------------- Defaults */

/** Today, as "YYYY-MM-DD". */
function today(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * A day to add to the event. The first day opens with a long check-in window and the
 * opening ceremony; a day added after it opens shorter, gets a drivers meeting for the
 * teams who need the day's field notes, and skips the ceremony — that only happens once.
 */
export function defaultEventDay(index: number, date?: string): EventDay {
  const first = index === 0
  return {
    id: `day-${index + 1}-${Math.random().toString(36).slice(2, 8)}`,
    label: `Day ${index + 1}`,
    date: date ?? addDaysIso(today(), index),
    startTime: first ? '07:30' : '08:00',
    targetEndTime: '18:00',
    openMinutes: first ? 60 : 30,
    driversMeetingMinutes: 15,
    openingCeremonyMinutes: first ? 15 : 0,
  }
}

/**
 * A morning/afternoon pair of blocks for every day, with the event's matches shared out
 * between the days and lunch in the middle of each.
 *
 * The last block is always 'remaining' so the blocks add up exactly however the division
 * rounds; the rest are fixed counts the director can then push around.
 */
export function defaultMatchBlocks(totalMatches: number, cycle: number, dayCount = 1): MatchBlock[] {
  const days = Math.max(1, Math.floor(dayCount))
  const perDay = Math.floor(totalMatches / days)
  let extra = totalMatches % days

  const out: MatchBlock[] = []
  for (let day = 0; day < days; day++) {
    const share = perDay + (extra > 0 ? 1 : 0)
    if (extra > 0) extra--
    const morning = Math.ceil(share / 2)

    out.push({
      id: `block-d${day + 1}-am`,
      label: 'Morning Qualification Matches',
      day,
      sizing: 'count',
      matchCount: morning,
      endTime: '12:00',
      cycleMinutes: cycle,
      breakAfter: { label: 'Lunch', minutes: 45 },
    })
    out.push({
      id: `block-d${day + 1}-pm`,
      label: 'Afternoon Qualification Matches',
      day,
      sizing: day === days - 1 ? 'remaining' : 'count',
      matchCount: share - morning,
      endTime: '16:00',
      cycleMinutes: cycle,
      breakAfter: null,
    })
  }
  return out
}

/* --------------------------------------------------------------- Migration */

/**
 * Bring a match block from any previously-persisted shape up to the current one.
 *
 * Blocks arrive from localStorage and from shared links, both of which can predate the
 * current shape — notably `matchCount: 'remaining'` from before `sizing` existed, blocks
 * with no `endTime`, and blocks from before events had more than one day. Merging over
 * the defaults doesn't reach inside an array, so every block has to be rebuilt field by
 * field rather than spread.
 */
function normalizeMatchBlock(
  raw: unknown,
  index: number,
  fallbackCycle: number,
  dayCount: number,
): MatchBlock {
  const b = (raw ?? {}) as Record<string, unknown>

  const legacyRemaining = b.matchCount === 'remaining'
  const sizing: BlockSizing =
    b.sizing === 'count' || b.sizing === 'remaining' || b.sizing === 'window'
      ? b.sizing
      : legacyRemaining
        ? 'remaining'
        : 'count'

  const cycleMinutes = typeof b.cycleMinutes === 'number' && b.cycleMinutes > 0 ? b.cycleMinutes : fallbackCycle
  const matchCount = typeof b.matchCount === 'number' && Number.isFinite(b.matchCount) ? b.matchCount : 10

  const breakAfterRaw = b.breakAfter as Record<string, unknown> | null | undefined
  const breakAfter =
    breakAfterRaw && typeof breakAfterRaw === 'object'
      ? {
          label: typeof breakAfterRaw.label === 'string' ? breakAfterRaw.label : 'Break',
          minutes: typeof breakAfterRaw.minutes === 'number' ? breakAfterRaw.minutes : 0,
        }
      : null

  return {
    id: typeof b.id === 'string' ? b.id : `block-${index}`,
    label: typeof b.label === 'string' ? b.label : `Match Block ${index + 1}`,
    // A pre-multi-day block has no day at all, which clamps to the first one.
    day: clampDay(b.day, dayCount),
    sizing,
    matchCount,
    endTime: typeof b.endTime === 'string' ? b.endTime : '12:00',
    cycleMinutes,
    breakAfter,
  }
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function str(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function normalizeEventDay(raw: unknown, index: number, base: EventDay): EventDay {
  const d = (raw ?? {}) as Record<string, unknown>
  return {
    id: str(d.id, base.id),
    label: str(d.label, `Day ${index + 1}`),
    date: str(d.date, base.date),
    startTime: str(d.startTime, base.startTime),
    targetEndTime: str(d.targetEndTime, base.targetEndTime),
    openMinutes: Math.max(0, num(d.openMinutes, base.openMinutes)),
    driversMeetingMinutes: Math.max(0, num(d.driversMeetingMinutes, base.driversMeetingMinutes)),
    openingCeremonyMinutes: Math.max(0, num(d.openingCeremonyMinutes, base.openingCeremonyMinutes)),
  }
}

/**
 * Recover a day list from a config written before events had days.
 *
 * Every field the day list owns used to sit on the event itself — one start time, one
 * target end, one drivers meeting, one opening ceremony, and the check-in window inside
 * `checkIn`. Those become day one, so an older link or a stored config opens as the
 * same single-day event it described rather than as the defaults.
 */
function legacyDay(p: Record<string, unknown>, base: EventDay): EventDay {
  const checkIn = (p.checkIn ?? {}) as Record<string, unknown>
  return {
    ...base,
    date: str(p.eventDate, base.date),
    startTime: str(p.dayStart, base.startTime),
    targetEndTime: str(p.targetEndTime, base.targetEndTime),
    openMinutes: Math.max(0, num(checkIn.minutes, base.openMinutes)),
    driversMeetingMinutes: Math.max(0, num(p.driversMeetingMinutes, base.driversMeetingMinutes)),
    openingCeremonyMinutes: Math.max(0, num(p.openingCeremonyMinutes, base.openingCeremonyMinutes)),
  }
}

/**
 * Fields that used to sit on the event and now live on a day. They're read by
 * `legacyDay` and then dropped, so a migrated config doesn't carry its own history
 * around in localStorage and in every share link it produces.
 */
const LEGACY_EVENT_KEYS = [
  'eventDate',
  'dayStart',
  'targetEndTime',
  'driversMeetingMinutes',
  'openingCeremonyMinutes',
] as const

/**
 * Merge a persisted or shared config over the defaults. Nested objects are merged one
 * level deep; days and match blocks are normalized individually, so a config written by
 * an older version loads rather than white-screening the app.
 */
export function normalizeConfig(raw: unknown): EventConfig {
  const base = defaultConfig()
  const p = (raw ?? {}) as Partial<EventConfig> & Record<string, unknown>

  const fallbackCycle = suggestedCycleMinutes(num(p.numFields, base.numFields))

  const rawDays = Array.isArray(p.days) ? p.days : null
  const days: EventDay[] =
    rawDays && rawDays.length
      ? rawDays.map((d, i) => normalizeEventDay(d, i, defaultEventDay(i, base.days[0].date)))
      : [legacyDay(p, base.days[0])]

  const rawBlocks = Array.isArray(p.matchBlocks) ? p.matchBlocks : null

  const merged: EventConfig = {
    ...base,
    ...p,
    days,
    championshipLevel: p.championshipLevel === true,
    // Rebuilt rather than spread: the old shape carried a `minutes` here, which is now
    // the first day's `openMinutes`.
    checkIn: { mode: p.checkIn?.mode === 'before-judging' ? 'before-judging' : 'deadline' },
    judging: {
      ...base.judging,
      ...(p.judging as object | undefined),
      day: clampDay((p.judging as EventConfig['judging'] | undefined)?.day, days.length),
    },
    inspection: {
      ...base.inspection,
      ...(p.inspection as object | undefined),
      day: clampDay((p.inspection as EventConfig['inspection'] | undefined)?.day, days.length),
    },
    practice: {
      ...base.practice,
      ...(p.practice as object | undefined),
      day: clampDay((p.practice as EventConfig['practice'] | undefined)?.day, days.length),
    },
    playoff: { ...base.playoff, ...(p.playoff as object | undefined) },
    matchBlocks:
      rawBlocks && rawBlocks.length
        ? rawBlocks.map((b, i) => normalizeMatchBlock(b, i, fallbackCycle, days.length))
        : base.matchBlocks,
  }

  for (const key of LEGACY_EVENT_KEYS) delete (merged as Record<string, unknown>)[key]
  return merged
}

export function defaultConfig(): EventConfig {
  const numTeams = 32
  const qualsPerTeam = 5
  const cycle = suggestedCycleMinutes(2)
  return {
    eventName: 'FTC Qualifying Tournament',

    days: [defaultEventDay(0)],

    numTeams,
    qualsPerTeam,
    numFields: 2,
    championshipLevel: false,

    matchBlocks: defaultMatchBlocks(qualMatchCount(numTeams, qualsPerTeam), cycle),

    checkIn: { mode: 'deadline' },
    allianceSelectionMinutes: 20,
    playoff: { ...DEFAULT_PLAYOFF_TIMING },

    judging: { mode: 'concurrent', day: 0, panels: 3, interviewMinutes: 10, gapMinutes: 5 },
    inspection: { day: 0, tables: 3, minutesPerTeam: 20, scheduled: true },
    practice: { enabled: true, day: 0, matchesPerTeam: 1, cycleMinutes: 4, concurrent: false },

    allianceCountOverride: null,
    includeIfRequiredFinal: true,
  }
}

/* ------------------------------------------------------------------- Engine */

/** One entry in a day's pre-match window, before lanes are assigned. */
type PreWindowActivity = {
  kind: BlockKind
  label: string
  minutes: number
  detail: string
}

export function buildSchedule(config: EventConfig): Schedule {
  blockSeq = 0

  // A config with no days can only come from a hand-edited link; treat it as one day
  // rather than producing an event with nothing in it.
  const days = config.days.length ? config.days : [defaultEventDay(0)]
  const dayCount = days.length
  const lastDay = dayCount - 1

  const teams = Math.max(0, Math.floor(config.numTeams))
  const totalMatches = qualMatchCount(teams, config.qualsPerTeam)

  const judgingMinutes =
    Math.ceil(teams / Math.max(1, config.judging.panels)) *
    (config.judging.interviewMinutes + config.judging.gapMinutes)
  const inspectionMinutes =
    Math.ceil(teams / Math.max(1, config.inspection.tables)) * config.inspection.minutesPerTeam

  const allianceCount = config.allianceCountOverride ?? allianceCountForTeams(teams)
  const playoffLength = playoffMinutes(
    allianceCount,
    config.includeIfRequiredFinal,
    config.playoff,
  )

  const concurrent = config.judging.mode === 'concurrent'
  const judgingDay = clampDay(config.judging.day, dayCount)
  const inspectionDay = clampDay(config.inspection.day, dayCount)
  const practiceDay = clampDay(config.practice.day, dayCount)

  const hasPractice = config.practice.enabled && config.practice.matchesPerTeam > 0
  const practiceMatches = hasPractice
    ? Math.ceil((teams * config.practice.matchesPerTeam) / TEAMS_PER_MATCH)
    : 0
  const practiceMinutes = practiceMatches * config.practice.cycleMinutes
  const practiceDetail = `${config.practice.matchesPerTeam} per team · ${config.practice.cycleMinutes} min cycle`

  // Nothing to overlap with unless inspection and judging have a pre-match window.
  const practiceConcurrent = hasPractice && config.practice.concurrent && !concurrent

  const blocks: Block[] = []

  /* --- Pass one: each day's opening sequence, and where its matches can start. --- */

  const dayMatchStart: number[] = []
  const dayOpenEnd: number[] = []

  days.forEach((day, di) => {
    const first = di === 0
    let cursor = parseTime(day.startTime)

    const openEnd = cursor + Math.max(0, day.openMinutes)
    blocks.push({
      id: nextId('checkin'),
      kind: 'checkin',
      label:
        first && config.checkIn.mode === 'deadline'
          ? 'Check-In, Pits & Queueing Open'
          : 'Pits & Queueing Open',
      day: di,
      start: cursor,
      end: openEnd,
      detail: first
        ? config.checkIn.mode === 'deadline'
          ? 'Adult check-in at Pit Administration (I102)'
          : 'Setup and load-in'
        : 'Pits reopen; teams settle in for the day',
      lane: 0,
    })
    dayOpenEnd.push(openEnd)
    cursor = openEnd

    // Whatever this day runs before its matches. Concurrent mode has no pre-match
    // window at all — it defers judging and inspection to pass three, where they're
    // overlaid on the matches instead.
    const preWindow: PreWindowActivity[] = []

    if (!concurrent && inspectionDay === di) {
      preWindow.push({
        kind: 'inspection',
        label: 'Robot Inspection',
        minutes: inspectionMinutes,
        detail: `${teams} teams · ${config.inspection.tables} tables · ${config.inspection.minutesPerTeam} min each`,
      })
    }
    if (!concurrent && judgingDay === di) {
      preWindow.push({
        kind: 'judging',
        label: 'Judging — Initial Interviews',
        minutes: judgingMinutes,
        detail: `${teams} teams · ${config.judging.panels} panels · ${config.judging.interviewMinutes} min interview + ${config.judging.gapMinutes} min gap`,
      })
    }
    if (practiceConcurrent && practiceDay === di) {
      preWindow.push({
        kind: 'practice',
        label: `Practice Matches (${practiceMatches})`,
        minutes: practiceMinutes,
        detail: `Concurrent with inspection & judging · ${practiceDetail}`,
      })
    }

    if (preWindow.length) {
      const start = cursor
      // The first activity holds the main lane and the rest stack beside it, so a day
      // that runs only inspection doesn't leave lane 0 empty.
      preWindow.forEach((activity, lane) => {
        blocks.push({
          id: nextId(activity.kind),
          kind: activity.kind,
          label: activity.label,
          day: di,
          start,
          end: start + activity.minutes,
          detail: activity.detail,
          lane,
        })
      })
      cursor = start + Math.max(...preWindow.map((a) => a.minutes))
    }

    if (day.driversMeetingMinutes > 0) {
      blocks.push({
        id: nextId('ceremony'),
        kind: 'ceremony',
        label: 'Drivers Meeting',
        day: di,
        start: cursor,
        end: cursor + day.driversMeetingMinutes,
        detail: 'Head Referee briefs drive teams on rules and field specifics',
        lane: 0,
      })
      cursor += day.driversMeetingMinutes
    }

    if (day.openingCeremonyMinutes > 0) {
      blocks.push({
        id: nextId('ceremony'),
        kind: 'ceremony',
        label: 'Opening Ceremony',
        day: di,
        start: cursor,
        end: cursor + day.openingCeremonyMinutes,
        detail: 'Welcome, sponsors, and opening remarks',
        lane: 0,
      })
      cursor += day.openingCeremonyMinutes
    }

    if (hasPractice && !practiceConcurrent && practiceDay === di) {
      blocks.push({
        id: nextId('practice'),
        kind: 'practice',
        label: `Practice Matches (${practiceMatches})`,
        day: di,
        start: cursor,
        end: cursor + practiceMinutes,
        detail: practiceDetail,
        lane: 0,
      })
      cursor += practiceMinutes
    }

    dayMatchStart.push(cursor)
  })

  /* --- Pass two: the qualification blocks, in the order they're played. --- */

  const resolved = resolveBlocks(config.matchBlocks, totalMatches, dayMatchStart)
  const order = blockOrder(config.matchBlocks, dayCount)

  // Where each day has got to once its matches and their breaks are done.
  const dayMatchEnd = [...dayMatchStart]
  const firstQualStartByDay: (number | null)[] = days.map(() => null)
  const matchMinutesByDay = days.map(() => 0)
  let firstQual: { day: number; minute: number } | null = null
  let lastQual: { day: number; minute: number } | null = null
  let matchNumber = 1

  for (const i of order) {
    const block = config.matchBlocks[i]
    const r = resolved[i]

    if (r.count > 0) {
      const first = matchNumber
      const last = matchNumber + r.count - 1
      blocks.push({
        id: nextId('quals'),
        kind: 'quals',
        label: block.label || `Qualification Matches ${first}–${last}`,
        day: r.day,
        start: r.start,
        end: r.end,
        detail: `Matches ${first}–${last} · ${r.count} matches · ${block.cycleMinutes} min cycle`,
        lane: 0,
      })
      matchNumber = last + 1
      matchMinutesByDay[r.day] += r.end - r.start
      if (firstQualStartByDay[r.day] === null) firstQualStartByDay[r.day] = r.start
      if (!firstQual) firstQual = { day: r.day, minute: r.start }
      lastQual = { day: r.day, minute: r.end }
      dayMatchEnd[r.day] = Math.max(dayMatchEnd[r.day], r.end)
    }

    if (block.breakAfter && block.breakAfter.minutes > 0) {
      blocks.push({
        id: nextId('break'),
        kind: 'break',
        label: block.breakAfter.label || 'Break',
        day: r.day,
        start: r.end,
        end: r.end + block.breakAfter.minutes,
        detail: '',
        lane: 0,
      })
      dayMatchEnd[r.day] = Math.max(dayMatchEnd[r.day], r.end + block.breakAfter.minutes)
    }
  }

  /* --- Pass three: activities overlaid on the matches, then the bracket. --- */

  // Overlaid on their day's match blocks rather than extending the day. A day with no
  // matches has nothing to overlay, so they fall back to where its matches would have
  // begun; `validate` flags that, since judging can't run concurrently with nothing.
  if (concurrent) {
    const inspectionStart = firstQualStartByDay[inspectionDay] ?? dayMatchStart[inspectionDay]
    blocks.push({
      id: nextId('inspection'),
      kind: 'inspection',
      label: 'Robot Inspection',
      day: inspectionDay,
      start: inspectionStart,
      end: inspectionStart + inspectionMinutes,
      detail: `Concurrent with matches · ${config.inspection.tables} tables · ${config.inspection.minutesPerTeam} min each`,
      lane: 1,
    })

    const judgingStart = firstQualStartByDay[judgingDay] ?? dayMatchStart[judgingDay]
    blocks.push({
      id: nextId('judging'),
      kind: 'judging',
      label: 'Judging — Initial Interviews',
      day: judgingDay,
      start: judgingStart,
      end: judgingStart + judgingMinutes,
      detail: `Concurrent with matches · ${config.judging.panels} panels · ${config.judging.interviewMinutes} min interview + ${config.judging.gapMinutes} min gap`,
      lane: 2,
    })
  }

  // The bracket closes the event, so it always sits on the last day, after whatever
  // matches that day holds. T701: "typically just after the last scheduled
  // Qualification MATCH".
  let cursor = dayMatchEnd[lastDay]

  blocks.push({
    id: nextId('ceremony'),
    kind: 'ceremony',
    label: 'Alliance Selection',
    day: lastDay,
    start: cursor,
    end: cursor + config.allianceSelectionMinutes,
    detail: `${allianceCount} alliances (Table 13-2)`,
    lane: 0,
  })
  cursor += config.allianceSelectionMinutes

  for (const step of playoffTimeline(allianceCount, config.includeIfRequiredFinal, config.playoff)) {
    blocks.push({
      id: nextId('playoff'),
      kind: step.kind === 'match' ? 'playoff' : 'break',
      label: step.label,
      day: lastDay,
      start: cursor,
      end: cursor + step.minutes,
      detail: step.kind === 'match' ? `Double elimination · ${allianceCount} alliances` : '',
      lane: 0,
    })
    cursor += step.minutes
  }

  const scheduledMatchCount = resolved.reduce((sum, r) => sum + r.count, 0)

  const activeCycles = config.matchBlocks
    .filter((_, i) => resolved[i].count > 0)
    .map((b) => b.cycleMinutes)
  const minTeamBreakMinutes = activeCycles.length
    ? Math.min(...activeCycles.map((c) => teamBreakMinutes(teams, c)))
    : 0

  const teamSlots = buildTeamSlots(config, dayMatchStart, judgingDay, inspectionDay, concurrent, blocks)

  // Runs until the last team's judging slot — the point after which nobody can still
  // be un-checked-in. Drawn on the judging day, which is where that deadline falls;
  // when judging is on a later day, check-in has been open since the event started.
  if (config.checkIn.mode === 'before-judging') {
    const judgingStarts = teamSlots.map((s) => s.judgingStart).filter((t): t is number => t !== null)
    const lastDeadline = judgingStarts.length ? Math.max(...judgingStarts) : dayOpenEnd[judgingDay]
    blocks.push({
      id: nextId('checkin'),
      kind: 'checkin',
      label: 'Check-In (rolling)',
      day: judgingDay,
      start: parseTime(days[judgingDay].startTime),
      end: lastDeadline,
      detail:
        judgingDay === 0
          ? 'Each team checks in before its own judging slot (I102, Event Director exception)'
          : `Each team checks in before its own judging slot; the pits have been open since ${days[0].label || 'day 1'}`,
      lane: 3,
    })
  }

  /* --- Per-day rollups, read off the finished block list. --- */

  const derivedDays: DerivedDay[] = days.map((day, di) => {
    const own = blocks.filter((b) => b.day === di)
    const start = own.length ? Math.min(...own.map((b) => b.start)) : parseTime(day.startTime)
    const end = own.length ? Math.max(...own.map((b) => b.end)) : start
    return {
      index: di,
      label: day.label || `Day ${di + 1}`,
      date: day.date,
      start,
      end,
      lengthMinutes: end - start,
      targetEnd: parseTime(day.targetEndTime),
      matchCount: resolved.reduce((sum, r) => sum + (r.day === di ? r.count : 0), 0),
      matchMinutes: matchMinutesByDay[di],
    }
  })

  const qualsStart = firstQual
    ? absMinute(firstQual.day, firstQual.minute)
    : absMinute(0, dayMatchStart[0])
  const qualsEnd = lastQual ? absMinute(lastQual.day, lastQual.minute) : qualsStart

  return {
    blocks,
    teamSlots,
    derived: {
      resolvedBlocks: resolved,
      days: derivedDays,
      qualMatchCount: totalMatches,
      surrogateCount: surrogateCount(teams, config.qualsPerTeam),
      scheduledMatchCount,
      suggestedCycleMinutes: suggestedCycleMinutes(config.numFields),
      judgingMinutes,
      inspectionMinutes,
      allianceCount,
      playoffMinutes: playoffLength,
      minTeamBreakMinutes,
      qualsStart,
      qualsEnd,
      qualsStartDay: firstQual ? firstQual.day : 0,
      qualsEndDay: lastQual ? lastQual.day : 0,
      eventStart: absMinute(0, derivedDays[0].start),
      eventEnd: absMinute(lastDay, derivedDays[lastDay].end),
      scheduledMinutes: derivedDays.reduce((sum, d) => sum + d.lengthMinutes, 0),
      matchPlaySeconds: MATCH_PLAY_SECONDS,
    },
  }
}

/**
 * Per-team judging and inspection slots, round-robined across panels and tables.
 *
 * In concurrent mode the two are deliberately staggered in opposite directions —
 * judging fills panels front-to-back while inspection is offset by half a rotation —
 * so a team is unlikely to be wanted in both places at once. This is best-effort:
 * without actual match assignments (which this app does not generate, see README) a
 * truly collision-free schedule isn't derivable, and the UI labels these as estimates.
 *
 * Both queues run inside one day. Splitting a team's interview slot across days would
 * mean deciding which teams are judged when, and the manual's equal-treatment rules
 * (A205) make that a director's call rather than an arithmetic one.
 */
function buildTeamSlots(
  config: EventConfig,
  dayMatchStart: readonly number[],
  judgingDay: number,
  inspectionDay: number,
  concurrent: boolean,
  blocks: readonly Block[],
): TeamSlot[] {
  const teams = Math.max(0, Math.floor(config.numTeams))
  const slots: TeamSlot[] = []

  const judgingBlock = blocks.find((b) => b.kind === 'judging')
  const inspectionBlock = blocks.find((b) => b.kind === 'inspection')
  const judgingBase = judgingBlock ? judgingBlock.start : dayMatchStart[judgingDay]
  const inspectionBase = inspectionBlock ? inspectionBlock.start : dayMatchStart[inspectionDay]

  const panels = Math.max(1, config.judging.panels)
  const tables = Math.max(1, config.inspection.tables)
  const interviewStride = config.judging.interviewMinutes + config.judging.gapMinutes

  // Offset inspection by half its rotation so the two queues pull different teams
  // at the same moment.
  const inspectionOffset = concurrent ? Math.floor(tables / 2) : 0

  for (let i = 0; i < teams; i++) {
    const judgingRound = Math.floor(i / panels)
    const judgingPanel = (i % panels) + 1

    const inspectionIndex = (i + inspectionOffset) % Math.max(1, teams)
    const inspectionRound = Math.floor(inspectionIndex / tables)
    const inspectionTable = (inspectionIndex % tables) + 1

    slots.push({
      team: i + 1,
      judgingDay,
      judgingStart: judgingBase + judgingRound * interviewStride,
      judgingPanel,
      inspectionDay,
      inspectionStart: config.inspection.scheduled
        ? inspectionBase + inspectionRound * config.inspection.minutesPerTeam
        : null,
      inspectionTable: config.inspection.scheduled ? inspectionTable : null,
    })
  }

  return slots
}
