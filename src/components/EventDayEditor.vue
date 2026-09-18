<script setup lang="ts">
import { computed } from 'vue'
import NumberField from './NumberField.vue'
import { addEventDay, config, removeEventDay, schedule } from '../composables/eventConfig'
import { fmtDuration, fmtTime } from '../lib/format'
import { CalendarPlus, TriangleAlert, X } from '@lucide/vue'

const days = computed(() => schedule.value.derived.days)

/** The final day carries alliance selection, the bracket and the awards ceremony. */
const lastIndex = computed(() => config.value.days.length - 1)

function overrunsTarget(index: number): boolean {
  const day = days.value[index]
  return !!day && day.targetEnd > 0 && day.end > day.targetEnd
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
