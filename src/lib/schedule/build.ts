/**
 * The scheduling engine's entry point: turn an `EventConfig` into a `Schedule`.
 *
 * An event is a list of days. A one-day qualifier is simply the one-day case of that
 * model: every day has its own clock, its own opening sequence, and whichever match
 * blocks are assigned to it. Two-day regional championships and premier events — eight
 * or more qualification matches per team, judging that fills a day on its own — are the
 * reason the list exists.
 *
 * Pure functions only — no Vue imports, no side effects — so the whole thing is trivially
 * testable and can be reasoned about independently of the UI.
 */

import {
  allianceCountForTeams,
  MATCH_PLAY_SECONDS,
  playoffMinutes,
  playoffTimeline,
  qualMatchCount,
  surrogateCount,
  TEAMS_PER_MATCH,
} from '../manual'
import { parseTime } from '../format'
import {
  ITEM_DRIVERS,
  ITEM_INSPECTION,
  ITEM_JUDGING,
  ITEM_OPENING,
  ITEM_PITS,
  ITEM_PRACTICE,
  ITEM_SELECTION,
} from './anchors'
import { resolveBlocks } from './blocks'
import { DayClock, spreadOverBreaks } from './clock'
import { defaultEventDay } from './defaults'
import { absMinute, blockOrder, clampDay, suggestedCycleMinutes } from './helpers'
import { buildTeamSlots } from './slots'
import type { Block, BlockKind, DerivedDay, EventConfig, Schedule } from './types'

/** One entry in a day's pre-match window, before lanes are assigned. */
type PreWindowActivity = {
  /** What a break follows to come after this activity. */
  key: string
  kind: BlockKind
  label: string
  minutes: number
  detail: string
}

/**
 * How long a team waits between its own matches. With one match at a time, a team
 * plays roughly once per "round" of `teams / 4` matches, so the gap is that many
 * matches' worth of cycle time.
 */
function teamBreakMinutes(teams: number, cycleMinutes: number): number {
  const matchesPerRound = Math.max(1, Math.floor(teams / TEAMS_PER_MATCH))
  // The team is not waiting through its own match, hence the -1.
  return Math.max(0, (matchesPerRound - 1) * cycleMinutes)
}

let blockSeq = 0
function nextId(prefix: string): string {
  blockSeq += 1
  return `${prefix}-${blockSeq}`
}

