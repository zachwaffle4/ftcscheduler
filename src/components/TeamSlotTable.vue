<script setup lang="ts">
import { computed, ref } from 'vue'
import type { TeamSlot } from '../lib/schedule'
import { fmtTime } from '../lib/format'
import { downloadCsv, slugify, toCsv } from '../lib/csv'
import { printScope } from '../lib/print'
import { config } from '../composables/eventConfig'
import { ChevronDown, ChevronUp, Download, Printer, Users } from '@lucide/vue'

const props = defineProps<{ slots: TeamSlot[]; estimate: boolean }>()

const cols = [
  { label: 'Team', sortable: true },
  { label: 'Judging', sortable: true },
  { label: 'Panel', sortable: true },
  { label: 'Inspection', sortable: true },
  { label: 'Table', sortable: true },
] as const

const sortCol = ref(0)
const sortDir = ref<'asc' | 'desc'>('asc')

function sortBy(col: number): void {
  if (sortCol.value === col) sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  else {
    sortCol.value = col
    sortDir.value = 'asc'
  }
}

function sortVal(row: TeamSlot, col: number): number {
  switch (col) {
    case 0:
      return row.team
    case 1:
      return row.judgingStart ?? Infinity
    case 2:
      return row.judgingPanel ?? Infinity
    case 3:
      return row.inspectionStart ?? Infinity
    case 4:
      return row.inspectionTable ?? Infinity
    default:
      return 0
  }
}

const sortedSlots = computed(() =>
  props.slots.slice().sort((a, b) => {
    const delta = sortVal(a, sortCol.value) - sortVal(b, sortCol.value)
    return sortDir.value === 'asc' ? delta : -delta
  }),
)

function exportCsv(): void {
  const csv = toCsv(
    ['Team', 'Judging start', 'Judge panel', 'Inspection start', 'Inspection table'],
    sortedSlots.value.map((s) => [
      s.team,
      s.judgingStart === null ? '' : fmtTime(s.judgingStart),
      s.judgingPanel ?? '',
      s.inspectionStart === null ? '' : fmtTime(s.inspectionStart),
      s.inspectionTable ?? '',
    ]),
  )
  downloadCsv(`${slugify(config.value.eventName)}-team-slots.csv`, csv)
}
</script>

<template>
  <div v-if="slots.length" class="card print-section print-teams">
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px">
      <h2 style="margin-bottom: 0"><Users class="icon" />Team Judging &amp; Inspection Slots</h2>
      <div style="display: flex; gap: 8px" class="no-print">
        <button
          class="btn-ghost"
          title="Print just the judging and inspection schedule"
          @click="printScope('teams')"
        >
          <Printer class="icon" />Print
        </button>
        <button class="btn-ghost" @click="exportCsv"><Download class="icon" />Export CSV</button>
      </div>
    </div>

    <p class="page-sub" style="margin: 8px 0 12px">
      Teams are numbered by schedule position, not by FTC team number — map them to real teams once
      you have your roster.
      <template v-if="estimate">
        Because match assignments aren't generated here, these slots are staggered against the match
        cadence but can't be guaranteed collision-free.
      </template>
    </p>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th
              v-for="(c, ci) in cols"
              :key="ci"
              :class="{ sortable: c.sortable, 'sort-active': sortCol === ci }"
              @click="c.sortable && sortBy(ci)"
            >
              {{ c.label }}
              <component
                :is="sortCol === ci && sortDir === 'desc' ? ChevronDown : ChevronUp"
                v-if="c.sortable"
                class="icon"
                style="margin-left: 3px; opacity: 0.5; vertical-align: -0.15em"
              />
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in sortedSlots" :key="s.team">
            <td><strong>Team {{ s.team }}</strong></td>
            <td>{{ s.judgingStart === null ? '—' : fmtTime(s.judgingStart) }}</td>
            <td class="muted-cell">{{ s.judgingPanel ?? '—' }}</td>
            <td>{{ s.inspectionStart === null ? 'Open window' : fmtTime(s.inspectionStart) }}</td>
            <td class="muted-cell">{{ s.inspectionTable ?? '—' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
