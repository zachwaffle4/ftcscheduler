<script setup lang="ts">
import { computed, ref, type Component } from 'vue'
import type { Finding } from '../lib/validate'
import {
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Info,
  ShieldCheck,
  TriangleAlert,
} from '@lucide/vue'

const props = defineProps<{ findings: Finding[] }>()

/**
 * Collapsed by default — the checks are reference material, not something to read on
 * every edit. The summary chip stays in the header either way, so a problem still
 * announces itself without the list being open.
 */
const expanded = ref(false)

const LEVEL_CLASS: Record<Finding['level'], string> = {
  error: 'v-error',
  warn: 'v-warn',
  info: 'v-info',
  ok: 'v-ok',
}

const LEVEL_ICON: Record<Finding['level'], Component> = {
  error: CircleAlert,
  warn: TriangleAlert,
  info: Info,
  ok: CircleCheck,
}

const errors = computed(() => props.findings.filter((f) => f.level === 'error').length)
const warns = computed(() => props.findings.filter((f) => f.level === 'warn').length)

const summary = computed(() => {
  if (errors.value) return { text: `${errors.value} problem${errors.value === 1 ? '' : 's'}`, cls: 'behind' }
  if (warns.value) return { text: `${warns.value} warning${warns.value === 1 ? '' : 's'}`, cls: 'warning' }
  return { text: 'All clear', cls: 'ahead' }
})
</script>

<template>
  <div v-if="findings.length" class="card print-section">
    <button class="section-toggle no-print" :aria-expanded="expanded" @click="expanded = !expanded">
      <h2 style="margin-bottom: 0"><ShieldCheck class="icon" />Schedule Checks</h2>
      <span :class="summary.cls" style="font-size: 0.85rem; font-weight: 600">{{ summary.text }}</span>
      <component :is="expanded ? ChevronDown : ChevronRight" class="icon section-chevron" />
    </button>

    <!-- Printed copies always show the heading, since the toggle itself is hidden. -->
    <h2 class="print-only" style="margin-bottom: 12px">
      <ShieldCheck class="icon" />Schedule Checks
    </h2>

    <!-- v-show rather than v-if so the print stylesheet can force it open: a collapsed
         section would otherwise vanish from the printout entirely. -->
    <div v-show="expanded" class="section-body">
      <p class="page-sub" style="margin: 12px 0">
        Competition manual rules, cited by rule or section number, alongside practical checks on
        whether the day actually fits together.
      </p>

      <div class="validation-list">
        <div v-for="(f, i) in findings" :key="i" class="validation-item" :class="LEVEL_CLASS[f.level]">
          <component :is="LEVEL_ICON[f.level]" class="icon v-icon" />
          <span class="v-rule">{{ f.rule }}</span>
          <span>{{ f.message }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
