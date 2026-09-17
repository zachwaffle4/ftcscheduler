<script setup lang="ts">
withDefaults(
  defineProps<{ value: string | number; label: string; cls?: string; sub?: string | null }>(),
  { cls: '', sub: null },
)
</script>

<template>
  <div class="stat">
    <div class="stat-value" :class="cls">
      <slot>{{ value }}</slot>
    </div>
    <div class="stat-label">{{ label }}</div>
    <div v-if="sub" class="stat-sub">{{ sub }}</div>
  </div>
</template>
