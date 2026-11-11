// Табло: „Чака вас“ и „Първи стъпки“ — чистата логика (без база, без мрежа).
//   node scripts/test-home.mjs
import { pickUnpaid, sumOutstanding, buildAttentionItems, UNPAID_LOOKBACK_DAYS } from '../src/lib/attentionLogic.js'
import { buildChecklist, checklistProgress } from '../src/lib/checklistLogic.js'
import { OTA_SOURCES, isOtaSource } from '../src/lib/sources.js'

let pass = 0
let fail = 0
const ok = (name, cond, extra = '') => {
  if (cond) pass++
  else {
    fail++
    console.log('  ПРОВАЛ:', name, extra)
  }
}

/* ---------- неплатени остатъци ---------- */
const TODAY = '2026-11-11'
const FROM = '2026-09-12' // днес − 60 дни
const row = (over) => ({ booking_id: 'x', status: 'confirmed', source: 'direct', check_in: '2026-11-05', outstanding: 100, ...over })

ok('срок за връщане назад е 60 дни', UNPAID_LOOKBACK_DAYS === 60)
ok('платформите не се броят (Airbnb плаща сама)', pickUnpaid([row({ source: 'airbnb' }), row({ source: 'booking' })], TODAY, FROM).length === 0)
ok('директна и ръчна се броят', pickUnpaid([row({ source: 'direct' }), row({ source: 'manual' })], TODAY, FROM).length === 2)
ok('отказана не се брои', pickUnpaid([row({ status: 'cancelled' })], TODAY, FROM).length === 0)
ok('чакаща (pending) се брои — гостът е пристигнал', pickUnpaid([row({ status: 'pending' })], TODAY, FROM).length === 1)
ok('гост, който още не е пристигнал, не се брои (капаро по-късно)', pickUnpaid([row({ check_in: '2026-11-12' })], TODAY, FROM).length === 0)
ok('гост, пристигнал днес, се брои', pickUnpaid([row({ check_in: TODAY })], TODAY, FROM).length === 1)
ok('твърде стара резервация (преди прозореца) не се брои', pickUnpaid([row({ check_in: '2026-09-11' })], TODAY, FROM).length === 0)
ok('точно на границата на прозореца се брои', pickUnpaid([row({ check_in: FROM })], TODAY, FROM).length === 1)
ok('платено докрай (0) и преплатено (<0) не се броят', pickUnpaid([row({ outstanding: 0 }), row({ outstanding: -5 })], TODAY, FROM).length === 0)
ok('outstanding като текст (numeric от Postgres) работи', pickUnpaid([row({ outstanding: '45.50' })], TODAY, FROM).length === 1)
ok('празен/липсващ списък не чупи', pickUnpaid(null, TODAY, FROM).length === 0 && pickUnpaid([], TODAY, FROM).length === 0)
ok('сумата е точна (45.5 + 100)', sumOutstanding(pickUnpaid([row({ outstanding: '45.50' }), row({ outstanding: 100 })], TODAY, FROM)) === 145.5)
ok('OTA_SOURCES е airbnb+booking и isOtaSource съвпада', OTA_SOURCES.join() === 'airbnb,booking' && isOtaSource('airbnb') && !isOtaSource('direct'))

/* ---------- „Чака вас“ ---------- */
ok('нищо не чака → празен списък', buildAttentionItems({}).length === 0 && buildAttentionItems({ pendingRequests: 0, unpaidCount: 0 }).length === 0)
const all = buildAttentionItems({ pendingRequests: 2, unpaidCount: 3, unpaidTotal: 245.5, incompleteBookings: 1, overdueCleaning: 4 })
ok('четири вида при всичко налично', all.length === 4)
ok('ред по спешност: заявки → неплатено → без цена → почистване', all.map((i) => i.key).join() === 'requests,unpaid,incomplete,cleaning')
ok('заявките водят към /booking-requests', all[0].to === '/booking-requests')
ok('неплатените водят към /earnings', all[1].to === '/earnings')
ok('без цена води към филтъра /bookings?incomplete=1 (същият, който ползва списъкът)', all[2].to === '/bookings?incomplete=1')
ok('почистването води към /cleaning-tasks', all[3].to === '/cleaning-tasks')
ok('множествено число: 2 нови заявки от гости', all[0].title === '2 нови заявки от гости')
ok('единствено число: Нова заявка от гост', buildAttentionItems({ pendingRequests: 1 })[0].title === 'Нова заявка от гост')
ok('единствено: Гост с неплатен остатък / Просрочено почистване / Резервация от платформа без цена',
  buildAttentionItems({ unpaidCount: 1 })[0].title === 'Гост с неплатен остатък' &&
  buildAttentionItems({ overdueCleaning: 1 })[0].title === 'Просрочено почистване' &&
  buildAttentionItems({ incompleteBookings: 1 })[0].title === 'Резервация от платформа без цена')
