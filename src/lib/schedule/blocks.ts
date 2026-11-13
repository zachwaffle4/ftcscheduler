/**
 * Sizing and placing the qualification match blocks.
 */

import { parseTime } from '../format'
import { DayClock, type MatchSpec } from './clock'
import { blockOrder, clampDay } from './helpers'
import type { MatchBlock, ResolvedBlock } from './types'

/**
 * Walk the blocks in the order they're played, working out how many matches each holds
 * and when it runs.
 *
 * This has to be a single sequential pass because a window block's size depends on
 * where its day has actually got to by the time it starts, which depends on every block
 * before it. `dayMatchStart` supplies each day's opening position — when matches can
 * first start, once that day's check-in, judging window and ceremonies are placed.
 *
 * A 'remaining' block takes whatever is still unscheduled at that point, minus any
 * fixed-count blocks that come after it anywhere in the event. Window blocks later on
 * can't be accounted for — their size isn't known until the cursor reaches them — so a
 * 'remaining' block placed before a window block will over-claim. That ordering is
 * unusual, and `validate` flags the resulting coverage mismatch.
 */
export function resolveBlocks(
  blocks: readonly MatchBlock[],
  totalMatches: number,
  dayMatchStart: readonly number[],
  clocks: readonly DayClock[] = dayMatchStart.map(() => new DayClock(undefined)),
): ResolvedBlock[] {
  const dayCount = Math.max(1, dayMatchStart.length)
  const order = blockOrder(blocks, dayCount)
  const out: ResolvedBlock[] = blocks.map((block) => ({
    day: clampDay(block.day, dayCount),
    count: 0,
    start: 0,
    end: 0,
    segments: [],
  }))

  let scheduled = 0
  let cursorDay = -1
  let cursor = 0

  order.forEach((index, position) => {
    const block = blocks[index]
    const day = clampDay(block.day, dayCount)
    const clock = clocks[day] ?? new DayClock(undefined)

    // Each day restarts the clock at its own first-match position.
    if (day !== cursorDay) {
      cursorDay = day
      cursor = dayMatchStart[day] ?? 0
    }

    let spec: MatchSpec

    if (block.sizing === 'count') {
      spec = { count: Math.max(0, Math.floor(block.matchCount)) }
    } else if (block.sizing === 'window') {
      spec = { until: parseTime(block.endTime) }
    } else {
      const laterFixed = order
        .slice(position + 1)
        .reduce(
          (sum, i) => sum + (blocks[i].sizing === 'count' ? Math.max(0, Math.floor(blocks[i].matchCount)) : 0),
          0,
        )
      spec = { count: Math.max(0, totalMatches - scheduled - laterFixed) }
    }

    const placed = clock.placeMatches(cursor, block.cycleMinutes, spec)
    out[index] = {
      day,
      count: placed.count,
      start: placed.segments.length ? placed.segments[0].start : cursor,
      end: placed.end,
      segments: placed.segments,
    }

    cursor = clock.takeAfter(placed.end, block.id)
    scheduled += placed.count
  })

  return out
}
