/** Time and duration formatting. Everything here is pure. */

/**
 * Parse "HH:MM" into minutes since midnight. Returns 0 on anything unparseable —
 * including undefined, which is reachable when a config persisted by an older version
 * is missing a field the current version expects.
 */
export function parseTime(hhmm: string | undefined | null): number {
  if (typeof hhmm !== 'string') return 0
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!m) return 0
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return 0
  return h * 60 + min
}

/** Minutes since midnight → "9:05 AM". Wraps past midnight rather than overflowing. */
export function fmtTime(minutes: number): string {
  const wrapped = ((Math.round(minutes) % 1440) + 1440) % 1440
  const h24 = Math.floor(wrapped / 60)
  const m = wrapped % 60
  const suffix = h24 < 12 ? 'AM' : 'PM'
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`
}

/** Minutes since midnight → "09:05", for `<input type="time">`. */
export function fmtTime24(minutes: number): string {
  const wrapped = ((Math.round(minutes) % 1440) + 1440) % 1440
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`
}

/** A span of minutes → "3h 20m", "45m", "1h". */
export function fmtDuration(minutes: number): string {
  const total = Math.round(minutes)
  if (total < 60) return `${total}m`
  const h = Math.floor(total / 60)
  const m = total % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

/** Seconds → "2:38", for match-length displays. */
export function fmtMinSec(seconds: number): string {
  const s = Math.round(seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
