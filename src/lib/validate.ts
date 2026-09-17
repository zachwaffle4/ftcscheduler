/**
 * Checks a generated schedule and reports what a director should know about it.
 *
 * Two kinds of finding come out of here. Most are competition manual rules, and those
 * name the rule or section they come from — "I102", "§13.6.1" — so they can be looked
 * up and argued with. The rest are practical checks the manual says nothing about:
 * whether the match blocks add up, whether a time-windowed block can still happen,
 * whether the day runs past the target end time. Those carry a plain label instead of
 * a citation, which is what distinguishes them in the UI.
 */

import {
  CHECKIN_DEADLINE_BEFORE_QUALS_MINUTES,
  INTERVIEW_MIN_MINUTES,
  MATCH_PLAY_SECONDS,
  MAX_TEAMS,
  MIN_TEAMS,
  PLAYOFF_MIN_BREAK_MINUTES,
  PLAYOFF_NOMINAL_CYCLE_MINUTES,
  QUAL_MIN_BREAK_MINUTES,
  QUALS_PER_TEAM_MAX,
  QUALS_PER_TEAM_MIN,
  SCHEDULE_PUBLISH_LEAD_MINUTES,
} from './manual'
import { fmtDuration, fmtMinSec, fmtTime, parseTime } from './format'
import { suggestedCycleMinutes, type EventConfig, type Schedule } from './schedule'

export type FindingLevel = 'error' | 'warn' | 'info' | 'ok'

export type Finding = {
  level: FindingLevel
  /**
   * A manual citation ("I102", "§13.6.1") for rule checks, or a plain label
   * ("Coverage", "Day length") for the practical ones.
   */
  rule: string
  message: string
}

