/**
 * Loading a saved or shared config. These arrive from localStorage and from `?c=` links,
 * either of which can predate the current shape, so every field is read defensively and
 * older shapes are carried forward rather than discarded.
 */

import { defaultConfig, defaultEventDay } from './defaults'
import { clampDay, suggestedCycleMinutes } from './helpers'
import type { BlockSizing, DayBreak, EventConfig, EventDay, MatchBlock } from './types'

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function str(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

/**
 * Bring a match block from any previously-persisted shape up to the current one.
 *
 * Blocks arrive from localStorage and from shared links, both of which can predate the
 * current shape — notably `matchCount: 'remaining'` from before `sizing` existed, blocks
 * with no `endTime`, and blocks from before events had more than one day. Merging over
 * the defaults doesn't reach inside an array, so every block has to be rebuilt field by
 * field rather than spread.
 */
function normalizeMatchBlock(
  raw: unknown,
  index: number,
  fallbackCycle: number,
  dayCount: number,
): MatchBlock {
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

  // `breakAfter` is dropped here on purpose; `normalizeConfig` reads it off the raw block
  // and turns it into a day-level break.
  return {
    id: typeof b.id === 'string' ? b.id : `block-${index}`,
    label: typeof b.label === 'string' ? b.label : `Match Block ${index + 1}`,
    // A pre-multi-day block has no day at all, which clamps to the first one.
    day: clampDay(b.day, dayCount),
    sizing,
    matchCount,
    endTime: typeof b.endTime === 'string' ? b.endTime : '12:00',
    cycleMinutes,
  }
}

/** A match block's retired `breakAfter`, if the raw block carried one worth keeping. */
function legacyBreakAfter(raw: unknown): { label: string; minutes: number } | null {
  const b = ((raw ?? {}) as Record<string, unknown>).breakAfter as Record<string, unknown> | null | undefined
  if (!b || typeof b !== 'object') return null
  const minutes = typeof b.minutes === 'number' && Number.isFinite(b.minutes) ? b.minutes : 0
  return minutes > 0 ? { label: typeof b.label === 'string' && b.label ? b.label : 'Break', minutes } : null
}

function normalizeDayBreak(raw: unknown, dayIndex: number, index: number): DayBreak {
  const b = (raw ?? {}) as Record<string, unknown>
  return {
    id: str(b.id, `break-${dayIndex}-${index}`),
    label: str(b.label, 'Break'),
    startTime: str(b.startTime, '12:00'),
    afterBlock: typeof b.afterBlock === 'string' && b.afterBlock ? b.afterBlock : null,
    minutes: Math.max(0, num(b.minutes, 0)),
  }
}

function normalizeEventDay(raw: unknown, index: number, base: EventDay): EventDay {
  const d = (raw ?? {}) as Record<string, unknown>
  return {
    id: str(d.id, base.id),
    label: str(d.label, `Day ${index + 1}`),
    date: str(d.date, base.date),
    startTime: str(d.startTime, base.startTime),
    targetEndTime: str(d.targetEndTime, base.targetEndTime),
    openMinutes: Math.max(0, num(d.openMinutes, base.openMinutes)),
    driversMeetingMinutes: Math.max(0, num(d.driversMeetingMinutes, base.driversMeetingMinutes)),
    openingCeremonyMinutes: Math.max(0, num(d.openingCeremonyMinutes, base.openingCeremonyMinutes)),
    // Days saved before day-level breaks existed have none.
    breaks: Array.isArray(d.breaks) ? d.breaks.map((b, i) => normalizeDayBreak(b, index, i)) : [],
  }
}

/**
 * Recover a day list from a config written before events had days.
 *
 * Every field the day list owns used to sit on the event itself — one start time, one
 * target end, one drivers meeting, one opening ceremony, and the check-in window inside
 * `checkIn`. Those become day one, so an older link or a stored config opens as the
 * same single-day event it described rather than as the defaults.
 */
function legacyDay(p: Record<string, unknown>, base: EventDay): EventDay {
  const checkIn = (p.checkIn ?? {}) as Record<string, unknown>
  return {
    ...base,
    // A config this old never had day breaks; its lunch, if any, is migrated off the blocks.
    breaks: [],
    date: str(p.eventDate, base.date),
    startTime: str(p.dayStart, base.startTime),
    targetEndTime: str(p.targetEndTime, base.targetEndTime),
    openMinutes: Math.max(0, num(checkIn.minutes, base.openMinutes)),
    driversMeetingMinutes: Math.max(0, num(p.driversMeetingMinutes, base.driversMeetingMinutes)),
    openingCeremonyMinutes: Math.max(0, num(p.openingCeremonyMinutes, base.openingCeremonyMinutes)),
  }
}

/**
 * Fields that used to sit on the event and now live on a day. They're read by
 * `legacyDay` and then dropped, so a migrated config doesn't carry its own history
 * around in localStorage and in every share link it produces.
 */
const LEGACY_EVENT_KEYS = [
  'eventDate',
  'dayStart',
  'targetEndTime',
  'driversMeetingMinutes',
  'openingCeremonyMinutes',
] as const

/**
 * Merge a persisted or shared config over the defaults. Nested objects are merged one
 * level deep; days and match blocks are normalized individually, so a config written by
 * an older version loads rather than white-screening the app.
 */
export function normalizeConfig(raw: unknown): EventConfig {
  const base = defaultConfig()
  const p = (raw ?? {}) as Partial<EventConfig> & Record<string, unknown>

  const fallbackCycle = suggestedCycleMinutes(num(p.numFields, base.numFields))

  const rawDays = Array.isArray(p.days) ? p.days : null
  const days: EventDay[] =
    rawDays && rawDays.length
      ? rawDays.map((d, i) => normalizeEventDay(d, i, defaultEventDay(i, base.days[0].date)))
      : [legacyDay(p, base.days[0])]

  const rawBlocks = Array.isArray(p.matchBlocks) ? p.matchBlocks : null

  const merged: EventConfig = {
    ...base,
    ...p,
    days,
    championshipLevel: p.championshipLevel === true,
    // Rebuilt rather than spread: the old shape carried a `minutes` here, which is now
    // the first day's `openMinutes`.
    checkIn: { mode: p.checkIn?.mode === 'before-judging' ? 'before-judging' : 'deadline' },
    judging: {
      ...base.judging,
      ...(p.judging as object | undefined),
      day: clampDay((p.judging as EventConfig['judging'] | undefined)?.day, days.length),
    },
    inspection: {
      ...base.inspection,
      ...(p.inspection as object | undefined),
      day: clampDay((p.inspection as EventConfig['inspection'] | undefined)?.day, days.length),
    },
    practice: {
      ...base.practice,
      ...(p.practice as object | undefined),
      day: clampDay((p.practice as EventConfig['practice'] | undefined)?.day, days.length),
    },
    playoff: { ...base.playoff, ...(p.playoff as object | undefined) },
    matchBlocks:
      rawBlocks && rawBlocks.length
        ? rawBlocks.map((b, i) => normalizeMatchBlock(b, i, fallbackCycle, days.length))
        : base.matchBlocks,
  }

  for (const key of LEGACY_EVENT_KEYS) delete (merged as Record<string, unknown>)[key]

  // A block used to carry its own "break after". Each becomes a day break that follows
  // that same block, so the saved event keeps its lunches exactly where they were.
  rawBlocks?.forEach((raw, i) => {
    const legacy = legacyBreakAfter(raw)
    const block = merged.matchBlocks[i]
    if (!legacy || !block) return
    merged.days[clampDay(block.day, days.length)].breaks.push({
      id: `break-${block.id}`,
      label: legacy.label,
      startTime: '12:00',
      afterBlock: block.id,
      minutes: legacy.minutes,
    })
  })

  return merged
}
