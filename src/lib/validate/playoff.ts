/**
 * Checks on the playoff bracket's timing settings.
 */

import {
  MATCH_PLAY_SECONDS,
  PLAYOFF_MIN_BREAK_MINUTES,
  PLAYOFF_NOMINAL_CYCLE_MINUTES,
} from '../manual'
import { fmtMinSec } from '../format'
import { CYCLE_FLOOR_MINUTES, type CheckContext, type Finding } from './context'

export function checkPlayoff({ config }: CheckContext): Finding[] {
  const out: Finding[] = []

  // Compressing the cadence squeezes the T406.B turnaround the bracket's Blue/Red
  // Gap columns depend on.
  const playoffFloor = Math.ceil(MATCH_PLAY_SECONDS / 60)
  if (config.playoff.cycleMinutes < CYCLE_FLOOR_MINUTES) {
    out.push({
      level: 'error',
      rule: '§10.4',
      message: `A ${config.playoff.cycleMinutes}-minute playoff round cycle is shorter than the ${fmtMinSec(MATCH_PLAY_SECONDS)} a match takes to play, leaving no time to reset the field.`,
    })
  } else if (config.playoff.cycleMinutes < PLAYOFF_NOMINAL_CYCLE_MINUTES) {
    out.push({
      level: 'warn',
      rule: 'T406.B',
      message: `The playoff bracket runs a ${config.playoff.cycleMinutes}-minute round cycle, faster than the ${PLAYOFF_NOMINAL_CYCLE_MINUTES} minutes Tables 13-3…13-6 assume. Alliances are guaranteed ${PLAYOFF_MIN_BREAK_MINUTES} minutes between their matches, so back-to-back rounds may stall waiting for teams.`,
    })
  }

  // The finals slot is only the play-and-post-results window — the field is reset
  // during the award break that follows — so it floors at match play, not a full cycle.
  if (config.playoff.finalsSlotMinutes < playoffFloor) {
    out.push({
      level: 'error',
      rule: '§10.4',
      message: `A ${config.playoff.finalsSlotMinutes}-minute finals slot is shorter than the ${fmtMinSec(MATCH_PLAY_SECONDS)} a match takes to play.`,
    })
  }

  if (config.playoff.awardBreakMinutes < PLAYOFF_MIN_BREAK_MINUTES) {
    out.push({
      level: 'warn',
      rule: 'T406.B',
      message: `Award breaks are ${config.playoff.awardBreakMinutes} minutes. Alliances are guaranteed ${PLAYOFF_MIN_BREAK_MINUTES} minutes between their matches, and in the later rounds the award break is that turnaround.`,
    })
  }

  return out
}
