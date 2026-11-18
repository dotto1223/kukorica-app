/* ================= storage ================= */
// Demó nézet: külön helyi tár, kitalált adatok, szerverrel nem szinkronizál
var DEMO=(()=>{try{return localStorage.getItem('tt.demo')==='1';}catch(e){return false;}})();
const KEY=DEMO?'tablatortenet.demo':'tablatortenet.v3';
let S={fields:[],sel:null,year:THIS_YEAR-1,idx:'NDVI',view:'zones'};
function load(){
  try{const s=localStorage.getItem(KEY);if(s){const v=JSON.parse(s);if(v&&Array.isArray(v.fields)){S=Object.assign(S,v);return;}}}catch(e){}
  try{const o=localStorage.getItem('tablatortenet.v1');if(o){const v=JSON.parse(o);if(v&&Array.isArray(v.fields)){S.fields=v.fields.map(migrateV1);S.sel=v.selected||null;save();}}}catch(e){}
}
function migrateV1(f){
  const nf={id:f.id||uid(),name:f.name,geometry:f.geometry,areaHa:f.areaHa,seasons:{},notes:(f.spatialNotes||[]).join('\n')};
  (f.seasons||[]).forEach(s=>{const se=newSeason(nf);const p=se.parts[0];p.crop=s.crop||'';p.hybrid=s.variety||'';p.sowing=s.sowing_date||'';p.yieldStd=s.yield_t_ha??null;p.notes=s.events||'';nf.seasons[s.year]=se;});
  return nf;
}
function save(){try{localStorage.setItem(KEY,JSON.stringify(S));}catch(e){toast('Mentési hiba: a böngésző tárhelye megtelt vagy le van tiltva.');return;}try{cloudAfterSave();}catch(e){}let fj='';try{fj=JSON.stringify(S.fields);}catch(e){}if(fj!==LASTFJ){const first=LASTFJ===null;LASTFJ=fj;if(!first)saveInd('local');}}
let LASTFJ=null;
/* „Mentve ✓” jelzés: helyi mentés azonnal, felhő a feltöltés után; betöltéskor (első 3 mp) nem jelez */
const T0=Date.now();let saveIndT=null;
function saveInd(st,txt){if(Date.now()-T0<3000&&st==='local')return;let el=document.getElementById('saveInd');
  if(!el){el=document.createElement('div');el.id='saveInd';el.setAttribute('role','status');el.setAttribute('aria-live','polite');document.body.appendChild(el);}
  const cloud=typeof SB_ON!=='undefined'&&SB_ON&&typeof SESS!=='undefined'&&SESS;
  const M={local:cloud?['…','Mentés…','busy']:['✓','Mentve ezen az eszközön','ok'],cloud:['✓','Mentve','ok'],err:['!','Mentve ezen az eszközön – internet nélkül, később feltöltjük','warn'],pull:['↻',txt||'Frissítve','ok']}[st];if(!M)return;
  el.className='saveInd on '+M[2];el.innerHTML=`<b>${M[0]}</b> <span>${M[1]}</span>`;clearTimeout(saveIndT);
  saveIndT=setTimeout(()=>el.classList.remove('on'),st==='err'?5000:st==='local'&&cloud?8000:2200);}
