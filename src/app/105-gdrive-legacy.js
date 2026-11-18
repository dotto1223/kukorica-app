/* ================= felhő (Google Drive, doagronomi) ================= */
const DEFAULT_CLOUD_URL='https://script.google.com/macros/s/AKfycbwGSNQ1DnuFQRgdunE3sROb1aNVszT1YlptMnNASl0oMOLjOjRQWIukYyuK1JofgnE2XQ/exec';/*CLOUD_URL*/
const CLOUD_KEY='tt.cloud',CLOUD_SYNC_KEY='tt.cloud.synced';
const CLOUD=(()=>{let c={};try{c=JSON.parse(localStorage.getItem(CLOUD_KEY)||'{}');}catch(e){}
  try{const q=new URLSearchParams(location.search);if(q.get('cloud'))c.url=q.get('cloud');if(q.get('code'))c.code=q.get('code');if(q.get('cloud')||q.get('code')){if(c.auto==null)c.auto=true;localStorage.setItem(CLOUD_KEY,JSON.stringify(c));history.replaceState(null,'',location.pathname);}}catch(e){}
  if(!c.url&&DEFAULT_CLOUD_URL)c.url=DEFAULT_CLOUD_URL;
  return c;})();
let CLOUD_SYNCED={};try{CLOUD_SYNCED=JSON.parse(localStorage.getItem(CLOUD_SYNC_KEY)||'{}');}catch(e){}
const cloudOn=()=>SB_ON?!!SESS:!!(CLOUD.url&&CLOUD.code);
function cloudSaveCfg(){try{localStorage.setItem(CLOUD_KEY,JSON.stringify(CLOUD));}catch(e){}}
function hashStr(s){let h=5381;for(let i=0;i<s.length;i++)h=((h<<5)+h+s.charCodeAt(i))|0;return (h>>>0).toString(36)+'.'+s.length;}
function fieldHash(f){const c=Object.assign({},f);delete c._savedAt;delete c._device;delete c._owner;return hashStr(JSON.stringify(c));}
function dirtyFields(){return S.fields.filter(f=>!f.sample&&(CLOUD_SYNCED[f.id]!==fieldHash(f)||OLD_CODE.test(f.code||'')));}
async function cloudCall(body){
  const r=await fetch(CLOUD.url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(Object.assign({code:CLOUD.code},body)),redirect:'follow'});
  if(!r.ok)throw new Error('HTTP '+r.status);const j=await r.json();if(!j.ok)throw new Error(j.error||'ismeretlen hiba');return j;}
function cloudPayload(f){const c=JSON.parse(JSON.stringify(f));Object.keys(c.seasons||{}).forEach(y=>(c.seasons[y].parts||[]).forEach(p=>{try{const yl=calcYield(f,f.seasons[y].parts.find(q=>q.id===p.id)||p);p._yieldStd=yl.std!=null?+yl.std.toFixed(2):null;}catch(e){}p._conf=SRC_CONF[p.src||'']||'';}));return c;}
let cloudBusy=false;
async function cloudPush(silent){if(SB_ON)return acctPush(silent);
  if(!cloudOn()){if(!silent)cloudDialog();return;}
  if(cloudBusy)return;const d=dirtyFields();if(!d.length){if(!silent)toast('Minden adat már a felhőben van ✓');cloudStatus();return;}
  if(!navigator.onLine){if(!silent)toast('Nincs internet – a mentés később automatikusan megtörténik.');cloudStatus();return;}
  cloudBusy=true;cloudStatus('⏳ Mentés a felhőbe…');
  try{for(let i=0;i<d.length;i+=5){const part=d.slice(i,i+5);await cloudCall({action:'save',device:CLOUD.device||'',fields:part.map(cloudPayload)});part.forEach(f=>CLOUD_SYNCED[f.id]=fieldHash(f));}
    localStorage.setItem(CLOUD_SYNC_KEY,JSON.stringify(CLOUD_SYNCED));CLOUD.last=new Date().toISOString();CLOUD.err='';cloudSaveCfg();if(!silent)toast(`Felhőbe mentve: ${d.length} tábla ✓`);}
  catch(e){CLOUD.err=String(e.message||e);cloudSaveCfg();if(!silent)toast('Felhőmentés sikertelen: '+CLOUD.err);}
  finally{cloudBusy=false;cloudStatus();}}
