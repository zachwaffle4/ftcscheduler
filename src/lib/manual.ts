/**
 * Every timing constant this app relies on, sourced from the FIRST Tech Challenge
 * 2026-2027 BIOBUZZ Competition Manual (V1), with the section or rule number that
 * establishes it.
 *
 * https://ftc-resources.firstinspires.org/ftc/game/cm-html/BIOBUZZ%20Competition%20Manual%20-%20V1.htm
 *
 * Anything the manual does *not* specify is deliberately absent from this file and
 * lives in the user-editable config instead (field reset time, inspection duration,
 * ceremony lengths, alliance selection duration). Keeping the line sharp is the point:
 * if a number is here, it is a rule; if it isn't, it's an Event Director's choice.
 */

export const MANUAL_VERSION = '2026-2027 BIOBUZZ Competition Manual, TU01'
export const MANUAL_URL =
  'https://ftc-resources.firstinspires.org/ftc/game/cm-html/BIOBUZZ%20Competition%20Manual%20-%20TU01.htm'

/* ---------------------------------------------------------------- MATCH play */

/** §10.4 — "The first period of each MATCH is 30 seconds (0:30) long". */
export const AUTO_SECONDS = 30

/** §10.4 — "There is an 8-second transition period between AUTO and TELEOP". */
export const TRANSITION_SECONDS = 8

/** §10.4 — "The third period of each MATCH is 2 minutes (2:00) long". */
export const TELEOP_SECONDS = 120

/**
 * Total ball-in-play time: 2:38. The manual says nothing about field reset or
 * staging, so this is a floor on cycle time, never the cycle time itself.
 */
export const MATCH_PLAY_SECONDS = AUTO_SECONDS + TRANSITION_SECONDS + TELEOP_SECONDS

/* ------------------------------------------------------- Qualification MATCHES */

/** §13.4 — RED ALLIANCE vs. BLUE ALLIANCE, two teams each. */
export const TEAMS_PER_MATCH = 4

/**
 * §13.6.1 — "All event types will schedule either 5 or 6 Qualification MATCHES per
 * team as determined by the Event Director based on available schedule time
 * allocated." Championship-level events may schedule more at FIRST HQ's discretion.
 */
export const QUALS_PER_TEAM_MIN = 5
export const QUALS_PER_TEAM_MAX = 6

/**
 * §13.6.1 — the schedule is published "no later than 15 minutes before Qualification
 * MATCHES are scheduled to begin."
 */
export const SCHEDULE_PUBLISH_LEAD_MINUTES = 15

/** T406.A — minimum break between a team's back-to-back Qualification MATCHES. */
export const QUAL_MIN_BREAK_MINUTES = 5

/** T406.B — minimum break between a team's back-to-back Playoff MATCHES. */
export const PLAYOFF_MIN_BREAK_MINUTES = 8

/* ------------------------------------------------------------------ Check-in */

/**
 * I102 — "An adult team member must check-in at the Pit Administration station...
 * no later than 45 minutes before Qualification MATCHES are scheduled to start".
 */
export const CHECKIN_DEADLINE_BEFORE_QUALS_MINUTES = 45

/* ------------------------------------------------------------------- Judging */

/**
 * A205 — "All teams will be scheduled for the same length Initial Interview of at
 * least 10 minutes."
 */
export const INTERVIEW_MIN_MINUTES = 10

/**
 * A207 — "The first 5 minutes of the Initial Interview are reserved for the team to
 * present a prepared oral presentation uninterrupted."
 */
export const INTERVIEW_PRESENTATION_MINUTES = 5

/* ------------------------------------------------------------------ Playoffs */

/**
 * Table 13-2 — number of playoff ALLIANCES formed, by the count of teams that
 * participated in Qualification MATCHES.
 */
const ALLIANCE_TABLE: ReadonlyArray<{ maxTeams: number; alliances: number }> = [
  { maxTeams: 10, alliances: 2 },
  { maxTeams: 20, alliances: 4 },
  { maxTeams: 40, alliances: 6 },
  { maxTeams: 64, alliances: 8 },
]

/** Table 13-2's range: the table starts at 4 teams and ends at 64. */
export const MIN_TEAMS = 4
export const MAX_TEAMS = 64

export type AllianceCount = 2 | 4 | 6 | 8

/** Table 13-2 lookup. Clamps outside the table's range; validate.ts flags that separately. */
export function allianceCountForTeams(teams: number): AllianceCount {
  for (const row of ALLIANCE_TABLE) {
    if (teams <= row.maxTeams) return row.alliances as AllianceCount
  }
  return 8
}

