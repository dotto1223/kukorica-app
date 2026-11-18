/* ================= Fiók és központi adatbázis (Supabase) ================= */
var SB_URL='/*SB_URL*/'.startsWith('/*')?'':'/*SB_URL*/',SB_KEY='/*SB_KEY*/'.startsWith('/*')?'':'/*SB_KEY*/';
var SB_ON=!!(SB_URL&&SB_KEY);var CONSENT_VER='2026-11-v1';
var SESS=null;try{SESS=JSON.parse(localStorage.getItem('tt.sb.session')||'null');}catch(e){}
var PROFILE=null,OWNERS={};
function isAdmin(){return !DEMO&&!!(PROFILE&&PROFILE.role==='admin');}
function sbSave(){try{SESS?localStorage.setItem('tt.sb.session',JSON.stringify(SESS)):localStorage.removeItem('tt.sb.session');}catch(e){}}
function sbSetSession(j){SESS={access_token:j.access_token,refresh_token:j.refresh_token,expires_at:j.expires_at||Math.floor(Date.now()/1000)+(j.expires_in||3600),user:j.user||SESS&&SESS.user};sbSave();}
async function sbRaw(path,opt={},auth=true){const h=Object.assign({apikey:SB_KEY,'Content-Type':'application/json'},opt.headers||{});
  if(auth&&SESS)h.Authorization='Bearer '+SESS.access_token;else if(!SB_KEY.startsWith('sb_'))h.Authorization='Bearer '+SB_KEY;
  const r=await fetch(SB_URL+path,Object.assign({},opt,{headers:h}));const t=await r.text();let j=null;try{j=t?JSON.parse(t):null;}catch(e){j=t;}
  if(!r.ok){const m=(j&&(j.msg||j.message||j.error_description||j.error))||('HTTP '+r.status);const e=new Error(sbErrHu(m));e.status=r.status;throw e;}return j;}
function sbErrHu(m){const s=String(m);
  if(/Invalid login credentials/i.test(s))return 'Hibás e-mail-cím vagy jelszó.';if(/Email not confirmed/i.test(s))return 'Az e-mail-címet még nem erősítette meg – nézze meg a postafiókját.';
  if(/User already registered/i.test(s))return 'Ezzel az e-mail-címmel már van fiók – jelentkezzen be.';if(/rate limit/i.test(s))return 'Túl sok e-mail-kérés – próbálja újra később.';
  if(/Password should be at least/i.test(s))return 'A jelszó legalább 8 karakter legyen.';if(/row-level security/i.test(s))return 'Ehhez a táblához nincs jogosultsága.';return s;}
