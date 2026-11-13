/**
 * The shapes the scheduling engine reads and writes: the config a director edits, and the
 * schedule that comes out of it. Types only — nothing in here runs.
 *
 * Times on a `Block` are minutes since midnight *of that block's own day*, with `day`
 * saying which day that is. Comparing two blocks that might sit on different days means
 * going through `absMinute` (see helpers.ts).
 */

import type { AllianceCount, PlayoffTiming } from '../manual'

/* ------------------------------------------------------------------- Config */

/**
 * A break that isn't part of any match block: lunch, a field reset, a judges' huddle. It
 * sits on a day, either at a clock time or right after another block on that day.
 */
export type DayBreak = {
  id: string
  /** "Lunch". */
  label: string
  /**
   * "HH:MM" on the day's own clock — when the break is meant to begin. Ignored while
   * `afterBlock` is set, but kept so switching back to a clock time restores it.
   */
  startTime: string
  /**
   * What this break follows: a match block's id, or an `ITEM_*` key for one of the day's
   * other blocks (inspection, practice, a ceremony…). When set, the break begins the moment
   * that block ends, wherever that turns out to be, and `startTime` plays no part. null
   * means the break is pinned to `startTime` instead. See `anchorOptions`.
   */
  afterBlock: string | null
  minutes: number
}

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
  /**
   * Free-standing breaks, pinned to the day's clock or to another block rather than
   * belonging to a match block, so lunch can fall in the middle of inspection, judging or
   * practice as readily as between match blocks. See `DayClock` for exactly where each
   * one lands.
   */
  breaks: DayBreak[]
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
}

/** A block's size and placement, once the event's layout is known. */
export type ResolvedBlock = {
  day: number
  count: number
  /** Minutes since midnight of `day`. `end` is the last segment's end. */
  start: number
  end: number
  /**
   * The runs of matches the block breaks into when a day-level break falls inside it.
   * One entry when nothing interrupts it; empty when the block holds no matches.
   */
  segments: { start: number; end: number; count: number }[]
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
  /**
   * Day-level breaks that never made it onto the timeline: nothing was scheduled on their
   * day at or after their start time, or they start before the day does.
   */
  unplacedBreaks: { day: number; brk: DayBreak }[]
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

/* ------------------------------------------------------------------- Clock */

/** A stretch of a day's clock, in minutes since midnight. */
export type Segment = { start: number; end: number }

/** A day-level break once the clock has taken it. */
export type PlacedBreak = { id: string; label: string; start: number; end: number }
