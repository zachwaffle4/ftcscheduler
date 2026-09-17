<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    modelValue: number
    label: string
    min?: number
    max?: number
    step?: number
    suffix?: string
    hint?: string | null
    hintWarn?: boolean
    width?: string
  }>(),
  { min: 0, max: 9999, step: 1, suffix: '', hint: null, hintWarn: false, width: '110px' },
)

const emit = defineEmits<{ (e: 'update:modelValue', v: number): void }>()

function onInput(e: Event): void {
  const raw = Number((e.target as HTMLInputElement).value)
  if (Number.isNaN(raw)) return
  emit('update:modelValue', Math.min(props.max, Math.max(props.min, raw)))
}
</script>

<template>
  <div class="field" :style="{ width }">
    <label>{{ label }}<span v-if="suffix" class="muted-cell"> ({{ suffix }})</span></label>
    <input type="number" :value="modelValue" :min="min" :max="max" :step="step" @input="onInput" />
    <span v-if="hint" class="field-hint" :class="{ warning: hintWarn }">{{ hint }}</span>
  </div>
</template>
