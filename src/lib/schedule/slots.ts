/**
 * Per-team judging and inspection slots.
 */

import type { Block, EventConfig, Segment, TeamSlot } from './types'

/**
 * Start time of each successive slot in a queue, where a slot never straddles a break:
 * one that would is pushed to the break's end instead. `stride` is the spacing between
 * slots and `length` how long one actually occupies.
 */
export function slotStarts(
  base: number,
  rounds: number,
  stride: number,
  length: number,
  breaks: readonly Segment[],
): number[] {
  const out: number[] = []
  let t = base
  for (let r = 0; r <= rounds; r++) {
    let moved = true
    while (moved) {
      moved = false
      for (const b of breaks) {
        if (b.start < t + length && b.end > t) {
          t = b.end
          moved = true
        }
      }
    }
    out.push(t)
    t += stride
  }
  return out
}

/**
 * Per-team judging and inspection slots, round-robined across panels and tables.
 *
 * In concurrent mode the two are deliberately staggered in opposite directions —
 * judging fills panels front-to-back while inspection is offset by half a rotation —
 * so a team is unlikely to be wanted in both places at once. This is best-effort:
 * without actual match assignments (which this app does not generate, see README) a
 * truly collision-free schedule isn't derivable, and the UI labels these as estimates.
 *
 * Both queues run inside one day. Splitting a team's interview slot across days would
 * mean deciding which teams are judged when, and the manual's equal-treatment rules
 * (A205) make that a director's call rather than an arithmetic one.
 */
export function buildTeamSlots(
  config: EventConfig,
  dayMatchStart: readonly number[],
  judgingDay: number,
  inspectionDay: number,
  concurrent: boolean,
  blocks: readonly Block[],
  judgingBreaks: readonly Segment[],
  inspectionBreaks: readonly Segment[],
): TeamSlot[] {
  const teams = Math.max(0, Math.floor(config.numTeams))
  const slots: TeamSlot[] = []

  const judgingBlock = blocks.find((b) => b.kind === 'judging')
  const inspectionBlock = blocks.find((b) => b.kind === 'inspection')
  const judgingBase = judgingBlock ? judgingBlock.start : dayMatchStart[judgingDay]
  const inspectionBase = inspectionBlock ? inspectionBlock.start : dayMatchStart[inspectionDay]

  const panels = Math.max(1, config.judging.panels)
  const tables = Math.max(1, config.inspection.tables)
  const interviewStride = config.judging.interviewMinutes + config.judging.gapMinutes

  // Offset inspection by half its rotation so the two queues pull different teams
  // at the same moment.
  const inspectionOffset = concurrent ? Math.floor(tables / 2) : 0

  // Slots are laid out round by round, and a slot that would straddle a break waits for
  // it to end, so nobody is interviewed or inspected through lunch.
  const judgingRounds = Math.ceil(teams / panels)
  const inspectionRounds = Math.ceil(teams / tables)
  const judgingTimes = slotStarts(
    judgingBase,
    judgingRounds,
    interviewStride,
    config.judging.interviewMinutes,
    judgingBreaks,
  )
  const inspectionTimes = slotStarts(
    inspectionBase,
    inspectionRounds,
    config.inspection.minutesPerTeam,
    config.inspection.minutesPerTeam,
    inspectionBreaks,
  )

  for (let i = 0; i < teams; i++) {
    const judgingRound = Math.floor(i / panels)
    const judgingPanel = (i % panels) + 1

    const inspectionIndex = (i + inspectionOffset) % Math.max(1, teams)
    const inspectionRound = Math.floor(inspectionIndex / tables)
    const inspectionTable = (inspectionIndex % tables) + 1

    slots.push({
      team: i + 1,
      judgingDay,
      judgingStart: judgingTimes[judgingRound],
      judgingPanel,
      inspectionDay,
      inspectionStart: config.inspection.scheduled ? inspectionTimes[inspectionRound] : null,
      inspectionTable: config.inspection.scheduled ? inspectionTable : null,
    })
  }

  return slots
}
