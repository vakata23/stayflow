import { todayISO } from './dates.js'
import { addDaysISO, bestPackage, daysBetween } from './packageLogic.js'
import { seasonForDay } from './seasonLogic.js'

/**
 * Демо витрина (/demo) — достъпна без регистрация. Три примерни имота със същата форма като данните от
 * public_property / public_seasons / public_packages, та страницата да е ТОЧНО тази, която виждат гостите.
 * Нищо не идва от базата и нищо не се записва: цената се смята тук (огледало на quote_stay, ползва същите
 * packageLogic/seasonLogic като редакторите), заетите нощи са от днес нататък, запитването не се изпраща.
 * Снимките са в public/demo: първата къща са реални снимки на апартамент в Неа Каликратия, другите две са
 * от Rawpixel (CC0). Цените, сезоните, офертите и подробностите са илюстративни.
 */

const photo = (name, full) => ({ url: `/demo/${name}-${full}.webp`, thumb: `/demo/${name}-480.webp` })
const NK = ['terrace-4', 'living-4', 'bedroom-1', 'kitchen-1', 'bath-3', 'terrace-3', 'view-2', 'living-1', 'bedroom-2', 'hall-2'].map((n) => photo(n, 1200))
const SOFIA = ['sofia-living', 'sofia-dining', 'sofia-living-wide', 'sofia-bath'].map((n) => photo(n, 1024))
const LOFT = ['plovdiv-loft-bed', 'plovdiv-loft-living', 'plovdiv-bedroom'].map((n) => photo(n, 1024))

const pk = (id, kind, name, extra) => ({
  id, kind, name, paid_nights: null, free_nights: null, repeat_block: false, min_nights: null, percent: null,
  fixed_nights: null, fixed_total: null, checkin_weekday: null, days_before: null, valid_from: null, valid_to: null, is_active: true, ...extra,
})
const season = (name, sm, sd, em, ed, price, min = 1) => ({ name, start_month: sm, start_day: sd, end_month: em, end_day: ed, price_per_night: price, min_nights: min })

export const DEMO_PROPERTIES = [
  {
    slug: 'morski-apartament-dve-terasi',
    settings: { cleaning_fee: 25, tourist_tax: 0, deposit_pct: 30, min_nights: 2 },
    busy: [[6, 3], [19, 4], [41, 7]], // [след колко дни от днес, колко нощувки]
    property: {
      name: 'Апартамент с две тераси край морето',
      city: 'Неа Каликратия',
      is_listed: true,
      accent_color: '#0a5c8f',
      public_description:
        'Топъл апартамент на западния бряг на Халкидики — спалня за двама и диван-легло в светъл хол с кухненски кът, място за четирима. Всяко помещение излиза към тераса: две частни тераси са вашата „дневна на открито“ — за сутрешно кафе и за вечерно вино под гръцкото небе.\n\nПлажът е на около сто метра: широк пясъчен бряг, плитко и спокойно море, рибни таверни по крайбрежната алея. Центърът на градчето — кафенета, барове и пристанището — е наблизо, пеша.',
      public_description_en:
        'A warm apartment on the west coast of Halkidiki: a bedroom for two plus a sofa bed in a bright living room with a kitchenette — room for four. Two private terraces act as your open-air living room, and the sandy beach is about a hundred metres away.',
      photos: NK.map((p) => p.url),
      photo_thumbs: NK.map((p) => p.thumb),
      cover_image_url: NK[0].url,
      max_guests: 4, bedrooms: 1, beds: 2, bathrooms: 1, area_m2: null,
      amenities: ['wifi', 'kitchen', 'fridge', 'ac', 'washer', 'tv', 'balcony'],
      checkin_time: '14:00', checkout_time: '11:00', smoking_allowed: false, parties_allowed: false, cancellation_policy: 'moderate',
      house_rules: 'Тишина от 23:00 до 07:00. Имотът се връща чист и подреден.',
      channels: [], base_price: 65, public_lat: 40.3117, public_lng: 23.0597,
    },
    seasons: [season('Лято', 6, 1, 9, 15, 85, 3), season('Зима', 11, 1, 3, 31, 50, 2)],
    packages: [pk('nk-1', 'free_nights', '6+1', { paid_nights: 6, free_nights: 1 }), pk('nk-2', 'percent_off', 'Месец', { min_nights: 30, percent: 25 })],
  },
  {
    slug: 'svetal-apartament-sofia',
    settings: { cleaning_fee: 30, tourist_tax: 0.5, deposit_pct: 30, min_nights: 2 },
    busy: [[3, 3], [14, 4], [30, 5]],
    property: {
      name: 'Светъл апартамент с големи прозорци',
      city: 'София',
      is_listed: true,
      accent_color: '#a63e1e',
      public_description:
        'Просторен хол с трапезария за шестима, високи прозорци и много естествена светлина — подходящ за семейство или за работно пътуване.\n\nПримерна обява: снимките са от безплатен фотобанк (CC0), а цената и подробностите са илюстративни.',
      public_description_en: 'A spacious living room with a dining area for six, tall windows and plenty of daylight — suited to a family or a work trip. Sample listing: photos are CC0 stock and details are illustrative.',
      photos: SOFIA.map((p) => p.url), photo_thumbs: SOFIA.map((p) => p.thumb), cover_image_url: SOFIA[0].url,
      max_guests: 4, bedrooms: 2, beds: 3, bathrooms: 1, area_m2: 78,
      amenities: ['wifi', 'kitchen', 'fridge', 'ac', 'heating', 'washer', 'tv', 'parking_paid'],
      checkin_time: '15:00', checkout_time: '11:00', smoking_allowed: false, parties_allowed: false, cancellation_policy: 'flexible',
      house_rules: null, channels: [], base_price: 118, public_lat: 42.6977, public_lng: 23.3219,
    },
    seasons: [],
    packages: [pk('sf-1', 'percent_off', 'Седмица', { min_nights: 7, percent: 10 }), pk('sf-2', 'early_bird', 'Ранно записване', { days_before: 30, percent: 8 })],
  },
  {
    slug: 'loft-s-tuhlena-stena-plovdiv',
    settings: { cleaning_fee: 20, tourist_tax: 0, deposit_pct: 30, min_nights: 2 },
    busy: [[10, 3], [25, 5]],
    property: {
      name: 'Лофт с тухлена стена и дървен под',
      city: 'Пловдив',
      is_listed: true,
      accent_color: '#7c4a1d',
      public_description:
        'Лофт с дървен под, тухлена стена в хола и спалня на галерия с греди по тавана — за двама или тримата.\n\nПримерна обява: снимките са от безплатен фотобанк (CC0), а цената и подробностите са илюстративни.',
      public_description_en: 'A loft with a wooden floor, an exposed brick wall in the living room and a gallery bedroom under timber beams — for two or three guests. Sample listing: CC0 stock photos, illustrative details.',
      photos: LOFT.map((p) => p.url), photo_thumbs: LOFT.map((p) => p.thumb), cover_image_url: LOFT[0].url,
      max_guests: 3, bedrooms: 1, beds: 2, bathrooms: 1, area_m2: 52,
      amenities: ['wifi', 'kitchen', 'ac', 'heating', 'tv'],
      checkin_time: '14:00', checkout_time: '11:00', smoking_allowed: false, parties_allowed: false, cancellation_policy: 'strict',
      house_rules: null, channels: [], base_price: 74, public_lat: 42.1354, public_lng: 24.7453,
    },
    seasons: [season('Празници', 12, 20, 1, 5, 99, 3)],
    packages: [pk('pl-1', 'fixed_price', 'Уикенд', { fixed_nights: 2, fixed_total: 130, checkin_weekday: 5 }), pk('pl-2', 'last_minute', 'Последна минута', { days_before: 3, percent: 15 })],
  },
]

