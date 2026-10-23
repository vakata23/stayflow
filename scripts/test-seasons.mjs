// Сезонни цени — чистата логика (без база, без мрежа): покриване на дати, през Нова година, застъпване,
// проверка на формата, най-ниска цена, подписи на периодите. Същите случаи като SQL тестовете за season_covers (014).
//   node scripts/test-seasons.mjs
import {
  DAYS_IN_MONTH, SEASON_PRESETS, emptySeason, toDraft, toPayload, validateSeason, seasonCovers, seasonForDay,
  seasonDayKeys, seasonsOverlap, sameSeason, uncoveredDays, lowestPrice, overlappingSeasons, dayMonthLabel, seasonRangeLabel, monthLabel,
} from '../src/lib/seasonLogic.js'

let pass = 0
let fail = 0
const ok = (name, cond, extra = '') => {
  if (cond) pass++
  else {
    fail++
    console.log('  ПРОВАЛ:', name, extra)
  }
}
const S = (sm, sd, em, ed, extra = {}) => ({ key: `${sm}-${sd}-${em}-${ed}`, start_month: sm, start_day: sd, end_month: em, end_day: ed, price_per_night: '60', min_nights: 1, name: '', ...extra })

/* ---------- покриване (огледало на season_covers в SQL) ---------- */
const winter = S(11, 1, 3, 31)
ok('зима 1.11–31.03: 31.03 да, 01.04 не, 01.11 да, 31.10 не', seasonCovers(winter, '2027-03-31') && !seasonCovers(winter, '2027-04-01') && seasonCovers(winter, '2027-11-01') && !seasonCovers(winter, '2027-10-31'))
ok('зима през Нова година: 31.12, 01.01, 15.02 са в сезона; 15.07 не', seasonCovers(winter, '2027-12-31') && seasonCovers(winter, '2028-01-01') && seasonCovers(winter, '2028-02-15') && !seasonCovers(winter, '2027-07-15'))
ok('годината не влиза в сметката (същият ден в различни години)', seasonCovers(winter, '2025-12-20') === seasonCovers(winter, '2031-12-20'))
ok('цяла година 1.01–31.12 покрива всичко', seasonCovers(S(1, 1, 12, 31), '2027-02-28') && seasonCovers(S(1, 1, 12, 31), '2027-12-31'))
ok('един ден (5.05–5.05)', seasonCovers(S(5, 5, 5, 5), '2027-05-05') && !seasonCovers(S(5, 5, 5, 5), '2027-05-06') && !seasonCovers(S(5, 5, 5, 5), '2027-05-04'))
ok('29 февруари попада в 28.02–01.03', seasonCovers(S(2, 28, 3, 1), '2028-02-29'))
ok('20.12–10.01: 31.12 да, 11.01 не', seasonCovers(S(12, 20, 1, 10), '2027-12-31') && !seasonCovers(S(12, 20, 1, 10), '2028-01-11'))
ok('числа като низове от формата работят („11“, „1“)', seasonCovers(S('11', '1', '3', '31'), '2027-12-10'))

/* ---------- кой сезон важи, при застъпване ---------- */
const lato = S(6, 1, 9, 30, { name: 'Лято', created_at: '2026-01-02T00:00:00Z' })
const pik = S(8, 10, 8, 20, { name: 'Пик', created_at: '2026-01-03T00:00:00Z' })
const zima = S(11, 1, 3, 31, { name: 'Зима', created_at: '2026-01-01T00:00:00Z' })
ok('seasonForDay: в средата на лятото → Лято', seasonForDay([zima, lato, pik], '2027-07-10')?.name === 'Лято')
ok('seasonForDay: при застъпване печели по-новият (15.08 → Пик)', seasonForDay([zima, lato, pik], '2027-08-15')?.name === 'Пик')
ok('seasonForDay: редът в списъка не променя резултата (най-новият по дата)', seasonForDay([pik, lato, zima], '2027-08-15')?.name === 'Пик')
ok('seasonForDay: ден извън всички сезони → null', seasonForDay([zima, lato, pik], '2027-04-15') === null)
ok('seasonForDay: чернови без дата — по-късната в списъка печели', seasonForDay([S(6, 1, 9, 30, { name: 'А' }), S(7, 1, 7, 31, { name: 'Б' })], '2027-07-10')?.name === 'Б')

