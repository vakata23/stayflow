// Платформи, които удържат комисиона — всичко друго е директна резервация.
// Вън от bookings.js, за да може чистата логика (и тестовете в Node) да я ползва без връзка към базата.
export const OTA_SOURCES = ['airbnb', 'booking']
export function isOtaSource(source) {
  return OTA_SOURCES.includes(source)
}
