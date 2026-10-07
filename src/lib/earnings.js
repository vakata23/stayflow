import { toISODate, fromISODate, todayISO, MONTHS_BG } from './dates'

export function addMonths(date, n) {
  return new Date(date.getFullYear(), date.getMonth() + n, date.getDate())
}

export function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

export function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0)
}

export function startOfYear(date) {
  return new Date(date.getFullYear(), 0, 1)
}

export function endOfYear(date) {
  return new Date(date.getFullYear(), 11, 31)
}

export const PERIODS = [
  { value: 'month', label: 'Този месец' },
  { value: 'year', label: 'Тази година' },
  { value: 'upcoming', label: 'Следващите 3 месеца' },
  { value: 'custom', label: 'Свой период' },
]

/**
 * Връща [from, to] (ISO дати) за избрания период. „upcoming“ е
 * предстоящите приходи — резервации, които вече са на книга за месеца
 * плюс следващите два (общо 3 календарни месеца напред от днес).
 */
export function getPeriodRange(kind, custom) {
  const today = new Date()

  switch (kind) {
    case 'year':
      return { from: toISODate(startOfYear(today)), to: toISODate(endOfYear(today)) }
    case 'upcoming':
      return { from: todayISO(), to: toISODate(endOfMonth(addMonths(today, 2))) }
    case 'custom':
      return { from: custom?.from || todayISO(), to: custom?.to || todayISO() }
    case 'month':
    default:
      return { from: toISODate(startOfMonth(today)), to: toISODate(endOfMonth(today)) }
  }
}

/** 12 последователни месеца, завършващи в месеца на periodTo — за графиката. */
export function getChartRange(periodToISO) {
  const end = fromISODate(periodToISO)
  const start = addMonths(startOfMonth(end), -11)
  return { from: toISODate(start), to: toISODate(endOfMonth(end)) }
}

/**
 * Комбинира редовете от earnings_by_month (вече смятени в Postgres) в едно
 * обобщение за избрания период. Сумиращите се полета просто се събират;
 * съотношенията (заетост, ADR, RevPAR, дял директни) се извеждат наново от
 * сумите — точно както го прави самата SQL функция за един месец, само на
 * ниво „няколко месеца“. Никаква резервационна логика не се пресмята тук.
 */
export function aggregateEarningsRows(rows) {
  const sum = (key) => rows.reduce((s, r) => s + Number(r[key] ?? 0), 0)

  const availableNights = sum('available_nights')
  const nightsSold = sum('nights_sold')
  const revenue = sum('revenue')
  const commission = sum('commission')
  const directRevenue = sum('direct_revenue')
  const otaRevenue = sum('ota_revenue')
  const commissionSaved = sum('commission_saved')
  const otherIncome = sum('other_income')
  const expenses = sum('expenses')
  const net = round2(revenue - commission)

  return {
    available_nights: availableNights,
    nights_sold: nightsSold,
    occupancy_pct: availableNights ? round1((100 * nightsSold) / availableNights) : 0,
    revenue,
    commission,
    net,
    adr: nightsSold ? round2(revenue / nightsSold) : null,
    revpar: availableNights ? round2(revenue / availableNights) : 0,
    direct_revenue: directRevenue,
    ota_revenue: otaRevenue,
    direct_share_pct: revenue ? round1((100 * directRevenue) / revenue) : null,
    commission_saved: commissionSaved,
    other_income: round2(otherIncome),
    expenses: round2(expenses),
    profit: round2(net + otherIncome - expenses),
  }
}

function round1(n) {
  return Math.round(n * 10) / 10
}
function round2(n) {
  return Math.round(n * 100) / 100
}

/** 'YYYY-MM-01' → 'Яну 2026' (кратко, за оста на графиката). */
export function shortMonthLabel(monthISO) {
  const d = fromISODate(monthISO.slice(0, 10))
  return `${MONTHS_BG[d.getMonth()].slice(0, 3)} ${String(d.getFullYear()).slice(2)}`
}

/** Сглобява и сваля CSV файл — за счетоводителя. */
export function downloadCsv(filename, headers, rows) {
  const escape = (v) => {
    const s = v == null ? '' : String(v)
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [headers.map(escape).join(';'), ...rows.map((row) => row.map(escape).join(';'))]
  // BOM, за да отвори Excel кирилицата без да я чупи.
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  link.click()
  URL.revokeObjectURL(link.href)
}