/* ---------- застъпване и покритие ---------- */
ok('зима и лято не се застъпват', !seasonsOverlap(winter, S(6, 1, 9, 30)))
ok('лято и пик (в лятото) се застъпват', seasonsOverlap(S(6, 1, 9, 30), S(8, 10, 8, 20)))
ok('зима през Нова година и 20.12–10.01 се застъпват', seasonsOverlap(winter, S(12, 20, 1, 10)))
ok('зима и сезон 1.04–31.10 се докосват без да се застъпват', !seasonsOverlap(winter, S(4, 1, 10, 31)))
ok('overlappingSeasons връща само другите, които се застъпват', overlappingSeasons(lato, [zima, lato, pik]).map((x) => x.name).join() === 'Пик')
ok('seasonDayKeys: зима = 31+31+30 (ноем., дек.…) → 152 дни', seasonDayKeys(winter).length === 30 + 31 + 31 + 29 + 31, String(seasonDayKeys(winter).length))
ok('uncoveredDays: без сезони — всички 366', uncoveredDays([]) === 366)
ok('uncoveredDays: зима + лято оставят 366 − 152 − 122 = 92 дни', uncoveredDays([winter, S(6, 1, 9, 30)]) === 92, String(uncoveredDays([winter, S(6, 1, 9, 30)])))
ok('uncoveredDays: цяла година → 0', uncoveredDays([S(1, 1, 12, 31)]) === 0)
ok('uncoveredDays: застъпените дни не се броят двойно', uncoveredDays([S(6, 1, 9, 30), S(8, 1, 8, 31)]) === 366 - 122)

