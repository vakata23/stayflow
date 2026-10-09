// Три визуални посоки за приложението — палитри и автоматична проверка на контраста.
//   node design/directions/palettes.mjs        → печата таблица с всички двойки
// Същите проверки се пускат и от scripts/test-design.mjs.
//
// Правила: текст ≥ 4.5:1; границата на контролите, фокусът и графиките ≥ 3:1;
// цветът никога не е единственият знак (състоянията имат иконка/текст).

export const DIRECTIONS = {
  a: {
    key: 'a',
    name: 'Златен час',
    tagline: 'Топла · гостоприемна · като хотел с душа',
    mood: 'Пясък и крем с дълбок теракотен акцент. Продължава „Златен час“ от публичните страници — собственикът и гостът виждат един и същ свят.',
    fonts: { head: 'Literata', body: 'Onest', num: 'Literata' },
    radius: 'големи: карти 24 · контроли 14 · значки 8',
    density: 'просторна — много въздух, малко линии; редове по 68 px',
    depth: 'меки топли сенки, без рамки; групите се делят от разстояние',
    nav: 'светла странична лента в крем; активният ред е мек теракотен фон; на телефон — плаваща лента с 5 места',
    c: {
      canvas: '#f6efe3', surface: '#fffcf6', sunken: '#efe5d3', line: '#e6dbc8', 'line-strong': '#8b7d68',
      ink: '#241a11', 'ink-soft': '#4f4235', 'ink-muted': '#6b5c4c',
      accent: '#a63e1e', 'accent-hover': '#8c3216', 'on-accent': '#ffffff', 'accent-soft': '#f8e2d6', 'accent-ink': '#7a2c12',
      success: '#2f6a3c', 'success-soft': '#e2efdc', 'success-ink': '#1d4a28',
      warning: '#8a5600', 'warning-soft': '#fbecc7', 'warning-ink': '#5e3a00',
      danger: '#b3261e', 'danger-soft': '#fbe1dc', 'danger-ink': '#7a1a14',
      'chart-1': '#5f7f46', 'chart-2': '#c4623f', 'src-airbnb': '#c4492f', 'src-booking': '#2f62a8', 'src-direct': '#4d7a3a',
      nav: '#f6efe3', 'on-nav': '#241a11', 'on-nav-muted': '#4f4235', 'nav-accent': '#a63e1e',
    },
  },
  b: {
    key: 'b',
    name: 'Графит',
    tagline: 'Тъмна · фокусирана · инструмент за професионалисти',
    mood: 'Графит със светъл „лимонов“ акцент. Спокойна вечер и нощ, числата светят — като пилотска кабина за имоти.',
    fonts: { head: 'Onest', body: 'Onest', num: 'JetBrains Mono' },
    radius: 'стегнати: карти 12 · контроли 8 · значки 5',
    density: 'плътна — повече информация на екран; редове по 46 px',
    depth: 'плоска, тънки 1 px линии, без сенки; светлина върху активното',
    nav: 'тъмна тясна лента; активният ред е със светла черта; на телефон — плътна долна лента',
    c: {
      canvas: '#0d1013', surface: '#151a1f', sunken: '#0a0c0f', line: '#262e37', 'line-strong': '#6a7785',
      ink: '#f1f4f6', 'ink-soft': '#bcc6cf', 'ink-muted': '#94a0ac',
      accent: '#c9f46e', 'accent-hover': '#dcff8c', 'on-accent': '#0d1013', 'accent-soft': '#222b15', 'accent-ink': '#d6f78f',
      success: '#4ade80', 'success-soft': '#10281a', 'success-ink': '#8bf0b0',
      warning: '#fbbf24', 'warning-soft': '#2b2210', 'warning-ink': '#fcd56b',
      danger: '#ff7a85', 'danger-soft': '#31151a', 'danger-ink': '#ffaab1',
      'chart-1': '#c9f46e', 'chart-2': '#6f8196', 'src-airbnb': '#ff7a85', 'src-booking': '#6fb1ff', 'src-direct': '#4ade80',
      nav: '#12171c', 'on-nav': '#f1f4f6', 'on-nav-muted': '#94a0ac', 'nav-accent': '#c9f46e',
    },
  },
  c: {
    key: 'c',
    name: 'Нощно синьо',
    tagline: 'Студена · спокойна · като банка за имоти',
    mood: 'Дълбоко нощно синьо и индиго върху студени неутрални. Усещане за доверие и ред — числата са на преден план.',
    fonts: { head: 'Golos Text', body: 'Golos Text', num: 'Golos Text' },
    radius: 'много големи: карти 28 · контроли 16 · значки 999',
    density: 'средна — едри карти, ясна йерархия; редове по 60 px',
    depth: 'меки студени сенки, без рамки; „плаваща“ лента',
    nav: 'тъмносиня плаваща лента със заоблени ъгли; на телефон — бяла долна лента с индиго „хапче“',
    c: {
      canvas: '#eef1f9', surface: '#ffffff', sunken: '#e5e9f6', line: '#d9dff1', 'line-strong': '#7080a6',
      ink: '#0f1840', 'ink-soft': '#38426f', 'ink-muted': '#535d8a',
      accent: '#4640d6', 'accent-hover': '#3631b4', 'on-accent': '#ffffff', 'accent-soft': '#e3e5fd', 'accent-ink': '#2d2994',
      success: '#0e7a55', 'success-soft': '#d9f3e9', 'success-ink': '#08493a',
      warning: '#935800', 'warning-soft': '#fcedcb', 'warning-ink': '#5d3900',
      danger: '#c42b3a', 'danger-soft': '#fde3e6', 'danger-ink': '#82182a',
      'chart-1': '#4640d6', 'chart-2': '#1a8fa3', 'src-airbnb': '#d6455a', 'src-booking': '#2a62c9', 'src-direct': '#0e7a55',
      nav: '#101a4e', 'on-nav': '#eef0ff', 'on-nav-muted': '#aab4ea', 'nav-accent': '#8f98ff',
    },
    nav: '',
  },
}
DIRECTIONS.c.nav = 'тъмносиня плаваща лента със заоблени ъгли; на телефон — бяла долна лента с индиго „хапче“'

