// Правна информация: данни на администратора, избор за бисквитки, текстове на 6 езика, съответствие на документите
// с кода (какво се пази в браузъра, към кого се свързва сайтът), отметки за съгласие, карта само със съгласие.
//   node scripts/test-legal.mjs
// Готовността за качване (попълнени данни на фирмата) се проверява ОТДЕЛНО: node scripts/check-legal-ready.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  COMPANY, REQUIRED_COMPANY_FIELDS, missingCompanyFields, legalReady, companyLines, companyShort,
  CONSENT_KEY, CONSENT_VERSION, parseConsent, serializeConsent, formatLegalDate, LEGAL_UPDATED,
} from '../src/lib/legal.js'
import { LEGAL } from '../src/pages/stay/i18n/legalStrings.js'
import { legalText, docLangCode } from '../src/lib/legalText.js'
import { DICTS, LANGUAGES, translate } from '../src/pages/stay/i18n/core.js'

let pass = 0
let fail = 0
const ok = (name, cond, extra = '') => {
  if (cond) pass++
  else {
    fail++
    console.log('  ПРОВАЛ:', name, extra)
  }
}
const ROOT = join(fileURLToPath(import.meta.url), '..', '..')
const read = (p) => readFileSync(join(ROOT, p), 'utf8')
const walk = (dir, out = []) => {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    statSync(p).isDirectory() ? walk(p, out) : /\.(jsx?|mjs|html)$/.test(n) && out.push(p)
  }
  return out
}

/* ---------- данни на администратора ---------- */
const full = { name: ' Тест ЕООД ', address: 'ул. Пример 1', eik: '123456789', email: 'a@b.bg', phone: '' }
ok('задължителни са 4 полета: име, адрес, ЕИК, имейл', REQUIRED_COMPANY_FIELDS.join() === 'name,address,eik,email')
ok('празна фирма: липсват и четирите', missingCompanyFields({ name: null, address: null, eik: null, email: null }).length === 4)
ok('празни интервали се броят за липсващи', missingCompanyFields({ ...full, eik: '   ' }).join() === 'eik')
ok('телефонът не е задължителен', missingCompanyFields(full).length === 0 && legalReady(full))
ok('непопълнена фирма не е готова за качване', legalReady({ name: 'X', address: null, eik: '1', email: 'e@e.bg' }) === false)
ok('редовете за показване: само попълнените, в ред Фирма, ЕИК, Адрес, Имейл', companyLines(full).map((l) => l.key).join() === 'name,eik,address,email')
ok('стойностите се подрязват', companyLines(full)[0].value === 'Тест ЕООД')
ok('кратък ред: „Име · ЕИК …“', companyShort(full) === 'Тест ЕООД · ЕИК 123456789')
ok('кратък ред без ЕИК е само името; без име е празен', companyShort({ name: 'Х' }) === 'Х' && companyShort({}) === '')
ok('данните на фирмата се четат от един обект COMPANY (име на полетата)', ['name', 'address', 'eik', 'email', 'phone'].every((k) => k in COMPANY))
ok('форматът на датата е „12 ноември 2026 г.“', formatLegalDate('2026-11-12') === '12 ноември 2026 г.' && typeof LEGAL_UPDATED === 'string')

/* ---------- избор за бисквитки ---------- */
ok('ключът в браузъра е stayflow.consent', CONSENT_KEY === 'stayflow.consent')
ok('„all“ и „necessary“ се записват и четат обратно', ['all', 'necessary'].every((c) => parseConsent(serializeConsent(c)) === c))
ok('липсващ или празен запис → още няма избор', parseConsent(null) === null && parseConsent('') === null && parseConsent(undefined) === null)
ok('повреден запис → още няма избор (не чупи)', parseConsent('{не е json') === null && parseConsent('"all"') === null && parseConsent('123') === null)
ok('друга версия или непознат избор → още няма избор', parseConsent(JSON.stringify({ v: CONSENT_VERSION + 1, choice: 'all' })) === null && parseConsent(JSON.stringify({ v: CONSENT_VERSION, choice: 'maybe' })) === null)
ok('непознат избор не се записва', (() => { try { serializeConsent('maybe'); return false } catch { return true } })())
const stamp = JSON.parse(serializeConsent('all', new Date('2026-11-12T10:00:00Z')))
ok('записът пази версия, избор и час (за да може да се докаже кога е даден)', stamp.v === 1 && stamp.choice === 'all' && stamp.at === '2026-11-12T10:00:00.000Z')

