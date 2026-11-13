/**
 * Checks on the qualification match blocks: whether they add up, whether a window block
 * can still happen, and whether the cycle times are workable.
 */

import { MATCH_PLAY_SECONDS, QUAL_MIN_BREAK_MINUTES } from '../manual'
import { fmtDuration, fmtMinSec, fmtTime, parseTime } from '../format'
import { suggestedCycleMinutes } from '../schedule'
import { CYCLE_FLOOR_MINUTES, type CheckContext, type Finding } from './context'

export function checkBlocks(ctx: CheckContext): Finding[] {
  const { config, d, teams, multiDay, dayName } = ctx
  const out: Finding[] = []

  if (d.scheduledMatchCount !== d.qualMatchCount) {
    const delta = d.scheduledMatchCount - d.qualMatchCount
    out.push({
      level: 'error',
      rule: 'Coverage',
      message: `Match blocks schedule ${d.scheduledMatchCount} matches, but ${teams} teams × ${config.qualsPerTeam} matches needs ${d.qualMatchCount}. ${delta > 0 ? `${delta} too many` : `${-delta} short`}.`,
    })
  }

  config.matchBlocks.forEach((block, i) => {
    if (block.sizing !== 'window') return
    const r = d.resolvedBlocks[i]
    if (!r || r.count > 0) return
    out.push({
      level: 'error',
      rule: 'Block window',
      message: `“${block.label}” is set to end by ${fmtTime(parseTime(block.endTime))}, but ${multiDay ? dayName(r.day) : 'the schedule'} doesn't reach it until ${fmtTime(r.start)}, so it holds no matches. Push its end time later or shorten what runs before it.`,
    })
  })

  if (d.surrogateCount > 0) {
    out.push({
      level: 'info',
      rule: '§13.6.2',
      message: `${teams} × ${config.qualsPerTeam} = ${teams * config.qualsPerTeam} is not divisible by 4, so event software will assign ${d.surrogateCount} surrogate ${d.surrogateCount === 1 ? 'appearance' : 'appearances'}. Surrogate results do not count toward ranking.`,
    })
  }

  if (d.minTeamBreakMinutes < QUAL_MIN_BREAK_MINUTES) {
    out.push({
      level: 'warn',
      rule: 'T406',
      message: `Teams get roughly ${fmtDuration(d.minTeamBreakMinutes)} between their matches; the manual guarantees at least ${QUAL_MIN_BREAK_MINUTES} minutes. With ${teams} teams a full round is only ${Math.floor(teams / 4)} matches, so lengthen the cycle time or expect the schedule to slip.`,
    })
  } else {
    out.push({
      level: 'ok',
      rule: 'T406',
      message: `Teams get about ${fmtDuration(d.minTeamBreakMinutes)} between matches (${QUAL_MIN_BREAK_MINUTES} min minimum).`,
    })
  }

  const suggested = suggestedCycleMinutes(config.numFields)
  for (const block of config.matchBlocks) {
    if (block.cycleMinutes < CYCLE_FLOOR_MINUTES) {
      out.push({
        level: 'error',
        rule: '§10.4',
        message: `"${block.label}" runs a ${block.cycleMinutes}-minute cycle, but a match is ${fmtMinSec(MATCH_PLAY_SECONDS)} of play alone. That leaves no time to reset the field.`,
      })
    } else if (block.cycleMinutes < suggested) {
      out.push({
        level: 'warn',
        rule: 'Cycle time',
        message: `"${block.label}" runs a ${block.cycleMinutes}-minute cycle, faster than the ${suggested} minutes typical for ${config.numFields} field${config.numFields === 1 ? '' : 's'}. Achievable with a practiced crew, but leaves no slack.`,
      })
    }
  }

  return out
}
