/**
 * The scheduling engine. Import from here (`../lib/schedule`) rather than from the
 * individual files, which are an implementation detail.
 *
 *   types.ts     the config and schedule shapes
 *   helpers.ts   absolute time, day clamping, block order
 *   anchors.ts   what a day-level break can follow
 *   clock.ts     a day's clock and the breaks on it
 *   blocks.ts    sizing and placing match blocks
 *   slots.ts     per-team judging and inspection slots
 *   defaults.ts  fresh events, days, breaks and match blocks
 *   migrate.ts   loading saved and shared configs
 *   build.ts     `buildSchedule`, which ties it together
 */

export * from './types'
export { absMinute, blockEnd, blockOrder, blockStart, clampDay, suggestedCycleMinutes } from './helpers'
export {
  anchorOptions,
  ITEM_DRIVERS,
  ITEM_INSPECTION,
  ITEM_JUDGING,
  ITEM_OPENING,
  ITEM_PITS,
  ITEM_PRACTICE,
  ITEM_SELECTION,
} from './anchors'
export { DayClock, spreadOverBreaks } from './clock'
export { resolveBlocks } from './blocks'
export { slotStarts } from './slots'
export { defaultConfig, defaultDayBreak, defaultEventDay, defaultMatchBlocks } from './defaults'
export { normalizeConfig } from './migrate'
export { buildSchedule } from './build'
