/**
 * Checks that are about each day of the event: its length, whether it has anything on
 * it, whether its breaks made it onto the timeline.
 */

import { fmtDuration, fmtTime, parseTime } from '../format'
import { anchorOptions } from '../schedule'
import type { CheckContext, Finding } from './context'

export function checkDays(ctx: CheckContext): Finding[] {
  const { config, schedule, d, dayCount, multiDay, onDay, dayName } = ctx
  const out: Finding[] = []

  d.days.forEach((day, i) => {
    if (day.targetEnd > 0 && day.end > day.targetEnd) {
      out.push({
        level: 'warn',
        rule: 'Day length',
        message: `${multiDay ? `${day.label} ends` : 'The event ends'} at ${fmtTime(day.end)}, ${fmtDuration(day.end - day.targetEnd)} past the ${fmtTime(day.targetEnd)} target. ${multiDay ? 'That day' : 'Total day'} is ${fmtDuration(day.lengthMinutes)} long.`,
      })
    } else if (day.targetEnd > 0) {
      out.push({
        level: 'ok',
        rule: 'Day length',
        message: `${multiDay ? `${day.label} ends` : 'The event ends'} at ${fmtTime(day.end)}, within the ${fmtTime(day.targetEnd)} target. ${multiDay ? 'That day' : 'Total day'} is ${fmtDuration(day.lengthMinutes)} long.`,
      })
    }

    // A day carrying nothing but its own pits-open window is almost always a day that
    // was added and then never given any matches.
    const scheduled = schedule.blocks.filter((b) => b.day === i && b.kind !== 'checkin')
    if (multiDay && !scheduled.length) {
      out.push({
        level: 'warn',
        rule: 'Day structure',
        message: `Nothing is scheduled on ${day.label} beyond the pits opening. Assign it match blocks, move judging or inspection to it, or remove the day.`,
      })
    }

    // Dates out of order make every printout confusing, and the event's day order is
    // the list order, not the dates.
    if (i > 0 && day.date && d.days[i - 1].date && day.date <= d.days[i - 1].date) {
      out.push({
        level: 'warn',
        rule: 'Day order',
        message: `${day.label} is dated ${day.date}, which is not after ${d.days[i - 1].label} (${d.days[i - 1].date}). Days run in list order regardless, so the dates are what's wrong.`,
      })
    }
  })

  for (const { day, brk } of d.unplacedBreaks) {
    const name = brk.label || 'Break'
    if (brk.afterBlock) {
      // The block may be real but on another day, or have stopped existing — a deleted
      // match block, or judging moved to concurrent mode.
      const elsewhere = d.days
        .map((_, i) => ({ i, option: anchorOptions(config, i).find((o) => o.key === brk.afterBlock) }))
        .find((e) => e.option && e.i !== day)
      out.push({
        level: 'warn',
        rule: 'Break',
        message: elsewhere
          ? `${name} is set to follow “${elsewhere.option!.label}”, which runs on ${dayName(elsewhere.i)}, not ${dayName(day)}. It isn't on the timeline.`
          : `${name} is set to follow something this day no longer has. It isn't on the timeline.`,
      })
    } else {
      out.push({
        level: 'warn',
        rule: 'Break',
        message: `${name} is set for ${fmtTime(parseTime(brk.startTime))}${onDay(day)}, but nothing is scheduled then — the day is over before it, or it starts before the day does. It isn't on the timeline.`,
      })
    }
  }

  if (multiDay) {
    out.push({
      level: 'info',
      rule: 'Day structure',
      message: `${dayCount}-day event: ${d.days.map((day) => `${day.label} — ${day.matchCount} qual ${day.matchCount === 1 ? 'match' : 'matches'}, ${fmtDuration(day.lengthMinutes)}`).join(' · ')}. The playoff bracket and awards close ${dayName(dayCount - 1)}.`,
    })
  }

  return out
}