export function buildSchedule(config: EventConfig): Schedule {
  blockSeq = 0

  // A config with no days can only come from a hand-edited link; treat it as one day
  // rather than producing an event with nothing in it.
  const days = config.days.length ? config.days : [defaultEventDay(0)]
  const dayCount = days.length
  const lastDay = dayCount - 1

  const teams = Math.max(0, Math.floor(config.numTeams))
  const totalMatches = qualMatchCount(teams, config.qualsPerTeam)

  const judgingMinutes =
    Math.ceil(teams / Math.max(1, config.judging.panels)) *
    (config.judging.interviewMinutes + config.judging.gapMinutes)
  const inspectionMinutes =
    Math.ceil(teams / Math.max(1, config.inspection.tables)) * config.inspection.minutesPerTeam

  const allianceCount = config.allianceCountOverride ?? allianceCountForTeams(teams)
  const playoffLength = playoffMinutes(
    allianceCount,
    config.includeIfRequiredFinal,
    config.playoff,
  )

  const concurrent = config.judging.mode === 'concurrent'
  const judgingDay = clampDay(config.judging.day, dayCount)
  const inspectionDay = clampDay(config.inspection.day, dayCount)
  const practiceDay = clampDay(config.practice.day, dayCount)

  const hasPractice = config.practice.enabled && config.practice.matchesPerTeam > 0
  const practiceMatches = hasPractice
    ? Math.ceil((teams * config.practice.matchesPerTeam) / TEAMS_PER_MATCH)
    : 0
  const practiceMinutes = practiceMatches * config.practice.cycleMinutes
  const practiceDetail = `${config.practice.matchesPerTeam} per team · ${config.practice.cycleMinutes} min cycle`

  // Nothing to overlap with unless inspection and judging have a pre-match window.
  const practiceConcurrent = hasPractice && config.practice.concurrent && !concurrent

  const blocks: Block[] = []

  /* --- Pass one: each day's opening sequence, and where its matches can start. --- */

  const dayMatchStart: number[] = []
  const dayOpenEnd: number[] = []

  // One clock per day, shared by every pass below so each day-level break is taken once,
  // at the first place the day's sequence reaches it.
  const clocks = days.map((day) => new DayClock(day))

  days.forEach((day, di) => {
    const first = di === 0
    const clock = clocks[di]
    let cursor = parseTime(day.startTime)

    const open = clock.place(cursor, Math.max(0, day.openMinutes))
    const openEnd = open.end
    blocks.push({
      id: nextId('checkin'),
      kind: 'checkin',
      label:
        first && config.checkIn.mode === 'deadline'
          ? 'Check-In, Pits & Queueing Open'
          : 'Pits & Queueing Open',
      day: di,
      start: open.start,
      end: openEnd,
      detail: first
        ? config.checkIn.mode === 'deadline'
          ? 'Adult check-in at Pit Administration (I102)'
          : 'Setup and load-in'
        : 'Pits reopen; teams settle in for the day',
      lane: 0,
    })
    dayOpenEnd.push(openEnd)
    cursor = clock.takeAfter(openEnd, ITEM_PITS)

    // Whatever this day runs before its matches. Concurrent mode has no pre-match
    // window at all — it defers judging and inspection to pass three, where they're
    // overlaid on the matches instead.
    const preWindow: PreWindowActivity[] = []

    if (!concurrent && inspectionDay === di) {
      preWindow.push({
        key: ITEM_INSPECTION,
        kind: 'inspection',
        label: 'Robot Inspection',
        minutes: inspectionMinutes,
        detail: `${teams} teams · ${config.inspection.tables} tables · ${config.inspection.minutesPerTeam} min each`,
      })
    }
    if (!concurrent && judgingDay === di) {
      preWindow.push({
        key: ITEM_JUDGING,
        kind: 'judging',
        label: 'Judging — Initial Interviews',
        minutes: judgingMinutes,
        detail: `${teams} teams · ${config.judging.panels} panels · ${config.judging.interviewMinutes} min interview + ${config.judging.gapMinutes} min gap`,
      })
    }
    if (practiceConcurrent && practiceDay === di) {
      preWindow.push({
        key: ITEM_PRACTICE,
        kind: 'practice',
        label: `Practice Matches (${practiceMatches})`,
        minutes: practiceMinutes,
        detail: `Concurrent with inspection & judging · ${practiceDetail}`,
      })
    }

    if (preWindow.length) {
      const start = cursor

      // These run side by side, so a break "after" one is a clock time: wherever that
      // activity finishes, with the others pausing for it. Shortest first, so each finish
      // time already allows for the breaks before it.
      for (const activity of [...preWindow].sort((a, b) => a.minutes - b.minutes)) {
        const segs = spreadOverBreaks(start, activity.minutes, clock.pending())
        clock.pinAfter(segs.length ? segs[segs.length - 1].end : start, activity.key)
      }

      // The longest activity drives the clock, and so decides where each break falls.
      const longest = Math.max(...preWindow.map((a) => a.minutes))
      cursor = clock.placeSplit(start, longest).end
      const taken = clock.intervals()

      // The first activity holds the main lane and the rest stack beside it, so a day
      // that runs only inspection doesn't leave lane 0 empty. Each one pauses for the
      // breaks the longest ran into, which are the only ones it can meet.
      preWindow.forEach((activity, lane) => {
        for (const seg of spreadOverBreaks(start, activity.minutes, taken)) {
          blocks.push({
            id: nextId(activity.kind),
            kind: activity.kind,
            label: activity.label,
            day: di,
            start: seg.start,
            end: seg.end,
            detail: activity.detail,
            lane,
          })
        }
      })
    }

    if (day.driversMeetingMinutes > 0) {
      const seg = clock.place(cursor, day.driversMeetingMinutes)
      blocks.push({
        id: nextId('ceremony'),
        kind: 'ceremony',
        label: 'Drivers Meeting',
        day: di,
        start: seg.start,
        end: seg.end,
        detail: 'Head Referee briefs drive teams on rules and field specifics',
        lane: 0,
      })
      cursor = clock.takeAfter(seg.end, ITEM_DRIVERS)
    }

    if (day.openingCeremonyMinutes > 0) {
      const seg = clock.place(cursor, day.openingCeremonyMinutes)
      blocks.push({
        id: nextId('ceremony'),
        kind: 'ceremony',
        label: 'Opening Ceremony',
        day: di,
        start: seg.start,
        end: seg.end,
        detail: 'Welcome, sponsors, and opening remarks',
        lane: 0,
      })
      cursor = clock.takeAfter(seg.end, ITEM_OPENING)
    }

    if (hasPractice && !practiceConcurrent && practiceDay === di) {
      const placed = clock.placeSplit(cursor, practiceMinutes)
      for (const seg of placed.segments) {
        blocks.push({
          id: nextId('practice'),
          kind: 'practice',
          label: `Practice Matches (${practiceMatches})`,
          day: di,
          start: seg.start,
          end: seg.end,
          detail: practiceDetail,
          lane: 0,
        })
      }
      cursor = clock.takeAfter(placed.end, ITEM_PRACTICE)
    }

    dayMatchStart.push(cursor)
  })

  /* --- Pass two: the qualification blocks, in the order they're played. --- */

  const resolved = resolveBlocks(config.matchBlocks, totalMatches, dayMatchStart, clocks)
  const order = blockOrder(config.matchBlocks, dayCount)

  // Where each day has got to once its matches and their breaks are done.
  const dayMatchEnd = [...dayMatchStart]
  const firstQualStartByDay: (number | null)[] = days.map(() => null)
  const matchMinutesByDay = days.map(() => 0)
  let firstQual: { day: number; minute: number } | null = null
  let lastQual: { day: number; minute: number } | null = null
  let matchNumber = 1

  for (const i of order) {
    const block = config.matchBlocks[i]
    const r = resolved[i]

    if (r.count > 0) {
      // A day-level break inside the block leaves it as several runs, each its own bar.
      for (const seg of r.segments) {
        const first = matchNumber
        const last = matchNumber + seg.count - 1
        blocks.push({
          id: nextId('quals'),
          kind: 'quals',
          label: block.label || `Qualification Matches ${first}–${last}`,
          day: r.day,
          start: seg.start,
          end: seg.end,
          detail: `Matches ${first}–${last} · ${seg.count} matches · ${block.cycleMinutes} min cycle`,
          lane: 0,
        })
        matchNumber = last + 1
        matchMinutesByDay[r.day] += seg.end - seg.start
      }
      if (firstQualStartByDay[r.day] === null) firstQualStartByDay[r.day] = r.start
      if (!firstQual) firstQual = { day: r.day, minute: r.start }
      lastQual = { day: r.day, minute: r.end }
      dayMatchEnd[r.day] = Math.max(dayMatchEnd[r.day], r.end)
    }
  }

  // A break that follows a day's last block runs past that block's end, and the bracket
  // starts after it. Breaks taken so far all fall within the day's matches, so the latest
  // one's end is safe to fold in.
  clocks.forEach((clock, di) => {
    for (const p of clock.placed) dayMatchEnd[di] = Math.max(dayMatchEnd[di], p.end)
  })

  /* --- Pass three: the bracket, then activities overlaid on the matches. --- */

  // The bracket closes the event, so it always sits on the last day, after whatever
  // matches that day holds. T701: "typically just after the last scheduled
  // Qualification MATCH". It goes through the day's clock like everything else, so a
  // lunch that falls due between alliance selection and the first round is taken there.
  const lastClock = clocks[lastDay]
  const selection = lastClock.place(dayMatchEnd[lastDay], config.allianceSelectionMinutes)

  blocks.push({
    id: nextId('ceremony'),
    kind: 'ceremony',
    label: 'Alliance Selection',
    day: lastDay,
    start: selection.start,
    end: selection.end,
    detail: `${allianceCount} alliances (Table 13-2)`,
    lane: 0,
  })
  let cursor = lastClock.takeAfter(selection.end, ITEM_SELECTION)

  for (const step of playoffTimeline(allianceCount, config.includeIfRequiredFinal, config.playoff)) {
    const seg = lastClock.place(cursor, step.minutes)
    blocks.push({
      id: nextId('playoff'),
      kind: step.kind === 'match' ? 'playoff' : 'break',
      label: step.label,
      day: lastDay,
      start: seg.start,
      end: seg.end,
      detail: step.kind === 'match' ? `Double elimination · ${allianceCount} alliances` : '',
      lane: 0,
    })
    cursor = seg.end
  }

  // Day-level breaks, now that every day's sequence has reached the ones it's going to.
  clocks.forEach((clock, di) => {
    for (const p of clock.placed) {
      blocks.push({
        id: nextId('break'),
        kind: 'break',
        label: p.label || 'Break',
        day: di,
        start: p.start,
        end: p.end,
        detail: 'Scheduled break',
        lane: 0,
      })
    }
  })

  // Overlaid on their day's match blocks rather than extending the day, and paused for
  // that day's breaks. A day with no matches has nothing to overlay, so they fall back to
  // where its matches would have begun; `validate` flags that, since judging can't run
  // concurrently with nothing.
  if (concurrent) {
    const inspectionStart = firstQualStartByDay[inspectionDay] ?? dayMatchStart[inspectionDay]
    for (const seg of spreadOverBreaks(inspectionStart, inspectionMinutes, clocks[inspectionDay].intervals())) {
      blocks.push({
        id: nextId('inspection'),
        kind: 'inspection',
        label: 'Robot Inspection',
        day: inspectionDay,
        start: seg.start,
        end: seg.end,
        detail: `Concurrent with matches · ${config.inspection.tables} tables · ${config.inspection.minutesPerTeam} min each`,
        lane: 1,
      })
    }

    const judgingStart = firstQualStartByDay[judgingDay] ?? dayMatchStart[judgingDay]
    for (const seg of spreadOverBreaks(judgingStart, judgingMinutes, clocks[judgingDay].intervals())) {
      blocks.push({
        id: nextId('judging'),
        kind: 'judging',
        label: 'Judging — Initial Interviews',
        day: judgingDay,
        start: seg.start,
        end: seg.end,
        detail: `Concurrent with matches · ${config.judging.panels} panels · ${config.judging.interviewMinutes} min interview + ${config.judging.gapMinutes} min gap`,
        lane: 2,
      })
    }
  }

  const unplacedBreaks = clocks.flatMap((clock, di) => {
    const taken = new Set(clock.placed.map((p) => p.id))
    return clock.configured.filter((b) => !taken.has(b.id)).map((b) => ({ day: di, brk: b }))
  })

  const scheduledMatchCount = resolved.reduce((sum, r) => sum + r.count, 0)

  const activeCycles = config.matchBlocks
    .filter((_, i) => resolved[i].count > 0)
    .map((b) => b.cycleMinutes)
  const minTeamBreakMinutes = activeCycles.length
    ? Math.min(...activeCycles.map((c) => teamBreakMinutes(teams, c)))
    : 0

  const teamSlots = buildTeamSlots(
    config,
    dayMatchStart,
    judgingDay,
    inspectionDay,
    concurrent,
    blocks,
    clocks[judgingDay].intervals(),
    clocks[inspectionDay].intervals(),
  )

  // Runs until the last team's judging slot — the point after which nobody can still
  // be un-checked-in. Drawn on the judging day, which is where that deadline falls;
  // when judging is on a later day, check-in has been open since the event started.
  if (config.checkIn.mode === 'before-judging') {
    const judgingStarts = teamSlots.map((s) => s.judgingStart).filter((t): t is number => t !== null)
    const lastDeadline = judgingStarts.length ? Math.max(...judgingStarts) : dayOpenEnd[judgingDay]
    blocks.push({
      id: nextId('checkin'),
      kind: 'checkin',
      label: 'Check-In (rolling)',
      day: judgingDay,
      start: parseTime(days[judgingDay].startTime),
      end: lastDeadline,
      detail:
        judgingDay === 0
          ? 'Each team checks in before its own judging slot (I102, Event Director exception)'
          : `Each team checks in before its own judging slot; the pits have been open since ${days[0].label || 'day 1'}`,
      lane: 3,
    })
  }

  /* --- Per-day rollups, read off the finished block list. --- */

  const derivedDays: DerivedDay[] = days.map((day, di) => {
    const own = blocks.filter((b) => b.day === di)
    const start = own.length ? Math.min(...own.map((b) => b.start)) : parseTime(day.startTime)
    const end = own.length ? Math.max(...own.map((b) => b.end)) : start
    return {
      index: di,
      label: day.label || `Day ${di + 1}`,
      date: day.date,
      start,
      end,
      lengthMinutes: end - start,
      targetEnd: parseTime(day.targetEndTime),
      matchCount: resolved.reduce((sum, r) => sum + (r.day === di ? r.count : 0), 0),
      matchMinutes: matchMinutesByDay[di],
    }
  })

  const qualsStart = firstQual
    ? absMinute(firstQual.day, firstQual.minute)
    : absMinute(0, dayMatchStart[0])
  const qualsEnd = lastQual ? absMinute(lastQual.day, lastQual.minute) : qualsStart

  return {
    blocks,
    teamSlots,
    derived: {
      resolvedBlocks: resolved,
      unplacedBreaks,
      days: derivedDays,
      qualMatchCount: totalMatches,
      surrogateCount: surrogateCount(teams, config.qualsPerTeam),
      scheduledMatchCount,
      suggestedCycleMinutes: suggestedCycleMinutes(config.numFields),
      judgingMinutes,
      inspectionMinutes,
      allianceCount,
      playoffMinutes: playoffLength,
      minTeamBreakMinutes,
      qualsStart,
      qualsEnd,
      qualsStartDay: firstQual ? firstQual.day : 0,
      qualsEndDay: lastQual ? lastQual.day : 0,
      eventStart: absMinute(0, derivedDays[0].start),
      eventEnd: absMinute(lastDay, derivedDays[lastDay].end),
      scheduledMinutes: derivedDays.reduce((sum, d) => sum + d.lengthMinutes, 0),
      matchPlaySeconds: MATCH_PLAY_SECONDS,
    },
  }
}
