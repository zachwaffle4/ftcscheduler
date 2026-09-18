<script setup lang="ts">
import { computed, ref } from 'vue'
import type { DerivedDay, TeamSlot } from '../lib/schedule'
import { absMinute } from '../lib/schedule'
import { fmtTime } from '../lib/format'
import { downloadCsv, slugify, toCsv } from '../lib/csv'
import { printScope } from '../lib/print'
import { config } from '../composables/eventConfig'
import { ChevronDown, ChevronUp, Download, Printer, Users } from '@lucide/vue'

const props = defineProps<{ slots: TeamSlot[]; days: DerivedDay[]; estimate: boolean }>()

const multiDay = computed(() => props.days.length > 1)

/**
 * The day columns only appear on a multi-day event, and the sort indices shift with
 * them — hence building the column list rather than hard-coding it.
 */
const cols = computed(() =>
  multiDay.value
    ? ([
        { label: 'Team', key: 'team' },
        { label: 'Judging day', key: 'judgingDay' },
        { label: 'Judging', key: 'judging' },
        { label: 'Panel', key: 'panel' },
        { label: 'Inspection day', key: 'inspectionDay' },
        { label: 'Inspection', key: 'inspection' },
        { label: 'Table', key: 'table' },
      ] as const)
    : ([
        { label: 'Team', key: 'team' },
        { label: 'Judging', key: 'judging' },
        { label: 'Panel', key: 'panel' },
        { label: 'Inspection', key: 'inspection' },
        { label: 'Table', key: 'table' },
      ] as const),
)

type SortKey = (typeof cols.value)[number]['key']

const sortKey = ref<SortKey>('team')
const sortDir = ref<'asc' | 'desc'>('asc')

function sortBy(key: SortKey): void {
  if (sortKey.value === key) sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  else {
    sortKey.value = key
    sortDir.value = 'asc'
  }
}

function sortVal(row: TeamSlot, key: SortKey): number {
  switch (key) {
    case 'team':
      return row.team
    // Sorting a time means sorting across days too, so the day is folded in.
    case 'judging':
      return row.judgingStart === null ? Infinity : absMinute(row.judgingDay, row.judgingStart)
    case 'judgingDay':
      return row.judgingDay
    case 'panel':
      return row.judgingPanel ?? Infinity
    case 'inspection':
      return row.inspectionStart === null ? Infinity : absMinute(row.inspectionDay, row.inspectionStart)
    case 'inspectionDay':
      return row.inspectionDay
    case 'table':
      return row.inspectionTable ?? Infinity
    default:
      return 0
  }
}

const sortedSlots = computed(() =>
  props.slots.slice().sort((a, b) => {
    const delta = sortVal(a, sortKey.value) - sortVal(b, sortKey.value)
    return sortDir.value === 'asc' ? delta : -delta
  }),
)

function dayLabel(index: number): string {
  return props.days[index]?.label ?? `Day ${index + 1}`
}

function exportCsv(): void {
  const csv = toCsv(
    ['Team', 'Judging day', 'Judging start', 'Judge panel', 'Inspection day', 'Inspection start', 'Inspection table'],
    sortedSlots.value.map((s) => [
      s.team,
      dayLabel(s.judgingDay),
      s.judgingStart === null ? '' : fmtTime(s.judgingStart),
      s.judgingPanel ?? '',
      s.inspectionStart === null ? '' : dayLabel(s.inspectionDay),
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
      <template v-if="multiDay">
        Both queues run inside a single day; which day is set in the judging and inspection sections.
      </template>
    </p>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th
              v-for="c in cols"
              :key="c.key"
              class="sortable"
              :class="{ 'sort-active': sortKey === c.key }"
              @click="sortBy(c.key)"
            >
              {{ c.label }}
              <component
                :is="sortKey === c.key && sortDir === 'desc' ? ChevronDown : ChevronUp"
                class="icon"
                style="margin-left: 3px; opacity: 0.5; vertical-align: -0.15em"
              />
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in sortedSlots" :key="s.team">
            <td><strong>Team {{ s.team }}</strong></td>
            <td v-if="multiDay" class="muted-cell">{{ dayLabel(s.judgingDay) }}</td>
            <td>{{ s.judgingStart === null ? '—' : fmtTime(s.judgingStart) }}</td>
            <td class="muted-cell">{{ s.judgingPanel ?? '—' }}</td>
            <td v-if="multiDay" class="muted-cell">
              {{ s.inspectionStart === null ? '—' : dayLabel(s.inspectionDay) }}
            </td>
            <td>{{ s.inspectionStart === null ? 'Open window' : fmtTime(s.inspectionStart) }}</td>
            <td class="muted-cell">{{ s.inspectionTable ?? '—' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
