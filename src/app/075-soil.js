/* ================= talaj ================= */
const SOIL_FIELDS=[['phKCl','pH (KCl)'],['phH2O','pH (H₂O)'],['KA','KA (Arany-féle)'],['hum','Humusz %'],['caco3','CaCO₃ %'],['p','AL-P₂O₅ mg/kg'],['k','AL-K₂O mg/kg'],['n','NO₃+NO₂-N mg/kg'],['salt','Összes só %']];

const WRB_HU={Chernozems:'csernozjom (mezőségi talaj)',Calcisols:'kalciszol (meszes talaj)',Phaeozems:'phaeozem (kilúgzott mezőségi jellegű)',Kastanozems:'kasztanozjom',Luvisols:'luviszol (agyagbemosódásos barna erdőtalaj)',Cambisols:'kambiszol (barna erdőtalaj jellegű)',Fluvisols:'fluviszol (öntéstalaj)',Gleysols:'glejszol (réti/vízhatású talaj)',Solonetz:'szolonyec (szikes)',Solonchaks:'szoloncsák (szikes)',Arenosols:'arenoszol (homoktalaj)',Vertisols:'vertiszol (duzzadó agyag)',Regosols:'regoszol (váztalaj)',Planosols:'planoszol',Stagnosols:'stagnoszol (pangóvizes)',Histosols:'hisztoszol (láptalaj)',Umbrisols:'umbriszol',Leptosols:'leptoszol (sekély talaj)',Retisols:'retiszol',Albeluvisols:'albeluviszol',Podzols:'podzol',Andosols:'andoszol'};
function usdaTexture(sand,silt,clay){if([sand,silt,clay].some(v=>v==null))return null;
 if(silt+1.5*clay<15)return'homok';if(silt+2*clay<30)return'vályogos homok';
 if((clay>=7&&clay<20&&sand>52)||(clay<7&&silt<50))return'homokos vályog';
 if(clay>=7&&clay<27&&silt>=28&&silt<50&&sand<=52)return'vályog';
 if(silt>=80&&clay<12)return'iszap';if((silt>=50&&clay>=12&&clay<27)||(silt>=50&&silt<80&&clay<12))return'iszapos vályog';
 if(clay>=20&&clay<35&&silt<28&&sand>45)return'homokos agyagos vályog';
 if(clay>=27&&clay<40&&sand>20&&sand<=45)return'agyagos vályog';if(clay>=27&&clay<40&&sand<=20)return'iszapos agyagos vályog';
 if(clay>=35&&sand>45)return'homokos agyag';if(clay>=40&&silt>=40)return'iszapos agyag';if(clay>=40)return'agyag';return null;}