async function sbFresh(){if(!SESS)return false;if(SESS.expires_at-60>Date.now()/1000)return true;
  try{const j=await sbRaw('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:SESS.refresh_token})},false);sbSetSession(j);return true;}
  catch(e){if(e.status===400||e.status===401){SESS=null;sbSave();}return false;}}
async function sb(path,opt){if(!(await sbFresh()))throw new Error('Nincs bejelentkezve');return sbRaw(path,opt,true);}
const rpc=(fn,body)=>sb('/rest/v1/rpc/'+fn,{method:'POST',body:JSON.stringify(body||{})});
// statisztika: demóban a kitalált demó-adatkészlet (bejelentkezés nélkül is), élesben a termelői adatok
function statRpc(fn,body){return DEMO?sbRaw('/rest/v1/rpc/demo_'+fn,{method:'POST',body:JSON.stringify(body||{})},false):rpc(fn,body);}
function statsOn(){return SB_ON&&(DEMO||!!(SESS&&PROFILE));}
async function loadProfile(){const u=SESS&&SESS.user;if(!u)return null;const r=await sb('/rest/v1/profiles?id=eq.'+u.id+'&select=*');PROFILE=r&&r[0]||null;
  if(isAdmin()){try{const ps=await sb('/rest/v1/profiles?select=id,full_name,farm_name,email');OWNERS={};ps.forEach(p=>OWNERS[p.id]=p);}catch(e){}}return PROFILE;}
// e-mailben kapott link (#access_token=…) feldolgozása
async function sbHandleRedirect(){if(!SB_ON||!location.hash.includes('access_token='))return;const q=new URLSearchParams(location.hash.slice(1));
  sbSetSession({access_token:q.get('access_token'),refresh_token:q.get('refresh_token'),expires_in:+q.get('expires_in')||3600});history.replaceState(null,'',location.pathname+location.search);
  try{SESS.user=await sbRaw('/auth/v1/user',{},true);sbSave();}catch(e){}
  if(q.get('type')==='recovery')setTimeout(newPasswordDialog,400);else if(q.get('type')==='signup')toast('E-mail-cím megerősítve ✓');}
function newPasswordDialog(){modal(`<h2>Új jelszó</h2><label class="f">Új jelszó (min. 8 karakter)</label><input class="input" type="password" id="npw" autocomplete="new-password"><div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn primary" id="npOk">Mentés</button></div>`);
  $('#npOk').onclick=async()=>{try{await sb('/auth/v1/user',{method:'PUT',body:JSON.stringify({password:$('#npw').value})});closeModal();toast('Jelszó módosítva ✓');}catch(e){toast(e.message);}};}

/* --- bejelentkező képernyő --- */
function loginScreen(msg){
  const el=document.getElementById('loginGate');if(el.parentNode!==document.body)document.body.appendChild(el);el.style.display='flex';document.documentElement.classList.add('need-login');
  el.innerHTML=`<div class="lg-box">${langSelectHTML('lgLang')}<h1 data-noi18n>🌽 kukorica.app</h1><p class="help">Jelentkezzen be. Minden termelő csak a saját tábláit látja.</p>
  <div class="seg" style="margin:10px 0"><button class="btn sm primary" id="lgTabIn">Belépés</button><button class="btn sm" id="lgTabUp">Regisztráció</button></div>
  <div id="lgUp" style="display:none"><label class="f">Név</label><input class="input" id="lgName" autocomplete="name"><label class="f">Gazdaság neve (nem kötelező)</label><input class="input" id="lgFarm"></div>
  <label class="f">E-mail-cím</label><input class="input" id="lgEmail" type="email" autocomplete="email" inputmode="email">
  <label class="f">Jelszó</label><input class="input" id="lgPw" type="password" autocomplete="current-password">
  <div class="help" id="lgMsg" style="min-height:1.3em;color:#c53030">${esc(msg||'')}</div>
  <button class="btn primary" style="width:100%;margin-top:6px" id="lgGo">Belépés</button>
  <div class="row" style="justify-content:space-between;margin-top:10px"><a href="#" id="lgForgot">Elfelejtett jelszó</a><a href="privacy.html" target="_blank">Adatkezelési tájékoztató</a></div>
  <div class="help" style="margin-top:12px"><a href="#" id="lgOffline">Folytatás bejelentkezés nélkül</a> – az adatok csak ezen az eszközön maradnak.</div>
  <div class="help" style="margin-top:8px"><a href="#" id="lgDemo">🧪 Demó megtekintése</a> – kitalált adatokkal, regisztráció nélkül.</div></div>`;
  let up=false;const sw=v=>{up=v;$('#lgUp').style.display=v?'':'none';$('#lgTabIn').className='btn sm'+(v?'':' primary');$('#lgTabUp').className='btn sm'+(v?' primary':'');$('#lgGo').textContent=v?'Regisztráció':'Belépés';$('#lgPw').autocomplete=v?'new-password':'current-password';};
  bindLangSelect('lgLang');$('#lgTabIn').onclick=()=>sw(false);$('#lgTabUp').onclick=()=>sw(true);
  $('#lgGo').onclick=async()=>{const email=$('#lgEmail').value.trim(),pw=$('#lgPw').value;$('#lgMsg').textContent='';if(!email||!pw)return $('#lgMsg').textContent='Adja meg az e-mail-címet és a jelszót.';
    $('#lgGo').disabled=true;
    try{if(up){if(pw.length<8)throw new Error('A jelszó legalább 8 karakter legyen.');
        const j=await sbRaw('/auth/v1/signup?redirect_to='+encodeURIComponent(location.origin+location.pathname),{method:'POST',body:JSON.stringify({email,password:pw,data:{full_name:$('#lgName').value.trim(),farm_name:$('#lgFarm').value.trim()}})},false);
        if(j&&j.access_token){sbSetSession(j);}else{$('#lgMsg').style.color='#2f6b3a';$('#lgMsg').textContent='Elküldtük a megerősítő e-mailt. Kattintson a benne lévő linkre, majd jelentkezzen be.';sw(false);return;}}
      else{const j=await sbRaw('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email,password:pw})},false);sbSetSession(j);}
      gateHide();await afterLogin();}
    catch(e){$('#lgMsg').style.color='#c53030';$('#lgMsg').textContent=e.message;}finally{$('#lgGo').disabled=false;}};
  $('#lgPw').onkeydown=e=>{if(e.key==='Enter')$('#lgGo').click();};
  $('#lgForgot').onclick=async e=>{e.preventDefault();const email=$('#lgEmail').value.trim();if(!email)return $('#lgMsg').textContent='Előbb írja be az e-mail-címét.';
    try{await sbRaw('/auth/v1/recover?redirect_to='+encodeURIComponent(location.origin+location.pathname),{method:'POST',body:JSON.stringify({email})},false);$('#lgMsg').style.color='#2f6b3a';$('#lgMsg').textContent='Ha van ilyen fiók, elküldtük a jelszóváltoztató linket.';}catch(er){$('#lgMsg').textContent=er.message;}};
  $('#lgOffline').onclick=e=>{e.preventDefault();gateHide();try{sessionStorage.setItem('tt.offline','1');}catch(er){}renderAcct();};$('#lgDemo').onclick=e=>{e.preventDefault();demoSet(true);};}

function gateHide(){const el=document.getElementById('loginGate');if(el)el.style.display='none';document.documentElement.classList.remove('need-login');setTimeout(()=>{try{map.invalidateSize();const f=curField();if(f&&curTab!=='fields')fit(f);}catch(e){}},50);}
async function afterLogin(){try{await loadProfile();}catch(e){toast('Profil betöltése sikertelen: '+e.message);}
  if(!PROFILE||PROFILE.consent_version!==CONSENT_VER)return consentDialog();
  renderAcct();await acctPull(true);acctPush(true);}
function consentDialog(){modal(`<h2>Adatkezelés</h2>
  <p>A kukorica.app az Ön által megadott tábla- és termesztési adatokat a <b>Dorogházi Ottó e.v.</b> adatkezelőként, az EU-ban (Frankfurt) tárolja.</p>
  <ul class="help" style="padding-left:18px"><li>A részletes adatait csak Ön és az adatkezelő láthatja.</li><li>A közös statisztikákban csak összesítve, név és helyszín nélkül szerepel; egy csoport csak legalább 5 tábla és 3 termelő adatából jelenik meg.</li>
  <li>Adatait bármikor letöltheti, javíthatja vagy a fiókjával együtt törölheti.</li></ul>
  <label style="display:flex;gap:10px;margin-top:10px;align-items:flex-start;flex-wrap:nowrap"><input type="checkbox" id="cnA" style="width:20px;height:20px;flex:0 0 20px;margin-top:2px"> <span>Elolvastam és elfogadom az <a href="privacy.html" target="_blank">adatkezelési tájékoztatót</a>.</span></label>
  <label style="display:flex;gap:10px;margin-top:10px;align-items:flex-start;flex-wrap:nowrap"><input type="checkbox" id="cnR" style="width:20px;height:20px;flex:0 0 20px;margin-top:2px"> <span>Hozzájárulok, hogy adataim anonimizálva kutatási célra (doktori kutatás, Debreceni Egyetem) is felhasználhatók legyenek. <i>(nem kötelező)</i></span></label>
  <div class="row" style="justify-content:space-between;margin-top:14px"><button class="btn" id="cnNo">Nem fogadom el</button><button class="btn primary" id="cnOk">Elfogadom</button></div>`);
  $('#cnNo').onclick=async()=>{closeModal();await acctLogout(true);};
  $('#cnOk').onclick=async()=>{if(!$('#cnA').checked)return toast('Az elfogadás szükséges a központi tároláshoz.');
    try{await sb('/rest/v1/profiles?id=eq.'+SESS.user.id,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({consent_version:CONSENT_VER,consent_at:new Date().toISOString(),research_consent:$('#cnR').checked})});
      closeModal();await loadProfile();renderAcct();await acctPull(true);acctPush(true);}catch(e){toast(e.message);}};}
async function acctLogout(silent){try{if(SESS)await sbRaw('/auth/v1/logout',{method:'POST'},true);}catch(e){}SESS=null;PROFILE=null;sbSave();
  if(!silent)toast('Kijelentkezve');renderAcct();loginScreen();}

/* --- tábla kód + település --- */
const GEO_CACHE={};
async function reverseSettlement(lat,lng){const k=lat.toFixed(3)+','+lng.toFixed(3);if(GEO_CACHE[k])return GEO_CACHE[k];
  const q=l=>fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=10&addressdetails=1&accept-language=${l}`).then(r=>r.json());
  let r=await q('hu');let a=r.address||{};const cc=(a.country_code||'hu').toLowerCase();
  // más országban a helyi nyelvű (latin betűs) neveket kérjük
  const LOC={rs:'sr-Latn',ro:'ro',sk:'sk',hr:'hr',si:'sl',ua:'uk',at:'de',de:'de',pl:'pl',cz:'cs',ba:'sr-Latn',me:'sr-Latn'};
  if(cc!=='hu'&&LOC[cc]){try{const r2=await q(LOC[cc]);if(r2&&r2.address){r=r2;a=r2.address;}}catch(e){}}
  const county=(a.county||a.state_district||a.state||'').replace(/ vármegye| megye/,'').replace(/^Județul /,'');
  const out={settlement:a.city||a.town||a.village||a.municipality||a.city_district||'',county,country:cc,
    district:cc==='hu'?'':(a.municipality&&a.municipality!==(a.city||a.town||a.village)?a.municipality:(a.county||a.state_district||'')).replace(/^Județul /,'')};
  return GEO_CACHE[k]=out;}
const OLD_CODE=/^[A-Z0-9]{4,8}-\d{4}$/;
function asciiPrefix(s){return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^A-Za-z0-9]/g,'').toUpperCase().slice(0,8)||'TABLA';}
async function ensureCode(f){
  if(!f.settlement){try{const [la,ln]=centroid(f.geometry);const s=await reverseSettlement(la,ln);f.settlement=s.settlement;f.county=s.county;f.country=s.country;if(s.country&&s.country!=='hu'){f.district=s.district;f.districtFor=f.settlement;}}catch(e){}}
  // rövid kód: település 2–3 betűs rövidítése + sorszám (pl. KKF-003); a régi hosszú kódot (KISKUNFE-0003) is lecseréli
  if((!f.code||f.code.startsWith('TMP-')||OLD_CODE.test(f.code))&&SB_ON&&SESS){try{f.code=await rpc('next_field_code',{p_prefix:asciiPrefix(f.settlement),p_field:f.id,p_settlement:f.settlement||''});}catch(e){}}
  if(!f.code)f.code='TMP-'+f.id.slice(-4).toUpperCase();}
function fieldLabel(f){return f.code&&!f.code.startsWith('TMP-')?(f.name&&f.name!==f.code?`${f.code} · ${f.name}`:f.code):(f.name||f.code||'Tábla');}

/* --- szinkron --- */
function hybNorm(h){return hybKey(h);}
function flatParts(f){const out=[];Object.keys(f.seasons||{}).forEach(y=>{const se=f.seasons[y];(se.parts||[]).forEach(p=>{let yl=null,n={N:null,P:null,K:null};try{yl=calcYield(f,p).std;}catch(e){}try{n=partNutr(se,p.id);}catch(e){}
  out.push({year:+y,part_id:p.id,label:p.label,area_ha:+(partArea(f,p)||0).toFixed(3),crop:p.crop||'',hybrid:p.hybrid||'',hybrid_norm:hybNorm(p.hybrid),fao:p.fao||'',sowing:p.sowing||'',density:p.density||'',density_unit:p.density?densUnit(p):'',stand:p.stand||'',tkm:p.tkm||'',seeds_m2:seedsM2(p)!=null?+seedsM2(p).toFixed(1):'',harvest:p.harvest||'',moisture:p.moisture||'',
    yield_std:yl!=null&&isFinite(yl)?+yl.toFixed(2):'',irrigated:(se.ops||[]).some(o=>o.type==='irr'&&(o.parts||['all']).some(q=>q==='all'||q===p.id)),n_kg:n.N!=null?Math.round(n.N):'',p_kg:n.P!=null?Math.round(n.P):'',k_kg:n.K!=null?Math.round(n.K):'',yield_src:p.src||''});});});return out;}
let acctBusy=false,acctT=null;
async function acctPush(silent){if(DEMO)return;if(!SB_ON||!SESS||!PROFILE||PROFILE.consent_version!==CONSENT_VER||acctBusy||!navigator.onLine){if(SB_ON&&SESS&&!navigator.onLine)saveInd('err');cloudStatus();return;}
  acctBusy=true;cloudStatus('⏳ Mentés…');let n=0,err='';
  try{// törlések
    let del=[];try{del=JSON.parse(localStorage.getItem('tt.cloud.deleted')||'[]');}catch(e){}
    const left=[];for(const id of del){try{await sb('/rest/v1/fields?id=eq.'+encodeURIComponent(id),{method:'PATCH',body:JSON.stringify({deleted_at:new Date().toISOString()})});delete CLOUD_SYNCED[id];}catch(e){left.push(id);}}
    if(del.length)localStorage.setItem('tt.cloud.deleted',JSON.stringify(left));
    for(const f of dirtyFields()){await ensureCode(f);const [la,ln]=centroid(f.geometry);const data=JSON.parse(JSON.stringify(f));delete data._owner;delete data._ownerName;
      const sr=await rpc('save_field',{p_field:{id:f.id,code:f.code,nickname:f.name||'',settlement:f.settlement||'',county:f.county||'',district:f.district||'',hrsz:f.hrsz||'',area_ha:+(+f.areaHa).toFixed(3),lat:la,lng:ln,data},p_parts:flatParts(f)});
      if(sr&&sr.code&&sr.code!==f.code)f.code=sr.code;// a felhőben lévő kód az irányadó
      if(sr&&sr.deleted){S.fields=S.fields.filter(x=>x.id!==f.id);delete CLOUD_SYNCED[f.id];if(S.sel===f.id)S.sel=S.fields[0]?S.fields[0].id:null;n++;continue;}
      CLOUD_SYNCED[f.id]=fieldHash(f);n++;}
    localStorage.setItem(CLOUD_SYNC_KEY,JSON.stringify(CLOUD_SYNCED));CLOUD.last=new Date().toISOString();CLOUD.err='';cloudSaveCfg();if(n)try{localStorage.setItem(KEY,JSON.stringify(S));}catch(e){}
    if(n){saveInd('cloud');if(!silent)toast(`Mentve: ${n} tábla ✓`);}else{const si=document.getElementById('saveInd');if(si&&si.classList.contains('busy'))saveInd('cloud');}}
  catch(e){err=e.message;CLOUD.err=err;cloudSaveCfg();saveInd('err');if(!silent)toast('Mentés sikertelen: '+err);}
  finally{acctBusy=false;cloudStatus();if(n)renderAll();}}
async function acctPull(silent){if(DEMO)return;if(!SB_ON||!SESS)return;cloudStatus('⏳ Letöltés…');
  try{const rows=await sb('/rest/v1/fields?select=id,owner,code,nickname,settlement,county,hrsz,data,updated_at&deleted_at=is.null&order=code');
    const dirty=new Set(dirtyFields().filter(f=>CLOUD_SYNCED[f.id]).map(f=>f.id));let add=0,upd=0;const mine=new Set();
    rows.forEach(r=>{const f=r.data||{};f.id=r.id;f.code=r.code;f.name=r.nickname||f.name||r.code;f.settlement=r.settlement;f.county=r.county;f.hrsz=r.hrsz;
      f._owner=r.owner;const o=OWNERS[r.owner];f._ownerName=o?(o.full_name||o.farm_name||o.email):'';mine.add(r.id);
      const i=S.fields.findIndex(x=>x.id===r.id);if(i<0){S.fields.push(f);add++;}else if(dirty.has(r.id))return;else if(fieldHash(S.fields[i])!==fieldHash(f)){S.fields[i]=f;upd++;}
      CLOUD_SYNCED[r.id]=fieldHash(f);if(!ANA[r.id])queueAnalysis(r.id);});
    // a szerveren már nem létező (máshol törölt) táblák eltávolítása, ha itt nincs mentetlen módosításuk
    const gone=S.fields.filter(f=>CLOUD_SYNCED[f.id]&&!mine.has(f.id)&&!dirty.has(f.id));if(gone.length){const g=new Set(gone.map(f=>f.id));S.fields=S.fields.filter(f=>!g.has(f.id));gone.forEach(f=>delete CLOUD_SYNCED[f.id]);}
    localStorage.setItem(CLOUD_SYNC_KEY,JSON.stringify(CLOUD_SYNCED));if(!S.sel&&S.fields[0])S.sel=S.fields[0].id;try{localStorage.setItem(KEY,JSON.stringify(S));}catch(e){}renderAll();
    if(!silent)toast(`Letöltve: ${add} új, ${upd} frissített tábla`);else if(add||upd)saveInd('pull',`Frissítve a másik eszközről: ${add+upd} tábla`);}
  catch(e){if(!silent)toast('Letöltés sikertelen: '+e.message);}cloudStatus();}

/* --- fiók kártya, GDPR --- */
function renderAcct(){const el=document.getElementById('acctBox');if(!el)return;
  el.style.display='none';if(!SB_ON)return;const gc=document.getElementById('gcloudBox');if(gc)gc.style.display='none';
  if(!SESS){el.innerHTML=`<div class="meta">Nincs bejelentkezve – az adatok csak ezen az eszközön vannak.</div><div class="row" style="margin-top:8px"><button class="btn sm primary" id="acIn">Bejelentkezés</button></div>`;$('#acIn').onclick=()=>loginScreen();return;}
  const p=PROFILE||{};el.innerHTML=`<div class="row"><div style="flex:1"><b>${esc(p.full_name||p.email||SESS.user&&SESS.user.email||'')}</b>${isAdmin()?' <span class="tag">admin</span>':''}<div class="meta">${esc(p.email||'')}${p.farm_name?' · '+esc(p.farm_name):''}</div></div><button class="btn sm ghost" id="acOut">Kijelentkezés</button></div>
   <div class="meta" id="cloudSt" style="margin-top:6px">…</div>
   <div class="row" style="margin-top:8px;flex-wrap:wrap"><button class="btn sm" id="acPull">⬇ Frissítés a szerverről</button><button class="btn sm ghost" id="acProf">👤 Profil</button><button class="btn sm ghost" id="acGdpr">🔒 Adataim</button></div>`;
  $('#acOut').onclick=()=>confirmBox('Kijelentkezés','A még nem mentett módosítások ezen az eszközön megmaradnak, és a következő bejelentkezéskor feltöltődnek.','Kijelentkezés',()=>acctLogout());
  $('#acPull').onclick=()=>acctPull(false);$('#acProf').onclick=profileDialog;$('#acGdpr').onclick=gdprDialog;cloudStatus();}
function profileDialog(){const p=PROFILE||{};modal(`<h2>Profil</h2><label class="f">Név</label><input class="input" id="pfN" value="${esc(p.full_name||'')}"><label class="f">Gazdaság neve</label><input class="input" id="pfF" value="${esc(p.farm_name||'')}"><label class="f">Telefon</label><input class="input" id="pfP" inputmode="tel" value="${esc(p.phone||'')}">
  <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn" id="pfC">Mégse</button><button class="btn primary" id="pfOk">Mentés</button></div>`);
  $('#pfC').onclick=closeModal;$('#pfOk').onclick=async()=>{try{await sb('/rest/v1/profiles?id=eq.'+SESS.user.id,{method:'PATCH',body:JSON.stringify({full_name:$('#pfN').value.trim(),farm_name:$('#pfF').value.trim(),phone:$('#pfP').value.trim()})});await loadProfile();closeModal();renderAcct();toast('Profil mentve');}catch(e){toast(e.message);}};}
function gdprDialog(){const p=PROFILE||{};modal(`<h2>🔒 Adataim</h2>
  <p class="help">Hozzájárulás: ${p.consent_at?new Date(p.consent_at).toLocaleDateString('hu-HU'):'–'} (${esc(p.consent_version||'–')}) · kutatási felhasználás: <b>${p.research_consent?'igen':'nem'}</b> <a href="#" id="gdR">módosítás</a></p>
  <div class="row" style="flex-wrap:wrap;gap:8px"><button class="btn sm" id="gdExp">⬇ Összes adatom letöltése (JSON)</button><a class="btn sm ghost" href="privacy.html" target="_blank">Adatkezelési tájékoztató</a></div>
  <div class="row" style="margin-top:14px"><button class="btn sm danger" id="gdDelOpen">🗑 Fiókom törlése…</button></div>
  <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn" id="gdC">Bezár</button></div>`);
  $('#gdC').onclick=closeModal;
  $('#gdR').onclick=async e=>{e.preventDefault();try{await sb('/rest/v1/profiles?id=eq.'+SESS.user.id,{method:'PATCH',body:JSON.stringify({research_consent:!p.research_consent})});await loadProfile();gdprDialog();}catch(er){toast(er.message);}};
  $('#gdExp').onclick=exportMyData;$('#gdDelOpen').onclick=deleteAccountDialog;
}

async function acctInit(){if(!SB_ON){renderAcct();return;}await sbHandleRedirect();renderAcct();
  if(!SESS){let off=false;try{off=sessionStorage.getItem('tt.offline')==='1';}catch(e){}if(!off)loginScreen();return;}
  if(await sbFresh()){gateHide();await afterLogin();}else loginScreen('A munkamenet lejárt, jelentkezzen be újra.');}

/* --- automatikus frissítés más eszközről (telefon ↔ gép) --- */
let lastPull=0;function autoPull(){if(DEMO)return;if(!SB_ON||!SESS||!PROFILE||acctBusy||!navigator.onLine||document.visibilityState!=='visible')return;if(Date.now()-lastPull<20000)return;lastPull=Date.now();acctPull(true);loadStats();}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(autoPull,800);});
window.addEventListener('focus',()=>setTimeout(autoPull,800));window.addEventListener('online',()=>setTimeout(autoPull,800));
setInterval(autoPull,60000);

/* Adataim letöltése: minden, ami a szerveren a felhasználóhoz tartozik (profil, táblák, évadatok, napló) egy JSON-fájlban */
async function exportMyData(){if(!SESS)return toast('Előbb jelentkezzen be.');
  try{const [pr,fl,pa,au]=await Promise.all([sb('/rest/v1/profiles?id=eq.'+SESS.user.id+'&select=*'),sb('/rest/v1/fields?owner=eq.'+SESS.user.id+'&select=*'),sb('/rest/v1/parts?owner=eq.'+SESS.user.id+'&select=*'),sb('/rest/v1/audit_log?select=*&order=at')]);
      offerFile(`tablatortenet_adataim_${stamp()}.json`,JSON.stringify({exported:new Date().toISOString(),profile:pr,fields:fl,parts:pa,log:au},null,1),'application/json');toast('Adatai letöltve');}catch(e){toast(e.message);}}
/* Fiókom törlése: kétlépcsős megerősítés, utána minden adat végleg törlődik a szerverről */
function deleteAccountDialog(){if(!SESS)return toast('Előbb jelentkezzen be.');
  modal(`<h2 style="color:#c53030">🗑 Fiókom törlése</h2>
  <p>Minden táblája, évadata, művelete, a módosítási napló és a fiókja <b>véglegesen törlődik</b> a szerverről. Ez nem vonható vissza.</p>
  <p class="help">Javasoljuk, hogy előtte töltse le az adatait.</p>
  <div class="row" style="margin:6px 0 12px"><button class="btn sm" id="dlExp">⬇ Adataim letöltése előbb</button></div>
  <label class="f">A megerősítéshez írja be: <b>TÖRLÉS</b></label><input class="input" id="dlTxt" autocomplete="off">
  <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn" id="dlC">Mégse</button><button class="btn danger" id="dlGo">Végleges törlés</button></div>`);
  $('#dlC').onclick=closeModal;$('#dlExp').onclick=exportMyData;
  $('#dlGo').onclick=async()=>{if($('#dlTxt').value.trim().toUpperCase()!=='TÖRLÉS')return toast('Írja be: TÖRLÉS');
    try{await rpc('delete_my_data');SESS=null;PROFILE=null;sbSave();S.fields=[];S.sel=null;CLOUD_SYNCED={};localStorage.removeItem(CLOUD_SYNC_KEY);save();closeModal();renderAll();toast('Fiók és adatok törölve');loginScreen();}catch(e){toast(e.message);}};}
