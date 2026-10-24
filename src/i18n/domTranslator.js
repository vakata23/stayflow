import { createTranslator } from './translator.js'
import { APP_LANGUAGES, getAppLang, getDictionary, loadDictionary, subscribeAppLang } from './appLang.js'

/**
 * Превежда приложението на собственика на гръцки/македонски, като заменя българските текстове в страницата
 * (текстови възли и надписи: placeholder, title, aria-label, alt) по речника. Кодът на екраните не се променя —
 * те пишат на български; всичко ново, което React вмъкне или промени, се превежда в момента на вмъкването (преди
 * браузърът да нарисува). Оригиналът се помни за всеки възел, затова смяната на език (и връщането на български) е мигновена.
 *
 * Не се превеждат: публичната страница за гости (/stay — има свой превод), картата за госта (/guest), витрината
 * (/design) и прегледът като гост; текстове в [translate="no"]; полетата за въвеждане (стойностите им).
 */

const CYR = /[Ѐ-ӿ]/
const ATTRS = ['placeholder', 'title', 'aria-label', 'alt', 'aria-description', 'aria-valuetext']
const ATTR_SELECTOR = ATTRS.map((a) => `[${a}]`).join(',')
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'NOSCRIPT'])
const EXCLUDED_PATHS = [/^\/stay(\/|$)/, /^\/guest(\/|$)/, /^\/design(\/|$)/, /^\/properties\/[^/]+\/preview(\/|$)/]

const textRec = new WeakMap() // възел → { src, out }
const attrRec = new WeakMap() // елемент → { [атрибут]: { src, out } }

let translator = null // null = български (нищо за превеждане)
let observer = null

const excluded = () => EXCLUDED_PATHS.some((re) => re.test(window.location.pathname))

function skipped(el) {
  return !el || SKIP_TAGS.has(el.tagName) || Boolean(el.closest?.('[translate="no"]'))
}

// за надписите на атрибутите (placeholder на textarea също се превежда) — само скриптове/стилове и [translate="no"] се пропускат
function skippedAttr(el) {
  return !el || el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || Boolean(el.closest?.('[translate="no"]'))
}

function processText(node) {
  if (skipped(node.parentElement)) return
  const rec = textRec.get(node)
  const current = node.data
  // ако текстът е нашият превод — работим от оригинала; ако React го е сменил — това е новият оригинал
  const src = rec && current === rec.out ? rec.src : current
  if (!rec && !CYR.test(src)) return
  const out = translator ? translator.translate(src) : src
  if (out !== current) node.data = out
  if (out !== src || rec) textRec.set(node, { src, out })
}

function processAttr(el, name) {
  if (skippedAttr(el)) return
  const value = el.getAttribute(name)
  if (value == null) return
  const recs = attrRec.get(el) ?? {}
  const rec = recs[name]
  const src = rec && value === rec.out ? rec.src : value
  if (!rec && !CYR.test(src)) return
  const out = translator ? translator.translate(src) : src
  if (out !== value) el.setAttribute(name, out)
  if (out !== src || rec) {
    recs[name] = { src, out }
    attrRec.set(el, recs)
  }
}

function scan(root) {
  if (root.nodeType === Node.TEXT_NODE) return processText(root)
  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) processText(n)
  const els = root.nodeType === Node.ELEMENT_NODE ? [root, ...root.querySelectorAll(ATTR_SELECTOR)] : root.querySelectorAll(ATTR_SELECTOR)
  for (const el of els) for (const name of ATTRS) if (el.hasAttribute?.(name)) processAttr(el, name)
}

function onMutations(records) {
  if (excluded()) return
  for (const r of records) {
    if (r.type === 'characterData') processText(r.target)
    else if (r.type === 'attributes') processAttr(r.target, r.attributeName)
    else r.addedNodes.forEach(scan)
  }
}

function applyLanguage(code) {
  const dict = getDictionary(code)
  translator = dict ? createTranslator(dict) : null
  if (!excluded()) document.documentElement.lang = APP_LANGUAGES.find((l) => l.code === code)?.html ?? 'bg'
  if (!excluded()) scan(document)
}

/**
 * Пуска превода. Извиква се веднъж, преди първото изобразяване (main.jsx): ако запомненият език е гръцки или
 * македонски, речникът се чака, за да няма миг на български.
 */
export async function startDomTranslation() {
  await loadDictionary(getAppLang())
  applyLanguage(getAppLang())
  observer = new MutationObserver(onMutations)
  observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS })
  subscribeAppLang((code) => applyLanguage(code))
}

/** За тестове: превежда веднага текст с текущия превеждач. */
export const translateNow = (text) => (translator ? translator.translate(text) : text)
