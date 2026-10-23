// Езици на публичната страница: речниците са пълни и еднакви, множественото число работи,
// сръбската латиница е вярна, изборът на език, сървърните съобщения. Без браузър и без мрежа.
//   node scripts/test-stay-i18n.mjs
import { readFileSync } from 'node:fs'
import { LANGUAGES, LANG_BY_CODE, DICTS, DEFAULT_LANG, toLatin, pickLang, fromBrowserTag, translate, SERVER_ERRORS, serverErrorKey, weekdayLabels, monthTitle } from '../src/pages/stay/i18n/core.js'
import { AMENITIES, CANCELLATION_POLICIES } from '../src/lib/amenities.js'

let pass = 0
let fail = 0
const ok = (name, cond, extra = '') => {
  if (cond) pass++
  else {
    fail++
    console.log('  ПРОВАЛ:', name, extra)
  }
}

const en = DICTS.en
const placeholders = (v) => (typeof v === 'string' ? [v] : Object.values(v)).flatMap((s) => s.match(/\{\w+\}/g) ?? []).sort().join(',')
const strings = (v) => (typeof v === 'string' ? [v] : Object.values(v))
const CYR = /[Ѐ-ӿ]/
const GREEK = /[Ͱ-Ͽ]/

/* ---------- речници ---------- */
ok('седем кода: bg en mk sr sr-latn el ro', LANGUAGES.map((l) => l.code).join() === 'bg,en,mk,sr,sr-latn,el,ro')
for (const { code, locale } of LANGUAGES) {
  const d = DICTS[code]
  ok(`${code}: има речник`, !!d)
  ok(`${code}: същите ключове като английския`, Object.keys(d).sort().join('|') === Object.keys(en).sort().join('|'),
    `липсват: ${Object.keys(en).filter((k) => !(k in d)).join(', ')} · излишни: ${Object.keys(d).filter((k) => !(k in en)).join(', ')}`)
  ok(`${code}: няма празни текстове`, Object.values(d).every((v) => strings(v).every((s) => typeof s === 'string' && s.trim().length > 0)))
  const sameVars = Object.keys(en).every((k) => d[k] && placeholders(d[k]) === placeholders(en[k]) || (typeof en[k] !== 'string' && d[k] && new Set(strings(d[k]).flatMap((s) => s.match(/\{\w+\}/g) ?? [])).size === new Set(strings(en[k]).flatMap((s) => s.match(/\{\w+\}/g) ?? [])).size))
  ok(`${code}: същите {заместители} като английския`, sameVars,
    Object.keys(en).filter((k) => d[k] && placeholders(d[k]) !== placeholders(en[k]) && typeof en[k] === 'string').join(', '))

  // множествено число: всички форми, които езикът ползва
  const cats = new Intl.PluralRules(locale).resolvedOptions().pluralCategories.filter((c) => c !== 'many' && c !== 'zero' && c !== 'two')
  const badPlural = Object.entries(d).filter(([, v]) => typeof v !== 'string' && !cats.every((c) => c in v)).map(([k]) => k)
  ok(`${code}: множественото число има всички форми (${cats.join('/')})`, badPlural.length === 0, badPlural.join(', '))
  ok(`${code}: формите са там, където английският има обект`, Object.keys(en).every((k) => (typeof en[k] === 'string') === (typeof d[k] === 'string') || k === 'quoteMaxGuests'))
}

