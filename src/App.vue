<script setup lang="ts">
import { onErrorCaptured, ref } from 'vue'
import { clearStoredConfig } from './composables/eventConfig'
import { RotateCcw, TriangleAlert } from '@lucide/vue'

/**
 * Last-resort recovery. Config is persisted to localStorage, so a value the current
 * build can't handle would otherwise reload into the same crash every time, leaving
 * no way to reach the Reset button. Catch it and offer a way out instead.
 */
const crash = ref<string | null>(null)

onErrorCaptured((err) => {
  crash.value = err instanceof Error ? err.message : String(err)
  return false
})

function recover(): void {
  clearStoredConfig()
  window.location.href = window.location.pathname
}
</script>

<template>
  <div class="container">
    <template v-if="crash">
      <h1 class="page-title"><TriangleAlert class="icon" />Something went wrong</h1>
      <p class="page-sub">
        The saved event configuration couldn't be loaded by this version of the app.
      </p>
      <div class="card">
        <p style="font-size: 0.9rem; margin-bottom: 14px">
          Clearing it will start you from the default event. Any share links you've kept will still
          open.
        </p>
        <button class="btn-primary" @click="recover"><RotateCcw class="icon" />Reset and reload</button>
        <p class="stat-sub" style="margin-top: 14px; text-align: left">{{ crash }}</p>
      </div>
    </template>
    <router-view v-else />
  </div>
</template>
