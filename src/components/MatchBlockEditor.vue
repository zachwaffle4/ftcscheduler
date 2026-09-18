<script setup lang="ts">
import { computed } from 'vue'
import NumberField from './NumberField.vue'
import {
  addMatchBlock,
  config,
  distributeMatchesEvenly,
  moveMatchBlock,
  multiDay,
  removeMatchBlock,
  reseedMatchBlocks,
  schedule,
  toggleBlockBreak,
} from '../composables/eventConfig'
import { blockOrder, clampDay } from '../lib/schedule'
import { fmtDateShort, fmtDuration, fmtTime } from '../lib/format'
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  Minus,
  Plus,
  RotateCcw,
  TriangleAlert,
  X,
} from '@lucide/vue'

const dayCount = computed(() => config.value.days.length)
const resolved = computed(() => schedule.value.derived.resolvedBlocks)
const counts = computed(() => resolved.value.map((r) => r.count))

const covered = computed(() => counts.value.reduce((a, b) => a + b, 0))
const required = computed(() => schedule.value.derived.qualMatchCount)

/**
 * Match numbers accumulate across the whole event in the order the blocks are played —
 * day by day, then list order — so each block shows the range it covers.
 */
const ranges = computed(() => {
  const out: ({ first: number; last: number } | null)[] = config.value.matchBlocks.map(() => null)
  let n = 1
  for (const i of blockOrder(config.value.matchBlocks, dayCount.value)) {
    const count = counts.value[i] ?? 0
    if (count <= 0) continue
    out[i] = { first: n, last: n + count - 1 }
    n += count
  }
  return out
})

/** Blocks grouped under the day that runs them, which is the order they're played in. */
const groups = computed(() =>
  config.value.days.map((day, index) => ({
    index,
    label: day.label || `Day ${index + 1}`,
    date: day.date,
    blocks: config.value.matchBlocks
      .map((block, i) => ({ block, i }))
      .filter((entry) => clampDay(entry.block.day, dayCount.value) === index),
  })),
)

/** A window block whose end time has already passed by the time the day reaches it. */
function isStarved(index: number): boolean {
  return config.value.matchBlocks[index].sizing === 'window' && counts.value[index] === 0
}
</script>