export type PlayoffRow = {
  /** Match number within the bracket, or null for a break/awards row. */
  match: number | null
  label: string
  /** Minutes from the start of the playoff block, per the manual's own estimate. */
  startMinute: number
  /** "if required" matches — played only when the lower bracket forces a second final. */
  ifRequired: boolean
  kind: 'match' | 'break' | 'awards'
}

/**
 * Tables 13-3 through 13-6: the manual's own "typical timing" for each bracket size,
 * as estimated start minutes relative to the first playoff match.
 *
 * Transcribing these beats simulating a bracket, because they already account for the
 * 15-minute award breaks woven between the later rounds (§5.7 — "Closing ceremony
 * elements... are integrated into and presented between Playoff MATCHES") and for the
 * T406.B 8-minute minimum turnaround.
 *
 * This is the raw table. `playoffTimeline` converts it to durations and rescales it to
 * whatever bracket timing the director has configured; at the default timing it
 * reproduces these start minutes exactly.
 *
 * Note the steady 6-minute cadence within a round — that is the manual's own implied
 * match cycle time, and the basis for this app's suggested default.
 */
export const PLAYOFF_SCHEDULES: Record<AllianceCount, ReadonlyArray<PlayoffRow>> = {
  // Table 13-3: 2-ALLIANCE bracket.
  2: [
    { match: null, label: 'Break — Judges’ Choice, Innovate/Design/Control Award', startMinute: 0, ifRequired: false, kind: 'break' },
    { match: 1, label: 'Finals 1', startMinute: 15, ifRequired: false, kind: 'match' },
    { match: null, label: 'Break — Sustain/Reach/Connect Award', startMinute: 18, ifRequired: false, kind: 'break' },
    { match: 2, label: 'Finals 2', startMinute: 33, ifRequired: false, kind: 'match' },
    { match: null, label: 'Break — Think Award', startMinute: 36, ifRequired: false, kind: 'break' },
    { match: 3, label: 'Finals 3 (if required)', startMinute: 51, ifRequired: true, kind: 'match' },
    { match: null, label: 'Awards — Compass, Finalists, Winners, Inspire', startMinute: 54, ifRequired: false, kind: 'awards' },
  ],
  // Table 13-4: 4-ALLIANCE bracket.
  4: [
    { match: 1, label: 'Round 1 — Match 1 (Upper)', startMinute: 0, ifRequired: false, kind: 'match' },
    { match: 2, label: 'Round 1 — Match 2 (Upper)', startMinute: 6, ifRequired: false, kind: 'match' },
    { match: null, label: 'Break', startMinute: 9, ifRequired: false, kind: 'break' },
    { match: 3, label: 'Round 2 — Match 3 (Lower)', startMinute: 25, ifRequired: false, kind: 'match' },
    { match: 4, label: 'Round 2 — Match 4 (Upper)', startMinute: 31, ifRequired: false, kind: 'match' },
    { match: null, label: 'Break — Judges’ Choice, Design Award, Reach Award', startMinute: 33, ifRequired: false, kind: 'break' },
    { match: 5, label: 'Round 3 — Match 5 (Lower)', startMinute: 48, ifRequired: false, kind: 'match' },
    { match: null, label: 'Break — Control, Innovate, Sustain Award', startMinute: 51, ifRequired: false, kind: 'break' },
    { match: 6, label: 'Finals 1', startMinute: 66, ifRequired: false, kind: 'match' },
    { match: null, label: 'Break — Connect Award, Think Award', startMinute: 69, ifRequired: false, kind: 'break' },
    { match: 7, label: 'Finals 2 (if required)', startMinute: 84, ifRequired: true, kind: 'match' },
    { match: null, label: 'Awards — Compass, Finalists, Winners, Inspire', startMinute: 87, ifRequired: false, kind: 'awards' },
  ],
  // Table 13-5: 6-ALLIANCE bracket.
  6: [
    { match: 1, label: 'Round 1 — Match 1 (Upper)', startMinute: 0, ifRequired: false, kind: 'match' },
    { match: 2, label: 'Round 1 — Match 2 (Upper)', startMinute: 6, ifRequired: false, kind: 'match' },
    { match: 3, label: 'Round 2 — Match 3 (Upper)', startMinute: 12, ifRequired: false, kind: 'match' },
    { match: 4, label: 'Round 2 — Match 4 (Upper)', startMinute: 18, ifRequired: false, kind: 'match' },
    { match: 5, label: 'Round 3 — Match 5 (Lower)', startMinute: 24, ifRequired: false, kind: 'match' },
    { match: 6, label: 'Round 3 — Match 6 (Lower)', startMinute: 30, ifRequired: false, kind: 'match' },
    { match: 7, label: 'Round 4 — Match 7 (Upper)', startMinute: 36, ifRequired: false, kind: 'match' },
    { match: 8, label: 'Round 4 — Match 8 (Lower)', startMinute: 42, ifRequired: false, kind: 'match' },
    { match: null, label: 'Break — Judges’ Choice, Design Award, Reach Award', startMinute: 45, ifRequired: false, kind: 'break' },
    { match: 9, label: 'Round 5 — Match 9 (Lower)', startMinute: 60, ifRequired: false, kind: 'match' },
    { match: null, label: 'Break — Control, Innovate, Sustain Award', startMinute: 63, ifRequired: false, kind: 'break' },
    { match: 10, label: 'Finals 1', startMinute: 78, ifRequired: false, kind: 'match' },
    { match: null, label: 'Break — Connect Award, Think Award', startMinute: 81, ifRequired: false, kind: 'break' },
    { match: 11, label: 'Finals 2 (if required)', startMinute: 96, ifRequired: true, kind: 'match' },
    { match: null, label: 'Awards — Compass, Finalists, Winners, Inspire', startMinute: 99, ifRequired: false, kind: 'awards' },
  ],
  // Table 13-6: 8-ALLIANCE bracket.
  8: [
    { match: 1, label: 'Round 1 — Match 1 (Upper)', startMinute: 0, ifRequired: false, kind: 'match' },
    { match: 2, label: 'Round 1 — Match 2 (Upper)', startMinute: 6, ifRequired: false, kind: 'match' },
    { match: 3, label: 'Round 1 — Match 3 (Upper)', startMinute: 12, ifRequired: false, kind: 'match' },
    { match: 4, label: 'Round 1 — Match 4 (Upper)', startMinute: 18, ifRequired: false, kind: 'match' },
    { match: 5, label: 'Round 2 — Match 5 (Lower)', startMinute: 24, ifRequired: false, kind: 'match' },
    { match: 6, label: 'Round 2 — Match 6 (Lower)', startMinute: 30, ifRequired: false, kind: 'match' },
    { match: 7, label: 'Round 2 — Match 7 (Upper)', startMinute: 36, ifRequired: false, kind: 'match' },
    { match: 8, label: 'Round 2 — Match 8 (Upper)', startMinute: 42, ifRequired: false, kind: 'match' },
    { match: 9, label: 'Round 3 — Match 9 (Lower)', startMinute: 48, ifRequired: false, kind: 'match' },
    { match: 10, label: 'Round 3 — Match 10 (Lower)', startMinute: 54, ifRequired: false, kind: 'match' },
    { match: 11, label: 'Round 4 — Match 11 (Upper)', startMinute: 60, ifRequired: false, kind: 'match' },
    { match: 12, label: 'Round 4 — Match 12 (Lower)', startMinute: 66, ifRequired: false, kind: 'match' },
    { match: null, label: 'Break — Judges’ Choice, Design Award, Reach Award', startMinute: 69, ifRequired: false, kind: 'break' },
    { match: 13, label: 'Round 5 — Match 13 (Lower)', startMinute: 84, ifRequired: false, kind: 'match' },
    { match: null, label: 'Break — Control, Innovate, Sustain Award', startMinute: 87, ifRequired: false, kind: 'break' },
    { match: 14, label: 'Finals 1', startMinute: 102, ifRequired: false, kind: 'match' },
    { match: null, label: 'Break — Connect Award, Think Award', startMinute: 105, ifRequired: false, kind: 'break' },
    { match: 15, label: 'Finals 2 (if required)', startMinute: 120, ifRequired: true, kind: 'match' },
    { match: null, label: 'Awards — Compass, Finalists, Winners, Inspire', startMinute: 123, ifRequired: false, kind: 'awards' },
  ],
}