export const findDemo = (slug) => DEMO_PROPERTIES.find((d) => d.slug === slug) ?? null

/** Най-ниската цена за нощувка — „от X €“ на картите. */
export const demoFromPrice = (d) => Math.min(d.property.base_price, ...d.seasons.map((s) => s.price_per_night))

/** Заетите нощи в интервала [from, to] (YYYY-MM-DD), по-късно от днес — календарът за гостите показва заети дни. */
export function demoBusyNights(d, from, to, today = todayISO()) {
  const nights = []
  for (const [start, count] of d.busy) {
    for (let i = 0; i < count; i++) {
      const night = addDaysISO(today, start + i)
      if (night >= from && night <= to) nights.push(night)
    }
  }
  return nights
}

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100

/**
 * Сметка като quote_stay: цена по нощувки (сезон → основна), най-изгодната оферта, почистване, такса, капаро,
 * наличност. null, ако датите са невалидни или в миналото (както функцията в базата не връща ред).
 */
export function demoQuote(d, checkIn, checkOut, guests, today = todayISO()) {
  const nights = daysBetween(checkIn, checkOut)
  if (!(nights >= 1) || guests < 1 || checkIn < today) return null
  const prices = []
  for (let i = 0; i < nights; i++) {
    const s = seasonForDay(d.seasons, addDaysISO(checkIn, i))
    prices.push(s ? Number(s.price_per_night) : d.property.base_price)
  }
  const accommodation = round2(prices.reduce((a, b) => a + b, 0))
  const best = bestPackage(d.packages, { prices, checkIn, today })
  const discount = best ? best.saving : 0
  const first = seasonForDay(d.seasons, checkIn)
  const { cleaning_fee, tourist_tax, deposit_pct, min_nights } = d.settings
  const total = round2(accommodation - discount + cleaning_fee)
  const busy = new Set(demoBusyNights(d, checkIn, addDaysISO(checkOut, -1), today))
  return {
    nights,
    accommodation_total: accommodation,
    cleaning_fee,
    tourist_tax: round2(tourist_tax * guests * nights),
    total,
    deposit: round2((total * deposit_pct) / 100),
    min_nights: first ? Number(first.min_nights) : min_nights,
    fits_guests: guests <= d.property.max_guests,
    is_available: busy.size === 0,
    discount,
    package_id: best ? best.pkg.id : null,
  }
}
