/**
 * Small pure helpers the rest of the engine leans on: the absolute-time scale, day-index
 * hygiene, and the order blocks are played in.
 */

import type { Block, MatchBlock } from './types'

/** Used to fold a (day, clock time) pair into one comparable number. */
const MINUTES_PER_DAY = 1440

/**
 * Fold a (day index, minutes since midnight) pair into a single number so two blocks on
 * different days can be compared and subtracted. Day lengths are notional 24-hour ones:
 * nothing here needs calendar arithmetic, only a consistent ordering.
 */
export function absMinute(day: number, minute: number): number {
  return day * MINUTES_PER_DAY + minute
}

/** A block's start on the absolute scale. */
export function blockStart(block: Block): number {
  return absMinute(block.day, block.start)
}

/** A block's end on the absolute scale. */
export function blockEnd(block: Block): number {
  return absMinute(block.day, block.end)
}

/**
 * Coerce a stored day index into the current day list. Day indices arrive from
 * localStorage and shared links, and the day they pointed at may since have been
 * deleted, so every read of one goes through here.
 */
export function clampDay(day: unknown, dayCount: number): number {
  const n = typeof day === 'number' && Number.isFinite(day) ? Math.floor(day) : 0
  return Math.min(Math.max(0, n), Math.max(0, dayCount - 1))
}

/**
 * Suggested minutes per match for a given field count. Two fields lands on 6 minutes,
 * which is the cadence the manual's own playoff timing tables use. Advisory only.
 */
export function suggestedCycleMinutes(numFields: number): number {
  if (numFields <= 1) return 7
  if (numFields === 2) return 6
  return 5
}

/**
 * Block indices in the order they are actually played: day by day, and within a day in
 * list order. The editor's array order and the event's chronology are only the same
 * thing on a single-day event, so everything that walks blocks sequentially walks this.
 */
export function blockOrder(blocks: readonly MatchBlock[], dayCount: number): number[] {
  const order: number[] = []
  for (let day = 0; day < Math.max(1, dayCount); day++) {
    blocks.forEach((block, i) => {
      if (clampDay(block.day, dayCount) === day) order.push(i)
    })
  }
  return order
}