/**
 * The match-to-match cadence baked into Tables 13-3 through 13-6. Every gap between
 * two consecutive playoff matches in those tables is exactly this, which is what makes
 * the tables rescalable to a different playoff cycle time.
 */
export const PLAYOFF_NOMINAL_CYCLE_MINUTES = 6

/**
 * The gap the tables allot a match that is immediately followed by an award break:
 * long enough to play and post results, with the field reset happening during the
 * ceremony. Every finals match falls in this category, which is why finals need their
 * own control rather than riding the cadence.
 */
export const PLAYOFF_NOMINAL_FINALS_SLOT_MINUTES = 3

/** The award break woven between the later rounds, and the closing awards ceremony. */
export const PLAYOFF_NOMINAL_AWARD_BREAK_MINUTES = 15

export type PlayoffTiming = {
  /** Minutes between consecutive playoff matches within a round. */
  cycleMinutes: number
  /** Minutes allotted a match that runs immediately before an award break. */
  finalsSlotMinutes: number
  /** Minutes for each award break, including the closing awards ceremony. */
  awardBreakMinutes: number
}

export const DEFAULT_PLAYOFF_TIMING: PlayoffTiming = {
  cycleMinutes: PLAYOFF_NOMINAL_CYCLE_MINUTES,
  finalsSlotMinutes: PLAYOFF_NOMINAL_FINALS_SLOT_MINUTES,
  awardBreakMinutes: PLAYOFF_NOMINAL_AWARD_BREAK_MINUTES,
}