ok('сумата в подробностите е в евро с два знака', all[1].detail === 'Общо 245.50 € — гостите вече са пристигнали.', all[1].detail)
ok('само един вид → само един ред', buildAttentionItems({ overdueCleaning: 3 }).length === 1)
ok('отрицателни/нулеви стойности не пускат ред', buildAttentionItems({ pendingRequests: -1, unpaidCount: 0 }).length === 0)
ok('всеки ред има заглавие, обяснение, връзка и тон', all.every((i) => i.title && i.detail && i.to.startsWith('/') && (i.tone === 'accent' || i.tone === 'warning')))

/* ---------- „Първи стъпки“ ---------- */
const P = (id, over = {}) => ({ id, name: id, base_price: 0, is_listed: false, ical_url: null, ...over })
const empty = { properties: [], photoPropertyIds: [], seasonPropertyIds: [], bookingCount: 0, notificationCount: 0 }
const stepsOf = (facts) => Object.fromEntries(buildChecklist(facts).map((s) => [s.key, s]))

const none = buildChecklist(empty)
ok('седем стъпки', none.length === 7)
ok('празен акаунт: нищо не е готово, първата е „Добавете имот“ → /properties/new', none.every((s) => !s.done) && checklistProgress(none).next.key === 'property' && none[0].to === '/properties/new')
ok('без имот всички връзки към имот сочат към създаване (не към несъществуващ имот)', ['photos', 'price', 'listing', 'ical'].every((k) => stepsOf(empty)[k].to === '/properties/new'))
ok('само „Известия“ и календарът от платформа са по желание', none.filter((s) => s.optional).map((s) => s.key).join() === 'ical,notify')

const one = { ...empty, properties: [P('a')] }
ok('един имот → стъпка 1 готова, следваща „Качете снимки“', stepsOf(one).property.done && checklistProgress(buildChecklist(one)).next.key === 'photos')
ok('връзките на стъпките за имот сочат към самия имот', ['photos', 'price', 'listing', 'ical'].every((k) => stepsOf(one)[k].to === '/properties/a'))
ok('снимки: готово при поне една снимка', stepsOf({ ...one, photoPropertyIds: ['a'] }).photos.done && !stepsOf(one).photos.done)
ok('цена: base_price > 0 е готово', stepsOf({ ...one, properties: [P('a', { base_price: '60.00' })] }).price.done)
ok('цена: само сезонна цена също е готово', stepsOf({ ...one, seasonPropertyIds: ['a'] }).price.done)
ok('цена 0 без сезони → не е готово', !stepsOf({ ...one, properties: [P('a', { base_price: 0 })] }).price.done)
ok('страница за гости: готова само при is_listed', stepsOf({ ...one, properties: [P('a', { is_listed: true })] }).listing.done && !stepsOf(one).listing.done)
ok('календар: готов при ical_url, но не при празен/интервали', stepsOf({ ...one, properties: [P('a', { ical_url: 'https://x/y.ics' })] }).ical.done && !stepsOf({ ...one, properties: [P('a', { ical_url: '  ' })] }).ical.done && !stepsOf(one).ical.done)
ok('резервация: готова при поне една', stepsOf({ ...one, bookingCount: 1 }).booking.done && !stepsOf(one).booking.done)
ok('„Нова резервация“ води към /bookings?new=1', none[5].to === '/bookings?new=1')
ok('известия: готови при поне една цел; водят към /notifications', stepsOf({ ...one, notificationCount: 2 }).notify.done && none[6].to === '/notifications')

/* при няколко имота връзката сочи към първия, на който още липсва стъпката */
const two = { ...empty, properties: [P('a'), P('b')], photoPropertyIds: ['a'] }
ok('два имота, снимки има само в първия → стъпката е готова (поне един), води към втория', stepsOf(two).photos.done && stepsOf(two).photos.to === '/properties/b')
const twoNoPhotos = { ...two, photoPropertyIds: [] }
ok('два имота, никой със снимки → води към първия', stepsOf(twoNoPhotos).photos.to === '/properties/a' && !stepsOf(twoNoPhotos).photos.done)

/* напредък */
const full = {
  properties: [P('a', { base_price: 80, is_listed: true, ical_url: 'https://x/y.ics' })],
  photoPropertyIds: ['a'], seasonPropertyIds: [], bookingCount: 3, notificationCount: 1,
}
const fp = checklistProgress(buildChecklist(full))
ok('всичко готово → complete, 7 от 7, няма следваща', fp.complete && fp.done === 7 && fp.total === 7 && fp.next === null)
const partial = checklistProgress(buildChecklist({ ...full, bookingCount: 0 }))
ok('липсва само резервация → 6 от 7, следваща „booking“, не е complete', !partial.complete && partial.done === 6 && partial.next.key === 'booking')
ok('липсващи полета във facts не чупят (undefined)', buildChecklist({}).length === 7 && !checklistProgress(buildChecklist({})).complete)
ok('всяка стъпка има заглавие, подсказка, бутон и връзка', none.every((s) => s.title && s.hint && s.cta && s.to.startsWith('/')))

console.log(`test-home: ${pass} успешни, ${fail} провалени`)
process.exit(fail ? 1 : 0)
