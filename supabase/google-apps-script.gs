/**
 * Táblatörténet – felhőmentés a doagronomi@gmail.com Google Drive-jába
 * ------------------------------------------------------------------
 * Telepítés (egyszer):
 *  1. script.google.com → Új projekt → ezt a kódot másolja be a Code.gs helyére → Mentés.
 *  2. Felül a függvényválasztóban válassza a "setup" függvényt → Futtatás → engedélyezze.
 *     Létrejön a Drive-on a "Táblatörténet adatok" mappa és a "Táblatörténet – adatok" táblázat.
 *  3. Telepítés → Új telepítés → típus: Webalkalmazás
 *       Végrehajtás: Én (doagronomi@gmail.com)   |   Hozzáférés: Bárki
 *     → Telepítés → a kapott "Webalkalmazás URL"-t (…/exec) másolja ki.
 *  4. A táblázat "Kódok" lapján adhat hozzá partnereket (név + kód). Az ADMIN kódot csak Ön használja.
 *
 * Adatok: táblánként egy JSON-fájl (partnerenként külön almappában), valamint
 * a táblázat "Táblák", "Évek", "Műveletek", "Napló" lapjai (Excelként letölthető).
 */

const ROOT_NAME = 'Táblatörténet adatok';
const SHEET_NAME = 'Táblatörténet – adatok';

function setup() {
  const props = PropertiesService.getScriptProperties();
  let folder = props.getProperty('ROOT') ? DriveApp.getFolderById(props.getProperty('ROOT')) : null;
  if (!folder) { folder = DriveApp.createFolder(ROOT_NAME); props.setProperty('ROOT', folder.getId()); }
  let ss = props.getProperty('SHEET') ? SpreadsheetApp.openById(props.getProperty('SHEET')) : null;
  if (!ss) {
    ss = SpreadsheetApp.create(SHEET_NAME);
    DriveApp.getFileById(ss.getId()).moveTo(folder);
    props.setProperty('SHEET', ss.getId());
  }
  const want = {
    'Kódok': ['Partner neve', 'Kód', 'Admin (igen/nem)', 'Megjegyzés'],
    'Táblák': ['Partner', 'Tábla azonosító', 'Tábla neve', 'Terület (ha)', 'Középpont szélesség', 'Középpont hosszúság', 'Utolsó mentés', 'Eszköz', 'Fájl'],
    'Évek': ['Partner', 'Tábla azonosító', 'Tábla', 'Év', 'Rész', 'Rész ha', 'Növény', 'Hibrid/fajta', 'FAO', 'Vetés', 'Tőszám', 'Aratás', 'Nedvesség %', 'Hozam nedves t/ha', 'Összes t', 'Hozam szabvány t/ha', 'Hozam forrása', 'Megbízhatóság', 'Megjegyzés'],
    'Műveletek': ['Partner', 'Tábla azonosító', 'Tábla', 'Év', 'Dátum', 'Művelet', 'Részek', 'Termék / típus', 'Mennyiség', 'Egység', 'Mód / cél', 'Mélység cm', 'Öntözés mm', 'Megjegyzés'],
    'Napló': ['Időpont', 'Partner', 'Művelet', 'Táblák száma', 'Eszköz']
  };
  Object.keys(want).forEach(name => {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    if (sh.getLastRow() === 0) { sh.appendRow(want[name]); sh.setFrozenRows(1); sh.getRange(1, 1, 1, want[name].length).setFontWeight('bold'); }
  });
  const def = ss.getSheetByName('Sheet1') || ss.getSheetByName('Munkalap1');
  if (def && ss.getSheets().length > 1) ss.deleteSheet(def);
  const codes = ss.getSheetByName('Kódok');
  if (codes.getLastRow() < 2) {
    const admin = 'ADMIN-' + Utilities.getUuid().slice(0, 8).toUpperCase();
    codes.appendRow(['Dorogházi Ottó', admin, 'igen', 'Saját kód – minden partner adatát látja']);
    codes.appendRow(['Minta Partner', 'PARTNER-' + Utilities.getUuid().slice(0, 6).toUpperCase(), 'nem', 'Példa – írja át vagy törölje']);
  }
  Logger.log('Kész. Mappa: ' + folder.getUrl() + '  Táblázat: ' + ss.getUrl());
  Logger.log('Admin kód: ' + codes.getRange(2, 2).getValue());
}

