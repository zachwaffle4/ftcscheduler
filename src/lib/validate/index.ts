/**
 * Checks a generated schedule and reports what a director should know about it.
 *
 * Two kinds of finding come out of here. Most are competition manual rules, and those
 * name the rule or section they come from — "I102", "§13.6.1" — so they can be looked
 * up and argued with. The rest are practical checks the manual says nothing about:
 * whether the match blocks add up, whether a time-windowed block can still happen,
 * whether a day runs past its target end time, whether a second day has anything on it.
 * Those carry a plain label instead of a citation, which is what distinguishes them in
 * the UI.
 *
 * The checks are grouped by what they look at, one file each; `validate` runs them in
 * turn and sorts the results by severity. Within a severity, findings keep the order the
 * groups run in.
 */

import type { EventConfig, Schedule } from '../schedule'
import { checkActivities } from './activities'
import { checkBlocks } from './blocks'
import { createContext, type Finding, type FindingLevel } from './context'
import { checkDays } from './days'
import { checkEvent } from './event'
import { checkPlayoff } from './playoff'

export type { Finding, FindingLevel } from './context'

const SEVERITY: Record<FindingLevel, number> = { error: 0, warn: 1, info: 2, ok: 3 }

export function validate(config: EventConfig, schedule: Schedule): Finding[] {
  const ctx = createContext(config, schedule)

  const out = [
    ...checkEvent(ctx),
    ...checkBlocks(ctx),
    ...checkPlayoff(ctx),
    ...checkActivities(ctx),
    ...checkDays(ctx),
  ]

  return out.sort((a, b) => SEVERITY[a.level] - SEVERITY[b.level])
}
