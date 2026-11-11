/**
 * „Първи стъпки“ — списък за нов собственик. Всяка стъпка се отмята САМА от данните в акаунта
 * (не от ръчно чекче), затова никога не лъже. Чиста логика, тества се в Node.
 *
 * facts = {
 *   properties:      [{ id, name, base_price, is_listed, ical_url }],
 *   photoPropertyIds: [id…]    — имоти с поне една снимка,
 *   seasonPropertyIds: [id…]   — имоти с поне един сезон на цената,
 *   bookingCount, notificationCount
 * }
 * „Поне един имот“ е прагът: списъкът води новия потребител през първия имот; при повече имоти
 * връзката сочи към първия, на който още му липсва стъпката.
 */
export function buildChecklist(facts) {
  const props = facts.properties ?? []
  const photoSet = new Set(facts.photoPropertyIds ?? [])
  const seasonSet = new Set(facts.seasonPropertyIds ?? [])
  const has = props.length > 0

  /** Първият имот, на който стъпката още не е изпълнена (иначе първият имот изобщо). */
  const target = (ok) => {
    const p = props.find((x) => !ok(x)) ?? props[0]
    return p ? `/properties/${p.id}` : '/properties/new'
  }

  const priced = (p) => Number(p.base_price) > 0 || seasonSet.has(p.id)
  const photographed = (p) => photoSet.has(p.id)
  const listed = (p) => p.is_listed === true
  const synced = (p) => Boolean(p.ical_url && String(p.ical_url).trim())

  return [
    {
      key: 'property',
      title: 'Добавете първия си имот',
      hint: 'Име, адрес и колко гости приема.',
      cta: 'Добави имот',
      to: '/properties/new',
      done: has,
    },
    {
      key: 'photos',
      title: 'Качете снимки',
      hint: 'Гостите избират по снимките на имота.',
      cta: 'Качи снимки',
      to: target(photographed),
      done: has && props.some(photographed),
    },
    {
      key: 'price',
      title: 'Задайте цена за нощувка',
      hint: 'Без цена гостите не могат да изпратят заявка.',
      cta: 'Задай цена',
      to: target(priced),
      done: has && props.some(priced),
    },
    {
      key: 'listing',
      title: 'Пуснете страницата за гости',
      hint: 'Линк, който пращате на гостите — резервират директно, без комисиона.',
      cta: 'Настрой страницата',
      to: target(listed),
      done: has && props.some(listed),
    },
    {
      key: 'ical',
      title: 'Свържете календара от Airbnb или Booking',
      hint: 'Резервациите от платформите идват сами и няма двойни резервации.',
      cta: 'Свържи календар',
      to: target(synced),
      done: has && props.some(synced),
      optional: true,
    },
    {
      key: 'booking',
      title: 'Добавете първата резервация',
      hint: 'Ръчно — за гост, дошъл по телефон или Viber.',
      cta: 'Нова резервация',
      to: '/bookings?new=1',
      done: Number(facts.bookingCount) > 0,
    },
    {
      key: 'notify',
      title: 'Включете известия',
      hint: 'Съобщение в Telegram при всяка нова заявка от гост.',
      cta: 'Включи известия',
      to: '/notifications',
      done: Number(facts.notificationCount) > 0,
      optional: true,
    },
  ]
}

export function checklistProgress(steps) {
  const done = steps.filter((s) => s.done).length
  return { done, total: steps.length, complete: done === steps.length, next: steps.find((s) => !s.done) ?? null }
}
