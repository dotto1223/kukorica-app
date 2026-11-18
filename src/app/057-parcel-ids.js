/* ===== Parcella-azonosítók: helyrajzi szám / kataszteri parcellaszám, MePAR blokk, kataszteri község =====
   Keresés ezekre a listában, másolás, és megnyitás a hivatalos nézegetőben (ahol ellenőrzött a cím). */
const OFFICIAL_VIEWERS={
  rs:{name:'GeoSrbija (RGZ)',url:'https://a3.geosrbija.rs/'},
  hr:{name:'Uređena zemlja (DGU)',url:'https://oss.uredjenazemlja.hr/'}
  // hu: a Lechner HRSZ-kereső / MePAR böngésző címe ellenőrzés után kerül ide
};
function fCountry(f){return String((f&&f.country)||'hu').toLowerCase();}
function idNorm(s){return String(s||'').toLowerCase().replace(/[\s\-–._]/g,'');}
function idList(s){return String(s||'').split(/[,;\n]+/).map(x=>x.trim()).filter(Boolean);}
function parcelIdsOf(f){return [...idList(f.hrsz).map(v=>({k:'hrsz',v})),...idList(f.mepar).map(v=>({k:'mepar',v}))];}
/* a keresőnek: nyers és „összevont” (szóköz, kötőjel, pont nélküli) alak is */
function idHay(f){return [f.ko||'',...parcelIdsOf(f).flatMap(x=>[x.v,idNorm(x.v)])].join(' ').toLowerCase();}
function idExact(f,q){const n=idNorm(q);if(n.length<2)return false;return parcelIdsOf(f).some(x=>idNorm(x.v)===n);}
function parcelLabel(f){return fCountry(f)==='hu'?'Helyrajzi szám(ok)':'Kataszteri parcellaszám(ok)';}
function copyText(t){const ok=()=>toast('Vágólapra másolva: '+t);
  if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).then(ok,()=>copyFallback(t,ok));}else copyFallback(t,ok);}
function copyFallback(t,ok){try{const a=document.createElement('textarea');a.value=t;a.setAttribute('readonly','');a.style.position='fixed';a.style.opacity='0';document.body.appendChild(a);a.select();document.execCommand('copy');a.remove();ok();}catch(e){toast(t);}}

/* Határ fül: azonosítók chipként (koppintásra másol) + hivatalos térkép gomb */
function parcelBoxHTML(f){const ids=parcelIdsOf(f);const v=OFFICIAL_VIEWERS[fCountry(f)];
  const pre=fCountry(f)==='hu'?(f.settlement?f.settlement+' ':''):((f.ko||f.settlement)?(f.ko||f.settlement)+' ':'');
  const chip=(x)=>`<button class="chipBtn pid" data-copy="${esc(x.k==='hrsz'?pre+x.v:x.v)}" title="Másolás">${x.k==='mepar'?'MePAR ':''}${esc(x.v)} <span aria-hidden="true">⧉</span></button>`;
  if(!ids.length&&!v)return '';
  return `<div class="pidBox"><div class="meta">${ids.length?'Azonosítók – koppintson a másoláshoz:':'Még nincs megadva azonosító.'}</div>
    ${ids.length?`<div class="pidRow">${ids.map(chip).join('')}</div>`:''}
    ${v?`<button class="btn sm" id="pidOpen">🗺 Megnyitás itt: <span data-noi18n>${esc(v.name)}</span></button>`:''}</div>`;}
function bindParcelBox(f){document.querySelectorAll('.pidBox [data-copy]').forEach(b=>b.onclick=()=>copyText(b.dataset.copy));
  const o=$('#pidOpen');if(o)o.onclick=()=>{const v=OFFICIAL_VIEWERS[fCountry(f)];const first=parcelIdsOf(f).find(x=>x.k==='hrsz');
    if(first)copyText(((f.ko||f.settlement)?(f.ko||f.settlement)+' ':'')+first.v);window.open(v.url,'_blank','noopener');};}