<template>
  <div class="config-section">
    <h3>Qualification Match Blocks</h3>
    <p class="page-sub" style="margin-bottom: 12px">
      Split qualification matches into blocks with their own cycle times and breaks, the way FTC Live
      does. Size a block by match count, by a wall-clock time window, or let it absorb whatever the
      others leave. Only one match runs at a time regardless of field count, so a block lasts
      <em>matches × cycle time</em>.
      <template v-if="multiDay">
        Each block belongs to a day, and matches are numbered across the whole event in the order
        they're played.
      </template>
    </p>

    <div v-for="group in groups" :key="group.index" class="day-group">
      <div v-if="multiDay" class="day-group-head">
        <span class="day-group-label">{{ group.label }}</span>
        <span class="field-hint">
          {{ fmtDateShort(group.date) }}
          <template v-if="schedule.derived.days[group.index]">
            · {{ schedule.derived.days[group.index].matchCount }} of {{ required }} matches
          </template>
        </span>
      </div>

      <p v-if="multiDay && !group.blocks.length" class="field-hint" style="margin-bottom: 10px">
        No qualification matches on this day.
      </p>

      <div v-if="group.blocks.length" class="block-list">
        <div v-for="(entry, position) in group.blocks" :key="entry.block.id" class="block-item">
          <div class="block-item-head">
            <input v-model="entry.block.label" type="text" placeholder="Block name" />
            <button
              class="btn-ghost"
              title="Move earlier in the day"
              :disabled="position === 0"
              @click="moveMatchBlock(entry.block.id, -1)"
            >
              <ArrowUp class="icon" />
            </button>
            <button
              class="btn-ghost"
              title="Move later in the day"
              :disabled="position === group.blocks.length - 1"
              @click="moveMatchBlock(entry.block.id, 1)"
            >
              <ArrowDown class="icon" />
            </button>
            <button
              class="btn-ghost"
              title="Remove block"
              :disabled="config.matchBlocks.length <= 1"
              @click="removeMatchBlock(entry.block.id)"
            >
              <X class="icon" />
            </button>
          </div>

          <div class="block-item-body">
            <div v-if="multiDay" class="field" style="width: 130px">
              <label>Day</label>
              <select v-model.number="entry.block.day">
                <option v-for="(day, di) in config.days" :key="day.id" :value="di">
                  {{ day.label || `Day ${di + 1}` }}
                </option>
              </select>
            </div>

            <div class="field" style="width: 150px">
              <label>Sized by</label>
              <select v-model="entry.block.sizing">
                <option value="count">Fixed count</option>
                <option value="remaining">Remaining</option>
                <option value="window">Time window</option>
              </select>
            </div>

            <NumberField
              v-if="entry.block.sizing === 'count'"
              v-model="entry.block.matchCount"
              label="Count"
              :min="0"
              :max="500"
              width="90px"
            />

            <div v-if="entry.block.sizing === 'window'" class="field" style="width: 130px">
              <label>Ends by</label>
              <input v-model="entry.block.endTime" type="time" />
              <span class="field-hint">starts {{ fmtTime(resolved[entry.i].start) }}</span>
            </div>

            <NumberField
              v-model="entry.block.cycleMinutes"
              label="Cycle"
              suffix="min"
              :min="1"
              :max="30"
              width="90px"
              :hint="`suggested ${schedule.derived.suggestedCycleMinutes}`"
              :hint-warn="entry.block.cycleMinutes < schedule.derived.suggestedCycleMinutes"
            />

            <span class="row-note" :class="{ warning: isStarved(entry.i) }">
              {{ counts[entry.i] }} {{ counts[entry.i] === 1 ? 'match' : 'matches' }}
              <template v-if="ranges[entry.i]">
                · #{{ ranges[entry.i]!.first }}–{{ ranges[entry.i]!.last }}
              </template>
              · {{ fmtDuration(counts[entry.i] * entry.block.cycleMinutes) }}
              <template v-if="counts[entry.i] > 0">
                · {{ fmtTime(resolved[entry.i].start) }}–{{ fmtTime(resolved[entry.i].end) }}
              </template>
              <template v-if="isStarved(entry.i)">
                <TriangleAlert class="icon" style="margin: 0 3px 0 6px" />ends before the day reaches
                it
              </template>
            </span>

            <button class="btn-ghost" @click="toggleBlockBreak(entry.block.id)">
              <component :is="entry.block.breakAfter ? Minus : Plus" class="icon" />
              {{ entry.block.breakAfter ? 'Remove break' : 'Break after' }}
            </button>
          </div>

          <div v-if="entry.block.breakAfter" class="block-break-row">
            <div class="field" style="width: 180px">
              <label>Break name</label>
              <input v-model="entry.block.breakAfter.label" type="text" placeholder="Lunch" />
            </div>
            <NumberField
              v-model="entry.block.breakAfter.minutes"
              label="Length"
              suffix="min"
              :min="0"
              :max="240"
              width="100px"
            />
          </div>
        </div>
      </div>

      <div v-if="multiDay" class="input-row" style="margin-top: 10px">
        <button class="btn-ghost" @click="addMatchBlock(group.index)">
          <Plus class="icon" />Add block to {{ group.label }}
        </button>
      </div>
    </div>

    <div class="input-row" style="margin-top: 12px">
      <button v-if="!multiDay" class="btn-ghost" @click="addMatchBlock(0)">
        <Plus class="icon" />Add block
      </button>
      <button class="btn-ghost" @click="distributeMatchesEvenly">
        <ArrowLeftRight class="icon" />Distribute evenly
      </button>
      <button class="btn-ghost" @click="reseedMatchBlocks">
        <RotateCcw class="icon" />Reset to morning/afternoon
      </button>
      <span class="field-hint" :class="{ warning: covered !== required }" style="margin-left: auto">
        {{ covered }} of {{ required }} required matches scheduled
      </span>
    </div>
  </div>
</template>
