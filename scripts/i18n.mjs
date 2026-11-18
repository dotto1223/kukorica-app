// i18n-src/*.txt (hu|en|de|sr|hr|sl|sk|cs|pl|ro|uk) → public/i18n/<nyelv>.json
import fs from 'fs';
const LANGS = ['en','de','sr','hr','sl','sk','cs','pl','ro','uk'];
const out = Object.fromEntries(LANGS.map(l => [l, { exact: {}, re: [] }]));
let n = 0, bad = 0;
for (const f of fs.readdirSync('i18n-src').filter(f => f.endsWith('.txt')).sort()) {
  fs.readFileSync('i18n-src/' + f, 'utf8').split('\n').forEach((line, i) => {
    if (!line.trim() || line.startsWith('#')) return;
    const c = line.split('|').map(s => s.trim());
    if (c.length !== LANGS.length + 1) { console.error(`${f}:${i + 1}: ${c.length} oszlop`); bad++; return; }
    if (c[0].includes('{*}')) {
      // szabad szöveges helyőrző → reguláris kifejezés
      const esc = c[0].split(/(\{\*\}|\{#\})/).map(t => t === '{*}' ? '(.+?)' : t === '{#}' ? '(\\d+(?:[.,]\\d+)*)' : t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('');
      LANGS.forEach((l, j) => { if (!c[j + 1]) return; let k = 0; const rep = c[j + 1].replace(/\{\*\}|\{#\}/g, () => '$' + (++k)); out[l].re.push(['^' + esc + '$', rep]); });
    } else LANGS.forEach((l, j) => { if (c[j + 1]) out[l].exact[c[0]] = c[j + 1]; });
    n++;
  });
}
fs.mkdirSync('public/i18n', { recursive: true });
LANGS.forEach(l => fs.writeFileSync(`public/i18n/${l}.json`, JSON.stringify(out[l])));
console.log(`i18n: ${n} szöveg, ${LANGS.length} nyelv${bad ? `, ${bad} hibás sor` : ''}`);
if (bad) process.exit(1);
