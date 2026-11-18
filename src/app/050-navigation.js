/* ================= navigáció: Tábláim ↔ egy tábla (fülek) =================
 * curTab értékei:
 *   'fields'                         → Tábláim lista
 *   'border' | 'season' | 'export'   → egy tábla fülei
 *   'sat' | 'weather' | 'soil' | 'overview' → az „Elemzés” fül alfülei
 */
let curTab='fields';
const ANALYSIS_TABS=['sat','weather','soil','overview'];
let lastAnalysis='sat';

function go(t){
  if(t==='analysis')t=lastAnalysis;
  if(t!=='fields'&&t!=='stats'&&t!=='account'&&!curField()){t='fields';}
  curTab=t;if(ANALYSIS_TABS.includes(t))lastAnalysis=t;
  const inStats=t==='stats',inAcc=t==='account',inField=t!=='fields'&&!inStats&&!inAcc;
  document.getElementById('v-acc').classList.toggle('on',inAcc);
  document.getElementById('v-list').classList.toggle('on',t==='fields');
  document.getElementById('v-field').classList.toggle('on',inField);
  document.getElementById('v-stats').classList.toggle('on',inStats);
  document.querySelectorAll('#tabs .tab').forEach(b=>b.classList.toggle('on',b.dataset.t===t||(b.dataset.t==='analysis'&&ANALYSIS_TABS.includes(t))||(b.id==='tabMore'&&(t==='border'||t==='export'))));
  const sub=document.getElementById('subtabs');sub.hidden=!ANALYSIS_TABS.includes(t);
  sub.querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.s===t));
  document.querySelectorAll('#v-field .pane').forEach(p=>p.classList.toggle('on',p.id==='p-'+t));
  const hash=inField?`#/tabla/${encodeURIComponent(S.sel)}/${t}`:inStats?'#/statisztika':inAcc?'#/fiok':'#/';
  if(location.hash!==hash&&!location.hash.includes('access_token='))history.replaceState(null,'',location.pathname+location.search+hash);
  renderHeader();renderMap();renderPane();
  const aside=document.querySelector('aside');if(aside)aside.scrollTop=0;
  if(typeof mobApply==='function')mobApply();
  if(typeof renderOnb==='function')renderOnb();
}
document.querySelectorAll('#tabs .tab').forEach(b=>b.onclick=()=>go(b.dataset.t));
document.querySelectorAll('#subtabs button[data-s]').forEach(b=>b.onclick=()=>go(b.dataset.s));
$('#subMore').onclick=()=>{setView(false);go('sat');};
$('#btnView').onclick=()=>setView(!S.simple);
document.querySelectorAll('#viewSw [data-view]').forEach(b=>b.onclick=()=>{const s=b.dataset.view==='simple';if(s!==S.simple)setView(s);});

function renderHeader(){
  const f=curField(),inField=curTab!=='fields'&&curTab!=='stats'&&curTab!=='account'&&f;const back=inField||((curTab==='stats'||curTab==='account')&&!(typeof isMob==='function'&&isMob()));
  $('#hdrBack').hidden=!back;$('#hdrHome').hidden=!!back;$('#hdrStats').hidden=curTab==='stats';
  $('#hdrTitle').innerHTML=curTab==='account'?'<b>Fiók</b><span></span>':curTab==='stats'?'<b>Statisztika</b><span>összesített, anonim adatok</span>':inField?`<b>${esc(fieldLabel(f))}</b><span>${f.settlement?esc(f.settlement)+' · ':''}${fmt(f.areaHa,2)} ha</span>`:'';
  const ys=$('#hdrYear');ys.hidden=!(inField&&curTab!=='border'&&curTab!=='export');
  ys.innerHTML=YEARS.map(y=>`<option ${y==S.year?'selected':''}>${y}</option>`).join('');
  renderYBar(!ys.hidden);
  // a régi kódrészek a #hdrField-et is frissítik – rejtett, csak kompatibilitás miatt
  $('#hdrField').innerHTML=S.fields.map(x=>`<option value="${x.id}" ${x.id===S.sel?'selected':''}>${esc(fieldLabel(x))}</option>`).join('');
}
$('#hdrYear').onchange=e=>setYear(+e.target.value);
function setYear(y){if(!(y<=THIS_YEAR&&y>=Math.min(...YEARS)))return;S.year=y;save();renderAll();}
/* telefonon: egyetlen évváltó sáv a fülek alatt (◀ év ▶) – a fejléc évválasztója és a lap címe ilyenkor rejtve */
function renderYBar(show){const b=$('#yBar');if(!b)return;b.hidden=!show;if(!show){b.innerHTML='';return;}
  const mn=Math.min(...YEARS);
  b.innerHTML=`<button class="yb" id="ybPrev" ${S.year<=mn?'disabled':''} aria-label="Előző év">◀</button>
    <select class="ybSel" id="ybSel" aria-label="Év">${YEARS.map(y=>`<option ${y==S.year?'selected':''}>${y}</option>`).join('')}</select>
    <button class="yb" id="ybNext" ${S.year>=THIS_YEAR?'disabled':''} aria-label="Következő év">▶</button>`;
  $('#ybPrev').onclick=()=>setYear(S.year-1);$('#ybNext').onclick=()=>setYear(S.year+1);$('#ybSel').onchange=e=>setYear(+e.target.value);}
