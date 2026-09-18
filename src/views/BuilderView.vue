<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import ConfigPanel from '../components/ConfigPanel.vue'
import StatCard from '../components/StatCard.vue'
import TimelineGantt from '../components/TimelineGantt.vue'
import TimelineTable from '../components/TimelineTable.vue'
import ValidationPanel from '../components/ValidationPanel.vue'
import TeamSlotTable from '../components/TeamSlotTable.vue'
import {
  config,
  findings,
  hydrateFromUrl,
  multiDay,
  resetConfig,
  schedule,
  shareUrl,
} from '../composables/eventConfig'
import { fmtDateRange, fmtDateShort, fmtDuration, fmtTime } from '../lib/format'
import { printScope } from '../lib/print'
import { CalendarDays, ChartColumn, Check, Info, Printer, RotateCcw, Share2 } from '@lucide/vue'
import { QUAL_MIN_BREAK_MINUTES } from '../lib/manual'

const d = computed(() => schedule.value.derived)

const breakCls = computed(() => (d.value.minTeamBreakMinutes < QUAL_MIN_BREAK_MINUTES ? 'behind' : ''))
const coverageCls = computed(() => (d.value.scheduledMatchCount === d.value.qualMatchCount ? '' : 'behind'))

const subtitle = computed(() =>
  [
    fmtDateRange(config.value.days.map((day) => day.date)),
    multiDay.value ? `${config.value.days.length} days` : '',
    `${config.value.numTeams} teams`,
    `${d.value.allianceCount} playoff alliances`,
  ]
    .filter(Boolean)
    .join(' · '),
)

/** Which day a moment falls on, for the stat cards' sub-labels. */
function dayLabel(index: number): string {
  return multiDay.value ? (d.value.days[index]?.label ?? '') : ''
}

function overrunsTarget(index: number): boolean {
  const day = d.value.days[index]
  return day.targetEnd > 0 && day.end > day.targetEnd
}

onMounted(() => {
  hydrateFromUrl()
})

const shareLabel = ref('Share')
const shareCopied = ref(false)

async function copyShareLink(): Promise<void> {
  const url = shareUrl()
  try {
    await navigator.clipboard.writeText(url)
    shareLabel.value = 'Copied'
  } catch {
    // Clipboard is blocked on insecure origins; put it in the URL bar instead so
    // the director can copy it by hand.
    window.history.replaceState(null, '', url)
    shareLabel.value = 'In address bar'
  }
  shareCopied.value = true
  setTimeout(() => {
    shareLabel.value = 'Share'
    shareCopied.value = false
  }, 2000)
}
</script>

<template>
  <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 12px">
    <div>
      <h1 class="page-title">
        <CalendarDays class="icon" />{{ config.eventName || 'FTC Event Schedule' }}
      </h1>
      <p class="page-sub">{{ subtitle }}</p>
    </div>
    <div class="input-row no-print" style="flex-wrap: nowrap">
      <button
        class="btn-ghost"
        title="Print everything, or save as PDF from the print dialog"
        @click="printScope('all')"
      >
        <Printer class="icon" />Print all
      </button>
      <button class="btn-ghost" @click="copyShareLink">
        <component :is="shareCopied ? Check : Share2" class="icon" />{{ shareLabel }}
      </button>
      <button class="btn-ghost" @click="resetConfig"><RotateCcw class="icon" />Reset</button>
      <router-link to="/about" class="btn-ghost"><Info class="icon" />About</router-link>
    </div>
  </div>

  <ConfigPanel />

  <div class="card print-section">
    <h2><ChartColumn class="icon" />Summary</h2>
    <div class="stats-grid">
      <StatCard :value="d.qualMatchCount" label="Qual matches" :cls="coverageCls"
        :sub="`${d.scheduledMatchCount} scheduled`" />
      <StatCard :value="d.surrogateCount" label="Surrogates" :sub="d.surrogateCount ? 'extra appearances' : 'none needed'" />
      <StatCard :value="d.allianceCount" label="Alliances" sub="Table 13-2" />
      <StatCard :value="fmtTime(d.qualsStart)" label="Quals start" :sub="dayLabel(d.qualsStartDay)" />
      <StatCard :value="fmtTime(d.eventEnd)" label="Event ends" :sub="dayLabel(d.days.length - 1)" />
      <StatCard
        :value="fmtDuration(d.scheduledMinutes)"
        :label="multiDay ? 'Scheduled' : 'Day length'"
        :sub="multiDay ? `across ${d.days.length} days` : ''"
      />
      <StatCard
        :value="fmtDuration(d.minTeamBreakMinutes)"
        label="Team break"
        :cls="breakCls"
        :sub="`T406 min ${QUAL_MIN_BREAK_MINUTES}m`"
      />
      <StatCard :value="fmtDuration(d.playoffMinutes)" label="Playoffs" :sub="`${d.allianceCount} alliances`" />
    </div>

    <!-- Only worth the space once there's more than one day to compare. -->
    <div v-if="multiDay" class="table-wrap" style="margin-top: 16px">
      <table>
        <thead>
          <tr>
            <th>Day</th>
            <th>Date</th>
            <th>Start</th>
            <th>End</th>
            <th>Length</th>
            <th>Qual matches</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="day in d.days" :key="day.index">
            <td><strong>{{ day.label }}</strong></td>
            <td class="muted-cell">{{ fmtDateShort(day.date) }}</td>
            <td>{{ fmtTime(day.start) }}</td>
            <td :class="overrunsTarget(day.index) ? 'behind' : ''">{{ fmtTime(day.end) }}</td>
            <td class="muted-cell">{{ fmtDuration(day.lengthMinutes) }}</td>
            <td class="muted-cell">
              {{ day.matchCount }}
              <template v-if="day.matchMinutes">· {{ fmtDuration(day.matchMinutes) }}</template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <ValidationPanel :findings="findings" />
  <TimelineGantt :blocks="schedule.blocks" :days="d.days" />
  <TimelineTable :blocks="schedule.blocks" :days="d.days" />
  <TeamSlotTable
    :slots="schedule.teamSlots"
    :days="d.days"
    :estimate="config.judging.mode === 'concurrent'"
  />
</template>
