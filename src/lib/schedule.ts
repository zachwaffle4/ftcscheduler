/**
 * The scheduling engine. Pure functions only — no Vue imports, no side effects — so
 * the whole thing is trivially testable and can be reasoned about independently of
 * the UI.
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
import { parseTime } from './format'

/* ------------------------------------------------------------------- Config */

/**
 * How a match block's size is determined:
 *   'count'     — a fixed number of matches
 *   'remaining' — absorbs whatever the sized blocks leave over
 *   'window'    — runs until a wall-clock end time, the way FTC Live lets you lay out a
 *                 day; the match count falls out of the available span and cycle time
 *
 * A block's start is never specified: it's wherever the schedule reaches it, which is
 * determined by everything before it. Only the end is the director's to choose.
 */
export type BlockSizing = 'count' | 'remaining' | 'window'

export type MatchBlock = {
  id: string
  label: string
  sizing: BlockSizing
  /** Used when sizing is 'count'. */
  matchCount: number
  /** "HH:MM", used when sizing is 'window'. The block runs until this time. */
  endTime: string
  /** Minutes per match, independent per block. */
  cycleMinutes: number
  breakAfter: { label: string; minutes: number } | null
}

/** A block's size and placement, once the day's layout is known. */
export type ResolvedBlock = {
  count: number
  /** Minutes since midnight. */
  start: number
  end: number
}

export type JudgingMode = 'dedicated' | 'concurrent'

export type EventConfig = {
  eventName: string
  eventDate: string
  /** "HH:MM" — when the day starts (pits open / check-in). */
  dayStart: string

  numTeams: number
  qualsPerTeam: number
  /**
   * Number of competition fields. Only one MATCH is ever played at a time; extra
   * fields let the next one be reset and staged in parallel, which lowers the
   * achievable cycle time. This value therefore only drives a *suggestion*.
   */
  numFields: number

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
    /** The opening pits-open window before the first scheduled activity. */
    minutes: number
  }
  /** Drivers meeting, run immediately before the opening ceremony. */
  driversMeetingMinutes: number
  openingCeremonyMinutes: number
  allianceSelectionMinutes: number
  /**
   * Playoff bracket timing. Defaults reproduce Tables 13-3…13-6 exactly; each field
   * rescales one kind of gap in those tables. See `playoffTimeline` in manual.ts.
   */
  playoff: PlayoffTiming

  judging: {
    mode: JudgingMode
    panels: number
    interviewMinutes: number
    gapMinutes: number
  }

  inspection: {
    tables: number
    minutesPerTeam: number
    /** When false, inspection is an open window and no per-team slots are generated. */
    scheduled: boolean
  }

  practice: {
    enabled: boolean
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

  /** "HH:MM" — the day is flagged if it runs past this. */
  targetEndTime: string
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
  /** Minutes since midnight. */
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
  judgingStart: number | null
  judgingPanel: number | null
  inspectionStart: number | null
  inspectionTable: number | null
}

export type Derived = {
  /** Per-block size and placement, aligned by index with `config.matchBlocks`. */
  resolvedBlocks: ResolvedBlock[]
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
  /** Minutes since midnight. */
  qualsStart: number
  qualsEnd: number
  dayStart: number
  dayEnd: number
  dayLengthMinutes: number
  matchPlaySeconds: number
}

export type Schedule = {
  blocks: Block[]
  teamSlots: TeamSlot[]
  derived: Derived
}

/* ------------------------------------------------------------------ Helpers */

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
 * Walk the blocks in order, working out how many matches each holds and when it runs.
 *
 * This has to be a single sequential pass because a window block's size depends on
 * where the day has actually got to by the time it starts, which depends on every
 * block before it.
 *
 * A 'remaining' block takes whatever is still unscheduled at that point, minus any
 * fixed-count blocks that come after it. Window blocks later in the list can't be
 * accounted for — their size isn't known until the cursor reaches them — so a
 * 'remaining' block placed before a window block will over-claim. That ordering is
 * unusual, and `validate` flags the resulting coverage mismatch.
 */