/* telefonon a Határ és az Export a „⋯” menüben van */
$('#tabMore').onclick=()=>{modal(`<h2>${esc(fieldLabel(curField()))}</h2><div class="accList moreList">
    <button class="accItem" data-g="border"><span class="ai">📐</span><span class="at"><span>Határ</span><small>határ módosítása, név, azonosítók</small></span><span class="ac">›</span></button>
    <button class="accItem" id="mlView"><span class="ai">🎚</span><span class="at"><span>${S.simple?'Szakértői nézet':'Egyszerű nézet'}</span><small>${S.simple?'műhold, termőzónák, kijuttatási térkép, hibrid-összehasonlítás':'csak tábla, évek, időjárás, jelentés'}</small></span><span class="ac">›</span></button>
    <button class="accItem" data-g="export"><span class="ai">⬇</span><span class="at"><span>Export</span><small>CSV, GeoJSON, shapefile, jelentés</small></span><span class="ac">›</span></button>
  </div><div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn" id="mlX">Bezár</button></div>`);
  $('#mlX').onclick=closeModal;$('#mlView').onclick=()=>{closeModal();setView(!S.simple);};document.querySelectorAll('.moreList [data-g]').forEach(b=>b.onclick=()=>{closeModal();go(b.dataset.g);});};
$('#hdrBack').onclick=()=>{endMode();go('fields');const f=curField();if(S.fields.length)fitAll();};
$('#hdrHome').onclick=()=>{endMode();go('fields');fitAll();};
$('#hdrUser').onclick=()=>userMenu();

function selectField(id,tab){S.sel=id;save();endMode();go(tab||'season');fit(curField());}
function fitAll(){if(!S.fields.length)return;const b=L.latLngBounds([]);S.fields.forEach(f=>b.extend(L.polygon(f.geometry).getBounds()));if(b.isValid())map.fitBounds(b,{padding:[30,30],maxZoom:16});}

/* ---- Új tábla: itt állok, rajzolás, koppintás, gépi adat; fájl és mappa lenyitva ---- */
$('#btnNew').onclick=()=>{modal(`<h2>Új tábla</h2><p class="help">Hogyan adja meg a tábla határát?</p>
  <div class="bigbtns">
   ${navigator.geolocation?`<button class="bigbtn" id="nwHere">📍<b>Itt állok a táblán</b><span>a telefon helyzetéből a program megrajzolja a határt</span></button>`:''}
   <button class="bigbtn" id="nwDraw">✏️<b>Rajzolás</b><span>koppintson a sarokpontokra</span></button>
   <button class="bigbtn" id="nwAuto">🪄<b>Koppintás a térképen</b><span>koppintson a tábla közepére, a program megrajzolja</span></button>
   <button class="bigbtn" id="nwMach">🚜<b>Gépi adatból</b><span>kombájn hozamtérképe, vetőgép vetési térképe – lépésről lépésre, gépmárka szerint</span></button>
  </div>
  <details class="nwMore"><summary>További lehetőségek: fájl, mappa</summary><div class="bigbtns" style="margin-top:8px">
   <button class="bigbtn" id="nwFile">⬆<b>Fájlból</b><span>Shapefile, KML, GeoJSON, gépi adat (ISO-XML, John Deere CSV vagy .jdl napló) vagy mentés</span></button><button class="bigbtn folderOnly" id="nwDir">📁<b>Mappából</b><span>egy teljes export-mappa: kombájn, vetőgép, John Deere</span></button>
  </div></details><div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn" id="nwC">Mégse</button></div>`);
  $('#nwC').onclick=closeModal;
  $('#nwAuto').onclick=()=>{closeModal();mobileShowMap();startAuto();};
  const nh=$('#nwHere');if(nh)nh.onclick=()=>{closeModal();mobileShowMap();toast('Helymeghatározás…');
    navigator.geolocation.getCurrentPosition(p=>{const la=p.coords.latitude,ln=p.coords.longitude;map.setView([la,ln],16);startAuto();setTimeout(()=>autoAt(la,ln),400);},
      e=>{toast('A helyzet nem határozható meg ('+(e.message||'nincs engedély')+'). Koppintson a táblára a térképen.');startAuto();},{enableHighAccuracy:true,timeout:15000,maximumAge:30000});};
  $('#nwDraw').onclick=()=>{closeModal();mobileShowMap();$('#btnDraw').click();};
  $('#nwMach').onclick=()=>{closeModal();machineGuide();};
  $('#nwFile').onclick=()=>{closeModal();$('#fileIn').click();};const nd=$('#nwDir');if(nd)nd.onclick=()=>{closeModal();$('#dirIn').click();};};