export function validate(config: EventConfig, schedule: Schedule): Finding[] {
  const out: Finding[] = []
  const d = schedule.derived
  const teams = Math.floor(config.numTeams)

  if (teams < MIN_TEAMS) {
    out.push({
      level: 'error',
      rule: 'Table 13-2',
      message: `${teams} teams is below the ${MIN_TEAMS}-team minimum the playoff alliance table covers.`,
    })
  } else if (teams > MAX_TEAMS) {
    out.push({
      level: 'error',
      rule: 'Table 13-2',
      message: `${teams} teams exceeds the ${MAX_TEAMS}-team maximum in the playoff alliance table. Consider a dual division event (§13.8).`,
    })
  }

  // Which I102 check applies depends on how the region runs check-in.
  const pitsOpen = schedule.blocks.find((b) => b.kind === 'checkin' && b.lane === 0)

  if (config.checkIn.mode === 'deadline') {
    if (pitsOpen) {
      const lead = d.qualsStart - pitsOpen.end
      if (lead < CHECKIN_DEADLINE_BEFORE_QUALS_MINUTES) {
        out.push({
          level: 'error',
          rule: 'I102',
          message: `Check-in closes ${fmtDuration(Math.max(0, lead))} before qualification matches; the manual requires at least ${CHECKIN_DEADLINE_BEFORE_QUALS_MINUTES} minutes. Start the day ${fmtDuration(CHECKIN_DEADLINE_BEFORE_QUALS_MINUTES - lead)} earlier or shorten check-in.`,
        })
      } else {
        out.push({
          level: 'ok',
          rule: 'I102',
          message: `Check-in closes ${fmtDuration(lead)} before qualification matches (${CHECKIN_DEADLINE_BEFORE_QUALS_MINUTES} min required).`,
        })
      }
    }

    if (pitsOpen && d.qualsStart - pitsOpen.end < SCHEDULE_PUBLISH_LEAD_MINUTES) {
      out.push({
        level: 'warn',
        rule: '§13.6.1',
        message: `The qualification schedule must be published no later than ${SCHEDULE_PUBLISH_LEAD_MINUTES} minutes before matches begin — that falls before check-in closes here.`,
      })
    }
  } else {
    // Rolling check-in. I102's own wording permits this, so it is not a violation.
    out.push({
      level: 'info',
      rule: 'I102',
      message:
        'Check-in stays open, with each team due before its own judging slot. I102 allows this — the 45-minute deadline applies "unless otherwise specified or approved by the Event Director".',
    })

    // The real constraint: the first team due must have had a chance to check in.
    const firstJudging = schedule.teamSlots
      .map((s) => s.judgingStart)
      .filter((t): t is number => t !== null)
      .reduce<number | null>((min, t) => (min === null || t < min ? t : min), null)

    if (pitsOpen && firstJudging !== null && firstJudging < pitsOpen.end) {
      out.push({
        level: 'warn',
        rule: 'I102',
        message: `The first judging slot is at ${fmtTime(firstJudging)}, before the pits-open window ends at ${fmtTime(pitsOpen.end)}. That team has no window in which to check in — start judging later or open the pits earlier.`,
      })
    } else if (pitsOpen && firstJudging !== null) {
      out.push({
        level: 'ok',
        rule: 'I102',
        message: `Teams have from ${fmtTime(pitsOpen.start)} until their judging slot to check in; the earliest deadline is ${fmtTime(firstJudging)}.`,
      })
    }
  }

  if (config.judging.interviewMinutes < INTERVIEW_MIN_MINUTES) {
    out.push({
      level: 'error',
      rule: 'A205',
      message: `Initial Interviews are ${config.judging.interviewMinutes} minutes; the manual requires at least ${INTERVIEW_MIN_MINUTES} minutes for every team.`,
    })
  } else {
    out.push({
      level: 'ok',
      rule: 'A205',
      message: `${config.judging.interviewMinutes}-minute interviews, equal for all ${teams} teams (${INTERVIEW_MIN_MINUTES} min minimum).`,
    })
  }

  if (config.qualsPerTeam < QUALS_PER_TEAM_MIN || config.qualsPerTeam > QUALS_PER_TEAM_MAX) {
    out.push({
      level: 'warn',
      rule: '§13.6.1',
      message: `${config.qualsPerTeam} qualification matches per team is outside the standard ${QUALS_PER_TEAM_MIN}–${QUALS_PER_TEAM_MAX}. Only Championship and Premier events schedule more, at FIRST HQ's discretion.`,
    })
  }

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
      message: `“${block.label}” is set to end by ${fmtTime(parseTime(block.endTime))}, but the schedule doesn't reach it until ${fmtTime(r.start)}, so it holds no matches. Push its end time later or shorten what runs before it.`,
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
  const floorMinutes = Math.ceil(MATCH_PLAY_SECONDS / 60) + 1
  for (const block of config.matchBlocks) {
    if (block.cycleMinutes < floorMinutes) {
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

  // Compressing the cadence squeezes the T406.B turnaround the bracket's Blue/Red
  // Gap columns depend on.
  const playoffFloor = Math.ceil(MATCH_PLAY_SECONDS / 60)
  if (config.playoff.cycleMinutes < floorMinutes) {
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

  const allianceSelection = schedule.blocks.find((b) => b.label === 'Alliance Selection')
  const judging = schedule.blocks.find((b) => b.kind === 'judging')
  if (judging && allianceSelection && judging.end > allianceSelection.start) {
    out.push({
      level: 'error',
      rule: '§6.1.2',
      message: `Judging runs until ${fmtTime(judging.end)}, past the start of alliance selection at ${fmtTime(allianceSelection.start)}. Judges need deliberation time before awards — add panels or shorten interviews.`,
    })
  }

  if (config.judging.mode === 'concurrent') {
    const matchWindow = d.qualsEnd - d.qualsStart
    if (d.judgingMinutes > matchWindow) {
      out.push({
        level: 'error',
        rule: '§6.1.2',
        message: `Judging needs ${fmtDuration(d.judgingMinutes)} but the qualification block is only ${fmtDuration(matchWindow)}. Add panels, shorten interviews, or switch to a dedicated judging window.`,
      })
    }
    if (d.inspectionMinutes > matchWindow) {
      out.push({
        level: 'error',
        rule: '§3.3.1',
        message: `Inspection needs ${fmtDuration(d.inspectionMinutes)} but the qualification block is only ${fmtDuration(matchWindow)}. Teams must pass inspection before playing qualification matches.`,
      })
    }
  }

  const practice = schedule.blocks.find((b) => b.kind === 'practice')
  if (practice && practice.lane > 0) {
    out.push({
      level: 'info',
      rule: '§3.3',
      message:
        'Practice matches run alongside inspection and judging. Teams may play scheduled practice matches before passing inspection — but not unscheduled or filler-line ones, so keep the practice field on its schedule.',
    })

    const inspectionBlock = schedule.blocks.find((b) => b.kind === 'inspection')
    const judgingBlock = schedule.blocks.find((b) => b.kind === 'judging')
    const window = Math.max(
      inspectionBlock ? inspectionBlock.end - inspectionBlock.start : 0,
      judgingBlock ? judgingBlock.end - judgingBlock.start : 0,
    )
    if (practice.end - practice.start > window) {
      out.push({
        level: 'warn',
        rule: 'Practice',
        message: `Practice matches need ${fmtDuration(practice.end - practice.start)}, longer than the ${fmtDuration(window)} inspection and judging window, so they set the pre-match schedule instead of hiding inside it.`,
      })
    }
  }

  const inspection = schedule.blocks.find((b) => b.kind === 'inspection')
  if (config.judging.mode === 'concurrent' && inspection) {
    out.push({
      level: 'warn',
      rule: '§3.3.1',
      message: `Inspection runs until ${fmtTime(inspection.end)}, after matches begin. Teams cannot play qualification matches before passing inspection — make sure early-match teams are inspected first.`,
    })
  }

  const target = parseTime(config.targetEndTime)
  if (target > 0 && d.dayEnd > target) {
    out.push({
      level: 'warn',
      rule: 'Day length',
      message: `The event ends at ${fmtTime(d.dayEnd)}, ${fmtDuration(d.dayEnd - target)} past the ${fmtTime(target)} target. Total day is ${fmtDuration(d.dayLengthMinutes)}.`,
    })
  } else if (target > 0) {
    out.push({
      level: 'ok',
      rule: 'Day length',
      message: `The event ends at ${fmtTime(d.dayEnd)}, within the ${fmtTime(target)} target. Total day is ${fmtDuration(d.dayLengthMinutes)}.`,
    })
  }

  const order: Record<FindingLevel, number> = { error: 0, warn: 1, info: 2, ok: 3 }
  return out.sort((a, b) => order[a.level] - order[b.level])
}
