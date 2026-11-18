// Többnyelvűség: a felület magyar szövegeit megjelenítéskor fordítja (szótár: public/i18n/<nyelv>.json).
// Az adatok (növénynevek, hibridek, dátumok) magyar/egységes formában tárolódnak – csak a kijelzés fordul.
export const LANGS = {
  hu: 'Magyar', en: 'English', de: 'Deutsch', sr: 'Srpski', hr: 'Hrvatski', sl: 'Slovenščina',
  sk: 'Slovenčina', cs: 'Čeština', pl: 'Polski', ro: 'Română', uk: 'Українська',
};
const KEY = 'tt.lang';
function detect() {
  try { const s = localStorage.getItem(KEY); if (s && LANGS[s]) return s; } catch (e) {}
  const nl = navigator.languages || [navigator.language || 'hu'];
  if (nl.some(l => String(l).toLowerCase().startsWith('hu'))) return 'hu';
  for (const l of nl) {
    const c = String(l).slice(0, 2).toLowerCase();
    if (c === 'bs' || c === 'me') return 'sr';
    if (LANGS[c]) return c;
  }
  return 'hu';
}
const I = { lang: detect(), exact: new Map(), re: [] };
const norm = s => s.replace(/\s+/g, ' ').trim();

const NUM = /\d+(?:[.,]\d+)*/g;
function core(k) {
  const hit = I.exact.get(k); if (hit != null) return hit;
  const nums = k.match(NUM);
  if (nums) { const t = I.exact.get(k.replace(NUM, '{#}')); if (t != null) { let i = 0; return t.replace(/\{#\}/g, () => nums[i++] ?? ''); } }
  for (const [rx, rep] of I.re) { if (rx.test(k)) return k.replace(rx, rep); }
  return null;
}
function tr(src) {
  const k = norm(src); if (!k || !/\p{L}/u.test(k)) return null;
  let t = core(k); if (t != null) return t;
  // jelek/ikonok a szöveg elején-végén (pl. „📊 Statisztika”, „+ Talajművelés”, „Név:”) – a magot fordítjuk
  const m = k.match(/^([^\p{L}\p{N}]*)(.*?)([\s:.·…*↗▶]*)$/u);
  if (m && (m[1] || m[3]) && m[2]) { t = core(m[2]); if (t != null) return m[1] + t + m[3]; if (m[3]) { t = core(m[2] + m[3]); if (t != null) return m[1] + t; } }
  return null;
}
function trText(node) {
  const o = node.__o ?? node.nodeValue; const t = tr(o);
  if (t == null) { if (node.__o != null && node.nodeValue !== node.__o) node.nodeValue = node.__o; return; }
  node.__o = o; const lead = o.match(/^\s*/)[0], tail = o.match(/\s*$/)[0];
  const v = lead + t + tail; node.__t = v; if (node.nodeValue !== v) node.nodeValue = v;
}
const ATTRS = ['placeholder', 'title', 'aria-label', 'label'];
function trEl(el) {
  if (el.closest && el.closest('[data-noi18n]')) return;
  if (el.tagName === 'OPTION' && !el.hasAttribute('value')) el.setAttribute('value', el.textContent);
  for (const a of ATTRS) { if (!el.hasAttribute(a)) continue; const ok = '__o_' + a; const o = el[ok] ?? el.getAttribute(a); const t = tr(o); if (t != null) { el[ok] = o; el.setAttribute(a, t); } }
}
function walk(root) {
  if (!root) return;
  if (root.nodeType === 3) { const p = root.parentNode; if (p && !/^(SCRIPT|STYLE|TEXTAREA)$/.test(p.nodeName) && !(p.closest && p.closest('[data-noi18n]'))) { if (p.nodeName === 'OPTION' && !p.hasAttribute('value')) p.setAttribute('value', root.nodeValue); trText(root); } return; }
  if (root.nodeType !== 1 || /^(SCRIPT|STYLE|TEXTAREA)$/.test(root.nodeName)) return;
  trEl(root);
  const it = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let n; while ((n = it.nextNode())) { if (n.nodeType === 1) { if (/^(SCRIPT|STYLE|TEXTAREA)$/.test(n.nodeName)) continue; trEl(n); } else walk(n); }
}
let obs = null;
function start() {
  if (I.lang === 'hu') return;
  walk(document.body); document.title = tr(document.title) || document.title;
  obs = new MutationObserver(ms => {
    obs.disconnect();
    for (const m of ms) {
      if (m.type === 'characterData') { const n = m.target; if (n.__o != null && n.nodeValue !== n.__t) { delete n.__o; delete n.__t; } walk(n); }
      else if (m.type === 'attributes') trEl(m.target);
      else m.addedNodes.forEach(walk);
    }
    obs.observe(document.body, OBS);
  });
  obs.observe(document.body, OBS);
}
const OBS = { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS };

export async function initI18n() {
  document.documentElement.lang = I.lang;
  if (I.lang !== 'hu') {
    try {
      const r = await fetch(`i18n/${I.lang}.json`, { cache: 'no-cache' }); const j = await r.json();
      Object.entries(j.exact || {}).forEach(([k, v]) => I.exact.set(norm(k), v));
      (j.re || []).forEach(([p, v]) => { try { I.re.push([new RegExp(p), v]); } catch (e) {} });
    } catch (e) { console.warn('i18n', e); }
  }
  window.I18N = {
    lang: I.lang, langs: LANGS,
    t: s => tr(s) ?? s,
    set: l => { try { localStorage.setItem(KEY, l); } catch (e) {} location.reload(); },
    locale: { hu: 'hu-HU', en: 'en-GB', de: 'de-DE', sr: 'sr-Latn-RS', hr: 'hr-HR', sl: 'sl-SI', sk: 'sk-SK', cs: 'cs-CZ', pl: 'pl-PL', ro: 'ro-RO', uk: 'uk-UA' }[I.lang],
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
}