/* ---------- текстове на 6 езика ---------- */
const codes = ['bg', 'en', 'mk', 'sr', 'el', 'ro']
const keys = Object.keys(LEGAL.bg)
ok('18 правни ключа', keys.length === 18, String(keys.length))
ok('всички езици имат същите ключове', codes.every((c) => Object.keys(LEGAL[c]).sort().join() === [...keys].sort().join()))
ok('няма празен текст', codes.every((c) => keys.every((k) => typeof LEGAL[c][k] === 'string' && LEGAL[c][k].trim())))
const vars = (s) => (s.match(/\{\w+\}/g) ?? []).sort().join()
ok('consentSignup има {terms} и {privacy} на всички езици', codes.every((c) => vars(LEGAL[c].consentSignup) === '{privacy},{terms}'))
ok('consentRequest има {privacy} на всички езици', codes.every((c) => vars(LEGAL[c].consentRequest) === '{privacy}'))
ok('другите текстове нямат заместители', codes.every((c) => keys.filter((k) => !['consentSignup', 'consentRequest'].includes(k)).every((k) => vars(LEGAL[c][k]) === '')))
ok('„Откажи“ и „Приемам“ са различни думи на всеки език', codes.every((c) => LEGAL[c].cookieAccept !== LEGAL[c].cookieDecline))
ok('bg, mk, sr са на кирилица; el на гръцка азбука; ro със запетая под ș/ț', codes.length === 6 &&
  ['bg', 'mk', 'sr'].every((c) => /[Ѐ-ӿ]/.test(LEGAL[c].cookieText)) && /[Ͱ-Ͽ]/.test(LEGAL.el.cookieText) &&
  !/[şţŞŢ]/.test(Object.values(LEGAL.ro).join('')))
ok('македонският няма български букви (ъ щ ю я)', !/[ъщюя]/i.test(Object.values(LEGAL.mk).join('')))
ok('картата се споменава с OpenStreetMap на всички езици', codes.every((c) => /OpenStreetMap/.test(LEGAL[c].mapBlockedText) && /OpenStreetMap/.test(LEGAL[c].mapOpen)))
ok('текстът на банера казва, че картата се зарежда само със съгласие (на всички езици има OpenStreetMap)', codes.every((c) => /OpenStreetMap/.test(LEGAL[c].cookieText)))

/* едни и същи текстове през двата пътя: малкия (банер) и големия (публичната страница) */
const same = LANGUAGES.every((l) => keys.every((k) => legalText(l.code, k, { terms: '{terms}', privacy: '{privacy}' }) === translate(l.code, k, { terms: '{terms}', privacy: '{privacy}' })))
ok('legalText (основен пакет) и translate (публична страница) дават еднакъв текст на 7 езика', same)
ok('сръбска латиница: „Одбиј“ → „Odbij“, „Прихватам“ → „Prihvatam“', legalText('sr-latn', 'cookieDecline') === 'Odbij' && legalText('sr-latn', 'cookieAccept') === 'Prihvatam')
ok('заместителите се попълват', legalText('en', 'consentRequest', { privacy: 'X' }).endsWith('More: X.'))
ok('непознат ключ връща самия ключ; непознат език пада към английски', legalText('bg', 'nope') === 'nope' && legalText('xx', 'cookieDecline') === 'Decline')
ok('правните ключове са и в речниците на публичната страница (t() там работи)', LANGUAGES.every((l) => keys.every((k) => typeof DICTS[l.code][k] === 'string')))

/* ---------- документите казват това, което кодът наистина прави ---------- */
const privacy = read('src/pages/legal/Privacy.jsx')
const terms = read('src/pages/legal/Terms.jsx')
const srcFiles = walk(join(ROOT, 'src')).filter((f) => !relative(ROOT, f).replace(/\\/g, '/').startsWith('src/pages/legal/'))