async function cloudPull(silent){if(SB_ON)return acctPull(silent);
  if(!cloudOn()){if(!silent)cloudDialog();return;}
  if(silent&&!navigator.onLine)return;
  cloudStatus('⏳ Letöltés a felhőből…');
  try{const l=await cloudCall({action:'list'});if(!l.fields.length){if(!silent)toast('A felhőben még nincs tábla ezzel a kóddal.');cloudStatus();return;}
    const j=await cloudCall({action:'load',ids:[]});let add=0,upd=0,kept=0;const dirty=new Set(dirtyFields().map(f=>f.id));
    let del=[];try{del=JSON.parse(localStorage.getItem('tt.cloud.deleted')||'[]');}catch(e){}
    j.fields.forEach(cf=>{if(!cf||!cf.id||!Array.isArray(cf.geometry)||del.includes(cf.id))return;const i=S.fields.findIndex(x=>x.id===cf.id);
      if(i<0){S.fields.push(cf);add++;}else if(dirty.has(cf.id)){kept++;return;}else if(fieldHash(S.fields[i])===fieldHash(cf)){CLOUD_SYNCED[cf.id]=fieldHash(cf);return;}else{S.fields[i]=cf;upd++;}
      CLOUD_SYNCED[cf.id]=fieldHash(cf);queueAnalysis&&!ANA[cf.id]&&queueAnalysis(cf.id);});
    localStorage.setItem(CLOUD_SYNC_KEY,JSON.stringify(CLOUD_SYNCED));CLOUD.last=new Date().toISOString();CLOUD.err='';cloudSaveCfg();if(!S.sel&&S.fields[0])S.sel=S.fields[0].id;
    try{localStorage.setItem(KEY,JSON.stringify(S));}catch(e){}renderAll();
    if(!silent||add||upd)toast(`Felhőből: ${add} új, ${upd} frissített tábla${kept?`, ${kept} helyi módosítás megtartva`:''}`);}
  catch(e){if(!silent)toast('Letöltés sikertelen: '+(e.message||e));}
  cloudStatus();}
let cloudT=null;
function cloudAfterSave(){if(!cloudOn())return;clearTimeout(cloudT);cloudT=setTimeout(()=>cloudPush(true),2500);cloudStatus();}
function cloudFlush(){if(SB_ON){if(SESS)acctPush(true);return;}if(!cloudOn()||!navigator.onLine)return;const d=dirtyFields();if(!d.length)return;
  try{fetch(CLOUD.url,{method:'POST',keepalive:true,headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({code:CLOUD.code,action:'save',device:CLOUD.device||'',fields:d.slice(0,5).map(cloudPayload)})});}catch(e){}}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')cloudFlush();else if(cloudOn())cloudPush(true);});
window.addEventListener('pagehide',cloudFlush);
setInterval(()=>{if(cloudOn()&&!cloudBusy&&dirtyFields().length)cloudPush(true);},60000);
window.addEventListener('online',()=>{if(cloudOn())cloudPush(true);});
function cloudStatus(msg){const el=document.getElementById('statusLine');if(!el)return;
  if(msg){el.textContent=msg;return;}
  if(!cloudOn()){el.innerHTML=SB_ON?'Nincs bejelentkezve – az adatok csak ezen az eszközön vannak.':'Nincs beállítva – az adatok csak ezen az eszközön vannak.';return;}
  const n=dirtyFields().length;const last=CLOUD.last?new Date(CLOUD.last).toLocaleString('hu-HU',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'még soha';
  el.innerHTML=`${n?`<b style="color:#b7791f">⏳ ${n} tábla mentésre vár${navigator.onLine?'':' (nincs net)'}</b>`:'<b style="color:#2f6b3a">✓ minden mentve</b>'} · automatikus mentés · utoljára: ${last}${CLOUD.err?` · <span style="color:#c53030">hiba: ${esc(CLOUD.err)}</span>`:''}`;}
function cloudDialog(){
  modal(`<h2>☁️ Felhőmentés beállítása</h2><p class="help">Az adatok a központi Google Drive-ba kerülnek (Táblatörténet adatok mappa + táblázat). A kódot Dorogházi Ottótól kapja.</p>
  <label class="f">Szkript címe (…/exec)</label><input class="input" id="cuUrl" placeholder="https://script.google.com/macros/s/…/exec" value="${esc(CLOUD.url||'')}">
  <label class="f">Partnerkód</label><input class="input" id="cuCode" placeholder="pl. PARTNER-1A2B3C" value="${esc(CLOUD.code||'')}">
  <label class="f">Ki rögzít / eszköz neve</label><input class="input" id="cuDev" placeholder="pl. Ottó iPhone" value="${esc(CLOUD.device||'')}">
  <p class="help" style="margin-top:8px">Beállítás után minden módosítás automatikusan a felhőbe kerül (net nélkül később pótolja).</p>
  <div id="cuMsg" class="help" style="min-height:1.2em"></div>
  <div class="row" style="justify-content:space-between;margin-top:12px"><button class="btn" id="cuTest">Kapcsolat próbája</button><div class="row"><button class="btn" id="cuC">Mégse</button><button class="btn primary" id="cuOk">Mentés</button></div></div>`);
  const read=()=>{CLOUD.url=$('#cuUrl').value.trim();CLOUD.code=$('#cuCode').value.trim();CLOUD.device=$('#cuDev').value.trim();};
  $('#cuC').onclick=closeModal;
  $('#cuTest').onclick=async()=>{read();$('#cuMsg').textContent='Próba…';try{const j=await cloudCall({action:'ping'});$('#cuMsg').innerHTML=`✓ Működik – partner: <b>${esc(j.partner)}</b>${j.admin?' (admin: minden partner adatát látja)':''}`;}catch(e){$('#cuMsg').textContent='✗ '+(e.message||e);}};
  $('#cuOk').onclick=()=>{read();cloudSaveCfg();closeModal();cloudStatus();if(cloudOn()){toast('Felhő beállítva');cloudPush(true);}};}