export type PlayoffStep = {
  label: string
  kind: PlayoffRow['kind']
  minutes: number
  ifRequired: boolean
}

/**
 * Convert a bracket's table into a list of durations, rescaled to the given timing.
 *
 * The tables contain exactly three kinds of gap, each with its own control:
 *   · 6 min  — one match to the next within a round  → `cycleMinutes`
 *   · 3 min  — a match immediately before a break    → `finalsSlotMinutes`
 *   · 15 min — an award break, and the closing awards → `awardBreakMinutes`
 *
 * Table 13-4 has two rounding quirks — a 16-minute break and a 2-minute gap where the
 * others use 15 and 3. Those are carried through as offsets from the nominal value
 * rather than overwritten, so the manual's timing is reproduced exactly at the default
 * timing and the quirks scale along with everything else.
 */
export function playoffTimeline(
  alliances: AllianceCount,
  includeIfRequired: boolean,
  timing: Partial<PlayoffTiming> = {},
): PlayoffStep[] {
  const { cycleMinutes, finalsSlotMinutes, awardBreakMinutes } = { ...DEFAULT_PLAYOFF_TIMING, ...timing }
  const rows = PLAYOFF_SCHEDULES[alliances]

  const steps: PlayoffStep[] = rows.map((row, i) => {
    const next = rows[i + 1]
    const gap = next ? next.startMinute - row.startMinute : PLAYOFF_NOMINAL_AWARD_BREAK_MINUTES

    let minutes: number
    if (row.kind !== 'match') {
      minutes = awardBreakMinutes + (gap - PLAYOFF_NOMINAL_AWARD_BREAK_MINUTES)
    } else if (gap === PLAYOFF_NOMINAL_CYCLE_MINUTES) {
      minutes = cycleMinutes
    } else {
      minutes = finalsSlotMinutes + (gap - PLAYOFF_NOMINAL_FINALS_SLOT_MINUTES)
    }

    return { label: row.label, kind: row.kind, minutes: Math.max(0, minutes), ifRequired: row.ifRequired }
  })

  return includeIfRequired ? steps : steps.filter((s) => !s.ifRequired)
}

/**
 * Total playoff block length in minutes, including the awards ceremony that closes it.
 * `includeIfRequired` controls whether the optional second final is budgeted for —
 * directors generally should, since they cannot know in advance.
 */
export function playoffMinutes(
  alliances: AllianceCount,
  includeIfRequired: boolean,
  timing: Partial<PlayoffTiming> = {},
): number {
  return playoffTimeline(alliances, includeIfRequired, timing).reduce((sum, s) => sum + s.minutes, 0)
}

/* ------------------------------------------------- Qualification match counts */

/** §13.6.2 — total Qualification MATCHES needed to give every team its rounds. */
export function qualMatchCount(teams: number, qualsPerTeam: number): number {
  return Math.ceil((teams * qualsPerTeam) / TEAMS_PER_MATCH)
}

/**
 * §13.6.2 — "All teams are assigned the same number of Qualification MATCHES, equal to
 * the number of rounds, unless the number of teams multiplied by number of MATCHES is
 * not divisible by 4. In this case, the FIRST event management software randomly
 * selects some teams to play an extra MATCH... designated as SURROGATES."
 *
 * The shortfall against a whole number of matches is exactly how many surrogate
 * appearances have to be manufactured.
 */
export function surrogateCount(teams: number, qualsPerTeam: number): number {
  return (TEAMS_PER_MATCH - ((teams * qualsPerTeam) % TEAMS_PER_MATCH)) % TEAMS_PER_MATCH
}