/* ---------- проверка на формата ---------- */
const valid = S(11, 1, 3, 31, { price_per_night: '60' })
ok('валиден сезон → без грешка', validateSeason(valid) === null)
ok('30 февруари → грешка за началото', /няма 30-и ден \(началото/.test(validateSeason(S(2, 30, 3, 1)) ?? ''))
ok('31 април в края → грешка за края', /няма 31-и ден \(краят/.test(validateSeason(S(4, 1, 4, 31)) ?? ''))
ok('29 февруари е позволен', validateSeason(S(2, 29, 2, 29)) === null)
ok('без цена → грешка', /цена/.test(validateSeason({ ...valid, price_per_night: '' }) ?? ''))
ok('цена 0 или отрицателна → грешка', validateSeason({ ...valid, price_per_night: '0' }) !== null && validateSeason({ ...valid, price_per_night: '-5' }) !== null)
ok('минимален престой 0 → грешка', /поне 1/.test(validateSeason({ ...valid, min_nights: 0 }) ?? ''))
ok('месец 13 → грешка', validateSeason(S(13, 1, 3, 31)) !== null)
ok('име над 60 знака → грешка', validateSeason({ ...valid, name: 'я'.repeat(61) }) !== null)
ok('ден 0 → грешка', validateSeason(S(5, 0, 6, 1)) !== null)
ok('DAYS_IN_MONTH е като в SQL ограничението', DAYS_IN_MONTH.join() === '31,29,31,30,31,30,31,31,30,31,30,31')

/* ---------- чернови ↔ база ---------- */
const e = emptySeason('winter')
ok('emptySeason(winter): 1.11–31.03, име „Зима“, без цена', e.name === 'Зима' && e.start_month === 11 && e.end_month === 3 && e.end_day === 31 && e.price_per_night === '' && e.id === null)
ok('emptySeason(summer): 1.06–30.09', (() => { const x = emptySeason('summer'); return x.start_month === 6 && x.end_month === 9 && x.end_day === 30 })())
ok('emptySeason() без образец е 1.01–31.12 и има различен ключ всеки път', emptySeason().end_month === 12 && emptySeason().key !== emptySeason().key)
ok('двата образеца са валидни, щом им се сложи цена', SEASON_PRESETS.every((p) => validateSeason({ ...emptySeason(p.key), price_per_night: '50' }) === null))
const row = { id: 'x1', name: null, start_month: 11, start_day: 1, end_month: 3, end_day: 31, price_per_night: '60.00', min_nights: 3, created_at: '2026-01-01T00:00:00Z' }
ok('toDraft: цената става „60“, липсващото име — празен низ', toDraft(row).price_per_night === '60' && toDraft(row).name === '' && toDraft(row).id === 'x1')
const payload = toPayload({ ...toDraft(row), name: '  Зима  ', price_per_night: '60.5', start_month: '11', min_nights: '3' }, 'p1')
ok('toPayload: числа, подрязано име, property_id', payload.property_id === 'p1' && payload.name === 'Зима' && payload.start_month === 11 && payload.price_per_night === 60.5 && payload.min_nights === 3)
ok('toPayload: празно име → null, празен мин. престой → 1', toPayload({ ...toDraft(row), name: '   ', min_nights: '' }, 'p1').name === null && toPayload({ ...toDraft(row), min_nights: '' }, 'p1').min_nights === 1)

/* ---------- какво е променено ---------- */
ok('sameSeason: еднакви (низове и числа, излишни интервали в името)', sameSeason(toDraft(row), { ...toDraft(row), name: '  ', price_per_night: '60.00', start_month: '11' }) && sameSeason({ ...toDraft(row), name: 'Зима ' }, { ...toDraft(row), name: 'Зима', price_per_night: '60.0' }))
ok('sameSeason: различна цена, ден, месец или мин. престой → различни', ['price_per_night', 'start_day', 'end_month', 'min_nights'].every((k) => !sameSeason(toDraft(row), { ...toDraft(row), [k]: k === 'price_per_night' ? '61' : 9 })))
ok('sameSeason: ключът и created_at не се броят', sameSeason({ ...toDraft(row), key: 'a', created_at: 'x' }, { ...toDraft(row), key: 'b', created_at: 'y' }))

/* ---------- цена „от“ ---------- */
ok('lowestPrice: основна 87, сезони 60 и 120 → 60', lowestPrice(87, [{ price_per_night: 60 }, { price_per_night: 120 }]) === 60)
ok('lowestPrice: основна 50, сезони 60 и 120 → 50', lowestPrice(50, [{ price_per_night: 60 }, { price_per_night: 120 }]) === 50)
ok('lowestPrice: без основна цена (0) → най-ниският сезон', lowestPrice(0, [{ price_per_night: '90' }, { price_per_night: '70' }]) === 70)
ok('lowestPrice: без нищо → 0', lowestPrice(0, []) === 0 && lowestPrice('', []) === 0)

/* ---------- подписи ---------- */
ok('„1 ноември – 31 март“ на български', seasonRangeLabel(winter, 'bg-BG') === '1 ноември – 31 март', seasonRangeLabel(winter, 'bg-BG'))
ok('„1 November – 31 March“ на английски', /^1 November – 31 March$/.test(seasonRangeLabel(winter, 'en-GB')), seasonRangeLabel(winter, 'en-GB'))
ok('29 февруари се показва', /29/.test(dayMonthLabel(2, 29, 'bg-BG')) && /февруари/.test(dayMonthLabel(2, 29, 'bg-BG')))
ok('име на месец (падащ списък): ноември, март', monthLabel(11, 'bg-BG') === 'ноември' && monthLabel(3, 'bg-BG') === 'март', `${monthLabel(11, 'bg-BG')} ${monthLabel(3, 'bg-BG')}`)
ok('гръцки месец в именителен: Οκτώβριος / ro: octombrie', /^Οκτώβριος$/i.test(monthLabel(10, 'el-GR')) && monthLabel(10, 'ro-RO') === 'octombrie', `${monthLabel(10, 'el-GR')} ${monthLabel(10, 'ro-RO')}`)

console.log(`test-seasons: ${pass} успешни, ${fail} провалени`)
process.exit(fail ? 1 : 0)
