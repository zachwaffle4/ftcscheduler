/**
 * Checks on the event as a whole: how many teams, check-in, interviews, and how many
 * matches each team plays.
 */

import {
  CHECKIN_DEADLINE_BEFORE_QUALS_MINUTES,
  INTERVIEW_MIN_MINUTES,
  MAX_TEAMS,
  MIN_TEAMS,
  QUALS_PER_TEAM_MAX,
  QUALS_PER_TEAM_MIN,
  SCHEDULE_PUBLISH_LEAD_MINUTES,
} from '../manual'
import { fmtDuration, fmtTime } from '../format'
import { absMinute } from '../schedule'
import type { CheckContext, Finding } from './context'

export function checkEvent(ctx: CheckContext): Finding[] {
  const { config, schedule, d, teams, judgingDay, onDay, dayName } = ctx
  const out: Finding[] = []

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
  const pitsOpen = schedule.blocks.find((b) => b.kind === 'checkin' && b.lane === 0 && b.day === 0)

  if (config.checkIn.mode === 'deadline') {
    if (pitsOpen && d.qualsStartDay > 0) {
      // Nothing to check: the deadline is on the first day and matches are a day or
      // more later, which clears 45 minutes by a wide margin.
      out.push({
        level: 'ok',
        rule: 'I102',
        message: `Check-in closes at ${fmtTime(pitsOpen.end)} on ${dayName(0)}, and qualification matches don't begin until ${dayName(d.qualsStartDay)} — comfortably clear of the ${CHECKIN_DEADLINE_BEFORE_QUALS_MINUTES}-minute deadline.`,
      })
    } else if (pitsOpen) {
      const lead = d.qualsStart - absMinute(0, pitsOpen.end)
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

      if (lead < SCHEDULE_PUBLISH_LEAD_MINUTES) {
        out.push({
          level: 'warn',
          rule: '§13.6.1',
          message: `The qualification schedule must be published no later than ${SCHEDULE_PUBLISH_LEAD_MINUTES} minutes before matches begin — that falls before check-in closes here.`,
        })
      }
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

    if (pitsOpen && firstJudging !== null) {
      const deadline = absMinute(judgingDay, firstJudging)
      if (deadline < absMinute(0, pitsOpen.end)) {
        out.push({
          level: 'warn',
          rule: 'I102',
          message: `The first judging slot is at ${fmtTime(firstJudging)}${onDay(judgingDay)}, before the pits-open window ends at ${fmtTime(pitsOpen.end)}. That team has no window in which to check in — start judging later or open the pits earlier.`,
        })
      } else {
        out.push({
          level: 'ok',
          rule: 'I102',
          message: `Teams have from ${fmtTime(pitsOpen.start)} until their judging slot to check in; the earliest deadline is ${fmtTime(firstJudging)}${onDay(judgingDay)}.`,
        })
      }
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
    // Championship-level and Premier events are exactly the exception §13.6.1 names, so
    // saying so downgrades this from something to fix to something to have approved.
    const sanctioned = config.championshipLevel && config.qualsPerTeam > QUALS_PER_TEAM_MAX
    out.push({
      level: sanctioned ? 'info' : 'warn',
      rule: '§13.6.1',
      message: sanctioned
        ? `${config.qualsPerTeam} qualification matches per team is above the standard ${QUALS_PER_TEAM_MIN}–${QUALS_PER_TEAM_MAX}, which Championship and Premier events schedule at FIRST HQ's discretion. Confirm the extra rounds are approved for this event.`
        : `${config.qualsPerTeam} qualification matches per team is outside the standard ${QUALS_PER_TEAM_MIN}–${QUALS_PER_TEAM_MAX}. Only Championship and Premier events schedule more, at FIRST HQ's discretion.`,
    })
  }

  return out
}