function kaClass(ka){ka=num(ka);if(ka==null)return'';if(ka<=30)return'homok';if(ka<=37)return'homokos vályog';if(ka<=42)return'vályog';if(ka<=50)return'agyagos vályog';if(ka<=60)return'agyag';return'nehéz agyag';}
const STRUCTS=['','morzsás','szemcsés','diós','rögös','hasábos','lemezes','poros (szerkezet nélküli)','tömör / ekealp'];
function zoneAt(f,lat,lng){const a=ANA[f.id];if(!a)return null;const G=a.G;const i=Math.floor((lng-G.w)/G.dLng),j=Math.floor((G.n-lat)/G.dLat);if(i<0||j<0||i>=G.nx||j>=G.ny)return null;return a.zone[j*G.nx+i]||null;}
async function sgGet(url){let last;for(const w of [0,3000,8000]){if(w){toast('SoilGrids foglalt, újrapróbálom…');await new Promise(r=>setTimeout(r,w));}try{return await getJSON(url,30000);}catch(e){last=e;if(!/50[234]|429|timeout|abort|Failed to fetch/i.test(String(e.message||e)))break;}}throw last;}
async function fetchSoilGrids(f){
  const [lat,lng]=centroid(f.geometry);const props=['phh2o','clay','sand','silt','soc','cec','bdod','nitrogen'];
  const url=`https://rest.isric.org/soilgrids/v2.0/properties/query?lon=${lng.toFixed(5)}&lat=${lat.toFixed(5)}&${props.map(p=>'property='+p).join('&')}&depth=0-5cm&depth=5-15cm&depth=15-30cm&value=mean`;
  const j=await sgGet(url);const out={};
  (j.properties.layers||[]).forEach(L=>{const d=L.unit_measure.d_factor||1;let s=0,w=0;L.depths.forEach(D=>{const v=D.values.mean;if(v==null)return;const th=D.range.bottom_depth-D.range.top_depth;s+=v/d*th;w+=th;});out[L.name]={v:w?s/w:null,u:L.unit_measure.target_units};});
  let wrb=null;try{const c=await getJSON(`https://rest.isric.org/soilgrids/v2.0/classification/query?lon=${lng.toFixed(5)}&lat=${lat.toFixed(5)}&number_classes=3`,30000);wrb={name:c.wrb_class_name,prob:c.wrb_class_probability};}catch(e){}
  return{at:isoToday(),lat,lng,props:out,wrb};
}
function renderSoil(){
  const f=curField(),box=$('#soilBox');if(!f){box.innerHTML='';return;}
  f.soil=f.soil||{samples:[]};const sg=f.soil.sg,a=ANA[f.id];
  const sgv=k=>sg&&sg.props[k]?sg.props[k].v:null;
  let h=`<h2>${esc(fieldLabel(f))} – talaj</h2>
  <h3>Laboreredmények (talajminták)</h3>
  <p class="help">Rögzítse a talajvizsgálati eredményeket (MSZ-módszerek: AL-P₂O₅, AL-K₂O, KA, humusz…). A minta helyét a térképre koppintva vagy a telefon GPS-ével adhatja meg – ekkor az app hozzárendeli a termőzónához.</p>
  <div class="row"><button class="btn sm primary" id="soilAdd">+ Talajminta</button></div>`;
  const S2=f.soil.samples.slice().sort((x,y)=>(y.date||'').localeCompare(x.date||''));
  if(S2.length){h+=`<div class="tw" style="margin-top:8px"><table><tr><th>Dátum</th><th>Zóna</th><th>Mélys.</th>${SOIL_FIELDS.map(x=>`<th>${x[1]}</th>`).join('')}<th>Fiz. féleség (KA)</th><th>Szerkezet</th><th>Talajtípus</th><th></th></tr>`+
    S2.map(s=>`<tr><td>${esc(s.date||'–')}</td><td>${s.zone?ZONE_NAME[s.zone-1]:(s.lat?'–':'tábla')}</td><td>${esc(s.depth||'')}</td>${SOIL_FIELDS.map(x=>`<td>${esc(s[x[0]]||'')}</td>`).join('')}<td>${esc(kaClass(s.KA))}</td><td>${esc(s.struct||'')}</td><td>${esc(s.stype||'')}</td><td><button class="btn sm ghost" data-se="${s.id}">✎</button></td></tr>`).join('')+`</table></div>`;
    if(a){const zs=[1,2,3].map(z=>{const arr=f.soil.samples.filter(s=>s.zone===z);return{z,n:arr.length,avg:Object.fromEntries(SOIL_FIELDS.map(([k])=>{const v=arr.map(s=>num(s[k])).filter(v=>v!=null);return[k,v.length?v.reduce((p,q)=>p+q,0)/v.length:null];}))};}).filter(o=>o.n);
      if(zs.length)h+=`<h3>Zónánkénti átlag</h3><div class="tw"><table><tr><th>Zóna</th><th>n</th>${SOIL_FIELDS.map(x=>`<th>${x[1]}</th>`).join('')}</tr>`+zs.map(o=>`<tr><td><i class="sw" style="background:rgb(${ZONE_COL[o.z-1].join(',')})"></i> ${ZONE_NAME[o.z-1]}</td><td>${o.n}</td>${SOIL_FIELDS.map(([k])=>`<td>${o.avg[k]==null?'–':fmt(o.avg[k],k==='p'||k==='k'||k==='n'?0:1)}</td>`).join('')}</tr>`).join('')+`</table></div>`;}
  } else h+=`<div class="meta" style="margin-top:8px">Még nincs rögzített talajminta.</div>`;
  h+=`<h3>Automatikus talajadat (SoilGrids, 0–30 cm)</h3>
  <p class="help">Globális, modellből becsült talajtérkép (ISRIC SoilGrids, 250 m-es felbontás) a tábla középpontjára. Tájékoztató jellegű – táblán belüli különbségeket nem mutat, és nem helyettesíti a laborvizsgálatot.</p>`;
  if(sg){const hum=sgv('soc')!=null?sgv('soc')*1.724/10:null;
    h+=`<div class="stats"><div><b>${fmt(sgv('phh2o'),1)}</b><span>pH (H₂O)</span></div><div><b>${fmt(sgv('clay'),0)}%</b><span>agyag</span></div><div><b>${fmt(sgv('silt'),0)}%</b><span>iszap</span></div><div><b>${fmt(sgv('sand'),0)}%</b><span>homok</span></div><div><b>${fmt(hum,1)}%</b><span>humusz (SOC×1,724, becsült)</span></div><div><b>${fmt(sgv('cec'),0)}</b><span>CEC (cmol(c)/kg)</span></div></div>
    <div class="notice"><b>Fizikai féleség (USDA, becsült):</b> ${esc(usdaTexture(sgv('sand'),sgv('silt'),sgv('clay'))||'–')}<br><b>Valószínű talajtípus (WRB):</b> ${sg.wrb&&sg.wrb.prob?sg.wrb.prob.map(([n,p])=>`${esc(WRB_HU[n]||n)} ${p}%`).join(' · '):'nem érhető el'}<br><span class="meta">A WRB nemzetközi osztályozás, modellbecslés 250 m-en. A magyar genetikai talajtípus (pl. mészlepedékes csernozjom, réti talaj) a Talaj-Téradat portálon nézhető meg, vagy a talajvizsgálati jegyzőkönyvből vihető be.</span></div>
    <div class="meta">Lekérve: ${sg.at} · <a href="#" id="sgRe">frissítés</a></div>`;}
  else h+=`<div class="row"><button class="btn sm" id="sgGo">SoilGrids lekérése</button></div>`;
  h+=`<h3>Magyar digitális talajtérképek</h3><p class="help">A HUN-REN ATK Talajtani Intézet Talaj-Téradat portálja (DOSoReMI.hu) 100 m-es magyar talajtérképeket kínál (pH, humusz, fizikai féleség, CaCO₃, vízgazdálkodás, talajtípus). Automatikus lekérést ehhez még nem építettem be; a portálon böngészhető.</p>
  <a class="btn sm" href="https://talaj-teradat.hu" target="_blank" rel="noopener">Talaj-Téradat portál ↗</a>`;
  box.innerHTML=h;
  $('#soilAdd').onclick=()=>soilForm(f,{id:uid(),date:isoToday(),depth:'0–30 cm'},true);
  box.querySelectorAll('[data-se]').forEach(b=>b.onclick=()=>{const s=f.soil.samples.find(x=>x.id===b.dataset.se);soilForm(f,JSON.parse(JSON.stringify(s)),false);});
  const go1=$('#sgGo'),re=$('#sgRe');const run=async()=>{box.querySelector('h3:nth-of-type(2)');try{toast('Talajadat lekérése…');f.soil.sg=await fetchSoilGrids(f);save();renderSoil();}catch(e){toast(/50[234]|429/.test(String(e.message||e))?'A SoilGrids (ISRIC) szerver most túlterhelt vagy karbantartás alatt van – próbálja újra később. A többi funkciót ez nem érinti.':'SoilGrids nem érhető el: '+(e.message||e));}};
  if(go1)go1.onclick=run;if(re)re.onclick=e=>{e.preventDefault();run();};
  if(!sg&&!f.soil._tried){f.soil._tried=true;run();}
}
let soilPick=null;
function soilForm(f,s,isNew){
  modal(`<h2>🧪 Talajminta</h2><div class="grid2"><div><label class="f">Dátum</label><input class="input" type="date" data-s="date" value="${esc(s.date||'')}"></div><div><label class="f">Mélység</label><input class="input" data-s="depth" value="${esc(s.depth||'')}"></div></div>
  <label class="f" style="margin-top:10px">Hely</label><div class="row"><button class="btn sm" id="sMap">🗺️ Térképen jelölöm</button><button class="btn sm" id="sGps">📍 Itt vagyok (GPS)</button><span class="meta" id="sLoc">${s.lat?`${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}${s.zone?' · '+ZONE_NAME[s.zone-1]+' zóna':''}`:'egész tábla (nincs hely)'}</span></div>
  <div class="grid3" style="margin-top:10px">${SOIL_FIELDS.map(([k,l])=>`<div><label class="f">${l}</label><input class="input" inputmode="decimal" data-s="${k}" value="${esc(s[k]||'')}"></div>`).join('')}</div>
  <div class="grid2" style="margin-top:10px"><div><label class="f">Talajszerkezet (ásópróba)</label><select class="input" data-s="struct">${STRUCTS.map(x=>`<option ${s.struct===x?'selected':''}>${x}</option>`).join('')}</select></div><div><label class="f">Talajtípus (jegyzőkönyvből)</label><input class="input" data-s="stype" value="${esc(s.stype||'')}" placeholder="pl. mészlepedékes csernozjom"></div></div>
  <label class="f" style="margin-top:10px">Tömörödés / ekealp (mélység, megjegyzés)</label><input class="input" data-s="compact" value="${esc(s.compact||'')}" placeholder="pl. 28–35 cm-en tömör réteg">
  <label class="f" style="margin-top:10px">Megjegyzés / labor</label><input class="input" data-s="note" value="${esc(s.note||'')}">
  <div class="row" style="justify-content:space-between;margin-top:14px">${isNew?'<span></span>':'<button class="btn danger" id="sDel">Törlés</button>'}<div class="row"><button class="btn" id="sC">Mégse</button><button class="btn primary" id="sOk">Mentés</button></div></div>`);
  const read=()=>$('#dlg').querySelectorAll('[data-s]').forEach(i=>s[i.dataset.s]=i.value.trim());
  const setLoc=(lat,lng)=>{s.lat=lat;s.lng=lng;s.zone=zoneAt(f,lat,lng);};
  $('#sGps').onclick=()=>{read();navigator.geolocation?navigator.geolocation.getCurrentPosition(p=>{setLoc(p.coords.latitude,p.coords.longitude);soilForm(f,s,isNew);},e=>toast('GPS: '+(e.message||'nincs engedély')),{enableHighAccuracy:true,timeout:12000}):toast('Nincs GPS');};
  $('#sMap').onclick=()=>{read();closeModal();soilPick={f,s,isNew};mode='soil';hint('Koppintson a minta helyére a térképen.',false);fit(f);if(window.innerWidth<900)document.getElementById('mapWrap').scrollIntoView({behavior:'smooth'});};
  $('#sC').onclick=closeModal;
  $('#sOk').onclick=()=>{read();f.soil=f.soil||{samples:[]};if(isNew)f.soil.samples.push(s);else{const i=f.soil.samples.findIndex(x=>x.id===s.id);f.soil.samples[i]=s;}save();closeModal();renderAll();toast('Talajminta mentve');};
  const d=$('#sDel');if(d)d.onclick=()=>{f.soil.samples=f.soil.samples.filter(x=>x.id!==s.id);save();closeModal();renderAll();};
}
