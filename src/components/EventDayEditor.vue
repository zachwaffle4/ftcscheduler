<script setup lang="ts">
import { computed } from 'vue'
import NumberField from './NumberField.vue'
import {
  addDayBreak,
  addEventDay,
  config,
  removeDayBreak,
  removeEventDay,
  schedule,
} from '../composables/eventConfig'
import { fmtDuration, fmtTime } from '../lib/format'
import { anchorOptions, type DayBreak } from '../lib/schedule'
import { CalendarPlus, Plus, TriangleAlert, X } from '@lucide/vue'

const days = computed(() => schedule.value.derived.days)

/** The final day carries alliance selection, the bracket and the awards ceremony. */
const lastIndex = computed(() => config.value.days.length - 1)

function overrunsTarget(index: number): boolean {
  const day = days.value[index]
  return !!day && day.targetEnd > 0 && day.end > day.targetEnd
}

/** What a day's breaks can follow: any of its blocks, not just the match blocks. */
function optionsOn(index: number) {
  return anchorOptions(config.value, index)
}

/** Switch a break between a clock time and following a block. */
function setAnchor(index: number, b: DayBreak, mode: 'time' | 'block'): void {
  if (mode === 'time') {
    b.afterBlock = null
    return
  }
  // Land on the first match block, which is where lunch usually goes; failing that, the
  // first thing the day has. Every day has at least its pits opening.
  const options = optionsOn(index)
  const matchBlockIds = new Set(config.value.matchBlocks.map((m) => m.id))
  b.afterBlock = (options.find((o) => matchBlockIds.has(o.key)) ?? options[0])?.key ?? null
}

/** A day nobody put anything on — no matches, no judging, no inspection, no practice. */
function isEmpty(index: number): boolean {
  return schedule.value.blocks.every((b) => b.day !== index || b.kind === 'checkin')
}
</script>

<template>
  <div class="config-section">
    <h3>Event Days</h3>
    <p class="page-sub" style="margin-bottom: 12px">
      Most events are one day. Add a second for a regional championship or premier event, where
      eight or more qualification matches per team and a full day of judging don't fit between one
      sunrise and one supper. Each day keeps its own start, pits-open window and target finish;
      qualification matches, judging, inspection and practice are then assigned to whichever day
      runs them. Alliance selection, the playoff bracket and awards always close the last day.
    </p>

    <div class="block-list">
      <div v-for="(day, i) in config.days" :key="day.id" class="block-item">
        <div class="block-item-head">
          <input v-model="day.label" type="text" :placeholder="`Day ${i + 1}`" />
          <span v-if="i === lastIndex && config.days.length > 1" class="field-hint">
            playoffs &amp; awards
          </span>
          <button
            class="btn-ghost"
            title="Remove this day — anything assigned to it moves to the day before"
            :disabled="config.days.length <= 1"
            @click="removeEventDay(day.id)"
          >
            <X class="icon" />
          </button>
        </div>

        <div class="block-item-body">
          <div class="field" style="width: 150px">
            <label>Date</label>
            <input v-model="day.date" type="date" />
          </div>
          <div class="field" style="width: 120px">
            <label>Starts</label>
            <input v-model="day.startTime" type="time" />
          </div>
          <NumberField
            v-model="day.openMinutes"
            :label="i === 0 && config.checkIn.mode === 'deadline' ? 'Check-in' : 'Pits open'"
            suffix="min"
            :min="0"
            :max="240"
            width="120px"
            :hint="i === 0 && config.checkIn.mode === 'deadline' ? 'I102 deadline' : 'before first activity'"
          />
          <NumberField
            v-model="day.driversMeetingMinutes"
            label="Drivers mtg"
            suffix="min"
            :min="0"
            :max="120"
            width="120px"
          />
          <NumberField
            v-model="day.openingCeremonyMinutes"
            label="Opening"
            suffix="min"
            :min="0"
            :max="120"
            width="115px"
            :hint="i === 0 ? 'ceremony' : 'usually day one only'"
          />
          <div class="field" style="width: 120px">
            <label>Target end</label>
            <input v-model="day.targetEndTime" type="time" />
          </div>

          <span class="row-note" :class="{ warning: overrunsTarget(i) || isEmpty(i) }">
            <template v-if="days[i]">
              {{ fmtTime(days[i].start) }}–{{ fmtTime(days[i].end) }} ·
              {{ fmtDuration(days[i].lengthMinutes) }} ·
              {{ days[i].matchCount }} qual {{ days[i].matchCount === 1 ? 'match' : 'matches' }}
            </template>
            <template v-if="isEmpty(i)">
              <TriangleAlert class="icon" style="margin: 0 3px 0 6px" />nothing scheduled
            </template>
            <template v-else-if="overrunsTarget(i)">
              <TriangleAlert class="icon" style="margin: 0 3px 0 6px" />past target
            </template>
          </span>
        </div>

        <div v-for="b in day.breaks" :key="b.id" class="block-break-row">
          <div class="field" style="width: 180px">
            <label>Break name</label>
            <input v-model="b.label" type="text" placeholder="Lunch" />
          </div>
          <div class="field" style="width: 130px">
            <label>Starts</label>
            <select
              :value="b.afterBlock ? 'block' : 'time'"
              @change="setAnchor(i, b, ($event.target as HTMLSelectElement).value as 'time' | 'block')"
            >
              <option value="time">At a time</option>
              <option value="block">After a block</option>
            </select>
          </div>
          <div v-if="b.afterBlock" class="field" style="width: 220px">
            <label>After</label>
            <select v-model="b.afterBlock">
              <option v-for="o in optionsOn(i)" :key="o.key" :value="o.key">{{ o.label }}</option>
              <option v-if="!optionsOn(i).some((o) => o.key === b.afterBlock)" :value="b.afterBlock">
                (not on this day)
              </option>
            </select>
          </div>
          <div v-else class="field" style="width: 120px">
            <label>Time</label>
            <input v-model="b.startTime" type="time" />
          </div>
          <NumberField v-model="b.minutes" label="Length" suffix="min" :min="0" :max="240" width="100px" />
          <button class="btn-ghost" title="Remove this break" @click="removeDayBreak(day.id, b.id)">
            <X class="icon" />
          </button>
        </div>
        <div class="input-row" style="margin-top: 6px">
          <button class="btn-ghost" @click="addDayBreak(day.id)">
            <Plus class="icon" />Add break
          </button>
          <span v-if="day.breaks.length" class="field-hint">
            At a time: inspection, judging and practice pause then, and a match or ceremony in
            progress finishes first. After a block: starts when that block ends — inspection, judging, practice, a ceremony or a match block.
          </span>
        </div>
      </div>
    </div>

    <div class="input-row" style="margin-top: 12px">
      <button class="btn-ghost" @click="addEventDay"><CalendarPlus class="icon" />Add day</button>
      <span class="field-hint" style="margin-left: auto">
        {{ config.days.length }} {{ config.days.length === 1 ? 'day' : 'days' }} ·
        {{ fmtDuration(schedule.derived.scheduledMinutes) }} scheduled
      </span>
    </div>
  </div>
</template>
