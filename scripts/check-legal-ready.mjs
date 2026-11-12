// Преди качване на живо: данните на администратора трябва да са попълнени в src/lib/legal.js (COMPANY).
//   node scripts/check-legal-ready.mjs     (излиза с код 1, ако нещо липсва)
import { COMPANY, missingCompanyFields } from '../src/lib/legal.js'

const labels = { name: 'име на фирмата', address: 'адрес', eik: 'ЕИК', email: 'имейл за въпроси за лични данни' }
const missing = missingCompanyFields(COMPANY)
if (missing.length) {
  console.log('НЕ Е ГОТОВО ЗА КАЧВАНЕ — в src/lib/legal.js (COMPANY) липсват:')
  for (const k of missing) console.log(`  - ${labels[k]} (${k})`)
  process.exit(1)
}
console.log('Данните на администратора са попълнени:', JSON.stringify(COMPANY))
