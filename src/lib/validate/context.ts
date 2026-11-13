/**
 * What every group of checks gets to work with, so each can be a plain function of one
 * argument instead of repeating the same setup.
 */

import { MATCH_PLAY_SECONDS } from '../manual'
import { blockEnd, blockStart, clampDay, type Block, type EventConfig, type Schedule } from '../schedule'

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

/** An activity that a break has split into several bars, read back as one. */
export type BlockSpan = Block & { minutes: number }

export type CheckContext = {
  config: EventConfig
  schedule: Schedule
  d: Schedule['derived']
  teams: number
  dayCount: number
  multiDay: boolean
  judgingDay: number
  inspectionDay: number
  /** "" on a single-day event, " on Day 2" when naming the day actually tells you something. */
  onDay: (index: number) => string
  dayName: (index: number) => string
  /**
   * An activity that a day-level break has split into several bars, read back as one: where
   * it starts and ends, and how many minutes of work it holds (the breaks excluded).
   */
  spanOf: (kind: Block['kind']) => BlockSpan | undefined
}

/** A match must be played, and the field reset, inside a cycle: the play time plus a minute. */
export const CYCLE_FLOOR_MINUTES = Math.ceil(MATCH_PLAY_SECONDS / 60) + 1

export function createContext(config: EventConfig, schedule: Schedule): CheckContext {
  const d = schedule.derived
  const dayCount = d.days.length
  const multiDay = dayCount > 1

  return {
    config,
    schedule,
    d,
    teams: Math.floor(config.numTeams),
    dayCount,
    multiDay,
    judgingDay: clampDay(config.judging.day, dayCount),
    inspectionDay: clampDay(config.inspection.day, dayCount),
    onDay: (index) => (multiDay ? ` on ${d.days[clampDay(index, dayCount)].label}` : ''),
    dayName: (index) => d.days[clampDay(index, dayCount)].label,
    spanOf: (kind) => {
      const own = schedule.blocks.filter((b) => b.kind === kind)
      if (!own.length) return undefined
      const first = own.reduce((a, b) => (blockStart(b) < blockStart(a) ? b : a))
      const last = own.reduce((a, b) => (blockEnd(b) > blockEnd(a) ? b : a))
      return {
        ...first,
        end: last.end,
        minutes: own.reduce((sum, b) => sum + (b.end - b.start), 0),
      }
    },
  }
}