export function resolveBlocks(
  blocks: readonly MatchBlock[],
  totalMatches: number,
  startMinute: number,
): ResolvedBlock[] {
  const out: ResolvedBlock[] = []
  let cursor = startMinute
  let scheduled = 0

  blocks.forEach((block, i) => {
    let count: number

    if (block.sizing === 'count') {
      count = Math.max(0, Math.floor(block.matchCount))
    } else if (block.sizing === 'window') {
      const span = parseTime(block.endTime) - cursor
      count = span > 0 && block.cycleMinutes > 0 ? Math.floor(span / block.cycleMinutes) : 0
    } else {
      const laterFixed = blocks
        .slice(i + 1)
        .reduce((sum, b) => sum + (b.sizing === 'count' ? Math.max(0, Math.floor(b.matchCount)) : 0), 0)
      count = Math.max(0, totalMatches - scheduled - laterFixed)
    }

    const start = cursor
    const end = start + count * block.cycleMinutes
    out.push({ count, start, end })

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

export function defaultMatchBlocks(totalMatches: number, cycle: number): MatchBlock[] {
  const morning = Math.ceil(totalMatches / 2)
  return [
    {
      id: 'block-morning',
      label: 'Morning Qualification Matches',
      sizing: 'count',
      matchCount: morning,
      endTime: '12:00',
      cycleMinutes: cycle,
      breakAfter: { label: 'Lunch', minutes: 45 },
    },
    {
      id: 'block-afternoon',
      label: 'Afternoon Qualification Matches',
      sizing: 'remaining',
      matchCount: 10,
      endTime: '16:00',
      cycleMinutes: cycle,
      breakAfter: null,
    },
  ]
}

/* --------------------------------------------------------------- Migration */

/**
 * Bring a match block from any previously-persisted shape up to the current one.
 *
 * Blocks arrive from localStorage and from shared links, both of which can predate the
 * current shape — notably `matchCount: 'remaining'` from before `sizing` existed, and
 * blocks with no `endTime`. Merging over the defaults doesn't reach inside an array,
 * so every block has to be rebuilt field by field rather than spread.
 */
function normalizeMatchBlock(raw: unknown, index: number, fallbackCycle: number): MatchBlock {
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
    sizing,
    matchCount,
    endTime: typeof b.endTime === 'string' ? b.endTime : '12:00',
    cycleMinutes,
    breakAfter,
  }
}

/**
 * Merge a persisted or shared config over the defaults. Nested objects are merged one
 * level deep and match blocks are normalized individually, so a config written by an
 * older version loads rather than white-screening the app.
 */
export function normalizeConfig(raw: unknown): EventConfig {
  const base = defaultConfig()
  const p = (raw ?? {}) as Partial<EventConfig> & Record<string, unknown>

  const fallbackCycle = suggestedCycleMinutes(
    typeof p.numFields === 'number' ? p.numFields : base.numFields,
  )

  const blocks = Array.isArray(p.matchBlocks) ? p.matchBlocks : null

  return {
    ...base,
    ...p,
    checkIn: { ...base.checkIn, ...(p.checkIn as object | undefined) },
    judging: { ...base.judging, ...(p.judging as object | undefined) },
    inspection: { ...base.inspection, ...(p.inspection as object | undefined) },
    practice: { ...base.practice, ...(p.practice as object | undefined) },
    playoff: { ...base.playoff, ...(p.playoff as object | undefined) },
    matchBlocks:
      blocks && blocks.length
        ? blocks.map((b, i) => normalizeMatchBlock(b, i, fallbackCycle))
        : base.matchBlocks,
  }
}

export function defaultConfig(): EventConfig {
  const numTeams = 32
  const qualsPerTeam = 5
  const cycle = suggestedCycleMinutes(2)
  return {
    eventName: 'FTC Qualifying Tournament',
    eventDate: new Date().toISOString().slice(0, 10),
    dayStart: '07:30',

    numTeams,
    qualsPerTeam,
    numFields: 2,

    matchBlocks: defaultMatchBlocks(qualMatchCount(numTeams, qualsPerTeam), cycle),

    checkIn: { mode: 'deadline', minutes: 60 },
    driversMeetingMinutes: 15,
    openingCeremonyMinutes: 15,
    allianceSelectionMinutes: 20,
    playoff: { ...DEFAULT_PLAYOFF_TIMING },

    judging: { mode: 'concurrent', panels: 3, interviewMinutes: 10, gapMinutes: 5 },
    inspection: { tables: 3, minutesPerTeam: 20, scheduled: true },
    practice: { enabled: true, matchesPerTeam: 1, cycleMinutes: 4, concurrent: false },

    allianceCountOverride: null,
    includeIfRequiredFinal: true,

    targetEndTime: '18:00',
  }
}

/* ------------------------------------------------------------------- Engine */

export function buildSchedule(config: EventConfig): Schedule {
  blockSeq = 0

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

  const blocks: Block[] = []
  const dayStart = parseTime(config.dayStart)
  let cursor = dayStart

  // In 'deadline' mode this block's end is the I102 deadline that validate checks.
  const pitsOpenEnd = cursor + config.checkIn.minutes
  blocks.push({
    id: nextId('checkin'),
    kind: 'checkin',
    label: config.checkIn.mode === 'deadline' ? 'Check-In, Pits & Queueing Open' : 'Pits & Queueing Open',
    start: cursor,
    end: pitsOpenEnd,
    detail:
      config.checkIn.mode === 'deadline'
        ? 'Adult check-in at Pit Administration (I102)'
        : 'Setup and load-in',
    lane: 0,
  })
  cursor = pitsOpenEnd

  const concurrent = config.judging.mode === 'concurrent'

  const hasPractice = config.practice.enabled && config.practice.matchesPerTeam > 0
  const practiceMatches = hasPractice
    ? Math.ceil((teams * config.practice.matchesPerTeam) / TEAMS_PER_MATCH)
    : 0
  const practiceMinutes = practiceMatches * config.practice.cycleMinutes
  const practiceDetail = `${config.practice.matchesPerTeam} per team · ${config.practice.cycleMinutes} min cycle`

  // Nothing to overlap with unless inspection and judging have a pre-match window.
  const practiceConcurrent = hasPractice && config.practice.concurrent && !concurrent

  // Concurrent mode can't place these until the match cursor is known, so it defers
  // them to after the block loop.
  if (!concurrent) {
    const preStart = cursor
    blocks.push({
      id: nextId('inspection'),
      kind: 'inspection',
      label: 'Robot Inspection',
      start: preStart,
      end: preStart + inspectionMinutes,
      detail: `${teams} teams · ${config.inspection.tables} tables · ${config.inspection.minutesPerTeam} min each`,
      lane: 0,
    })
    blocks.push({
      id: nextId('judging'),
      kind: 'judging',
      label: 'Judging — Initial Interviews',
      start: preStart,
      end: preStart + judgingMinutes,
      detail: `${teams} teams · ${config.judging.panels} panels · ${config.judging.interviewMinutes} min interview + ${config.judging.gapMinutes} min gap`,
      lane: 1,
    })

    let preEnd = preStart + Math.max(inspectionMinutes, judgingMinutes)

    if (practiceConcurrent) {
      blocks.push({
        id: nextId('practice'),
        kind: 'practice',
        label: `Practice Matches (${practiceMatches})`,
        start: preStart,
        end: preStart + practiceMinutes,
        detail: `Concurrent with inspection & judging · ${practiceDetail}`,
        lane: 2,
      })
      preEnd = Math.max(preEnd, preStart + practiceMinutes)
    }

    cursor = preEnd
  }

  if (config.driversMeetingMinutes > 0) {
    blocks.push({
      id: nextId('ceremony'),
      kind: 'ceremony',
      label: 'Drivers Meeting',
      start: cursor,
      end: cursor + config.driversMeetingMinutes,
      detail: 'Head Referee briefs drive teams on rules and field specifics',
      lane: 0,
    })
    cursor += config.driversMeetingMinutes
  }

  if (config.openingCeremonyMinutes > 0) {
    blocks.push({
      id: nextId('ceremony'),
      kind: 'ceremony',
      label: 'Opening Ceremony',
      start: cursor,
      end: cursor + config.openingCeremonyMinutes,
      detail: 'Welcome, sponsors, and opening remarks',
      lane: 0,
    })
    cursor += config.openingCeremonyMinutes
  }

  if (hasPractice && !practiceConcurrent) {
    blocks.push({
      id: nextId('practice'),
      kind: 'practice',
      label: `Practice Matches (${practiceMatches})`,
      start: cursor,
      end: cursor + practiceMinutes,
      detail: practiceDetail,
      lane: 0,
    })
    cursor += practiceMinutes
  }

  const qualsStart = cursor
  const resolved = resolveBlocks(config.matchBlocks, totalMatches, qualsStart)
  let matchNumber = 1
  config.matchBlocks.forEach((block, i) => {
    const count = resolved[i].count

    if (count > 0) {
      const minutes = count * block.cycleMinutes
      const first = matchNumber
      const last = matchNumber + count - 1
      blocks.push({
        id: nextId('quals'),
        kind: 'quals',
        label: block.label || `Qualification Matches ${first}–${last}`,
        start: cursor,
        end: cursor + minutes,
        detail: `Matches ${first}–${last} · ${count} matches · ${block.cycleMinutes} min cycle`,
        lane: 0,
      })
      cursor += minutes
      matchNumber = last + 1
    }
    if (block.breakAfter && block.breakAfter.minutes > 0) {
      blocks.push({
        id: nextId('break'),
        kind: 'break',
        label: block.breakAfter.label || 'Break',
        start: cursor,
        end: cursor + block.breakAfter.minutes,
        detail: '',
        lane: 0,
      })
      cursor += block.breakAfter.minutes
    }
  })
  const qualsEnd = cursor

  // Overlaid on the match blocks rather than extending the day.
  if (concurrent) {
    blocks.push({
      id: nextId('inspection'),
      kind: 'inspection',
      label: 'Robot Inspection',
      start: qualsStart,
      end: qualsStart + inspectionMinutes,
      detail: `Concurrent with matches · ${config.inspection.tables} tables · ${config.inspection.minutesPerTeam} min each`,
      lane: 1,
    })
    blocks.push({
      id: nextId('judging'),
      kind: 'judging',
      label: 'Judging — Initial Interviews',
      start: qualsStart,
      end: qualsStart + judgingMinutes,
      detail: `Concurrent with matches · ${config.judging.panels} panels · ${config.judging.interviewMinutes} min interview + ${config.judging.gapMinutes} min gap`,
      lane: 2,
    })
  }

  // T701: "typically just after the last scheduled Qualification MATCH".
  blocks.push({
    id: nextId('ceremony'),
    kind: 'ceremony',
    label: 'Alliance Selection',
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
      start: cursor,
      end: cursor + step.minutes,
      detail: step.kind === 'match' ? `Double elimination · ${allianceCount} alliances` : '',
      lane: 0,
    })
    cursor += step.minutes
  }

  const dayEnd = cursor

  const scheduledMatchCount = resolved.reduce((sum, r) => sum + r.count, 0)

  const activeCycles = config.matchBlocks
    .filter((_, i) => resolved[i].count > 0)
    .map((b) => b.cycleMinutes)
  const minTeamBreakMinutes = activeCycles.length
    ? Math.min(...activeCycles.map((c) => teamBreakMinutes(teams, c)))
    : 0

  const teamSlots = buildTeamSlots(config, qualsStart, concurrent, blocks)

  // Runs until the last team's judging slot — the point after which nobody can still
  // be un-checked-in.
  if (config.checkIn.mode === 'before-judging') {
    const judgingStarts = teamSlots.map((s) => s.judgingStart).filter((t): t is number => t !== null)
    const lastDeadline = judgingStarts.length ? Math.max(...judgingStarts) : pitsOpenEnd
    blocks.push({
      id: nextId('checkin'),
      kind: 'checkin',
      label: 'Check-In (rolling)',
      start: dayStart,
      end: lastDeadline,
      detail: 'Each team checks in before its own judging slot (I102, Event Director exception)',
      lane: 3,
    })
  }

  return {
    blocks,
    teamSlots,
    derived: {
      resolvedBlocks: resolved,
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
      dayStart,
      dayEnd,
      dayLengthMinutes: dayEnd - dayStart,
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
 */
function buildTeamSlots(
  config: EventConfig,
  qualsStart: number,
  concurrent: boolean,
  blocks: readonly Block[],
): TeamSlot[] {
  const teams = Math.max(0, Math.floor(config.numTeams))
  const slots: TeamSlot[] = []

  const judgingBlock = blocks.find((b) => b.kind === 'judging')
  const inspectionBlock = blocks.find((b) => b.kind === 'inspection')
  const judgingBase = judgingBlock ? judgingBlock.start : qualsStart
  const inspectionBase = inspectionBlock ? inspectionBlock.start : qualsStart

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
      judgingStart: judgingBase + judgingRound * interviewStride,
      judgingPanel,
      inspectionStart: config.inspection.scheduled
        ? inspectionBase + inspectionRound * config.inspection.minutesPerTeam
        : null,
      inspectionTable: config.inspection.scheduled ? inspectionTable : null,
    })
  }

  return slots
}
