/**
 * Checks on judging, inspection and practice: whether each fits where it's been put.
 */

import { fmtDuration, fmtTime } from '../format'
import { blockEnd, blockStart } from '../schedule'
import type { CheckContext, Finding } from './context'

export function checkActivities(ctx: CheckContext): Finding[] {
  const { config, schedule, d, multiDay, judgingDay, inspectionDay, onDay, dayName, spanOf } = ctx
  const out: Finding[] = []

  const allianceSelection = schedule.blocks.find((b) => b.label === 'Alliance Selection')
  const judging = spanOf('judging')
  if (judging && allianceSelection && blockEnd(judging) > blockStart(allianceSelection)) {
    out.push({
      level: 'error',
      rule: '§6.1.2',
      message: `Judging runs until ${fmtTime(judging.end)}${onDay(judging.day)}, past the start of alliance selection at ${fmtTime(allianceSelection.start)}${onDay(allianceSelection.day)}. Judges need deliberation time before awards — add panels or shorten interviews.`,
    })
  }

  if (config.judging.mode === 'concurrent') {
    // Concurrent means concurrent with one day's matches — the window is that day's
    // match time, not the event's.
    const matchWindow = d.days[judgingDay].matchMinutes
    if (matchWindow === 0) {
      out.push({
        level: 'error',
        rule: '§6.1.2',
        message: `Judging is set to run concurrently with qualification matches${onDay(judgingDay)}, but no match blocks are assigned to that day. Move judging to a day that has matches, or give it a dedicated window.`,
      })
    } else if (d.judgingMinutes > matchWindow) {
      out.push({
        level: 'error',
        rule: '§6.1.2',
        message: `Judging needs ${fmtDuration(d.judgingMinutes)} but ${multiDay ? `${dayName(judgingDay)}'s` : 'the'} qualification matches only run for ${fmtDuration(matchWindow)}. Add panels, shorten interviews, move matches onto that day, or switch to a dedicated judging window.`,
      })
    }

    const inspectionWindow = d.days[inspectionDay].matchMinutes
    if (inspectionWindow > 0 && d.inspectionMinutes > inspectionWindow) {
      out.push({
        level: 'error',
        rule: '§3.3.1',
        message: `Inspection needs ${fmtDuration(d.inspectionMinutes)} but ${multiDay ? `${dayName(inspectionDay)}'s` : 'the'} qualification matches only run for ${fmtDuration(inspectionWindow)}. Teams must pass inspection before playing qualification matches.`,
      })
    }
  }

  const practice = spanOf('practice')
  if (practice && practice.lane > 0) {
    out.push({
      level: 'info',
      rule: '§3.3',
      message:
        'Practice matches run alongside inspection and judging. Teams may play scheduled practice matches before passing inspection — but not unscheduled or filler-line ones, so keep the practice field on its schedule.',
    })

    const inspectionBlock = spanOf('inspection')
    const judgingBlock = spanOf('judging')
    const window = Math.max(
      inspectionBlock && inspectionBlock.day === practice.day ? inspectionBlock.minutes : 0,
      judgingBlock && judgingBlock.day === practice.day ? judgingBlock.minutes : 0,
    )
    if (practice.minutes > window) {
      out.push({
        level: 'warn',
        rule: 'Practice',
        message: `Practice matches need ${fmtDuration(practice.minutes)}, longer than the ${fmtDuration(window)} inspection and judging window${onDay(practice.day)}, so they set the pre-match schedule instead of hiding inside it.`,
      })
    }
  }

  // Inspection has to be done before a team's first match, whichever day each is on.
  const inspection = spanOf('inspection')
  if (inspection && blockEnd(inspection) > d.qualsStart) {
    const late = inspectionDay > d.qualsStartDay
    out.push({
      level: late ? 'error' : 'warn',
      rule: '§3.3.1',
      message: late
        ? `Inspection is scheduled${onDay(inspectionDay)} but qualification matches begin${onDay(d.qualsStartDay)}. Teams cannot play qualification matches before passing inspection — move inspection to ${dayName(d.qualsStartDay)} or earlier.`
        : `Inspection runs until ${fmtTime(inspection.end)}${onDay(inspection.day)}, after matches begin. Teams cannot play qualification matches before passing inspection — make sure early-match teams are inspected first.`,
    })
  }

  return out
}
