<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import ConfigPanel from '../components/ConfigPanel.vue'
import StatCard from '../components/StatCard.vue'
import TimelineGantt from '../components/TimelineGantt.vue'
import TimelineTable from '../components/TimelineTable.vue'
import ValidationPanel from '../components/ValidationPanel.vue'
import TeamSlotTable from '../components/TeamSlotTable.vue'
import { config, findings, hydrateFromUrl, resetConfig, schedule, shareUrl } from '../composables/eventConfig'
import { fmtDuration, fmtTime } from '../lib/format'
import { printScope } from '../lib/print'
import { CalendarDays, ChartColumn, Check, Info, Printer, RotateCcw, Share2 } from '@lucide/vue'
import { QUAL_MIN_BREAK_MINUTES } from '../lib/manual'

const d = computed(() => schedule.value.derived)

const breakCls = computed(() => (d.value.minTeamBreakMinutes < QUAL_MIN_BREAK_MINUTES ? 'behind' : ''))
const coverageCls = computed(() => (d.value.scheduledMatchCount === d.value.qualMatchCount ? '' : 'behind'))

const subtitle = computed(() => {
  const date = config.value.eventDate
    ? new Date(`${config.value.eventDate}T00:00:00`).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : ''
  return [date, `${config.value.numTeams} teams`, `${d.value.allianceCount} playoff alliances`]
    .filter(Boolean)
    .join(' · ')
})

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
      <StatCard :value="fmtTime(d.qualsStart)" label="Quals start" />
      <StatCard :value="fmtTime(d.dayEnd)" label="Event ends" />
      <StatCard :value="fmtDuration(d.dayLengthMinutes)" label="Day length" />
      <StatCard
        :value="fmtDuration(d.minTeamBreakMinutes)"
        label="Team break"
        :cls="breakCls"
        :sub="`T406 min ${QUAL_MIN_BREAK_MINUTES}m`"
      />
      <StatCard :value="fmtDuration(d.playoffMinutes)" label="Playoffs" :sub="`${d.allianceCount} alliances`" />
    </div>
  </div>

  <ValidationPanel :findings="findings" />
  <TimelineGantt :blocks="schedule.blocks" />
  <TimelineTable :blocks="schedule.blocks" />
  <TeamSlotTable :slots="schedule.teamSlots" :estimate="config.judging.mode === 'concurrent'" />
</template>
