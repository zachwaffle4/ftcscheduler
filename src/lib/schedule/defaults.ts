/**
 * The starting point: what a fresh event looks like, and the pieces added to it later (a
 * day, a break, a set of match blocks).
 */

import { addDaysIso } from '../format'
import { DEFAULT_PLAYOFF_TIMING, qualMatchCount } from '../manual'
import { suggestedCycleMinutes } from './helpers'
import type { DayBreak, EventConfig, EventDay, MatchBlock } from './types'

/** Today, as "YYYY-MM-DD". */
function today(): string {
  return new Date().toISOString().slice(0, 10)
}

let breakSeq = 0

/** A break for a day. Lunch at noon is what nearly everyone wants first. */
export function defaultDayBreak(): DayBreak {
  breakSeq += 1
  return {
    id: `break-${Date.now().toString(36)}-${breakSeq}`,
    label: 'Lunch',
    startTime: '12:00',
    afterBlock: null,
    minutes: 45,
  }
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
    breaks: [defaultDayBreak()],
  }
}

/**
 * A morning/afternoon pair of blocks for every day, with the event's matches shared out
 * between the days. Lunch comes from each day's own breaks, not from here.
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
    })
    out.push({
      id: `block-d${day + 1}-pm`,
      label: 'Afternoon Qualification Matches',
      day,
      sizing: day === days - 1 ? 'remaining' : 'count',
      matchCount: share - morning,
      endTime: '16:00',
      cycleMinutes: cycle,
    })
  }
  return out
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