function doGet() { return json({ ok: true, app: 'tablatortenet', msg: 'A felhőmentés működik.' }); }

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json({ ok: false, error: 'Hibás kérés' }); }
  const who = checkCode(body.code);
  if (!who) return json({ ok: false, error: 'Ismeretlen kód' });
  try {
    if (body.action === 'ping') return json({ ok: true, partner: who.name, admin: who.admin });
    if (body.action === 'save') return json(saveFields(who, body.fields || [], body.device || ''));
    if (body.action === 'list') return json(listFields(who));
    if (body.action === 'load') return json(loadFields(who, body.ids || []));
    return json({ ok: false, error: 'Ismeretlen művelet' });
  } catch (err) { return json({ ok: false, error: String(err && err.message || err) }); }
}

/* ---------------- belső függvények ---------------- */
function json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function ss_() { return SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET')); }
function root_() { return DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('ROOT')); }
function checkCode(code) {
  if (!code) return null;
  const rows = ss_().getSheetByName('Kódok').getDataRange().getValues().slice(1);
  for (const r of rows) {
    if (String(r[1]).trim() && String(r[1]).trim() === String(code).trim()) return { name: String(r[0]).trim() || 'Névtelen', admin: /^igen|yes|true|1$/i.test(String(r[2]).trim()) };
  }
  return null;
}
function safe(s) { return String(s || '').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80); }
function partnerFolder(name) {
  const r = root_(); const it = r.getFoldersByName(name);
  return it.hasNext() ? it.next() : r.createFolder(name);
}
function deleteRowsFor(sh, fieldId) {
  const vals = sh.getDataRange().getValues();
  for (let i = vals.length - 1; i >= 1; i--) if (String(vals[i][1]) === String(fieldId)) sh.deleteRow(i + 1);
}
function num(v) { if (v === '' || v == null) return null; const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? null : n; }

