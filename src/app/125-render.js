/* ================= render ================= */
function renderPane(){if(curTab==='fields')renderFields();if(curTab==='border')renderBorder();if(curTab==='season')renderSeason();if(curTab==='weather')renderWeather();if(curTab==='sat')renderSat();if(curTab==='soil')renderSoil();if(curTab==='overview')renderOverview();if(curTab==='stats')renderStats();if(curTab==='account')renderAcc();}
// Az Egyszerű/Részletes kapcsoló megszűnt: a ritkán kellő mezők lenyitható blokkokban vannak.
/* egyszerű / szakértői nézet: egyszerűben a műhold, a termőzóna, a kijuttatási térkép, a hibrid-összehasonlítás és a GIS-exportok rejtve */
function viewPref(){try{return localStorage.getItem('tt.view');}catch(e){return null;}}
function applyMode(){const v=viewPref();S.simple=v?v==='simple':!(typeof isAdmin==='function'&&isAdmin());document.body.classList.toggle('simple',S.simple);
  if(S.simple&&lastAnalysis==='sat')lastAnalysis='weather';document.querySelectorAll('#viewSw [data-view]').forEach(x=>x.classList.toggle('on',(x.dataset.view==='simple')===S.simple));const b=document.getElementById('btnView');if(b)b.textContent=S.simple?'🎚 Szakértői nézet bekapcsolása':'🎚 Egyszerű nézet';}
function setView(simple,silent){try{localStorage.setItem('tt.view',simple?'simple':'expert');}catch(e){}applyMode();
  if(S.simple&&curTab==='sat')go('weather');else renderAll();if(!silent)toast(simple?'Egyszerű nézet':'Szakértői nézet: műhold, termőzónák, kijuttatási térkép, hibrid-összehasonlítás');}
function renderAll(){applyMode();renderHeader();renderMap();renderPane();renderOnb();}
if('serviceWorker' in navigator&&location.protocol==='https:'){navigator.serviceWorker.register('sw.js').catch(()=>{});}
load();if(DEMO&&typeof demoSeed==='function')demoSeed();{const t=routeFromHash();applyMode();go(t);}
Promise.all(S.fields.map(x=>loadAna(x).catch(()=>null))).then(()=>{if(curTab==='fields')renderFields();});
if(curTab!=='fields'&&curField())fit(curField());else startView();
$('#btnReport').onclick=()=>{const f=curField();if(f)openReport(f);};