/* ---- Gépi adat beolvasása: útmutató gépmárka szerint ---- */
const MACH_GUIDE=[
 {id:'jd',ico:'🟩',name:'John Deere',ok:'Tesztelve: Operations Center export és a kijelző USB-s naplója (aratás).',steps:[
   '<b>Legjobb: Operations Center.</b> Az Operations Center weboldalán exportálja a tábla munkáját (aratás, vetés) Shapefile formában. A letöltött ZIP-et a Fájl kiválasztása gombbal olvassa be – több ZIP egyszerre is mehet.',
   '<b>Közvetlenül a kijelzőről (pendrive):</b> a pendrive-on van egy <code>JD-Data</code> mappa. Számítógépen a Mappa kiválasztása gombbal válassza ki magát a <code>JD-Data</code> mappát. A táblánkénti naplókból a program aratási térképet készít (kísérleti, vetést még nem olvas).',
   'Ha a kijelző shapefile-t is tud exportálni, az is jó: a pendrive mappáját válassza ki.']},
 {id:'cnh',ico:'🟥',name:'Case IH / New Holland / Steyr',ok:'Tesztelve: AFS Pro 700 ISO-XML (aratás, vetés).',steps:[
   'A kijelző adatexport funkciójával mentse a munkákat ISO-XML formában pendrive-ra.',
   'A pendrive-on egy <code>TASKDATA</code> mappa jön létre (néha ZIP-be csomagolva). Számítógépen ezt a mappát (vagy azt, amelyben van) válassza ki a Mappa kiválasztása gombbal, telefonon a ZIP-et a Fájl kiválasztása gombbal.',
   'Ha AFS Connect (felhő) van: ott is lehet ISO-XML-t vagy shapefile-t exportálni, ugyanígy olvasható be.']},
 {id:'iso',ico:'🟨',name:'Claas, Fendt, Massey Ferguson, egyéb ISOBUS terminál',ok:'Szabványos ISO-XML: elvileg ugyanúgy működik, mint a Case IH, de ezekkel a márkákkal még nem próbáltuk – ha hibát ad, kérjük, jelezze.',steps:[
   'A terminálon exportálja a munkákat ISO-XML (TASKDATA) formában pendrive-ra.',
   'Számítógépen a TASKDATA mappát a Mappa kiválasztása gombbal, telefonon a ZIP-et a Fájl kiválasztása gombbal olvassa be.']},
 {id:'shp',ico:'⬜',name:'Egyéb (Trimble, Ag Leader, Topcon, felhős rendszerek)',ok:'Shapefile-t vagy CSV-t olvas, ha a fájlban van koordináta és hozam- vagy vetésnorma-oszlop; ezekkel a rendszerekkel még nem próbáltuk.',steps:[
   'Exportáljon shapefile-t (egy ZIP-ben a .shp, .dbf, .shx, .prj fájlokkal) vagy ISO-XML-t.',
   'A ZIP-et a Fájl kiválasztása gombbal, a mappát a Mappa kiválasztása gombbal olvassa be.']}];
