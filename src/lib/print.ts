/**
 * Scoped printing. Each printable card is tagged with `print-section` plus the scopes
 * it belongs to; putting a `print-scope-*` class on <body> hides everything outside
 * that scope for the duration of the print. The page header is deliberately left
 * untagged so every printout carries the event name and date.
 *
 * A scope covers exactly the card its button sits in, so a section's print button and
 * its heading always describe the same thing.
 */

export type PrintScope = 'all' | 'schedule' | 'teams'

export function printScope(scope: PrintScope): void {
  const cls = scope === 'all' ? null : `print-scope-${scope}`
  if (cls) document.body.classList.add(cls)

  let done = false
  const cleanup = (): void => {
    if (done) return
    done = true
    if (cls) document.body.classList.remove(cls)
    window.removeEventListener('afterprint', cleanup)
  }

  window.addEventListener('afterprint', cleanup)
  window.print()
  // Not every browser fires afterprint reliably; don't leave the page in print scope.
  setTimeout(cleanup, 1000)
}