function saveFields(who, fields, device) {
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const ss = ss_(); const shT = ss.getSheetByName('Táblák'), shY = ss.getSheetByName('Évek'), shO = ss.getSheetByName('Műveletek');
    const now = new Date(); let n = 0;
    fields.forEach(f => {
      if (!f || !f.id || !Array.isArray(f.geometry)) return;
      const owner = (who.admin && f._owner) ? f._owner : who.name;
      f._owner = owner; f._savedAt = now.toISOString(); f._device = device;
      const folder = partnerFolder(owner); const fname = safe(f.name) + '__' + f.id + '.json';
      const ex = folder.getFilesByName(fname); const content = JSON.stringify(f);
      let file;
      if (ex.hasNext()) { file = ex.next(); file.setContent(content); }
      else {
        // ha a tábla átnevezve: régi fájl törlése azonosító alapján
        const all = folder.getFiles(); while (all.hasNext()) { const x = all.next(); if (x.getName().indexOf('__' + f.id + '.json') > 0) x.setTrashed(true); }
        file = folder.createFile(fname, content, MimeType.PLAIN_TEXT);
      }
      // Táblák lap
      deleteRowsFor(shT, f.id);
      const c = centroid(f.geometry);
      shT.appendRow([owner, f.id, f.name, Math.round((f.areaHa || 0) * 100) / 100, c[0], c[1], now, device, file.getUrl()]);
      // Évek + Műveletek
      deleteRowsFor(shY, f.id); deleteRowsFor(shO, f.id);
      const yRows = [], oRows = [];
      Object.keys(f.seasons || {}).sort().forEach(y => {
        const se = f.seasons[y]; if (!se) return;
        (se.parts || []).forEach(p => yRows.push([owner, f.id, f.name, y, p.label, p.areaHa || '', p.crop || '', p.hybrid || '', p.fao || '', p.sowing || '', p.density || '', p.harvest || '', p.moisture || '', p.yieldWet || '', p.totalT || '', p._yieldStd != null ? p._yieldStd : '', p.src || '', p._conf || '', p.notes || '']));
        (se.ops || []).forEach(o => {
          const pn = (o.parts || ['all']).indexOf('all') >= 0 ? 'Egész tábla' : (o.parts || []).map(id => { const pp = (se.parts || []).find(q => q.id === id); return pp ? pp.label : ''; }).join('+');
          oRows.push([owner, f.id, f.name, y, o.date || '', o.type || '', pn, o.type === 'till' ? (o.kind || '') : (o.custom ? o.cname : (o.product || o.desc || '')), o.amount || o.dose || '', o.unit || '', o.method || o.target || '', o.depth || '', o.mm || '', o.note || '']);
        });
      });
      if (yRows.length) shY.getRange(shY.getLastRow() + 1, 1, yRows.length, yRows[0].length).setValues(yRows);
      if (oRows.length) shO.getRange(shO.getLastRow() + 1, 1, oRows.length, oRows[0].length).setValues(oRows);
      n++;
    });
    ss.getSheetByName('Napló').appendRow([now, who.name, 'mentés', n, device]);
    return { ok: true, saved: n, partner: who.name, at: now.toISOString() };
  } finally { lock.releaseLock(); }
}
function centroid(g) { let a = 0, b = 0; g.forEach(p => { a += p[0]; b += p[1]; }); return [Math.round(a / g.length * 1e6) / 1e6, Math.round(b / g.length * 1e6) / 1e6]; }

function listFields(who) {
  const rows = ss_().getSheetByName('Táblák').getDataRange().getValues().slice(1);
  const out = rows.filter(r => who.admin || String(r[0]) === who.name).map(r => ({ owner: r[0], id: r[1], name: r[2], areaHa: r[3], savedAt: r[6] instanceof Date ? r[6].toISOString() : String(r[6]) }));
  return { ok: true, fields: out, partner: who.name, admin: who.admin };
}
function loadFields(who, ids) {
  const out = []; const want = new Set(ids.map(String));
  const owners = who.admin ? null : [who.name];
  const r = root_(); const folders = r.getFolders();
  while (folders.hasNext()) {
    const fo = folders.next(); if (owners && owners.indexOf(fo.getName()) < 0) continue;
    const files = fo.getFiles();
    while (files.hasNext()) {
      const file = files.next(); const m = file.getName().match(/__([^_]+)\.json$/);
      if (!m || (want.size && !want.has(m[1]))) continue;
      try { out.push(JSON.parse(file.getBlob().getDataAsString())); } catch (err) {}
    }
  }
  return { ok: true, fields: out };
}

/* =====================================================================
 * Supabase ébren tartása (az ingyenes csomag 1 hét tétlenség után szünetel)
 * Beállítás: 1) a lenti két értéket töltse ki, 2) Mentés,
 * 3) bal oldalt ⏰ Eseményindítók → + Eseményindító hozzáadása →
 *    függvény: keepAliveSupabase · eseményforrás: Időalapú · napi időzítő → Mentés
 * ===================================================================== */
const SB_URL = 'https://rmbfykiroxpjuoawhtoo.supabase.co';      // Project URL
const SB_KEY = 'sb_publishable_vr5GtCg7zGAdnXk4dg8wjw_valrCUcd';   // publishable (anon) kulcs – nem a secret/service kulcs!
function keepAliveSupabase() {
  const r = UrlFetchApp.fetch(SB_URL + '/rest/v1/rpc/ping', {
    method: 'post', contentType: 'application/json', payload: '{}',
    headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY }, muteHttpExceptions: true });
  Logger.log('Supabase ping: ' + r.getResponseCode() + ' ' + r.getContentText());
}