function machineGuide(sel){const g=MACH_GUIDE.find(x=>x.id===sel);
  if(!g){modal(`<h2>🚜 Gépi adat beolvasása</h2><p class="help">Milyen gépről vagy kijelzőről származik az adat?</p>
    <div class="bigbtns">${MACH_GUIDE.map(x=>`<button class="bigbtn" data-mg="${x.id}">${x.ico}<b>${x.name}</b><span>${x.ok}</span></button>`).join('')}</div>
    <p class="help" style="margin-top:10px">A fájlok nem kerülnek fel a szerverre: a program a böngészőben dolgozza fel őket, a felhőbe csak a kész tábla és térkép kerül. Ezért a több GB-os mappa sem gond.</p>
    <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn" id="mgC">Mégse</button></div>`);
    document.querySelectorAll('[data-mg]').forEach(b=>b.onclick=()=>machineGuide(b.dataset.mg));$('#mgC').onclick=closeModal;return;}
  const mob=document.documentElement.classList.contains('mob');
  modal(`<h2>${g.ico} ${g.name}</h2><ol class="mgSteps">${g.steps.map(t=>`<li>${t}</li>`).join('')}</ol>
    <p class="help">${g.ok}</p>${mob?`<p class="help">Telefonon mappát nem lehet kiválasztani – a ZIP-fájlt válassza, vagy olvassa be számítógépről.</p>`:''}
    <p class="help">Beolvasás után a program megmutatja, mit talált: új tábla lesz belőle, vagy egy meglévő táblához kerül. Csak az üres mezőket tölti ki.</p>
    <div class="row" style="justify-content:space-between;margin-top:12px;flex-wrap:wrap;gap:6px"><button class="btn" id="mgB">← Másik gép</button>
    <span class="row" style="gap:6px;flex-wrap:wrap">${mob?'':'<button class="btn primary" id="mgDir">📁 Mappa kiválasztása</button>'}<button class="btn ${mob?'primary':''}" id="mgFile">⬆ Fájl kiválasztása</button></span></div>`);
  $('#mgB').onclick=()=>machineGuide();$('#mgFile').onclick=()=>{closeModal();$('#fileIn').click();};const d=$('#mgDir');if(d)d.onclick=()=>{closeModal();$('#dirIn').click();};}
// telefonon: ha a lista (vagy más, térkép nélküli nézet) látszik, előbb a térképre vált, különben a koppintás a listába menne
function mobileShowMap(){if(typeof isMob==='function'&&isMob()){const v=mobView();if(v!=='map'&&v!=='field'){MOBTAB='map';go('fields');}return;}
  if(window.innerWidth<900)document.getElementById('mapWrap').scrollIntoView({behavior:'smooth'});}

/* ---- Határ fül ---- */
function renderBorder(){const f=curField(),el=$('#borderBox');if(!f){el.innerHTML='';return;}
  const a=ANA[f.id];
  el.innerHTML=`<div class="kv">
     <div><span>Táblakód</span><b>${esc(f.code&&!f.code.startsWith('TMP-')?f.code:'– (mentéskor kapja)')}</b></div>
     <div><span>Saját név</span><b>${esc(f.name||'–')}</b></div>
     <div><span>Település</span><b>${esc(f.settlement||'–')}${f.county?', '+esc(f.county):''}</b></div>
     ${fCountry(f)!=='hu'?`<div><span>Kataszteri község</span><b>${esc(f.ko||'–')}</b></div>`:''}
     <div><span>${fCountry(f)==='hu'?'Helyrajzi szám':'Parcellaszám'}</span><b>${esc(f.hrsz||'–')}</b></div>
     ${fCountry(f)==='hu'?`<div><span>MePAR blokk</span><b>${esc(f.mepar||'–')}</b></div>`:''}
     <div><span>Terület</span><b>${fmt(f.areaHa,2)} ha</b></div>
     <div><span>Határ forrása</span><b>${esc(f.src||'kézi rajz / import')}</b></div>
     ${f._ownerName&&isAdmin()?`<div><span>Termelő</span><b>${esc(f._ownerName)}</b></div>`:''}
   </div>${parcelBoxHTML(f)}
   <div class="bigbtns" style="margin-top:14px">
     <button class="bigbtn" id="bdGeo">📐<b>Határ módosítása</b><span>pontok húzása, új pont, törlés</span></button>
     <button class="bigbtn" id="bdRen">✎<b>Név, azonosítók, település</b><span>helyrajzi szám, MePAR blokk, adatok szerkesztése</span></button>
   </div>
   <p class="help" style="margin-top:12px">${a?`Termőzónák elkészültek (${a.years.length} év alapján) – lásd: <a href="#" id="bdAna">Elemzés</a>.`:'A műholdas elemzés a határ megadása után automatikusan elindul.'}</p>
   <details class="more"><summary>Veszélyes műveletek</summary><button class="btn sm danger" id="bdDel" style="margin-top:8px">🗑 Tábla törlése</button></details>`;
  $('#bdGeo').onclick=()=>{mobileShowMap();editGeom(f);};
  $('#bdRen').onclick=()=>renameDialog(f);
  bindParcelBox(f);
  const an=$('#bdAna');if(an)an.onclick=e=>{e.preventDefault();go('sat');};
  $('#bdDel').onclick=()=>confirmBox('Tábla törlése',`Biztosan törli: <b>${esc(fieldLabel(f))}</b>? Minden évadata törlődik.`,'Törlés',()=>{
    deleteFields([f.id]);S.sel=null;go('fields');toast('Tábla törölve');});}

