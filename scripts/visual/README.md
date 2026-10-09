# Визуални проверки (снимки, достъпност, поведение)

Локална тестова среда, която **не пипа нито базата, нито кода, нито `ProtectedRoute`**: статичният билд се сервира заедно с
имитация на Supabase (вход, таблици, RPC) и български тестови данни. „Влизането“ е само фалшива сесия в `localStorage`,
която приложението чете както обикновено. Данните са измислени (`seed.mjs`); снимките са генерирани градиенти.

## Подготовка (веднъж)

```bash
npm i --no-save @electric-sql/pglite playwright axe-core   # не променя package.json; ползва инсталирания Chrome
```

> `@electric-sql/pglite` е за SQL тестовете — включен е, за да не го изтрие `npm` като „излишен“.

## Билд срещу тестовия сървър и старт

```bash
VITE_SUPABASE_URL=http://localhost:4174 VITE_SUPABASE_ANON_KEY=test npx vite build --outDir /tmp/stayflow-dist --emptyOutDir
node scripts/visual/server.mjs /tmp/stayflow-dist 4174
```

## Проверки (във втори терминал)

| Какво | Команда |
|---|---|
| Снимки на 375 и 1440 px (тъч/мишка) | `node scripts/visual/shoot.mjs after http://localhost:4174 /,/bookings,/earnings` · публични: добави `--public` |
| Нарязана дълга страница на парчета | `node scripts/visual/slices.mjs ds http://localhost:4174/design 1440 1050 public` |
| Достъпност (axe-core, WCAG 2.x A/AA) | `node scripts/visual/axe.mjs http://localhost:4174 after /login,/,/calendar,/design` |
| Поведение на компонентите (прозорец, фокус, Esc, размери, намалено движение) | `node scripts/visual/ui-behavior.mjs http://localhost:4174` |
| Движение: броене, каскада, график, лист „Още“, хапче в лентата, намалено движение (+ кадри в `out/motion/`) | `node scripts/visual/motion.mjs http://localhost:4174 --frames` |
| Хоризонтално препълване на всички екрани (360 / 375 / 768 / 1440 px) | `node scripts/visual/overflow.mjs http://localhost:4174` |
| Скелет на екраните: пропускане към съдържанието, скрол в началото, скелети при зареждане, празни състояния, 404, „назад“ | `node scripts/visual/shell.mjs http://localhost:4174` |
| Календар и форма за резервация: клетки ≥ 44 px, лист за ден, слепени ленти, потвърждение при изтриване, плащане с Enter | `node scripts/visual/calendar.mjs http://localhost:4174` |
| Достъпност на отворени листове и форми | `node scripts/visual/axe-states.mjs http://localhost:4174` |

Резултатите (снимки, JSON) са в `scripts/visual/out/` (в `.gitignore`). На Windows с Git Bash добавете
`MSYS_NO_PATHCONV=1` пред командата, ако подавате пътища като `/design`.

Токените и контрастът се проверяват отделно, без браузър: `node scripts/test-design.mjs`.
