import { useState, useEffect, useRef } from 'react'
import { Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { nightsBetween, formatDateBG } from '../../lib/dates'
import { formatMoney } from '../../lib/money'
import { fetchPropertySettings, DEFAULT_SETTINGS } from '../../lib/propertySettings'
import {
  BOOKING_SOURCES,
  BOOKING_STATUSES,
  findConflictingBooking,
  translateBookingError,
  isOtaSource,
  suggestCommission,
  suggestTouristTax,
} from '../../lib/bookings'
import { Field, Input, Textarea, Select, Button, Alert, Modal } from '../../components/ui'
import PaymentsSection from './PaymentsSection'

const empty = {
  property_id: '',
  guest_name: '',
  guest_phone: '',
  guest_email: '',
  check_in: '',
  check_out: '',
  num_guests: 1,
  total_price: '',
  commission: '',
  tourist_tax: '',
  source: 'manual',
  status: 'confirmed',
  notes: '',
}

/** Група полета със заглавие — формата е на ясни стъпки: престой, гост, цена. */
function Section({ title, children }) {
  return (
    <section className="space-y-4">
      <h3 className="type-heading">{title}</h3>
      {children}
    </section>
  )
}

export default function BookingFormModal({ open, onClose, onSaved, properties, initial, defaults }) {
  const [values, setValues] = useState(empty)
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const errorRef = useRef(null)

  // Докато собственикът не пипне ръчно комисионата/таксата, стойността им
  // следва автоматично цената, имота, датите и броя гости.
  const commissionTouched = useRef(false)
  const touristTaxTouched = useRef(false)

  const isEdit = Boolean(initial?.id)

  useEffect(() => {
    if (!open) return
    setError(null)
    setConfirmDelete(false)
    // „Докоснато“ само ако резервацията вече има истинска стойност —
    // иначе (0 или липсва, типично за внесени през iCal платформени
    // резервации) оставяме автоматичното предложение да проработи,
    // когато собственикът попълни цена/дати/гости.
    commissionTouched.current = isEdit && Number(initial?.commission) > 0
    touristTaxTouched.current = isEdit && Number(initial?.tourist_tax) > 0
    setValues({
      ...empty,
      property_id: properties[0]?.id ?? '',
      ...defaults,
      ...(initial
        ? {
            ...initial,
            total_price: initial.total_price ?? '',
            commission: initial.commission ?? '',
            tourist_tax: initial.tourist_tax ?? '',
            guest_phone: initial.guest_phone ?? '',
            guest_email: initial.guest_email ?? '',
            notes: initial.notes ?? '',
          }
        : {}),
    })
  }, [open, initial?.id, defaults?.check_in, defaults?.property_id])

  // Настройките на избрания имот (комисиона/такса) — за предложените стойности.
  useEffect(() => {
    if (!open || !values.property_id) return
    let cancelled = false
    fetchPropertySettings(values.property_id).then((s) => {
      if (!cancelled) setSettings(s)
    })
    return () => {
      cancelled = true
    }
  }, [open, values.property_id])

  const nights =
    values.check_in && values.check_out && values.check_out > values.check_in
      ? nightsBetween(values.check_in, values.check_out)
      : 0

  // Авто-предложена комисиона при промяна на цена/източник/имот.
  useEffect(() => {
    if (!open || commissionTouched.current || !isOtaSource(values.source)) return
    const suggested = suggestCommission(values.total_price, settings.ota_commission_pct)
    setValues((v) => (v.commission === suggested ? v : { ...v, commission: suggested }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, values.total_price, values.source, settings.ota_commission_pct])

  // Авто-предложен туристически данък при промяна на имот/дати/гости.
  useEffect(() => {
    if (!open || touristTaxTouched.current) return
    const suggested = suggestTouristTax(values.num_guests, nights, settings.tourist_tax)
    setValues((v) => (v.tourist_tax === suggested ? v : { ...v, tourist_tax: suggested }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, values.num_guests, nights, settings.tourist_tax])

  // Грешката е най-горе във формата — при дълъг формуляр я довеждаме пред очите.
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [error])

  const set = (key) => (e) => setValues((v) => ({ ...v, [key]: e.target.value }))
  const setCommission = (e) => {
    commissionTouched.current = true
    setValues((v) => ({ ...v, commission: e.target.value }))
  }
  const setTouristTax = (e) => {
    touristTaxTouched.current = true
    setValues((v) => ({ ...v, tourist_tax: e.target.value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    if (!values.property_id) return setError('Изберете имот.')
    if (!values.guest_name.trim()) return setError('Името на госта е задължително.')
    if (!values.check_in || !values.check_out) return setError('Попълнете двете дати.')
    if (values.check_out <= values.check_in) {
      return setError('Датата на напускане трябва да е след датата на настаняване.')
    }

    const property = properties.find((p) => p.id === values.property_id)
    if (property && Number(values.num_guests) > property.max_guests) {
      return setError(
        `Имотът побира максимум ${property.max_guests} гости, а сте въвели ${values.num_guests}.`
      )
    }

    setSaving(true)
    try {
      // Първа защита: проверка за застъпване преди запис.
      if (values.status !== 'cancelled') {
        const conflict = await findConflictingBooking({
          propertyId: values.property_id,
          checkIn: values.check_in,
          checkOut: values.check_out,
          excludeId: initial?.id,
        })
        if (conflict) {
          setSaving(false)
          return setError(
            `Периодът се застъпва с резервация на ${conflict.guest_name} ` +
              `(${formatDateBG(conflict.check_in)} – ${formatDateBG(conflict.check_out)}).`
          )
        }
      }

      const payload = {
        property_id: values.property_id,
        guest_name: values.guest_name.trim(),
        guest_phone: values.guest_phone.trim() || null,
        guest_email: values.guest_email.trim() || null,
        check_in: values.check_in,
        check_out: values.check_out,
        num_guests: Number(values.num_guests),
        total_price: values.total_price === '' ? null : Number(values.total_price),
        // Комисиона само за резервации от платформа — директна/ръчна винаги е 0,
        // независимо от стара стойност, ако източникът бъде сменен.
        commission: isOtaSource(values.source) ? Number(values.commission) || 0 : 0,
        tourist_tax: Number(values.tourist_tax) || 0,
        source: values.source,
        status: values.status,
        notes: values.notes.trim() || null,
      }

      // Втора защита: ако базата отхвърли записа (състезателна заявка),
      // грешката се превежда в разбираемо съобщение.
      const { error } = isEdit
        ? await supabase.from('bookings').update(payload).eq('id', initial.id)
        : await supabase.from('bookings').insert(payload)

      if (error) throw error

      onSaved()
      onClose()
    } catch (err) {
      setError(translateBookingError(err))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    const { error } = await supabase.from('bookings').delete().eq('id', initial.id)
    setDeleting(false)
    if (error) {
      setConfirmDelete(false)
      return setError(translateBookingError(error))
    }
    onSaved()
    onClose()
  }

  const price = values.total_price === '' ? null : Number(values.total_price)

  // Действията са винаги пред очите: Отказ и Запази. Изтриването е в края на формата и е необратимо —
  // иска второ потвърждение (като записите в „Приходи“).
  const footer = (
    <>
      <Button type="button" variant="secondary" onClick={onClose} disabled={saving || deleting}>
        Отказ
      </Button>
      <Button type="submit" form="booking-form" loading={saving}>
        {isEdit ? 'Запази' : 'Създай резервация'}
      </Button>
    </>
  )

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Редакция на резервация' : 'Нова резервация'} size="lg" footer={footer}>
      <form id="booking-form" onSubmit={handleSubmit} className="space-y-8">
        {error && (
          <div ref={errorRef}>
            <Alert>{error}</Alert>
          </div>
        )}

        <Section title="Престой">
          <Field label="Имот" required>
            <Select value={values.property_id} onChange={set('property_id')}>
              <option value="">— Изберете имот —</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Настаняване" required>
              <Input type="date" value={values.check_in} onChange={set('check_in')} />
            </Field>
            <Field label="Напускане" required>
              <Input type="date" value={values.check_out} onChange={set('check_out')} min={values.check_in} />
            </Field>
          </div>

          {nights > 0 && (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-accent-soft px-4 py-3 text-sm text-accent-ink" aria-live="polite">
              <strong className="font-semibold">
                {nights} {nights === 1 ? 'нощувка' : 'нощувки'}
              </strong>
              {price != null && price > 0 && (
                <>
                  <span className="num">{formatMoney(price)} общо</span>
                  <span className="num">{formatMoney(price / nights)} на нощувка</span>
                </>
              )}
            </p>
          )}
        </Section>

        <Section title="Гост">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Име на госта" required>
              <Input value={values.guest_name} onChange={set('guest_name')} placeholder="Иван Петров" autoComplete="off" />
            </Field>
            <Field label="Брой гости">
              <Input type="number" min={1} inputMode="numeric" value={values.num_guests} onChange={set('num_guests')} />
            </Field>
            <Field label="Телефон">
              <Input type="tel" value={values.guest_phone} onChange={set('guest_phone')} placeholder="+359 88 123 4567" autoComplete="off" />
            </Field>
            <Field label="Имейл">
              <Input type="email" value={values.guest_email} onChange={set('guest_email')} placeholder="gost@primer.bg" autoComplete="off" />
            </Field>
          </div>
        </Section>

        <Section title="Цена и източник">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Обща цена (€)">
              <Input type="number" min={0} step="0.01" inputMode="decimal" value={values.total_price} onChange={set('total_price')} placeholder="0.00" />
            </Field>
            <Field label="Източник">
              <Select value={values.source} onChange={set('source')}>
                {BOOKING_SOURCES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Статус">
              <Select value={values.status} onChange={set('status')}>
                {BOOKING_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className={`grid gap-4 ${isOtaSource(values.source) ? 'sm:grid-cols-2' : ''}`}>
            {isOtaSource(values.source) && (
              <Field
                label="Комисиона на платформата (€)"
                hint={`Предложена от ${settings.ota_commission_pct}% за този имот — може да редактирате.`}
              >
                <Input type="number" min={0} step="0.01" inputMode="decimal" value={values.commission} onChange={setCommission} />
              </Field>
            )}
            <Field
              label="Туристически данък (€)"
              hint={
                settings.tourist_tax > 0
                  ? `Предложен от ${settings.tourist_tax} €/гост/нощувка — може да редактирате.`
                  : 'Задайте ставка в настройките на имота за автоматично предложение.'
              }
            >
              <Input type="number" min={0} step="0.01" inputMode="decimal" value={values.tourist_tax} onChange={setTouristTax} />
            </Field>
          </div>
        </Section>

        <Section title="Бележки">
          <Field label="Бележки за резервацията">
            <Textarea rows={3} value={values.notes} onChange={set('notes')} placeholder="Късно настаняване, домашен любимец…" />
          </Field>
        </Section>

        {isEdit && <PaymentsSection bookingId={initial.id} />}

        {isEdit && (
          <section className="border-t border-line pt-6">
            {confirmDelete ? (
              <div className="rounded-2xl bg-danger-soft p-4" role="group" aria-label="Потвърждение за изтриване">
                <p className="text-sm font-semibold text-danger-ink">Да изтрием ли резервацията? Не може да се върне.</p>
                <div className="mt-3 flex gap-2">
                  <Button type="button" variant="secondary" onClick={() => setConfirmDelete(false)} disabled={deleting} className="flex-1 sm:flex-none">
                    Не, запази я
                  </Button>
                  <Button type="button" variant="dangerSolid" onClick={handleDelete} loading={deleting} className="flex-1 sm:flex-none">
                    Да, изтрий
                  </Button>
                </div>
              </div>
            ) : (
              <Button type="button" variant="danger" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Изтрий резервацията
              </Button>
            )}
          </section>
        )}
      </form>
    </Modal>
  )
}
