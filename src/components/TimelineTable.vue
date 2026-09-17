<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Block } from '../lib/schedule'
import { fmtDuration, fmtTime } from '../lib/format'
import { downloadCsv, slugify, toCsv } from '../lib/csv'
import { printScope } from '../lib/print'
import { config } from '../composables/eventConfig'
import {
  CalendarClock,
  ChevronsDownUp,
  ChevronsUpDown,
  CornerDownRight,
  Download,
  Printer,
} from '@lucide/vue'

const props = defineProps<{ blocks: Block[] }>()

/**
 * A full bracket is a dozen-plus near-identical rows one cycle apart. Compressing runs
 * of back-to-back playoff matches into a single row keeps the schedule readable; the
 * award breaks between rounds stay as their own rows, so the shape of the day survives.
 */
const compressPlayoffs = ref(true)

type Row = { block: Block; concurrent: boolean; compressed: number }

const chronological = computed(() =>
  props.blocks.slice().sort((a, b) => a.start - b.start || a.lane - b.lane),
)

const rows = computed<Row[]>(() => {
  const source = chronological.value

  if (!compressPlayoffs.value) {
    return source.map((b) => ({ block: b, concurrent: b.lane > 0, compressed: 1 }))
  }

  const out: Row[] = []
  for (let i = 0; i < source.length; i++) {
    const block = source[i]

    if (block.kind !== 'playoff') {
      out.push({ block, concurrent: block.lane > 0, compressed: 1 })
      continue
    }

    let j = i
    while (j + 1 < source.length && source[j + 1].kind === 'playoff') j++
    const run = source.slice(i, j + 1)
    i = j

    if (run.length === 1) {
      out.push({ block, concurrent: false, compressed: 1 })
      continue
    }

    out.push({
      block: {
        ...block,
        id: `${block.id}-run`,
        label: 'Playoff Matches',
        end: run[run.length - 1].end,
        detail: `${run[0].label} through ${run[run.length - 1].label}`,
      },
      concurrent: false,
      compressed: run.length,
    })
  }
  return out
})

const playoffRunCount = computed(
  () => chronological.value.filter((b) => b.kind === 'playoff').length,
)

/** Always exports the full schedule — compression is a view preference, not data. */
function exportCsv(): void {
  const csv = toCsv(
    ['Start', 'End', 'Duration', 'Activity', 'Detail', 'Concurrent'],
    chronological.value.map((b) => [
      fmtTime(b.start),
      fmtTime(b.end),
      fmtDuration(b.end - b.start),
      b.label,
      b.detail,
      b.lane > 0 ? 'yes' : '',
    ]),
  )
  downloadCsv(`${slugify(config.value.eventName)}-schedule.csv`, csv)
}
</script>

<template>
  <div v-if="rows.length" class="card print-section print-schedule">
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px">
      <h2 style="margin-bottom: 0"><CalendarClock class="icon" />Event Schedule</h2>
      <div style="display: flex; gap: 8px" class="no-print">
        <button
          v-if="playoffRunCount > 1"
          class="btn-ghost"
          :title="
            compressPlayoffs
              ? 'Show every playoff match as its own row'
              : 'Collapse runs of back-to-back playoff matches'
          "
          @click="compressPlayoffs = !compressPlayoffs"
        >
          <component :is="compressPlayoffs ? ChevronsUpDown : ChevronsDownUp" class="icon" />
          {{ compressPlayoffs ? 'Expand playoffs' : 'Compress playoffs' }}
        </button>
        <button class="btn-ghost" title="Print just the event schedule" @click="printScope('schedule')">
          <Printer class="icon" />Print
        </button>
        <button class="btn-ghost" @click="exportCsv"><Download class="icon" />Export CSV</button>
      </div>
    </div>

    <div class="table-wrap" style="margin-top: 12px">
      <table class="schedule-table">
        <thead>
          <tr>
            <th>Start</th>
            <th>End</th>
            <th>Duration</th>
            <th>Activity</th>
            <th>Detail</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.block.id" :class="{ 'sub-row': r.concurrent }">
            <td>{{ fmtTime(r.block.start) }}</td>
            <td class="muted-cell">{{ fmtTime(r.block.end) }}</td>
            <td class="muted-cell">{{ fmtDuration(r.block.end - r.block.start) }}</td>
            <td>
              <strong v-if="!r.concurrent">{{ r.block.label }}</strong>
              <template v-else>
                <CornerDownRight class="icon" style="margin-right: 4px; opacity: 0.6" />{{
                  r.block.label
                }}
              </template>
              <span v-if="r.compressed > 1" class="muted-cell" style="font-size: 0.75rem">
                · {{ r.compressed }} matches
              </span>
            </td>
            <td class="muted-cell">{{ r.block.detail }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
