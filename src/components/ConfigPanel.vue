<script setup lang="ts">
import { computed } from 'vue'
import NumberField from './NumberField.vue'
import MatchBlockEditor from './MatchBlockEditor.vue'
import { config, schedule } from '../composables/eventConfig'
import {
  allianceCountForTeams,
  DEFAULT_PLAYOFF_TIMING,
  INTERVIEW_MIN_MINUTES,
  PLAYOFF_NOMINAL_AWARD_BREAK_MINUTES,
  PLAYOFF_NOMINAL_CYCLE_MINUTES,
  PLAYOFF_NOMINAL_FINALS_SLOT_MINUTES,
  playoffTimeline,
  QUALS_PER_TEAM_MAX,
  QUALS_PER_TEAM_MIN,
} from '../lib/manual'
import { fmtDuration } from '../lib/format'
import { RotateCcw, Settings } from '@lucide/vue'
import type { AllianceCount } from '../lib/manual'

const tableAlliances = computed(() => allianceCountForTeams(config.value.numTeams))

/** Breakdown of the current bracket, for the per-input hints. */
const bracketSteps = computed(() =>
  playoffTimeline(schedule.value.derived.allianceCount, config.value.includeIfRequiredFinal),
)
const cadenceMatchCount = computed(
  () => bracketSteps.value.filter((s) => s.kind === 'match' && s.minutes === PLAYOFF_NOMINAL_CYCLE_MINUTES).length,
)
const finalsMatchCount = computed(
  () => bracketSteps.value.filter((s) => s.kind === 'match' && s.minutes !== PLAYOFF_NOMINAL_CYCLE_MINUTES).length,
)
const breakCount = computed(() => bracketSteps.value.filter((s) => s.kind !== 'match').length)

const isManualPlayoffTiming = computed(
  () =>
    config.value.playoff.cycleMinutes === DEFAULT_PLAYOFF_TIMING.cycleMinutes &&
    config.value.playoff.finalsSlotMinutes === DEFAULT_PLAYOFF_TIMING.finalsSlotMinutes &&
    config.value.playoff.awardBreakMinutes === DEFAULT_PLAYOFF_TIMING.awardBreakMinutes,
)

function resetPlayoffTiming(): void {
  config.value.playoff = { ...DEFAULT_PLAYOFF_TIMING }
}

const allianceSelectValue = computed({
  get: () => (config.value.allianceCountOverride === null ? 'auto' : String(config.value.allianceCountOverride)),
  set: (v: string) => {
    config.value.allianceCountOverride = v === 'auto' ? null : (Number(v) as AllianceCount)
  },
})
</script>

