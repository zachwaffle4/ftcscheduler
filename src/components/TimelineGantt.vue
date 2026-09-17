<script setup lang="ts">
import { computed } from 'vue'
import type { Block, BlockKind } from '../lib/schedule'
import { fmtTime } from '../lib/format'
import { CalendarRange } from '@lucide/vue'

const props = defineProps<{ blocks: Block[] }>()

const BLOCK_CLASS: Record<BlockKind, string> = {
  checkin: 'block-checkin',
  inspection: 'block-inspection',
  judging: 'block-judging',
  ceremony: 'block-ceremony',
  practice: 'block-practice',
  quals: 'block-quals',
  playoff: 'block-playoff',
  break: 'block-break',
}

const LEGEND: ReadonlyArray<{ kind: BlockKind; label: string }> = [
  { kind: 'checkin', label: 'Check-in' },
  { kind: 'inspection', label: 'Inspection' },
  { kind: 'judging', label: 'Judging' },
  { kind: 'ceremony', label: 'Ceremony' },
  { kind: 'practice', label: 'Practice' },
  { kind: 'quals', label: 'Qualification matches' },
  { kind: 'playoff', label: 'Playoffs' },
  { kind: 'break', label: 'Break / awards' },
]

const span = computed(() => {
  if (!props.blocks.length) return { start: 0, end: 1 }
  const start = Math.min(...props.blocks.map((b) => b.start))
  const end = Math.max(...props.blocks.map((b) => b.end))
  return { start, end: Math.max(end, start + 1) }
})

/**
 * The playoff bracket is a couple of hours of short matches, which at day scale renders
 * as a row of unreadable slivers. Collapse the whole bracket — matches and the award
 * breaks woven between them — into one bar. Per-match detail lives in the schedule
 * table, which can expand it.
 */
function collapsePlayoffs(blocks: Block[]): Block[] {
  const first = blocks.findIndex((b) => b.kind === 'playoff')
  if (first < 0) return blocks

  // The bracket closes the day, so everything from the first playoff match onward —
  // matches, award breaks, and the closing ceremony — belongs to it.
  const bracket = blocks.slice(first)
  const matches = bracket.filter((b) => b.kind === 'playoff').length

  return [
    ...blocks.slice(0, first),
    {
      id: 'playoffs-collapsed',
      kind: 'playoff',
      label: `Playoffs — ${matches} matches & awards`,
      start: bracket[0].start,
      end: bracket[bracket.length - 1].end,
      detail: '',
      lane: bracket[0].lane,
    },
  ]
}

/** Lane 0 is the main field; higher lanes stack beneath it. */
const lanes = computed(() => {
  const byLane = new Map<number, Block[]>()
  for (const b of props.blocks) {
    const list = byLane.get(b.lane)
    if (list) list.push(b)
    else byLane.set(b.lane, [b])
  }
  return [...byLane.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([lane, blocks]) => ({
      lane,
      blocks: collapsePlayoffs(blocks.slice().sort((a, b) => a.start - b.start)),
    }))
})

function pct(value: number): number {
  const { start, end } = span.value
  return ((value - start) / (end - start)) * 100
}

function barStyle(block: Block): Record<string, string> {
  const left = pct(block.start)
  const width = Math.max(0.4, pct(block.end) - left)
  return { left: `${left}%`, width: `${width}%` }
}

const ticks = computed(() => {
  const { start, end } = span.value
  const out: { minute: number; label: string; left: number }[] = []
  for (let m = Math.ceil(start / 60) * 60; m <= end; m += 60) {
    out.push({ minute: m, label: fmtTime(m).replace(':00', ''), left: pct(m) })
  }
  return out
})

const LANE_LABEL: Partial<Record<BlockKind, string>> = {
  judging: 'Judging',
  inspection: 'Inspection',
  practice: 'Practice',
  checkin: 'Check-in',
}

function laneLabel(lane: number, blocks: Block[]): string {
  if (lane === 0) return 'Main field'
  return LANE_LABEL[blocks[0]?.kind] ?? 'Concurrent'
}
</script>

<template>
  <div class="card print-section">
    <h2><CalendarRange class="icon" />Day at a Glance</h2>

    <div class="timeline">
      <div v-for="group in lanes" :key="group.lane" class="timeline-row">
        <span class="timeline-time">{{ laneLabel(group.lane, group.blocks) }}</span>
        <div class="timeline-track">
          <div
            v-for="block in group.blocks"
            :key="block.id"
            class="timeline-bar"
            :class="BLOCK_CLASS[block.kind]"
            :style="barStyle(block)"
            :title="`${block.label} · ${fmtTime(block.start)}–${fmtTime(block.end)}`"
          >
            <span class="timeline-label">{{ block.label }}</span>
          </div>
        </div>
      </div>

      <div class="timeline-axis">
        <span></span>
        <div class="timeline-ticks">
          <span v-for="t in ticks" :key="t.minute" class="timeline-tick" :style="{ left: `${t.left}%` }">
            {{ t.label }}
          </span>
        </div>
      </div>
    </div>

    <div class="legend">
      <span v-for="item in LEGEND" :key="item.kind" class="legend-item">
        <span class="legend-swatch" :class="BLOCK_CLASS[item.kind]"></span>{{ item.label }}
      </span>
    </div>
  </div>
</template>