/* ---- Fiók menü (fejléc 👤) ---- */
function langSelectHTML(id){const L=(window.I18N&&I18N.langs)||{hu:'Magyar'};const cur=(window.I18N&&I18N.lang)||'hu';
  return `<select class="input langSel" id="${id}" data-noi18n title="Nyelv / Language">${Object.entries(L).map(([k,v])=>`<option value="${k}" ${k===cur?'selected':''}>🌐 ${v}</option>`).join('')}</select>`;}
function bindLangSelect(id){const s=document.getElementById(id);if(s)s.onchange=()=>window.I18N&&I18N.set(s.value);}
function langDialog(){modal(`<h2 data-noi18n>🌐 Nyelv · Language</h2>${langSelectHTML('umLangSel')}<div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn" id="lgdC">Bezár</button></div>`);bindLangSelect('umLangSel');$('#lgdC').onclick=closeModal;}
function userMenu(){
  if(!SB_ON)return toast('A központi fiók nincs bekapcsolva.');
  if(!SESS)return loginScreen();
  const p=PROFILE||{};
  modal(`<h2>👤 ${esc(p.full_name||p.email||'Fiók')}</h2><div class="meta">${esc(p.email||'')}${p.farm_name?' · '+esc(p.farm_name):''}${isAdmin()?' · <span class="tag">admin</span>':''}</div>
   <div class="meta" id="umSt" style="margin-top:8px"></div>
   <div class="bigbtns" style="margin-top:12px">
    <button class="bigbtn" id="umPull">⬇<b>Frissítés</b><span>adatok letöltése a szerverről</span></button>
    <button class="bigbtn" id="umProf">👤<b>Profil</b><span>név, gazdaság, telefon</span></button>
    <button class="bigbtn" id="umExp">⬇<b>Adataim letöltése</b><span>minden tábla, évadat és a profil egy fájlban</span></button>
    <button class="bigbtn" id="umDemo">🧪<b>Demó nézet</b><span>kipróbálás kitalált adatokkal</span></button>
    <button class="bigbtn" id="umGdpr">🔒<b>Adatkezelés</b><span>hozzájárulás, tájékoztató</span></button>
    <button class="bigbtn" id="umLang" data-noi18n>🌐<b>${esc((window.I18N&&I18N.langs[I18N.lang])||'Magyar')}</b><span>Nyelv · Language</span></button>
   </div>
   <div class="row" style="justify-content:space-between;margin-top:14px;flex-wrap:wrap;gap:8px"><span class="row" style="gap:8px"><button class="btn" id="umOut">Kijelentkezés</button><button class="btn danger" id="umDel">🗑 Fiókom törlése</button></span><button class="btn primary" id="umC">Bezár</button></div>`);
  $('#umSt').innerHTML=$('#statusLine').innerHTML;$('#umLang').onclick=()=>{closeModal();langDialog();};
  $('#umC').onclick=closeModal;$('#umPull').onclick=()=>{closeModal();acctPull(false);};
  $('#umProf').onclick=profileDialog;$('#umGdpr').onclick=gdprDialog;$('#umDemo').onclick=()=>{closeModal();demoEnterDialog();};$('#umExp').onclick=exportMyData;$('#umDel').onclick=()=>{closeModal();deleteAccountDialog();};
  $('#umOut').onclick=()=>{closeModal();acctLogout();};}

/* ---- útvonal a címsorból (#/tabla/<id>/<fül>) ---- */
function routeFromHash(){if(/^#\/fiok/.test(location.hash))return 'account';if(/^#\/statisztika/.test(location.hash))return 'stats';const m=location.hash.match(/^#\/tabla\/([^/]+)\/?(\w+)?/);if(m){const id=decodeURIComponent(m[1]);if(S.fields.some(f=>f.id===id)){S.sel=id;return m[2]||'season';}}return 'fields';}
