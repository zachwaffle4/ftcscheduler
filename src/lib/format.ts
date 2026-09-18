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

/* ------------------------------------------------------------------- Dates */

/**
 * Parse "YYYY-MM-DD" as a local date. The `T00:00:00` matters: bare "YYYY-MM-DD" is
 * parsed as UTC, which renders as the previous day for anyone west of Greenwich.
 */
function parseDate(iso: string | undefined | null): Date | null {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const date = new Date(`${iso}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

/** "2026-09-17" → "Thursday, September 17, 2026". Empty for an unparseable date. */
export function fmtDateLong(iso: string | undefined | null): string {
  const date = parseDate(iso)
  return date
    ? date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : ''
}

/** "2026-09-17" → "Thu, Sep 17". Empty for an unparseable date. */
export function fmtDateShort(iso: string | undefined | null): string {
  const date = parseDate(iso)
  return date ? date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : ''
}

/**
 * The dates of a multi-day event as one phrase: "September 17–18, 2026" when the days
 * share a month, "October 31 – November 1, 2026" when they don't, and the single long
 * date when the event is one day.
 */
export function fmtDateRange(isoDates: readonly string[]): string {
  const dates = isoDates.map(parseDate).filter((d): d is Date => d !== null)
  if (!dates.length) return ''
  const first = dates[0]
  const last = dates[dates.length - 1]
  if (first.getTime() === last.getTime()) return fmtDateLong(isoDates[0])

  const sameMonth = first.getMonth() === last.getMonth() && first.getFullYear() === last.getFullYear()
  const head = first.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
  const tail = sameMonth
    ? String(last.getDate())
    : last.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
  const joiner = sameMonth ? '–' : ' – '
  return `${head}${joiner}${tail}, ${last.getFullYear()}`
}

/** Shift "YYYY-MM-DD" by whole days. Returns the input unchanged if it won't parse. */
export function addDaysIso(iso: string, delta: number): string {
  const date = parseDate(iso)
  if (!date) return iso
  date.setDate(date.getDate() + delta)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