// всеки ключ в браузъра, който кодът ползва, е описан в политиката
const usedKeys = new Set()
for (const f of srcFiles) for (const m of readFileSync(f, 'utf8').matchAll(/['"`](stayflow\.[A-Za-z]+)['"`]/g)) usedKeys.add(m[1])
ok('кодът ползва поне езика, избора за бисквитки и интерфейса в браузъра', ['stayflow.appLang', 'stayflow.stayLang', 'stayflow.checklistCollapsed', 'stayflow.autoSetupSeen'].every((k) => usedKeys.has(k)) , [...usedKeys].join(', '))
const undocumented = [...usedKeys].filter((k) => !privacy.includes(k))
ok('политиката изброява всеки ключ, който кодът пази в браузъра', undocumented.length === 0, undocumented.join(', '))
ok('политиката описва и избора за бисквитки (stayflow.consent)', privacy.includes(CONSENT_KEY))
ok('политиката описва сесията при вход (sb-…-auth-token)', /sb-…-auth-token/.test(privacy))

// към кого се свързва сайтът: само известните; нов външен адрес трябва да се опише в политиката и да мине през този списък
const ALLOWED_HOSTS = new Set([
  'www.openstreetmap.org', // карта — само със съгласие
  'wiki.osmfoundation.org', 'www.cpdp.bg', // връзки в политиката
  'www.w3.org', // пространство от имена на SVG
  'schema.org', // структурирани данни за търсачки
  'localhost', 'api.telegram.org', 'api.resend.com', 'api.anthropic.com', // сървърен код (функции), не се зарежда в браузъра
  'www.airbnb.com', 'airbnb.com', 'www.booking.com', 'booking.com', 'maps.google.com', 'www.google.com', 'wa.me', 'm.me', 'viber.com', 't.me', 'instagram.com', // връзки, които посетителят сам отваря, или примерни адреси в подсказки
])
const hosts = new Map()
for (const f of [...srcFiles, join(ROOT, 'index.html')]) {
  const text = readFileSync(f, 'utf8')
  for (const m of text.matchAll(/https?:\/\/([a-z0-9.-]+\.[a-z]{2,})/gi)) {
    const h = m[1].toLowerCase()
    if (!hosts.has(h)) hosts.set(h, relative(ROOT, f).replace(/\\/g, '/'))
  }
}
const unknownHosts = [...hosts].filter(([h]) => !ALLOWED_HOSTS.has(h) && !h.endsWith('.supabase.co') && !h.endsWith('.netlify.app') && !h.endsWith('.example.com') && !h.endsWith('.example.bg') && !h.endsWith('primer.bg'))
ok('няма непознати външни адреса (реклама, статистика, шрифтове) — нов адрес се описва в политиката и се добавя тук', unknownHosts.length === 0, unknownHosts.map(([h, f]) => `${h} (${f})`).join(' | '))
ok('няма скриптове за проследяване или реклама', !/googletagmanager|google-analytics|gtag\(|fbq\(|hotjar|clarity\.ms|plausible|matomo/i.test(srcFiles.map((f) => readFileSync(f, 'utf8')).join('\n') + read('index.html')))
ok('шрифтовете са самохоствани (без Google Fonts)', !/fonts\.googleapis|fonts\.gstatic/.test(read('index.html') + srcFiles.map((f) => readFileSync(f, 'utf8')).join('\n')))

// политиката и условията казват основното, което GDPR изисква да се каже
const must = (name, text, parts) => ok(`${name}: ${parts.map((p) => p.label).join(', ')}`, parts.every((p) => p.re.test(text)), parts.filter((p) => !p.re.test(text)).map((p) => p.label).join(', '))
must('Политика за поверителност', privacy, [
  { label: 'администратор', re: /Администратор/ }, { label: 'цели и основание', re: /purpose=[\s\S]*basis=/ }, { label: 'чл. 6 GDPR', re: /чл\. 6/ },
  { label: 'получатели (Supabase, Netlify)', re: /Supabase[\s\S]*Netlify/ }, { label: 'Telegram', re: /Telegram/ }, { label: 'OpenStreetMap', re: /OpenStreetMap/ },
  { label: 'срок на съхранение', re: /Колко дълго пазим/ }, { label: 'достъп', re: /достъп до личните/ }, { label: 'поправка', re: /поправка/ }, { label: 'изтриване', re: /изтриване/ },
  { label: 'ограничаване', re: /ограничаване/ }, { label: 'пренос', re: /пренос/ }, { label: 'възражение', re: /възразите/ }, { label: 'оттегляне на съгласие', re: /оттеглите/ },
  { label: 'жалба до КЗЛД', re: /Комисията за защита на личните данни/ }, { label: 'срок за отговор', re: /един месец/ },
  { label: 'IP адрес', re: /IP адрес/ }, { label: 'без реклама и продажба', re: /Не продаваме/ },
])
ok('политиката е в раздел #cookies (връзка от банера)', /id="cookies"/.test(privacy))
must('Условия за ползване', terms, [
  { label: 'кой предоставя', re: /Предоставя се от/ }, { label: 'не е страна по договора за настаняване', re: /Не сме страна по договора/ }, { label: 'заявката не е резервация', re: /Заявката не е резервация/ },
  { label: 'плащанията не минават през StayFlow', re: /не събира и не\s+обработва плащания/ }, { label: 'приемливо ползване', re: /Приемливо ползване/ }, { label: 'отговорност', re: /Отговорност/ },
  { label: 'приложимо право', re: /българското право/ }, { label: 'връзка към политиката', re: /to="\/privacy"/ },
])
ok('документите не са пълни с измислени срокове в дни/месеци/години за пазене на данни', !/\d+\s*(дни|месеца|години)/i.test(privacy.split('Колко дълго пазим')[1]?.split('</section>')[0] ?? ''))
ok('и двата документа показват данните на администратора (CompanyBlock)', /<CompanyBlock/.test(privacy) && /<CompanyBlock/.test(terms))
ok('непопълнено поле се вижда като „[да се попълни]“, не се измисля', /\[да се попълни\]/.test(read('src/pages/legal/LegalShell.jsx')))

/* ---------- съгласия и карта ---------- */
const signup = read('src/pages/auth/Signup.jsx')
ok('регистрация: проверката за съгласие е ПРЕДИ signUp', signup.indexOf('if (!consent)') > 0 && signup.indexOf('if (!consent)') < signup.indexOf('supabase.auth.signUp'))
ok('регистрация: връзки към /terms и /privacy в нов раздел', /href="\/terms"[^>]*target="_blank"/.test(signup) && /href="\/privacy"[^>]*target="_blank"/.test(signup))
const listing = read('src/pages/stay/ListingView.jsx')
ok('заявка за резервация: проверката за съгласие е ПРЕДИ изпращането', listing.indexOf('if (!consent) return setSendError') > 0 && listing.indexOf('if (!consent) return setSendError') < listing.indexOf("fetch('/api/booking-request'"))
ok('заявка: отметката не е предварително отметната', /useState\(false\)[^\n]*съгласие/.test(listing) || /const \[consent, setConsent\] = useState\(false\)/.test(listing))
ok('регистрация: отметката не е предварително отметната', /const \[consent, setConsent\] = useState\(false\)/.test(signup))
const map = read('src/components/LocationMap.jsx')
ok('картата: iframe-ът е СЛЕД проверката за съгласие', map.indexOf('allowExternal') > 0 && map.indexOf('if (!allowExternal)') < map.indexOf('<iframe'))
ok('картата: без съгласие има връзка „Отвори в OpenStreetMap“ (rel=noopener)', /mapOpen/.test(map) && /rel="noopener noreferrer"/.test(map))
const banner = read('src/components/CookieBanner.jsx')
const btnClasses = [...banner.matchAll(/<button type="button" onClick=\{(?:decline|accept)\} className="([^"]+)"/g)].map((m) => m[1])
ok('банер: „Откажи“ и „Приемам“ са еднакви по вид (един и същ клас)', btnClasses.length === 2 && btnClasses[0] === btnClasses[1], btnClasses.join(' | '))
ok('банер: има връзка към политиката (#cookies)', /to="\/privacy#cookies"/.test(banner))
const app = read('src/App.jsx')
ok('банерът е в App (всеки екран), а /privacy и /terms са публични маршрути', /<CookieBanner \/>/.test(app) && /path="\/privacy"/.test(app) && /path="\/terms"/.test(app))
ok('документите са translate="no" (на български; превеждачът не ги пипа, но <html lang> следва езика на посетителя)', /<article[^>]*translate="no"/.test(read('src/pages/legal/LegalShell.jsx')) && !/privacy|terms/.test(read('src/i18n/domTranslator.js')))
ok('<html lang> → език: sr е кирилица, sr-Latn латиница, непознато → български', docLangCode('sr') === 'sr' && docLangCode('sr-Latn') === 'sr-latn' && docLangCode('SR_latn') === 'sr-latn' && docLangCode('el') === 'el' && docLangCode('ro-RO') === 'ro' && docLangCode('xx') === 'bg' && docLangCode('') === 'bg' && docLangCode(null) === 'bg')
ok('всеки html lang на публичната страница дава същия език', LANGUAGES.every((l) => docLangCode(l.html) === l.code), LANGUAGES.map((l) => `${l.html}→${docLangCode(l.html)}`).join(' '))

console.log(`test-legal: ${pass} успешни, ${fail} провалени`)
process.exit(fail ? 1 : 0)
