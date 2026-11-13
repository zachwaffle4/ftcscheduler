/**
 * A day's clock: the cursor everything on that day is placed along, and the day-level
 * breaks that cursor has to make room for.
 */

import { parseTime } from '../format'
import type { DayBreak, EventDay, PlacedBreak, Segment } from './types'

/** How a run of matches is sized: a fixed count, or as many as fit before a clock time. */
export type MatchSpec = { count: number } | { until: number }

/**
 * One day's clock, and the day-level breaks on it.
 *
 * Everything on a day happens one thing after another, so a single cursor walks the day
 * and each thing is placed through here. A break that follows a block (`afterBlock`)
 * is simply taken when that block ends. Any other wants to begin at its `startTime`; what
 * happens when the cursor gets there depends on what's being placed:
 *
 *  - Splittable work (inspection, judging, practice) is cut exactly at the break and
 *    resumes after it.
 *  - Anything that shouldn't be interrupted — a match, a ceremony, a playoff round — runs
 *    to completion, and the break starts the moment it ends. So a lunch set for 12:00
 *    begins when the match in progress at 12:00 finishes: at most one cycle late.
 *
 * A break is only placed when something follows it. One whose time falls after the last
 * thing on the day never appears, and is reported through `unplacedBreaks`.
 */
export class DayClock {
  private holes: { id: string; label: string; start: number; minutes: number }[]
  private next = 0
  readonly placed: PlacedBreak[] = []
  /** Every break the day was configured with, placed or not. */
  readonly configured: DayBreak[]
  /** Breaks that follow another block, rather than a time. */
  private readonly anchored: DayBreak[]

  constructor(day: EventDay | undefined) {
    const dayStart = day ? parseTime(day.startTime) : 0
    this.configured = (day?.breaks ?? []).filter((b) => b.minutes > 0)
    this.anchored = this.configured.filter((b) => b.afterBlock)
    this.holes = this.configured
      .filter((b) => !b.afterBlock)
      .map((b) => ({ id: b.id, label: b.label, start: parseTime(b.startTime), minutes: b.minutes }))
      // One that starts before its own day is a typo, not an instruction.
      .filter((h) => h.start >= dayStart)
      .sort((a, b) => a.start - b.start)
  }

  /** Where the cursor ends up once every break that's due has been taken, without taking them. */
  private afterDue(cursor: number): { t: number; index: number } {
    let t = cursor
    let index = this.next
    while (index < this.holes.length && this.holes[index].start <= t) {
      t += this.holes[index].minutes
      index++
    }
    return { t, index }
  }

  /** Take every break that's due at `cursor`, and return the cursor after them. */
  private settle(cursor: number): number {
    let t = cursor
    while (this.next < this.holes.length && this.holes[this.next].start <= t) {
      const h = this.holes[this.next]
      this.placed.push({ id: h.id, label: h.label, start: t, end: t + h.minutes })
      t += h.minutes
      this.next++
    }
    return t
  }

  private nextStart(): number | null {
    return this.next < this.holes.length ? this.holes[this.next].start : null
  }

  private insertIndex(start: number): number {
    let i = this.next
    while (i < this.holes.length && this.holes[i].start <= start) i++
    return i
  }

  /**
   * Take the breaks that follow `key` — a match block's id or an `ITEM_*` key — starting
   * at `cursor`, the end of that block, and return the cursor after them. Called once per
   * block, whether or not it held anything.
   */
  takeAfter(cursor: number, key: string): number {
    let t = cursor
    for (const b of this.anchored) {
      if (b.afterBlock !== key) continue
      this.placed.push({ id: b.id, label: b.label, start: t, end: t + b.minutes })
      t += b.minutes
    }
    return t
  }

  /**
   * The breaks that follow `key`, as clock times rather than immediately. For work that
   * runs alongside other work, where "after" can't be a point in a single sequence: the
   * break goes in at `end`, and everything else running then pauses for it like for any
   * timed break.
   */
  pinAfter(end: number, key: string): void {
    let at = end
    for (const b of this.anchored) {
      if (b.afterBlock !== key) continue
      this.holes.splice(this.insertIndex(at), 0, { id: b.id, label: b.label, start: at, minutes: b.minutes })
      at += b.minutes
    }
  }

  /** Breaks still waiting to be taken, as intervals — where they will land if nothing slips. */
  pending(): Segment[] {
    return this.holes.slice(this.next).map((h) => ({ start: h.start, end: h.start + h.minutes }))
  }

  /** Something that can't be split. Returns where it actually runs. */
  place(cursor: number, minutes: number): Segment {
    const start = this.settle(cursor)
    return { start, end: start + minutes }
  }

  /** Continuous work that pauses for any break it runs into. */
  placeSplit(cursor: number, minutes: number): { segments: Segment[]; end: number } {
    const segments: Segment[] = []
    let remaining = minutes
    let at = cursor
    while (remaining > 0) {
      const t = this.settle(at)
      const stop = this.nextStart()
      if (stop === null || t + remaining <= stop) {
        segments.push({ start: t, end: t + remaining })
        return { segments, end: t + remaining }
      }
      segments.push({ start: t, end: stop })
      remaining -= stop - t
      at = stop
    }
    return { segments, end: cursor }
  }

  /**
   * Whole matches, one cycle each. Breaks never cut a match; the first match that
   * *starts* at or after a break's time waits for it.
   */
  placeMatches(
    cursor: number,
    cycle: number,
    spec: MatchSpec,
  ): { segments: { start: number; end: number; count: number }[]; count: number; end: number } {
    const segments: { start: number; end: number; count: number }[] = []
    let at = cursor
    let placed = 0

    for (;;) {
      let cap: number
      if ('count' in spec) {
        cap = spec.count - placed
      } else {
        // A window's size depends on where the cursor lands once due breaks are taken,
        // so look before committing to them.
        const t = this.afterDue(at).t
        cap = cycle > 0 ? Math.floor((spec.until - t) / cycle) : 0
      }
      if (cap <= 0) break

      const t = this.settle(at)
      const stop = this.nextStart()
      // Every match that starts before the break goes ahead, so the one that straddles it
      // is the last of the run.
      const beforeStop = stop === null || cycle <= 0 ? cap : Math.max(1, Math.ceil((stop - t) / cycle))
      const n = Math.min(cap, beforeStop)

      segments.push({ start: t, end: t + n * cycle, count: n })
      at = t + n * cycle
      placed += n
    }

    return { segments, count: placed, end: at }
  }

  /** The breaks taken so far, as intervals on this day's clock. */
  intervals(): Segment[] {
    return this.placed.map((p) => ({ start: p.start, end: p.end }))
  }
}

/**
 * Lay `minutes` of continuous work out from `start`, leaving gaps wherever it meets one
 * of `breaks`. Used for work that runs alongside the main sequence — judging and
 * inspection overlaid on matches — and so can't drive the clock itself.
 */
export function spreadOverBreaks(start: number, minutes: number, breaks: readonly Segment[]): Segment[] {
  const segments: Segment[] = []
  let t = start
  let remaining = minutes
  for (const b of breaks) {
    if (remaining <= 0) break
    if (b.end <= t) continue
    if (b.start <= t) {
      t = b.end
      continue
    }
    const room = b.start - t
    if (remaining <= room) break
    segments.push({ start: t, end: b.start })
    remaining -= room
    t = b.end
  }
  if (remaining > 0) segments.push({ start: t, end: t + remaining })
  return segments
}
