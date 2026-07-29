# StayFlow — PMS за краткосрочни наеми

Уеб приложение за управление на имоти за краткосрочно настаняване (Airbnb,
Booking.com, директни резервации) — за собственици на 1–10 имота в България.

**Стек:** React (Vite) + Tailwind CSS · Supabase (Postgres, Auth, Storage, RLS) ·
Netlify (frontend + serverless функция за iCal)

## Функционалности

- 🏠 **Имоти** — добавяне, редакция, снимки, WiFi/код за достъп
- 📅 **Календар и резервации** — месечен изглед, защита от двойни резервации,
  iCal експорт/импорт към Airbnb/Booking
- 🧹 **Камериерски задачи** — kanban изглед със статуси, автоматична дата от
  напускането на гост
- 📝 **Забележки от почистване** — щети/липси със снимки
- 💰 **Ценови планове** — цени по периоди, видими в календара
- 🔗 **Публична гост карта** — `/guest/<id>` с WiFi, код, локация, правила
- 🧾 **Фактуриране** — PDF фактури с кирилица (jsPDF)

---

## 1. Настройка на Supabase

### 1.1 Създайте проект

1. Влезте в [supabase.com](https://supabase.com) → **New project**.
2. Изберете регион (за България — **eu-west** или **eu-central**).
3. Запишете си паролата на базата (нужна само при директен достъп).

### 1.2 Импортирайте схемата

В Supabase Dashboard → **SQL Editor** → **New query** изпълнете **последователно**
следните файлове от папка `supabase/` (всеки поотделно, в този ред):

1. `supabase/schema.sql` — таблици, RLS политики, storage buckets, тригери
2. `supabase/migrations/002_ical_sync.sql` — iCal синхронизация
3. `supabase/migrations/003_guest_card.sql` — публична гост карта

> Всеки файл трябва да завърши с `Success. No rows returned` — това е нормално.

### 1.3 (По избор) Изключете имейл потвърждението за разработка

За по-бързо тестване: **Authentication → Sign In / Providers → Email** →
изключете **Confirm email**. **Включете го обратно преди production.**

### 1.4 Вземете ключовете

**Project Settings → API** (или **API Keys**):

- **Project URL** — напр. `https://xxxx.supabase.co`
- **anon / public** ключ (в новите проекти: `sb_publishable_...`)

> ⚠️ Никога не използвайте `service_role` / secret ключа във frontend код.

---

## 2. Локално стартиране

Изисква **Node.js 18+**.

```bash
# 1. Инсталирайте зависимостите
npm install

# 2. Създайте .env от примера и попълнете стойностите от стъпка 1.4
cp .env.example .env
```

Съдържание на `.env`:

```
VITE_SUPABASE_URL=https://вашия-проект.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...
```

```bash
# 3. Стартирайте dev сървъра
npm run dev
```

Отворете <http://localhost:5173>, регистрирайте се и добавете първия си имот.

> Ако видите екран „Липсва Supabase конфигурация", значи `.env` липсва или е
> непопълнен. Рестартирайте dev сървъра след промяна на `.env`.

---

## 3. Deploy към Netlify

Frontend-ът и iCal функцията се хостват заедно в Netlify. Базата остава в
Supabase Cloud.

### 3.1 Свържете репозиторито

1. Качете кода в GitHub/GitLab.
2. В [Netlify](https://app.netlify.com) → **Add new site → Import an existing project**.
3. Netlify чете `netlify.toml` автоматично:
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Functions directory: `netlify/functions`

### 3.2 Environment променливи

**Site configuration → Environment variables** добавете:

| Име | Стойност |
|-----|----------|
| `VITE_SUPABASE_URL` | вашия Supabase URL |
| `VITE_SUPABASE_ANON_KEY` | вашия anon ключ |

### 3.3 Deploy

Натиснете **Deploy**. След това:

- Приложението е достъпно на `https://вашия-сайт.netlify.app`
- iCal експортът работи на `/api/ical?token=...`
- Гост картите работят на `/guest/<property_id>`

> `netlify.toml` вече съдържа SPA fallback и правилото за `/api/ical`, така че
> refresh на вътрешна страница и директните линкове работят коректно.

---

## 4. iCal синхронизация с Airbnb / Booking

**Експорт (StayFlow → платформата):** от страницата на имота копирайте
iCal линка и го поставете в Airbnb/Booking („Импорт на календар").

**Импорт (платформата → StayFlow):** поставете iCal адреса от Airbnb/Booking в
полето на имота и натиснете „Синхронизирай сега". За MVP синхронизацията е
ръчна (бутон); може да се автоматизира с cron по-късно.

---

## 5. Структура на проекта

```
stayflow/
├── public/fonts/          # Roboto TTF за кирилица в PDF фактурите
├── netlify/functions/     # iCal serverless функция (production)
├── supabase/
│   ├── schema.sql         # основна схема
│   └── migrations/        # 002 (iCal), 003 (гост карта)
├── src/
│   ├── components/        # Layout, ui примитиви, IcalSync…
│   ├── context/           # AuthContext
│   ├── lib/               # supabase, dates, ical, bookings, pricing, PDF…
│   └── pages/             # по модул: properties, bookings, cleaning, pricing…
├── netlify.toml
└── vite.config.js         # + dev middleware за /api/ical
```

---

## 6. Сигурност (важно)

- **Row Level Security** е включен на всички таблици — всеки потребител вижда
  само своите данни.
- **Публичните страници** (iCal, гост карта) минават през `security definer`
  функции, които връщат само безопасни полета — никакви резервации, финансови
  или чужди данни не изтичат.
- `anon` ключът е публичен по дизайн; защитата идва от RLS, не от тайна на ключа.
- `.env` е в `.gitignore` — не го качвайте в репозиторито.

---

## Налични команди

| Команда | Действие |
|---------|----------|
| `npm run dev` | Локален dev сървър |
| `npm run build` | Production build в `dist/` |
| `npm run preview` | Преглед на production build локално |
