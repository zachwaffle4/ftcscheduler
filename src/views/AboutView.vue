<script setup lang="ts">
import {
  AUTO_SECONDS,
  CHECKIN_DEADLINE_BEFORE_QUALS_MINUTES,
  INTERVIEW_MIN_MINUTES,
  INTERVIEW_PRESENTATION_MINUTES,
  MANUAL_URL,
  MANUAL_VERSION,
  MATCH_PLAY_SECONDS,
  PLAYOFF_MIN_BREAK_MINUTES,
  QUAL_MIN_BREAK_MINUTES,
  SCHEDULE_PUBLISH_LEAD_MINUTES,
  TELEOP_SECONDS,
  TRANSITION_SECONDS,
} from '../lib/manual'
import { fmtMinSec } from '../lib/format'
import { ArrowLeft, Info } from '@lucide/vue'

const rules = [
  { rule: '§10.4', what: 'Match periods', value: `${AUTO_SECONDS}s auto + ${TRANSITION_SECONDS}s transition + ${TELEOP_SECONDS / 60}:00 teleop = ${fmtMinSec(MATCH_PLAY_SECONDS)}` },
  { rule: '§13.6.1', what: 'Quals per team', value: '5 or 6, set by the Event Director' },
  { rule: '§13.6.1', what: 'Schedule publication', value: `no later than ${SCHEDULE_PUBLISH_LEAD_MINUTES} min before quals` },
  { rule: '§13.6.2', what: 'Surrogates', value: 'assigned when teams × quals is not divisible by 4' },
  { rule: 'T406.A', what: 'Break between qual matches', value: `${QUAL_MIN_BREAK_MINUTES} min minimum` },
  { rule: 'T406.B', what: 'Break between playoff matches', value: `${PLAYOFF_MIN_BREAK_MINUTES} min minimum` },
  { rule: 'I102', what: 'Check-in deadline', value: `${CHECKIN_DEADLINE_BEFORE_QUALS_MINUTES} min before quals, "unless otherwise specified or approved by the Event Director"` },
  { rule: 'A205', what: 'Interview length', value: `at least ${INTERVIEW_MIN_MINUTES} min, equal for every team` },
  { rule: 'A207', what: 'Prepared presentation', value: `first ${INTERVIEW_PRESENTATION_MINUTES} min, uninterrupted` },
  { rule: '§3.3', what: 'Practice before inspection', value: 'allowed for scheduled practice matches, not for filler-line ones' },
  { rule: '§3.3.1', what: 'Inspection', value: 'robot inspection only — must pass before qualification matches' },
  { rule: 'Table 13-2', what: 'Playoff alliances', value: '4–10 → 2, 11–20 → 4, 21–40 → 6, 41–64 → 8' },
  { rule: 'Tables 13-3…13-6', what: 'Playoff timing', value: 'the default bracket timing — 6 min round cadence, 3 min finals slot, 15 min award breaks' },
]

const choices = [
  ['Match cycle time', 'The manual never specifies field reset or staging. The suggested default comes from the 6-minute cadence its own playoff timing tables use.'],
  ['Inspection duration', 'Not specified. Defaults to 20 minutes per team.'],
  ['Judge turnaround gap', 'Not specified. Defaults to 5 minutes between interviews for deliberation and the feedback form.'],
  ['Opening ceremony', 'Not specified. Defaults to 15 minutes.'],
  ['Alliance selection', 'T701 says only "typically just after the last scheduled Qualification MATCH". Defaults to 20 minutes.'],
  ['Lunch and breaks', 'Entirely the Event Director’s call — configure them per match block.'],
  ['Drivers meeting', 'Not specified. Defaults to 15 minutes, immediately before the opening ceremony.'],
  ['How check-in closes', 'I102 sets a 45-minute deadline but defers to the Event Director. Some regions — Massachusetts among them — instead keep check-in open and make each team’s own judging slot its deadline. Both are supported; pick the one your region runs, and the compliance checks follow.'],
  ['How many days the event runs', 'The manual sets no event length and never says a tournament is one day. §13.6.1 makes the number of qualification matches per team the Event Director’s call "based on available schedule time allocated", which is the only place day count enters the rules at all. Add days as you need them; each gets its own start time, pits-open window, drivers meeting and target finish, and you assign matches, judging, inspection and practice to whichever day runs them. Alliance selection, the bracket and awards always close the last day.'],
  ['More than 6 qualification matches per team', '§13.6.1 sets 5 or 6 for all event types, with Championship-level and Premier events scheduling more at FIRST HQ’s discretion. Marking the event as Championship or Premier says those extra rounds are sanctioned, which is the difference between a warning and a note — it changes nothing about the timing.'],
  ['Playoff bracket timing', 'Tables 13-3…13-6 are labelled "typical timing", not a rule. The three bracket inputs default to exactly those tables; changing them rescales the round cadence, the finals slot, and the award breaks independently. Note that finals always sit immediately before an award break, so they never follow the round cadence — the field is reset during the ceremony.'],
]
</script>

<template>
  <router-link to="/" class="back-btn"><ArrowLeft class="icon" />Back to schedule</router-link>

  <h1 class="page-title"><Info class="icon" />About</h1>
  <p class="page-sub">
    A schedule builder for FIRST Tech Challenge event directors, checked against the
    <a :href="MANUAL_URL" target="_blank" rel="noopener">{{ MANUAL_VERSION }}</a>.
  </p>

  <div class="card">
    <h2>What this does</h2>
    <p style="font-size: 0.9rem">
      Enter your team count, qualification matches per team, judging and inspection capacity, and
      match blocks. You get a minute-by-minute event timeline, per-team judging and inspection slots,
      and a list of every place the schedule conflicts with the competition manual.
    </p>
    <p style="font-size: 0.9rem; margin-top: 10px">
      Events can run over <strong>as many days as you need</strong>. A qualifier is one day; a
      regional championship or premier event with eight or more qualification matches per team and a
      full day of judging is usually two. Each day has its own clock, and every activity —
      qualification match blocks, judging, inspection, practice — is assigned to the day that runs
      it. The compliance checks then apply per day: each day's length against its own target, each
      day's matches against the judging that has to fit alongside them.
    </p>
    <p style="font-size: 0.9rem; margin-top: 10px">
      It deliberately does <strong>not</strong> generate qualification match pairings — which four
      teams play in each match. The manual delegates that to FIRST event management software, whose
      algorithm balances partner and opponent repeats alongside the T406 minimum break
      (§13.6.2). This tool budgets the time those matches take; it doesn't try to replace that
      scheduler.
    </p>
    <p style="font-size: 0.9rem; margin-top: 10px">
      One assumption worth stating plainly: <strong>only one match is played at a time</strong>, no
      matter how many fields you have. Extra fields don't run matches in parallel — they let the
      next field be reset and staged while the current match plays, which is why field count here
      only influences the suggested cycle time.
    </p>
  </div>

  <div class="card">
    <h2>Rules this enforces</h2>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Rule</th>
            <th>What</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rules" :key="r.rule + r.what">
            <td><strong>{{ r.rule }}</strong></td>
            <td>{{ r.what }}</td>
            <td class="muted-cell" style="white-space: normal">{{ r.value }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <div class="card">
    <h2>What the manual leaves to you</h2>
    <p class="page-sub">
      These are configurable because no rule fixes them. The defaults are conventional, not
      authoritative.
    </p>
    <div class="table-wrap">
      <table>
        <tbody>
          <tr v-for="[what, why] in choices" :key="what">
            <td><strong>{{ what }}</strong></td>
            <td class="muted-cell" style="white-space: normal">{{ why }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
