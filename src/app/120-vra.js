/* ================= kijuttatási térkép (VRA) ================= */
async function vraDialog(){const f=curField();if(!f)return toast('Válasszon táblát.');const a=ANA[f.id]||await loadAna(f);if(!a)return toast('Ehhez a táblához még nincs termőzóna – várja meg az elemzést (Műhold fül).');
  const zs=[1,2,3,4].filter(z=>a.area[z]);
  modal(`<h2>🗺️ Kijuttatási térkép – ${esc(fieldLabel(f))}</h2><p class="help">Adja meg a dózist zónánként. A fájl a géptermináloknak (John Deere, Trimble, Topcon, Müller stb.) szokásos shapefile, <b>RATE</b> oszloppal, WGS84.</p>
  <div class="row"><div style="flex:2"><label class="f">Termék / művelet</label><input class="input" id="vP" placeholder="pl. vetőmag, UAN 30, NPK"></div><div style="flex:1"><label class="f">Egység</label><select class="input" id="vU"><option>mag/ha</option><option>kg/ha</option><option>l/ha</option><option>t/ha</option></select></div></div>
  <table style="margin-top:10px"><tr><th>Zóna</th><th>Terület</th><th>Dózis</th></tr>${zs.map(z=>`<tr><td><span style="display:inline-block;width:10px;height:10px;background:rgb(${ZONE_COL[z-1]})"></span> ${ZONE_NAME[z-1]}</td><td>${fmt(a.area[z],2)} ha</td><td><input class="input" id="vR${z}" inputmode="decimal" style="width:110px"></td></tr>`).join('')}</table>
  <div class="help" id="vTot"></div>
  <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn" id="vC">Mégse</button><button class="btn primary" id="vOk">⬇ Shapefile (ZIP)</button></div>`);
  const rates=()=>{const r={};zs.forEach(z=>{const v=parseFloat(($('#vR'+z).value||'').replace(',','.'));r[z]=isNaN(v)?0:v;});return r;};
  const upd=()=>{const r=rates();let t=0,ar=0;zs.forEach(z=>{t+=r[z]*a.area[z];ar+=a.area[z];});$('#vTot').textContent=t?`Összesen: ${fmt0(t)} ${$('#vU').value.split('/')[0]} · átlag ${fmt(t/ar,1)} ${$('#vU').value}`:'';};
  zs.forEach(z=>$('#vR'+z).oninput=upd);$('#vU').onchange=upd;$('#vC').onclick=closeModal;
  $('#vOk').onclick=async()=>{const r=rates();if(!zs.some(z=>r[z]))return toast('Adjon meg legalább egy dózist.');const nm=safeName(f.name)+'_vra_'+safeName($('#vP').value||'dozis');
    const recs=zoneRecs(f,a,r).map(x=>(x.attrs.TERMEK=$('#vP').value||'',x.attrs.EGYSEG=$('#vU').value,x));
    const files=shapefile(nm,recs,[{n:'TABLA',t:'C',l:60},{n:'ZONA',t:'N',l:2},{n:'ZONA_NEV',t:'C',l:20},{n:'TERULET',t:'N',l:10,d:2},{n:'RATE',t:'N',l:12,d:2},{n:'TERMEK',t:'C',l:40},{n:'EGYSEG',t:'C',l:10}]);
    const blob=makeZip(files),name=nm+'.zip';closeModal();
    try{const file=new File([blob],name,{type:'application/zip'});if(navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({files:[file],title:name});return;}}catch(e){if(e&&e.name==='AbortError')return;}
    const el=document.createElement('a');el.href=URL.createObjectURL(blob);el.download=name;document.body.appendChild(el);el.click();setTimeout(()=>{URL.revokeObjectURL(el.href);el.remove();},2000);};}

$('#btnCloud').onclick=cloudDialog;$('#btnCloudPull').onclick=()=>cloudPull(false);
$('#btnSummary').onclick=copySummary;$('#btnPkg').onclick=exportPackage;$('#btnVra').onclick=vraDialog;
const BUILD='/*BUILD*/';
async function checkUpdate(){if(location.protocol!=='https:')return;try{const t=await fetch(location.pathname+'?v='+Date.now(),{cache:'no-store'}).then(r=>r.text());const m=t.match(/const BUILD='(\d+)'/);
  if(m&&m[1]!==BUILD&&!mode){toast('Új változat érhető el – frissítés…');setTimeout(()=>location.reload(),1200);}}catch(e){}}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')checkUpdate();});setTimeout(checkUpdate,4000);
setTimeout(async()=>{if(DEMO){demoStart();return;}if(SB_ON){await acctInit();return;}cloudStatus();if(cloudOn()){await cloudPull(true);cloudPush(true);}},600);
if(/[?&]test=1/.test(location.search)||location.protocol==='file:')window.__tt={get S(){return S;},ANA,curField,geomKey,rasterGrid,rasterFill,floodFrom,maskToPoly,haOf,ftwSuggest,s2Grid,s2Candidates,candPoly,regularize,map};

/* minta táblák: lásd 121-samples.js */

document.addEventListener('click',e=>{if(e.target&&e.target.id==='ovRep'){openReport(curField());}});
$('#viewSel').onchange=e=>{S.view=e.target.value;save();renderAnaLayer();if(curTab==='sat')renderSat();};