<template>
  <div class="card no-print">
    <h2><Settings class="icon" />Event Configuration</h2>

    <!-- Sections run in event order: the day's parameters first, then each activity
         in the order it happens, from check-in through the playoff bracket. -->

    <div class="config-section">
      <h3>Event</h3>
      <div class="input-row">
        <div class="field" style="flex: 1; min-width: 240px">
          <label>Event name</label>
          <input v-model="config.eventName" type="text" placeholder="FTC Qualifying Tournament" />
        </div>
        <div class="field" style="width: 160px">
          <label>Date</label>
          <input v-model="config.eventDate" type="date" />
        </div>
        <div class="field" style="width: 130px">
          <label>Day starts</label>
          <input v-model="config.dayStart" type="time" />
        </div>
        <div class="field" style="width: 130px">
          <label>Target end</label>
          <input v-model="config.targetEndTime" type="time" />
        </div>
      </div>
    </div>

    <div class="config-section">
      <h3>Teams &amp; Matches</h3>
      <div class="input-row">
        <NumberField
          v-model="config.numTeams"
          label="Teams"
          :min="1"
          :max="128"
          :hint="`${tableAlliances} alliances (Table 13-2)`"
        />
        <NumberField
          v-model="config.qualsPerTeam"
          label="Quals per team"
          :min="1"
          :max="12"
          width="130px"
          :hint="`manual: ${QUALS_PER_TEAM_MIN}–${QUALS_PER_TEAM_MAX}`"
          :hint-warn="config.qualsPerTeam < QUALS_PER_TEAM_MIN || config.qualsPerTeam > QUALS_PER_TEAM_MAX"
        />
        <NumberField
          v-model="config.numFields"
          label="Fields"
          :min="1"
          :max="6"
          width="130px"
          hint="only affects cycle time"
        />
        <span class="row-note">
          {{ schedule.derived.qualMatchCount }} qualification matches
          <template v-if="schedule.derived.surrogateCount">
            · {{ schedule.derived.surrogateCount }} surrogate{{
              schedule.derived.surrogateCount === 1 ? '' : 's'
            }}
          </template>
        </span>
      </div>
    </div>

    <div class="config-section">
      <h3>Check-In &amp; Pits</h3>
      <div class="input-row">
        <div class="field" style="width: 240px">
          <label>Check-in</label>
          <select v-model="config.checkIn.mode">
            <option value="deadline">Closes 45 min before quals</option>
            <option value="before-judging">Rolling — before judging slot</option>
          </select>
        </div>
        <NumberField
          v-model="config.checkIn.minutes"
          :label="config.checkIn.mode === 'deadline' ? 'Check-in window' : 'Pits open'"
          suffix="min"
          :min="0"
          :max="240"
          width="150px"
          :hint="config.checkIn.mode === 'deadline' ? 'I102 deadline' : 'before first activity'"
        />
      </div>
    </div>

    <div class="config-section">
      <h3>Judging — Initial Interviews</h3>
      <div class="input-row">
        <div class="field" style="width: 230px">
          <label>When</label>
          <select v-model="config.judging.mode">
            <option value="concurrent">Concurrent with qualification matches</option>
            <option value="dedicated">Dedicated window before quals</option>
          </select>
        </div>
        <NumberField v-model="config.judging.panels" label="Judge panels" :min="1" :max="20" width="120px" />
        <NumberField
          v-model="config.judging.interviewMinutes"
          label="Interview"
          suffix="min"
          :min="1"
          :max="60"
          width="120px"
          :hint="`A205 minimum ${INTERVIEW_MIN_MINUTES}`"
          :hint-warn="config.judging.interviewMinutes < INTERVIEW_MIN_MINUTES"
        />
        <NumberField
          v-model="config.judging.gapMinutes"
          label="Gap between"
          suffix="min"
          :min="0"
          :max="30"
          width="130px"
          hint="judge deliberation"
        />
        <span class="row-note">{{ fmtDuration(schedule.derived.judgingMinutes) }} total</span>
      </div>
    </div>

    <div class="config-section">
      <h3>Inspection</h3>
      <div class="input-row">
        <NumberField v-model="config.inspection.tables" label="Inspection tables" :min="1" :max="20" width="150px" />
        <NumberField
          v-model="config.inspection.minutesPerTeam"
          label="Per team"
          suffix="min"
          :min="1"
          :max="120"
          width="120px"
        />
        <label class="checkbox-field">
          <input v-model="config.inspection.scheduled" type="checkbox" />
          Assign scheduled slots
        </label>
        <span class="row-note">{{ fmtDuration(schedule.derived.inspectionMinutes) }} total</span>
      </div>
    </div>

    <div class="config-section">
      <h3>Practice Matches</h3>
      <div class="input-row">
        <label class="checkbox-field">
          <input v-model="config.practice.enabled" type="checkbox" />
          Run practice matches
        </label>
        <NumberField
          v-if="config.practice.enabled"
          v-model="config.practice.matchesPerTeam"
          label="Per team"
          :min="0"
          :max="6"
          width="110px"
        />
        <NumberField
          v-if="config.practice.enabled"
          v-model="config.practice.cycleMinutes"
          label="Cycle"
          suffix="min"
          :min="1"
          :max="20"
          width="110px"
        />
        <label
          v-if="config.practice.enabled && config.judging.mode === 'dedicated'"
          class="checkbox-field"
          title="Teams may play scheduled practice matches before passing inspection (§3.3)"
        >
          <input v-model="config.practice.concurrent" type="checkbox" />
          Run alongside inspection &amp; judging
        </label>
        <span v-else-if="config.practice.enabled" class="row-note">
          Concurrent practice needs a dedicated judging window
        </span>
      </div>
    </div>

    <div class="config-section">
      <h3>Drivers Meeting &amp; Opening Ceremony</h3>
      <div class="input-row">
        <NumberField
          v-model="config.driversMeetingMinutes"
          label="Drivers meeting"
          suffix="min"
          :min="0"
          :max="120"
          width="150px"
          hint="before opening ceremony"
        />
        <NumberField
          v-model="config.openingCeremonyMinutes"
          label="Opening ceremony"
          suffix="min"
          :min="0"
          :max="120"
          width="160px"
        />
      </div>
    </div>

    <MatchBlockEditor />

    <div class="config-section">
      <h3>Alliance Selection &amp; Playoffs</h3>
      <div class="input-row">
        <NumberField
          v-model="config.allianceSelectionMinutes"
          label="Alliance selection"
          suffix="min"
          :min="0"
          :max="120"
          width="160px"
        />
        <div class="field" style="width: 190px">
          <label>Playoff alliances</label>
          <select v-model="allianceSelectValue">
            <option value="auto">Auto — {{ tableAlliances }} (Table 13-2)</option>
            <option value="2">2 alliances</option>
            <option value="4">4 alliances</option>
            <option value="6">6 alliances</option>
            <option value="8">8 alliances</option>
          </select>
        </div>
        <label class="checkbox-field">
          <input v-model="config.includeIfRequiredFinal" type="checkbox" />
          Budget the “if required” final
        </label>
      </div>
    </div>

    <div class="config-section">
      <h3>Playoff Bracket Timing</h3>
      <p class="page-sub" style="margin-bottom: 12px">
        These defaults reproduce the manual's Tables 13-3…13-6 exactly. Each one rescales a different
        gap in the bracket — finals sit immediately before an award break, so they don't follow the
        round cadence.
      </p>
      <div class="input-row">
        <NumberField
          v-model="config.playoff.cycleMinutes"
          label="Round cycle"
          suffix="min"
          :min="1"
          :max="30"
          width="140px"
          :hint="`manual: ${PLAYOFF_NOMINAL_CYCLE_MINUTES} · ${cadenceMatchCount} matches`"
          :hint-warn="config.playoff.cycleMinutes < PLAYOFF_NOMINAL_CYCLE_MINUTES"
        />
        <NumberField
          v-model="config.playoff.finalsSlotMinutes"
          label="Finals slot"
          suffix="min"
          :min="1"
          :max="30"
          width="140px"
          :hint="`manual: ${PLAYOFF_NOMINAL_FINALS_SLOT_MINUTES} · ${finalsMatchCount} matches`"
        />
        <NumberField
          v-model="config.playoff.awardBreakMinutes"
          label="Award break"
          suffix="min"
          :min="0"
          :max="60"
          width="140px"
          :hint="`manual: ${PLAYOFF_NOMINAL_AWARD_BREAK_MINUTES} · ×${breakCount} = ${fmtDuration(breakCount * config.playoff.awardBreakMinutes)}`"
        />
        <span class="row-note">
          {{ fmtDuration(schedule.derived.playoffMinutes) }} total
          <template v-if="!isManualPlayoffTiming"> · differs from the manual</template>
        </span>
        <button v-if="!isManualPlayoffTiming" class="btn-ghost" @click="resetPlayoffTiming">
          <RotateCcw class="icon" />Manual defaults
        </button>
      </div>
    </div>
  </div>
</template>