/* ---------- покритие на данните в приложението ---------- */
ok('всяко удобство има превод на всички езици', AMENITIES.every((a) => LANGUAGES.every((l) => typeof DICTS[l.code][`amenity.${a.key}`] === 'string')))
ok('всяка политика за анулиране има баджа, правило и пояснение', CANCELLATION_POLICIES.every((p) => ['badge', 'rule', 'hint'].every((f) => en[`cancel.${p.value}.${f}`])))
// propertySettings.js тегли supabase и не се зарежда в node — типовете канали се четат от изходния код
const channelTypes = [...readFileSync(new URL('../src/lib/propertySettings.js', import.meta.url), 'utf8').matchAll(/\{ value: '(\w+)', label:/g)].map((m) => m[1])
ok('намерени са 8 канала за връзка', channelTypes.length === 8, channelTypes.join())
ok('всеки канал за връзка има превод', channelTypes.every((c) => en[`channel.${c}`]))
ok('българският речник казва същото като досегашните етикети на удобствата', AMENITIES.every((a) => DICTS.bg[`amenity.${a.key}`] === a.label))
ok('българските пояснения за анулиране са като в amenities.js', CANCELLATION_POLICIES.every((p) => DICTS.bg[`cancel.${p.value}.hint`] === p.hint))

/* ---------- азбука ---------- */
for (const code of ['en', 'el', 'ro', 'sr-latn']) {
  const text = Object.values(DICTS[code]).flatMap(strings).join(' ')
  ok(`${code}: няма кирилица`, !CYR.test(text), text.match(/[Ѐ-ӿ]+/)?.[0])
}
for (const code of ['bg', 'mk', 'sr']) ok(`${code}: е на кирилица`, CYR.test(DICTS[code].about))
ok('el: е на гръцка азбука', GREEK.test(DICTS.el.about) && !GREEK.test(DICTS.ro.about))
ok('ro: ползва ș и ț със запетая (U+0219/021B), не със седил', !/[şţŞŢ]/.test(Object.values(DICTS.ro).flatMap(strings).join('')))

/* ---------- сръбска латиница ---------- */
ok('латиница: Љ Њ Џ → Lj Nj Dž, ђ ћ ч ш ж', toLatin('Љубав Њива Џем ђак ћуфте чаша шума жаба') === 'Ljubav Njiva Džem đak ćufte čaša šuma žaba')
ok('латиница: цифри, {заместители} и латински думи остават', toLatin('Добро {name} 12 WiFi') === 'Dobro {name} 12 WiFi')
ok('латиница: „Пошаљи упит“ → „Pošalji upit“', toLatin('Пошаљи упит') === 'Pošalji upit')
ok('sr-latn: целият речник е получен от кирилицата', DICTS['sr-latn'].about === toLatin(DICTS.sr.about) && DICTS['sr-latn'].about === 'O ovom smeštaju')

/* ---------- превод и множествено число ---------- */
ok('en: 1 guest / 2 guests', translate('en', 'guestsUpTo', { n: 1 }) === 'up to 1 guest' && translate('en', 'guestsUpTo', { n: 2 }) === 'up to 2 guests')
ok('bg: 1 гост / 2 гости', translate('bg', 'guestsUpTo', { n: 1 }) === 'до 1 гост' && translate('bg', 'guestsUpTo', { n: 2 }) === 'до 2 гости')
ok('ro: 1 oaspete / 4 oaspeți / 20 de oaspeți', translate('ro', 'guestsUpTo', { n: 1 }) === 'până la 1 oaspete' && translate('ro', 'guestsUpTo', { n: 4 }) === 'până la 4 oaspeți' && translate('ro', 'guestsUpTo', { n: 20 }) === 'până la 20 de oaspeți')
ok('ro: 3 nopți / 25 de nopți', translate('ro', 'nights', { n: 3 }) === '3 nopți' && translate('ro', 'nights', { n: 25 }) === '25 de nopți')
ok('sr: 1 рецензија / 2 рецензије / 5 рецензија / 21 рецензија', ['1 рецензија', '2 рецензије', '5 рецензија', '21 рецензија'].every((s, i) => translate('sr', 'reviewsCount', { n: [1, 2, 5, 21][i] }) === s))
ok('sr-latn: 3 recenzije', translate('sr-latn', 'reviewsCount', { n: 3 }) === '3 recenzije')
ok('mk: 1 рецензија / 3 рецензии', translate('mk', 'reviewsCount', { n: 1 }) === '1 рецензија' && translate('mk', 'reviewsCount', { n: 3 }) === '3 рецензии')
ok('el: 1 κριτική / 2 κριτικές', translate('el', 'reviewsCount', { n: 1 }) === '1 κριτική' && translate('el', 'reviewsCount', { n: 2 }) === '2 κριτικές')
ok('заместители: {time}, {city}, вложен {nights}', translate('en', 'checkInAfter', { time: '14:00' }) === 'Check-in after 14:00' && translate('en', 'quoteMinStay', { nights: translate('en', 'nights', { n: 3 }) }) === 'The minimum stay for these dates is 3 nights.')
ok('липсващ ключ връща ключа, не гърми', translate('el', 'няма.такъв.ключ') === 'няма.такъв.ключ')
ok('непознат език пада към български', translate('xx', 'about') === DICTS.bg.about)
ok('дробен брой (1.5 бани) не гърми', typeof translate('ro', 'bathrooms', { n: 1.5 }) === 'string')

/* ---------- избор на език ---------- */
ok('?lang= има предимство пред всичко', pickLang({ param: 'ro', stored: 'el', browser: ['bg-BG'] }) === 'ro')
ok('?lang=SR_Latn се разпознава', pickLang({ param: 'SR_Latn' }) === 'sr-latn')
ok('невалиден ?lang= се пренебрегва', pickLang({ param: 'xx', stored: 'mk' }) === 'mk')
ok('запомненият избор бие браузъра', pickLang({ stored: 'el', browser: ['en-US'] }) === 'el')
ok('браузър bg-BG → bg, ro-RO → ro, el → el, mk → mk, en-US → en', ['bg-BG', 'ro-RO', 'el', 'mk-MK', 'en-US'].map((t) => pickLang({ browser: [t] })).join() === 'bg,ro,el,mk,en')
ok('браузър sr-RS → латиница, sr-Cyrl-RS → кирилица', fromBrowserTag('sr-RS') === 'sr-latn' && fromBrowserTag('sr-Cyrl-RS') === 'sr' && fromBrowserTag('sr-Latn-ME') === 'sr-latn')
ok('първият поддържан език от списъка печели (de, ro → ro)', pickLang({ browser: ['de-DE', 'ro', 'en'] }) === 'ro')
ok('неподдържан език (de) → английски, не български', pickLang({ browser: ['de-DE', 'fr'] }) === 'en' && pickLang({ browser: [] }) === 'en' && pickLang() === 'en')
ok('езикът по подразбиране за сървър/тест е български', DEFAULT_LANG === 'bg')
ok('всеки език има локал и <html lang>', LANGUAGES.every((l) => l.locale && l.html && LANG_BY_CODE[l.code] === l))

/* ---------- съобщения от сървъра ---------- */
const serverSrc = readFileSync(new URL('../src/lib/bookingRequestServer.js', import.meta.url), 'utf8')
const fnSrc = readFileSync(new URL('../netlify/functions/booking-request.mjs', import.meta.url), 'utf8')
const serverMessages = [...serverSrc.matchAll(/error: '([^']+)'/g), ...fnSrc.matchAll(/error: '([^']*[А-Яа-я][^']*)'/g)].map((m) => m[1])
ok('намерени са съобщения от сървъра', serverMessages.length >= 15, String(serverMessages.length))
ok('всяко българско съобщение от сървъра има превод', serverMessages.every((m) => m in SERVER_ERRORS), serverMessages.filter((m) => !(m in SERVER_ERRORS)).join(' | '))
ok('всеки ключ от таблицата съществува в речниците', Object.values(SERVER_ERRORS).every((k) => k in en))
ok('непознато съобщение → общото „Неуспешно изпращане“', serverErrorKey('Нещо ново') === 'errSend' && serverErrorKey(undefined) === 'errSend')

/* ---------- дати ---------- */
ok('седмица от понеделник на български: Пн Вт Ср Чт Пт Сб Нд', weekdayLabels('bg-BG').join(' ') === 'Пн Вт Ср Чт Пт Сб Нд', weekdayLabels('bg-BG').join(' '))
ok('седмица на английски започва с Mon и свършва със Sun', weekdayLabels('en-GB')[0] === 'Mon' && weekdayLabels('en-GB')[6] === 'Sun')
ok('седмица на всеки език: 7 различни кратки етикета без точка', LANGUAGES.every((l) => { const w = weekdayLabels(l.locale); return w.length === 7 && new Set(w).size === 7 && w.every((x) => x && !x.endsWith('.')) }), LANGUAGES.map((l) => weekdayLabels(l.locale).join(' ')).join(' / '))
ok('месец: „Октомври 2026“ на български', monthTitle('bg-BG', 2026, 9) === 'Октомври 2026', monthTitle('bg-BG', 2026, 9))
ok('месец: October 2026 / Οκτώβριος 2026 / Octombrie 2026', monthTitle('en-GB', 2026, 9) === 'October 2026' && monthTitle('el-GR', 2026, 9) === 'Οκτώβριος 2026' && monthTitle('ro-RO', 2026, 9) === 'Octombrie 2026', [monthTitle('en-GB', 2026, 9), monthTitle('el-GR', 2026, 9), monthTitle('ro-RO', 2026, 9)].join(' / '))
ok('месец на македонски и сръбски (кирилица и латиница)', /^Октомври 2026$/.test(monthTitle('mk-MK', 2026, 9)) && /^Октобар 2026$/.test(monthTitle('sr-RS', 2026, 9)) && /^Oktobar 2026$/.test(monthTitle('sr-Latn-RS', 2026, 9)), [monthTitle('mk-MK', 2026, 9), monthTitle('sr-RS', 2026, 9), monthTitle('sr-Latn-RS', 2026, 9)].join(' / '))

console.log(`test-stay-i18n: ${pass} успешни, ${fail} провалени`)
process.exit(fail ? 1 : 0)
