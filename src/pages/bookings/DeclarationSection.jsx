import { Field, Input, Select, Alert } from '../../components/ui'
import { countryOptions } from '../../lib/countries'
import { appLocale } from '../../i18n/appLang'
import { OTA_SOURCES } from '../../lib/sources'
import {
  PAY_METHODS, isLongStay, nightsOf, yearSplit, isValidAfm, isValidPassport, missingData, SHORT_TERM_MAX_NIGHTS,
  declarationDeadline, dmy,
} from '../../lib/declarationLogic'
import { formatMoney } from '../../lib/money'

export const emptyDeclaration = {
  guest_country: '',
  guest_tax_id: '',
  guest_passport: '',
  guest_doc_name: '',
  pay_method: '',
  status: 'pending',
}

/** Проверка преди запис: попълненото трябва да е валидно (грешен ΑΦΜ или паспорт в декларацията се глобява като липсващ). */
export function validateDeclaration(decl) {
  if (decl.guest_country === 'GR' && decl.guest_tax_id.trim() && !isValidAfm(decl.guest_tax_id)) {
    return 'ΑΦΜ не е валиден. Трябва да е 9 цифри с правилна контролна цифра.'
  }
  if (decl.guest_country && decl.guest_country !== 'GR' && decl.guest_passport.trim() && !isValidPassport(decl.guest_passport)) {
    return 'Номерът на паспорта не е валиден (4–30 букви и цифри).'
  }
  return null
}

/**
 * Секция „Данни за декларацията“ във формата за резервация — само за имоти в Гърция.
 * Данните се пазат в отделна таблица (stay_declarations) и се виждат само от собственика.
 */
export default function DeclarationSection({ booking, decl, onChange }) {
  const set = (key) => (e) => onChange({ ...decl, [key]: e.target.value })
  const greek = decl.guest_country === 'GR'
  const nights = booking.check_in && booking.check_out && booking.check_out > booking.check_in ? nightsOf(booking.check_in, booking.check_out) : 0
  const isOta = OTA_SOURCES.includes(booking.source)
  const missing = missingData(booking, {
    guest_country: decl.guest_country,
    guest_tax_id: decl.guest_tax_id,
    guest_passport: decl.guest_passport,
    guest_doc_name: decl.guest_doc_name,
    pay_method: decl.pay_method,
  })
  const split = nights > 0 && !isLongStay(nights) ? yearSplit(booking.check_in, booking.check_out, booking.total_price) : []

  return (
    <fieldset className="space-y-4 rounded-2xl border border-line p-4 sm:p-5">
      <legend className="px-2 type-heading text-base">Данни за декларацията</legend>
      <p className="text-xs text-ink-muted">
        Гръцката данъчна служба иска декларация за всеки престой до 20-о число на следващия месец. Данните се виждат само от вас.
      </p>

      {decl.status === 'submitted' && (
        <Alert kind="info">Декларацията е отбелязана като подадена. Ако промените данните, подайте поправка в myAADE.</Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Гражданство на госта">
          <Select value={decl.guest_country} onChange={set('guest_country')}>
            <option value="">— Изберете —</option>
            {countryOptions(appLocale()).map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Начин на плащане" hint={isOta && !decl.pay_method ? 'Платформена резервация — ще се води като „Платформа“.' : undefined}>
          <Select value={decl.pay_method} onChange={set('pay_method')}>
            <option value="">{isOta ? '— Платформа (по подразбиране) —' : '— Изберете —'}</option>
            {PAY_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {greek && (
        <Field label="ΑΦΜ на госта" hint="9 цифри. Може с префикс EL.">
          <Input value={decl.guest_tax_id} onChange={set('guest_tax_id')} inputMode="numeric" autoComplete="off" placeholder="123456789" />
        </Field>
      )}
      {decl.guest_country && !greek && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Номер на паспорт">
            <Input value={decl.guest_passport} onChange={set('guest_passport')} autoComplete="off" placeholder="C01X00T47" />
          </Field>
          <Field label="Име както в паспорта">
            <Input value={decl.guest_doc_name} onChange={set('guest_doc_name')} autoComplete="off" placeholder="Anna Schmidt" />
          </Field>
        </div>
      )}

      {nights > 0 && isLongStay(nights) && (
        <Alert kind="info">
          {`${nights} нощи — над ${SHORT_TERM_MAX_NIGHTS}. Това не е краткосрочен наем и иска друга декларация (за дългосрочен наем). Тук не се следи.`}
        </Alert>
      )}
      {split.length > 1 && (
        <Alert kind="warning">
          {`Престоят минава през 1 януари. Подават се ${split.length} декларации:`}
          <ul className="mt-1 list-disc pl-5">
            {split.map((p) => (
              <li key={p.year}>
                {p.nights === 1 ? `1 нощ през ${p.year}` : `${p.nights} нощи през ${p.year}`}
                {p.amount != null && ` · ${formatMoney(p.amount)}`}
              </li>
            ))}
          </ul>
        </Alert>
      )}
      {nights > 0 && !isLongStay(nights) && (
        <p className="text-xs text-ink-muted">
          {missing.length === 0 ? 'Данните са пълни.' : 'Още липсват данни за декларацията.'}{' '}
          {`Срок за подаване: ${dmy(declarationDeadline(booking.check_out))}.`}
        </p>
      )}
    </fieldset>
  )
}
