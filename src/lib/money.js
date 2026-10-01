/**
 * Единен формат за парични суми в цялото приложение.
 * България е в еврозоната от 01.01.2026 — всички суми в StayFlow са в евро.
 */
export function formatMoney(value) {
  return `${Number(value).toFixed(2)} €`
}