// ---------------------------------------------------------------- проверка на контраста
const lin = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
const lum = (hex) => {
  const n = parseInt(hex.slice(1), 16)
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
}
export const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

/** [текст, фон, минимум, описание] */
export const PAIRS = [
  ['ink', 'canvas', 4.5, 'основен текст върху фона'],
  ['ink', 'surface', 4.5, 'основен текст върху карта'],
  ['ink', 'sunken', 4.5, 'основен текст върху вдълбната зона'],
  ['ink-soft', 'canvas', 4.5, 'второстепенен текст върху фона'],
  ['ink-soft', 'surface', 4.5, 'второстепенен текст върху карта'],
  ['ink-soft', 'sunken', 4.5, 'второстепенен текст върху вдълбната зона'],
  ['ink-muted', 'canvas', 4.5, 'подсказки върху фона'],
  ['ink-muted', 'surface', 4.5, 'подсказки върху карта'],
  ['ink-muted', 'sunken', 4.5, 'подсказки върху вдълбната зона'],
  ['on-accent', 'accent', 4.5, 'текст върху основен бутон'],
  ['on-accent', 'accent-hover', 4.5, 'текст върху основен бутон (ховър)'],
  ['accent', 'surface', 4.5, 'акцентът като текст/връзка върху карта'],
  ['accent', 'canvas', 4.5, 'акцентът като текст/връзка върху фона'],
  ['accent-ink', 'accent-soft', 4.5, 'текст върху мек акцент'],
  ['success', 'surface', 4.5, 'успех като текст/иконка върху карта'],
  ['warning', 'surface', 4.5, 'внимание като текст/иконка върху карта'],
  ['danger', 'surface', 4.5, 'грешка като текст/иконка върху карта'],
  ['success-ink', 'success-soft', 4.5, 'текст в съобщение за успех'],
  ['warning-ink', 'warning-soft', 4.5, 'текст в предупреждение'],
  ['danger-ink', 'danger-soft', 4.5, 'текст в грешка'],
  ['line-strong', 'surface', 3, 'граница на поле върху карта (UI ≥ 3:1)'],
  ['line-strong', 'canvas', 3, 'граница на поле върху фона (UI ≥ 3:1)'],
  ['accent', 'surface', 3, 'фокус пръстен върху карта (UI ≥ 3:1)'],
  ['chart-1', 'surface', 3, 'графика, серия 1 (≥ 3:1)'],
  ['chart-2', 'surface', 3, 'графика, серия 2 (≥ 3:1)'],
  ['src-airbnb', 'surface', 3, 'точка „Airbnb“ (≥ 3:1)'],
  ['src-booking', 'surface', 3, 'точка „Booking“ (≥ 3:1)'],
  ['src-direct', 'surface', 3, 'точка „Директна“ (≥ 3:1)'],
  ['on-nav', 'nav', 4.5, 'текст в навигацията'],
  ['on-nav-muted', 'nav', 4.5, 'второстепенен текст в навигацията'],
  ['nav-accent', 'nav', 3, 'активен знак в навигацията (UI ≥ 3:1)'],
]

export function check(dir) {
  return PAIRS.map(([fg, bg, min, why]) => {
    const r = ratio(dir.c[fg], dir.c[bg])
    return { fg, bg, min, why, ratio: r, ok: r >= min }
  })
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('palettes.mjs')) {
  for (const d of Object.values(DIRECTIONS)) {
    const res = check(d)
    const bad = res.filter((r) => !r.ok)
    console.log(`\n${d.key.toUpperCase()} · ${d.name}: ${res.length - bad.length}/${res.length} двойки минават`)
    for (const r of bad) console.log(`   ✗ ${r.why}: ${r.fg} върху ${r.bg} = ${r.ratio.toFixed(2)} (нужно ${r.min})`)
    console.log('   най-ниски:', res.slice().sort((a, b) => a.ratio / a.min - b.ratio / b.min).slice(0, 3).map((r) => `${r.fg}/${r.bg} ${r.ratio.toFixed(2)}`).join(' · '))
  }
}
