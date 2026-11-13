/**
 * What a day-level break can follow. A break either sits at a clock time or comes right
 * after one of the day's blocks; this is the list of those blocks.
 */

import { blockOrder, clampDay } from './helpers'
import type { EventConfig } from './types'

/** Keys for the blocks a break can follow besides match blocks, whose own ids serve. */
export const ITEM_PITS = 'item:pits'
export const ITEM_INSPECTION = 'item:inspection'
export const ITEM_JUDGING = 'item:judging'
export const ITEM_PRACTICE = 'item:practice'
export const ITEM_DRIVERS = 'item:drivers'
export const ITEM_OPENING = 'item:opening'
export const ITEM_SELECTION = 'item:selection'

/**
 * Everything on a day that a break can follow, in the order the day runs it. Used to fill
 * the editor's dropdown and to name a break's anchor in a warning.
 *
 * Judging and inspection are left out of a concurrent-mode day: there they're overlaid on
 * the matches rather than being a step of their own, so there's no "after" to point at.
 */
export function anchorOptions(config: EventConfig, dayIndex: number): { key: string; label: string }[] {
  const dayCount = Math.max(1, config.days.length)
  const day = config.days[dayIndex]
  if (!day) return []

  const concurrent = config.judging.mode === 'concurrent'
  const hasPractice = config.practice.enabled && config.practice.matchesPerTeam > 0
  const practiceHere = hasPractice && clampDay(config.practice.day, dayCount) === dayIndex
  const practiceAlongside = practiceHere && config.practice.concurrent && !concurrent

  const out: { key: string; label: string }[] = [{ key: ITEM_PITS, label: 'Check-in / pits open' }]
  if (!concurrent && clampDay(config.inspection.day, dayCount) === dayIndex) {
    out.push({ key: ITEM_INSPECTION, label: 'Robot inspection' })
  }
  if (!concurrent && clampDay(config.judging.day, dayCount) === dayIndex) {
    out.push({ key: ITEM_JUDGING, label: 'Judging' })
  }
  if (practiceAlongside) out.push({ key: ITEM_PRACTICE, label: 'Practice matches' })
  if (day.driversMeetingMinutes > 0) out.push({ key: ITEM_DRIVERS, label: 'Drivers meeting' })
  if (day.openingCeremonyMinutes > 0) out.push({ key: ITEM_OPENING, label: 'Opening ceremony' })
  if (practiceHere && !practiceAlongside) out.push({ key: ITEM_PRACTICE, label: 'Practice matches' })
  for (const i of blockOrder(config.matchBlocks, dayCount)) {
    const block = config.matchBlocks[i]
    if (clampDay(block.day, dayCount) === dayIndex) out.push({ key: block.id, label: block.label })
  }
  if (dayIndex === dayCount - 1) out.push({ key: ITEM_SELECTION, label: 'Alliance selection' })
  return out
}
