import { computed, ref, watch } from 'vue'
import {
  buildSchedule,
  defaultConfig,
  defaultMatchBlocks,
  normalizeConfig,
  suggestedCycleMinutes,
  type EventConfig,
  type MatchBlock,
} from '../lib/schedule'
import { fmtTime24 } from '../lib/format'
import { qualMatchCount } from '../lib/manual'
import { validate } from '../lib/validate'

/**
 * Global app state: a module-scope ref rather than a store library, which is all a
 * single-page tool with one config object needs.
 *
 * Bump LS_VERSION to discard persisted config outright. That's the blunt instrument;
 * `normalizeConfig` handles additive shape changes without losing the user's event.
 */
const LS_VERSION = 'v1'
const LS_KEY = `ftcsched_${LS_VERSION}_config`

function load(): EventConfig {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return normalizeConfig(JSON.parse(raw))
  } catch {
    // Private browsing, quota, or corrupt JSON — fall through to defaults.
  }
  return defaultConfig()
}

export const config = ref<EventConfig>(load())

watch(
  config,
  (value) => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(value))
    } catch {
      // Not worth surfacing; the app works fine without persistence.
    }
  },
  { deep: true },
)

export const schedule = computed(() => buildSchedule(config.value))
export const findings = computed(() => validate(config.value, schedule.value))

export const errorCount = computed(() => findings.value.filter((f) => f.level === 'error').length)
export const warnCount = computed(() => findings.value.filter((f) => f.level === 'warn').length)

export function resetConfig(): void {
  config.value = defaultConfig()
}

/**
 * Drop the persisted config entirely. The recovery path when a stored config is bad
 * enough that the app can't render — reassigning the ref isn't enough there, because
 * the broken value is what gets reloaded.
 */
export function clearStoredConfig(): void {
  try {
    localStorage.removeItem(LS_KEY)
  } catch {
    // Nothing useful to do; the reload below still lands on defaults in memory.
  }
}

/* ------------------------------------------------------------ URL sharing */

/**
 * Config round-trips through a `?c=` query param so a director can send a colleague a
 * link to a specific scenario. Base64url keeps it copy-paste safe.
 */
export function encodeConfig(value: EventConfig): string {
  const json = JSON.stringify(value)
  const bytes = new TextEncoder().encode(json)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decodeConfig(encoded: string): EventConfig | null {
  try {
    const padded = encoded.replace(/-/g, '+').replace(/_/g, '/')
    const binary = atob(padded)
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0))
    // Normalize so a link made by an older version still opens.
    return normalizeConfig(JSON.parse(new TextDecoder().decode(bytes)))
  } catch {
    return null
  }
}

/** Read `?c=` on load. Returns true if a shared config was applied. */
export function hydrateFromUrl(): boolean {
  const encoded = new URLSearchParams(window.location.search).get('c')
  if (!encoded) return false
  const decoded = decodeConfig(encoded)
  if (!decoded) return false
  config.value = decoded
  return true
}

export function shareUrl(): string {
  return `${window.location.origin}${window.location.pathname}?c=${encodeConfig(config.value)}`
}

/* --------------------------------------------------------------- Match blocks */

let blockIdSeq = 0

export function addMatchBlock(): void {
  blockIdSeq += 1
  const cycle = suggestedCycleMinutes(config.value.numFields)
  // Seed the end time from where the qualification blocks currently finish, so
  // switching this block to 'window' sizing lands somewhere sensible, not midnight.
  const endsAt = schedule.value.derived.qualsEnd + 10 * cycle
  config.value.matchBlocks.push({
    id: `block-${Date.now()}-${blockIdSeq}`,
    label: `Match Block ${config.value.matchBlocks.length + 1}`,
    sizing: 'count',
    matchCount: 10,
    endTime: fmtTime24(endsAt),
    cycleMinutes: cycle,
    breakAfter: null,
  })
}

export function removeMatchBlock(id: string): void {
  if (config.value.matchBlocks.length <= 1) return
  config.value.matchBlocks = config.value.matchBlocks.filter((b) => b.id !== id)
}

export function moveMatchBlock(id: string, delta: -1 | 1): void {
  const blocks = config.value.matchBlocks
  const i = blocks.findIndex((b) => b.id === id)
  const j = i + delta
  if (i < 0 || j < 0 || j >= blocks.length) return
  const [moved] = blocks.splice(i, 1)
  blocks.splice(j, 0, moved)
}

export function toggleBlockBreak(id: string): void {
  const block = config.value.matchBlocks.find((b) => b.id === id)
  if (!block) return
  block.breakAfter = block.breakAfter ? null : { label: 'Lunch', minutes: 45 }
}

/**
 * Rewrite the blocks so their counts add up to exactly what the event needs.
 *
 * Window blocks are left alone — their size is a consequence of the times the user
 * pinned, so silently resizing them would throw away the thing they asked for. Only
 * the count-sized blocks absorb the difference.
 */
export function distributeMatchesEvenly(): void {
  const total = qualMatchCount(config.value.numTeams, config.value.qualsPerTeam)
  const blocks = config.value.matchBlocks

  const resolved = schedule.value.derived.resolvedBlocks
  const windowMatches = blocks.reduce(
    (sum, b, i) => sum + (b.sizing === 'window' ? (resolved[i]?.count ?? 0) : 0),
    0,
  )

  const adjustable = blocks.filter((b) => b.sizing !== 'window')
  if (!adjustable.length) return

  const target = Math.max(0, total - windowMatches)
  const per = Math.floor(target / adjustable.length)
  let extra = target % adjustable.length

  config.value.matchBlocks = blocks.map<MatchBlock>((b) => {
    if (b.sizing === 'window') return b
    const take = per + (extra > 0 ? 1 : 0)
    if (extra > 0) extra--
    return { ...b, sizing: 'count', matchCount: take }
  })
}

/** Discard the current blocks for a fresh morning/afternoon split. */
export function reseedMatchBlocks(): void {
  const total = qualMatchCount(config.value.numTeams, config.value.qualsPerTeam)
  config.value.matchBlocks = defaultMatchBlocks(total, suggestedCycleMinutes(config.value.numFields))
}
