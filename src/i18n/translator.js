/**
 * Превод на текстовете на приложението на собственика. Изходният език е български — текстовете в кода си остават
 * на български (както са тествани), а на гръцки/македонски се заменят при показване по речник
 * { 'български текст': 'превод' } (виж domTranslator.js). Чиста логика без DOM — тества се с node.
 *
 * Ключ в речника:
 *  • обикновен текст („Запази“) — точно съвпадение на целия текст на възела;
 *  • текст с {0}, {1}… („Настанен · до {0}“) — шаблон; на мястото на {0} стои променливото (дата, име, число);
 *  • текст, завършващ на „:“ („Неуспешно записване:“) — стои пред текст от системата („Неуспешно записване: …“).
 * Ако текстът е сглобен в кода от няколко думи/израза („Почистване 25 € на резервация“), превеждат се частите му, но само
 * когато всяка българска дума е покрита от запис — така имена и бележки на потребителя („Студио „Морски бриз“) не се пипат.
 * Липсващ превод → текстът остава на български (никога празно).
 */

const CYR = /[Ѐ-ӿ]/
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Колко кирилски букви има в постоянната част на шаблона — по тях се решава колко „широки“ са {0}. */
const literalLetters = (key) => (key.replace(/\{\d+\}/g, '').match(/[Ѐ-ӿ]/g) ?? []).length

function compilePattern(key, out) {
  // Шаблон с малко собствен текст („{0} от {1} {2}“) хваща само отделни думи/числа, та да не „лапа“ случайни изречения.
  const wide = literalLetters(key) >= 8
  // тесен шаблон: една дума или число, може с „ €“/„ %“ след него (3370.25 €)
  const group = wide ? '([\\s\\S]+?)' : '(\\S+(?:\\s[€%])?)'
  const re = new RegExp('^' + key.split(/(\{\d+\})/).map((part) => (/^\{\d+\}$/.test(part) ? group : escapeRe(part))).join('') + '$')
  const order = [...key.matchAll(/\{(\d+)\}/g)].map((m) => Number(m[1])) // кой {n} е на коя позиция на група
  return { key, re, out, order, weight: literalLetters(key) }
}

/** Прави превеждач от речник. translate(text) връща превода или самия текст, ако няма какво да се направи. */
export function createTranslator(dict) {
  const exact = new Map()
  const patterns = []
  const prefixes = []
  for (const [key, out] of Object.entries(dict)) {
    if (!out) continue
    if (/\{\d+\}/.test(key)) patterns.push(compilePattern(key, out))
    else {
      exact.set(key, out)
      if (key.endsWith(':')) prefixes.push(key)
    }
  }
  patterns.sort((a, b) => b.weight - a.weight)
  prefixes.sort((a, b) => b.length - a.length)

  const cache = new Map()

  const LEAD = /^[(«„“"'·—–\-[]+/
  const TRAIL = /[)»”".,;:!?…·—–\]]+$/

  /** Превод по фрази: най-дългият запис за всяка последователност от думи; успява само ако всички български думи са покрити. */
  function byPhrases(core) {
    const words = core.split(' ')
    const out = []
    let any = false
    for (let i = 0; i < words.length; ) {
      if (!CYR.test(words[i])) {
        out.push(words[i++])
        continue
      }
      let hit = null
      for (let j = Math.min(words.length, i + 8); j > i && !hit; j--) {
        const chunk = words.slice(i, j).join(' ')
        let t = exact.get(chunk)
        if (t !== undefined) hit = { j, text: t }
        else {
          const lead = LEAD.exec(chunk)?.[0] ?? ''
          const trail = TRAIL.exec(chunk.slice(lead.length))?.[0] ?? ''
          t = exact.get(chunk.slice(lead.length, chunk.length - trail.length))
          if (t !== undefined) hit = { j, text: lead + t + trail }
        }
      }
      if (!hit) return undefined
      out.push(hit.text)
      i = hit.j
      any = true
    }
    return any ? out.join(' ') : undefined
  }

  function lookup(core, depth = 0) {
    const hit = exact.get(core)
    if (hit !== undefined) return hit
    if (depth > 2) return undefined
    for (const p of patterns) {
      const m = p.re.exec(core)
      if (!m) continue
      const vals = []
      p.order.forEach((n, i) => {
        const raw = m[i + 1]
        const core = raw.trim()
        const inner = depth < 2 && CYR.test(core) ? lookup(core, depth + 1) : undefined
        vals[n] = inner === undefined ? raw : raw.slice(0, raw.indexOf(core)) + inner + raw.slice(raw.indexOf(core) + core.length)
      })
      return p.out.replace(/\{(\d+)\}/g, (_, n) => vals[Number(n)] ?? '')
    }
    for (const pre of prefixes) {
      if (core.startsWith(pre) && (core.length === pre.length || core[pre.length] === ' ')) return exact.get(pre) + core.slice(pre.length)
    }
    return depth === 0 ? byPhrases(core) : undefined
  }

  function translate(text) {
    if (!text || !CYR.test(text)) return text
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text)
    const core = m[2].replace(/\s+/g, ' ')
    let out = cache.get(core)
    if (out === undefined) {
      out = lookup(core) ?? null
      cache.set(core, out)
    }
    return out === null ? text : m[1] + out + m[3]
  }

  /** Дали текстът (на български) има превод — за тестовете за покритие. */
  const covers = (text) => translate(text) !== text

  return { translate, covers, size: exact.size + patterns.length }
}
