<script setup lang="ts">
import { computed } from 'vue'
import NumberField from './NumberField.vue'
import {
  addMatchBlock,
  config,
  distributeMatchesEvenly,
  moveMatchBlock,
  removeMatchBlock,
  reseedMatchBlocks,
  schedule,
  toggleBlockBreak,
} from '../composables/eventConfig'
import { fmtDuration, fmtTime } from '../lib/format'
import { ArrowDown, ArrowLeftRight, ArrowUp, Minus, Plus, RotateCcw, TriangleAlert, X } from '@lucide/vue'

const resolved = computed(() => schedule.value.derived.resolvedBlocks)
const counts = computed(() => resolved.value.map((r) => r.count))

const covered = computed(() => counts.value.reduce((a, b) => a + b, 0))
const required = computed(() => schedule.value.derived.qualMatchCount)

/** Match numbers accumulate across blocks, so each block shows the range it covers. */
const ranges = computed(() => {
  let n = 1
  return counts.value.map((count) => {
    if (count <= 0) return null
    const range = { first: n, last: n + count - 1 }
    n = range.last + 1
    return range
  })
})

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
    </p>

    <div class="block-list">
      <div v-for="(block, i) in config.matchBlocks" :key="block.id" class="block-item">
        <div class="block-item-head">
          <input v-model="block.label" type="text" placeholder="Block name" />
          <button
            class="btn-ghost"
            title="Move up"
            :disabled="i === 0"
            @click="moveMatchBlock(block.id, -1)"
          >
            <ArrowUp class="icon" />
          </button>
          <button
            class="btn-ghost"
            title="Move down"
            :disabled="i === config.matchBlocks.length - 1"
            @click="moveMatchBlock(block.id, 1)"
          >
            <ArrowDown class="icon" />
          </button>
          <button
            class="btn-ghost"
            title="Remove block"
            :disabled="config.matchBlocks.length <= 1"
            @click="removeMatchBlock(block.id)"
          >
            <X class="icon" />
          </button>
        </div>

        <div class="block-item-body">
          <div class="field" style="width: 150px">
            <label>Sized by</label>
            <select v-model="block.sizing">
              <option value="count">Fixed count</option>
              <option value="remaining">Remaining</option>
              <option value="window">Time window</option>
            </select>
          </div>

          <NumberField
            v-if="block.sizing === 'count'"
            v-model="block.matchCount"
            label="Count"
            :min="0"
            :max="500"
            width="90px"
          />

          <div v-if="block.sizing === 'window'" class="field" style="width: 130px">
            <label>Ends by</label>
            <input v-model="block.endTime" type="time" />
            <span class="field-hint">starts {{ fmtTime(resolved[i].start) }}</span>
          </div>

          <NumberField
            v-model="block.cycleMinutes"
            label="Cycle"
            suffix="min"
            :min="1"
            :max="30"
            width="90px"
            :hint="`suggested ${schedule.derived.suggestedCycleMinutes}`"
            :hint-warn="block.cycleMinutes < schedule.derived.suggestedCycleMinutes"
          />

          <span class="row-note" :class="{ warning: isStarved(i) }">
            {{ counts[i] }} {{ counts[i] === 1 ? 'match' : 'matches' }}
            <template v-if="ranges[i]"> · #{{ ranges[i]!.first }}–{{ ranges[i]!.last }}</template>
            · {{ fmtDuration(counts[i] * block.cycleMinutes) }}
            <template v-if="isStarved(i)">
              <TriangleAlert class="icon" style="margin: 0 3px 0 6px" />ends before the day reaches
              it
            </template>
          </span>

          <button class="btn-ghost" @click="toggleBlockBreak(block.id)">
            <component :is="block.breakAfter ? Minus : Plus" class="icon" />
            {{ block.breakAfter ? 'Remove break' : 'Break after' }}
          </button>
        </div>

        <div v-if="block.breakAfter" class="block-break-row">
          <div class="field" style="width: 180px">
            <label>Break name</label>
            <input v-model="block.breakAfter.label" type="text" placeholder="Lunch" />
          </div>
          <NumberField v-model="block.breakAfter.minutes" label="Length" suffix="min" :min="0" :max="240" width="100px" />
        </div>
      </div>
    </div>

    <div class="input-row" style="margin-top: 12px">
      <button class="btn-ghost" @click="addMatchBlock"><Plus class="icon" />Add block</button>
      <button class="btn-ghost" @click="distributeMatchesEvenly"><ArrowLeftRight class="icon" />Distribute evenly</button>
      <button class="btn-ghost" @click="reseedMatchBlocks"><RotateCcw class="icon" />Reset to morning/afternoon</button>
      <span class="field-hint" :class="{ warning: covered !== required }" style="margin-left: auto">
        {{ covered }} of {{ required }} required matches scheduled
      </span>
    </div>
  </div>
</template>
