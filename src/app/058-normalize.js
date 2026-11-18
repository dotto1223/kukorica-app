/* ===== Bevitt adatok egységesítése: számok (pont/vessző), nevek (szóköz → _), hibrid-/fajtanevek ===== */
// Szám: "10,4" = "10.4"; szóköz/ezres tagolás megengedett ("72 000", "72.000" egész mezőnél).
function parseNumHU(v,intField){if(v==null)return null;let s=String(v).trim().replace(/[\s  ']/g,'');if(!s)return null;
  s=s.replace(/[^0-9.,\-]/g,'');if(!s)return null;
  const lc=s.lastIndexOf(','),ld=s.lastIndexOf('.');
  if(lc>=0&&ld>=0){const dec=lc>ld?',':'.';const th=dec===','?'.':',';s=s.split(th).join('').replace(dec,'.');}
  else if(lc>=0){s=(s.split(',').length>2)?s.split(',').join(''):s.replace(',','.');}
  else if(ld>=0&&s.split('.').length>2)s=s.split('.').join('');
  else if(intField&&/^\d{1,3}\.\d{3}$/.test(s))s=s.replace('.','');
  const n=parseFloat(s);return isNaN(n)?null:n;}
const NUM_KEYS={yieldWet:0,totalT:0,moisture:0,stdM:0,areaHa:0,density:0,stand:0,tkm:0,fao:1};
function normNumStr(v,intField){if(v==null||String(v).trim()==='')return '';const n=parseNumHU(v,intField);if(n==null)return null;return String(intField?Math.round(n):+n.toFixed(4));}
const numDisp=v=>v==null||v===''?'':String(v).replace('.',',');

// Név: felesleges szóközök ki, a szóközök helyén alsó vonal.
/* letölthető adatokhoz (QGIS, ArcGIS, Python): ékezet nélkül, szóköz helyett alsó vonal, csak ASCII. A számok változatlanok. */
const ASC_MAP={'ß':'ss','Æ':'AE','æ':'ae','Ø':'O','ø':'o','Ł':'L','ł':'l','Đ':'D','đ':'d','Œ':'OE','œ':'oe','–':'-','—':'-','„':'"','”':'"','“':'"','’':"'"};
function asc(v){if(v==null||typeof v!=='string')return v;
  let s=v.replace(/[ßÆæØøŁłĐđŒœ–—„”“’]/g,c=>ASC_MAP[c]).normalize('NFKD').replace(/[\u0300-\u036f]/g,'');
  // cirill betűk átírása (ukrán felület)
  const CY='А:A,Б:B,В:V,Г:H,Ґ:G,Д:D,Е:E,Є:Ye,Ж:Zh,З:Z,И:Y,І:I,Ї:Yi,Й:Y,К:K,Л:L,М:M,Н:N,О:O,П:P,Р:R,С:S,Т:T,У:U,Ф:F,Х:Kh,Ц:Ts,Ч:Ch,Ш:Sh,Щ:Shch,Ь:,Ю:Yu,Я:Ya,Ы:Y,Э:E,Ё:Yo,Ъ:';
  if(/[\u0400-\u04ff]/.test(s)){const m={};CY.split(',').forEach(x=>{const [a,b]=x.split(':');m[a]=b;m[a.toLowerCase()]=b.toLowerCase();});s=s.replace(/[\u0400-\u04ff]/g,c=>m[c]!=null?m[c]:'_');}
  return s.replace(/\s+/g,'_').replace(/[^A-Za-z0-9_.,\/:+%-]/g,'_').replace(/_+/g,'_').replace(/^_|_$/g,'');}
const ascProps=o=>{const r={};for(const k in o)r[k]=asc(o[k]);return r;};
const ascGeo=fc=>Object.assign({},fc,{features:(fc.features||[]).map(ft=>Object.assign({},ft,{properties:ascProps(ft.properties||{})}))});
function normName(s){return String(s||'').trim().replace(/\s+/g,'_').replace(/_+/g,'_');}
// Hibrid/fajta: „dkc 4897”, „DKC4897”, „Dkc-4897” → „DKC_4897”; egyéb név: szóközök → _ (kis-/nagybetű marad).
function normHybrid(s){let t=String(s||'').trim();if(!t)return '';
  const m=t.match(/^([A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű]{2,5})[\s_\-.]*(\d.*)$/);
  if(m)t=m[1].toUpperCase()+'_'+m[2].trim().replace(/\s+/g,'_');
  return t.replace(/\s+/g,'_').replace(/_+/g,'_');}
const hybKey=h=>String(h||'').toUpperCase().replace(/[\s\-_.]/g,'');

/* --- ismert nevek (szerverről: jóváhagyottak + legalább 2 termelőnél előforduló) --- */
let HYB=null,HYB_AT=0;
async function loadHybrids(force){if(DEMO)return HYB||[];if(!SB_ON||!SESS||!PROFILE)return HYB||[];if(!force&&HYB&&Date.now()-HYB_AT<10*60e3)return HYB;
  try{HYB=await rpc('hybrid_names',{});HYB_AT=Date.now();}catch(e){HYB=HYB||[];}return HYB;}
function knownHybrids(){const m=new Map();(HYB||[]).forEach(h=>{if(h.approved||h.no>=2)m.set(h.key,h.name);});
  S.fields.forEach(f=>Object.values(f.seasons||{}).forEach(se=>se.parts.forEach(p=>{if(p.hybrid&&!p.hybridReview){const k=hybKey(p.hybrid);if(!m.has(k))m.set(k,p.hybrid);}})));return m;}
function lev(a,b){if(a===b)return 0;const m=a.length,n=b.length;if(Math.abs(m-n)>2)return 9;let prev=Array.from({length:n+1},(_,j)=>j);
  for(let i=1;i<=m;i++){const cur=[i];for(let j=1;j<=n;j++)cur[j]=Math.min(prev[j]+1,cur[j-1]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));prev=cur;}return prev[n];}
// hasonló, ismert név keresése (1 karakter eltérés, vagy felcserélt számjegy)
function similarHybrid(name){const k=hybKey(name);const known=knownHybrids();if(!k||known.has(k))return null;let best=null,bd=9;
  known.forEach((nm,kk)=>{if(kk===k)return;const d=lev(k,kk);if(d<bd){bd=d;best=nm;}});return bd<=1?best:null;}
function isKnownHybrid(name){return knownHybrids().has(hybKey(name));}

/* Hibrid megadásakor: egységesítés + elírás-gyanú kérdés. cb(végleges név, ellenőrzendő-e) */
function hybridAsk(raw,cb){const n=normHybrid(raw);if(!n){cb('',false);return;}
  const known=knownHybrids();const k=hybKey(n);if(known.has(k)){cb(known.get(k),false);return;}
  const sim=similarHybrid(n);
  if(!sim){cb(n,true);return;}
  modal(`<h2>Elírás lehet?</h2><p>A „${esc(n)}” nevet még nem ismeri a rendszer. Erre gondolt:</p>
    <div class="row" style="margin:10px 0;gap:8px;flex-wrap:wrap"><button class="btn primary" id="hyYes">✓ ${esc(sim)}</button><button class="btn" id="hyNo">Nem, a „${esc(n)}” helyes</button></div>
    <p class="help">Ha a megadott név helyes, megtartjuk, és az adminisztrátor felülvizsgálja.</p>`);
  $('#hyYes').onclick=()=>{closeModal();cb(sim,false);};$('#hyNo').onclick=()=>{closeModal();cb(n,true);};}

/* Meglévő adatok egyszeri egységesítése (régebbi bevitelekhez) */
function normalizeAll(){let ch=0;S.fields.forEach(f=>{const nn=normName(f.name);if(f.name&&nn!==f.name){f.name=nn;ch++;}
  Object.values(f.seasons||{}).forEach(se=>se.parts.forEach(p=>{if(p.hybrid){const h=normHybrid(p.hybrid);if(h!==p.hybrid){p.hybrid=h;ch++;}}
    Object.keys(NUM_KEYS).forEach(k=>{if(p[k]!=null&&p[k]!==''){const v=normNumStr(p[k],NUM_KEYS[k]);if(v!=null&&v!==String(p[k])){p[k]=v;ch++;}}});}));});
  if(ch)save();return ch;}

function fillHybList(f,year){let dl=document.getElementById('hybList');if(!dl){dl=document.createElement('datalist');dl.id='hybList';document.body.appendChild(dl);}
  const crop=f&&f.seasons&&f.seasons[year]&&f.seasons[year].parts.map(p=>p.crop).find(Boolean);const m=new Map();
  (HYB||[]).forEach(h=>{if((h.approved||h.no>=2)&&(!crop||!h.crop||h.crop===crop))m.set(h.key,h.name);});knownHybrids().forEach((nm,k)=>{if(!m.has(k))m.set(k,nm);});
  dl.innerHTML=[...m.values()].sort().slice(0,400).map(n=>`<option value="${esc(n)}">`).join('');}

/* Növénynév: tárolás egységesen (magyar lista), megjelenítés a választott nyelven */
const T_=s=>(window.I18N?I18N.t(s):s);
const cropDisp=c=>c?T_(c):'';
function cropCanon(v){const t=String(v||'').trim();if(!t)return '';const lc=t.toLowerCase();
  const hit=CROPS.find(c=>c.toLowerCase()===lc||T_(c).toLowerCase()===lc);return hit||t;}
