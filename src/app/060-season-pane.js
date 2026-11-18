/* ================= season pane ================= */
function renderSeason(){
  const f=curField(),box=$('#seasonBox');if(!f){box.innerHTML='';return;}
  const se=season(f,S.year,true);
  const sumA=se.parts.reduce((a,p)=>a+(partArea(f,p)||0),0);
  let h=`<div class="row seasonTitle" style="justify-content:space-between"><h2 style="margin:0">${esc(fieldLabel(f))} – ${S.year}</h2>
    <div class="row"><button class="btn sm" id="yPrev">◀ ${S.year-1}</button><button class="btn sm" id="yNext" ${S.year>=THIS_YEAR?'disabled':''}>${S.year+1} ▶</button></div></div>
`+`<h3>Növény, vetés, aratás</h3>`;
  se.parts.forEach((p,i)=>{const y=calcYield(f,p),n=partNutr(se,p.id);
    h+=`<div class="card" data-p="${p.id}">
    <div class="partHead">${se.parts.length>1?`<i class="sw" style="background:${PART_COL[i%PART_COL.length]};width:14px;height:14px"></i>`:''}
      <input class="input" data-k="label" value="${esc(p.label)}" style="flex:1">
      ${!p.geometry&&se.parts.length>1?`<input class="input" data-k="areaHa" inputmode="decimal" value="${esc(numDisp(p.areaHa??''))}" placeholder="ha" style="width:80px">`:`<span class="meta">${fmt(partArea(f,p),2)} ha</span>`}
      ${se.parts.length>1?`<button class="btn sm ghost" data-split="${p.id}" title="Tovább osztás">✂️</button><button class="btn sm ghost danger" data-del="${p.id}">✕</button>`:''}
    </div>
    <div class="grid2 quick">
      <div><label class="f">Növény</label>${cropSelectHTML(p.crop)}</div>
      <div><label class="f">Hibrid / fajta</label><input class="input" data-k="hybrid" list="hybList" autocomplete="off" value="${esc(p.hybrid)}"${p.hybridReview?' title="Új név – admin felülvizsgálatra vár"':''} placeholder="pl. DKC 5092"></div>
      <div><label class="f">Vetés dátuma${sowReq(p.crop)?' <span class="reqStar" title="Kötelező">*</span>':''}</label><input class="input${sowReq(p.crop)&&!p.sowing?' reqMiss':''}" type="date" data-k="sowing" value="${esc(p.sowing)}"></div>
      <div class="span2m"><label class="f">Tőszám / vetőmag-norma${sowReq(p.crop)?' <span class="reqStar" title="Kötelező">*</span>':''}</label><div class="row" style="gap:6px;flex-wrap:nowrap"><input class="input${sowReq(p.crop)&&!p.density?' reqMiss':''}" style="flex:1;min-width:0" inputmode="decimal" data-k="density" value="${esc(numDisp(p.density))}" placeholder="${DENS_PH[densUnit(p)]}"><select class="input" data-k="densUnit" style="width:96px;flex:none" aria-label="Tőszám egysége">${DENS_UNITS.map(u=>`<option value="${u}" ${densUnit(p)===u?'selected':''}>${u}</option>`).join('')}</select></div></div>
      <div><label class="f">Hozam (t/ha, betakarításkor)</label><input class="input" inputmode="decimal" data-k="yieldWet" value="${esc(numDisp(p.yieldWet))}" placeholder="pl. 10,2"></div>
      <div><label class="f">Hozamadat forrása</label><select class="input" data-k="src">${Object.entries(SRC_LABEL).map(([k,l])=>`<option value="${k}" ${(p.src||'')===k?'selected':''}>${l}</option>`).join('')}</select></div>
    </div>
    ${p.crop&&!isCorn(p.crop)?`<div class="notice">Ebben az évben nem kukorica volt a táblán (elővetemény). Az adat megmarad, a kukorica-statisztikába nem számít bele.</div>`:''}
    ${reqMissing(p).length?`<div class="reqNote">Kötelező: ${reqMissing(p).join(', ')} – ezek nélkül a tábla nem kerülhet be a hibrid-, tőszám- és vetésidő-összehasonlításba.</div>`:''}
    <div class="calc">${y.std!=null?`Hozam szabvány nedvességen (${stdMoistFor(p)}%): <b>${fmt(y.std,2)} t/ha</b>${y.wet!=null&&num(p.totalT)!=null&&num(p.yieldWet)==null?` (mérlegjegyből: ${fmt(y.wet,2)} t/ha nedvesen)`:''}`:'A hozamhoz adja meg a t/ha-t vagy az összes tonnát.'}${typeof stYieldHint==='function'?stYieldHint(f,p,S.year,y.std):''}
    ${n.N||n.P||n.K?`<br>Kijuttatott hatóanyag: N ${fmt0(n.N)} · P₂O₅ ${fmt0(n.P)} · K₂O ${fmt0(n.K)}${n.S?` · S ${fmt0(n.S)}`:''} kg/ha`:''}</div>
    <details class="more" data-more="${p.id}" ${OPENMORE.has(p.id)||(!OPENMORE.has('x'+p.id)&&moreFilled(p))?'open':''} style="margin-top:10px"><summary class="moreSum">További adatok <span class="meta">– aratás, nedvesség, mérlegjegy, kelt tőszám, megjegyzés${moreFilled(p)?` · ${moreFilled(p)} kitöltve`:''}</span></summary>
    <div class="grid2" style="margin-top:8px">
      <div><label class="f">Aratás dátuma</label><input class="input" type="date" data-k="harvest" value="${esc(p.harvest)}"></div>
      <div><label class="f">Aratási nedvesség (%)</label><input class="input" inputmode="decimal" data-k="moisture" value="${esc(numDisp(p.moisture))}" placeholder="pl. 21"></div>
      <div><label class="f">…vagy összes tonna (mérlegjegy)</label><input class="input" inputmode="decimal" data-k="totalT" value="${esc(numDisp(p.totalT))}" placeholder="pl. 540"></div>
      <div><label class="f">Kelt tőszám (${standUnit(p)}, nem kötelező)${hq('stand')}</label><input class="input" inputmode="decimal" data-k="stand" value="${esc(numDisp(p.stand))}" placeholder="${standUnit(p)==='tő/ha'?'pl. 68000':'pl. 380'}"></div>
      ${densUnit(p)==='kg/ha'?`<div><label class="f">Ezermagtömeg (g, nem kötelező)</label><input class="input" inputmode="decimal" data-k="tkm" value="${esc(numDisp(p.tkm))}" placeholder="pl. 45"></div>`:''}
      <div class="meta" style="align-self:end;padding-bottom:10px">${seedsM2(p)&&densUnit(p)==='kg/ha'?`Vetett: <b>${fmt0(seedsM2(p))}</b> <b>mag/m²</b>${emergencePct(p)!=null?' · ':''}`:''}${emergencePct(p)!=null?`Kelési arány: <b>${fmt0(emergencePct(p))}%</b>`:densUnit(p)==='kg/ha'&&!num(p.tkm)?'Ezermagtömeggel a norma mag/m²-re váltható.':(!num(p.stand)?'Kelés után tőszámlálással (pl. 3 × 10 m sor)':'')}</div>
    </div>
    <div style="margin-top:8px"><label class="f">Megjegyzés (pl. jég, aszály, belvíz, vadkár)</label><input class="input" data-k="notes" value="${esc(p.notes)}"></div>
    <details class="adv" data-det="${p.id}" ${OPENDET.has(p.id)?'open':''} style="margin-top:8px"><summary class="meta" style="cursor:pointer">Részletek (FAO, szabvány-nedvesség, megbízhatóság)</summary>
    <div class="grid2" style="margin-top:8px">
      <div><label class="f">FAO-szám${hq('fao')}</label><input class="input" inputmode="numeric" data-k="fao" value="${esc(numDisp(p.fao))}" placeholder="pl. 420"></div>
      <div><label class="f">Szabvány-nedvesség (%)${hq('stdm')}</label><input class="input" inputmode="decimal" data-k="stdM" value="${esc(numDisp(p.stdM))}" placeholder="${STD_MOIST[p.crop]??14} (alap)"></div>
    </div><div class="meta" style="margin-top:6px">Megbízhatóság: <b>${SRC_CONF[p.src||'']?SRC_CONF[p.src||'']+' – '+['','mért','dokumentált','becsült'][SRC_CONF[p.src||'']]:'nincs megadva'}</b> (a hozamadat forrása alapján)</div></details>
    </details>
    </div>`;});
  h+=gxeCardHTML(f,gxeCropFor(f,se))+`<details class="more" data-more="split" ${OPENMORE.has('split')||se.parts.length>1?'open':''} style="margin-top:14px"><summary class="moreSum">Felosztás részekre <span class="meta">– ha a táblán több hibrid / fajta / kezelés volt</span></summary>
  <p class="help">${fmt(f.areaHa,2)} ha. Ha a táblán ebben az évben több hibrid / fajta / kezelés volt, ossza fel részekre – a többi évben a tábla egyben marad.</p>
  <div class="row" style="margin-bottom:8px">${se.parts.map((p,i)=>`<span class="chip"><i class="sw" style="background:${se.parts.length>1?PART_COL[i%PART_COL.length]:'#3f8a4c'}"></i>${esc(p.label)} · ${fmt(partArea(f,p),2)} ha</span>`).join('')}</div>
  ${se.parts.length>1&&Math.abs(sumA-f.areaHa)>0.05*f.areaHa?`<div class="notice warn">A részek összterülete (${fmt(sumA,2)} ha) eltér a táblától (${fmt(f.areaHa,2)} ha).</div>`:''}
  <div class="row">
    <button class="btn sm" id="bSplit">✂️ Felosztás vonallal</button>
    <button class="btn sm" id="bAddPart">+ Rész hektárral</button>
    ${prevSplit(f)?`<button class="btn sm" id="bCopyPrev">⧉ ${prevSplit(f)} évi felosztás másolása</button>`:''}
    ${se.parts.length>1?`<button class="btn sm ghost danger" id="bUnsplit">Felosztás megszüntetése</button>`:''}
  </div>
  </details>`+cropGuessHTML(f,S.year);
  if(se.smap){const Y=se.smap;h+=`<h3>Vetési térkép</h3><div class="card"><div class="row" style="justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><div><b>🌱 <span>Vetőgép tőszámtérkép</span></b><div class="meta"><span>${esc(Y.date)}${Y.date2?' – '+esc(Y.date2.slice(5)):''}</span> · <span>átlag ${Y.unit==='k/ha'?fmt0(Y.mean*1000)+' mag/ha':fmt0(Y.mean)+' kg/ha'}</span>${Y.product?` · <span data-noi18n>${esc(Y.product)}</span>`:''} · <span>${Y.cell} m-es rács</span></div></div>
    <div class="row" style="gap:6px"><button class="btn sm" id="smShow">🗺️ Megjelenítés</button><button class="btn sm ghost" id="smDel">Törlés</button></div></div></div>`;}
  if(se.ymap){const Y=se.ymap;h+=`<h3>Hozamtérkép</h3><div class="card"><div class="row" style="justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><div><b>🌾 <span>Kombájn hozamtérkép</span></b><div class="meta"><span>${esc(Y.date)}</span> · <span>átlag ${fmt(Y.mean,2)} t/ha</span>${Y.dry?'':' <span>(nedves tömeg)</span>'}${Y.moist!=null?` · <span>nedvesség ${fmt(Y.moist,1)}%</span>`:''} · <span>${Y.cell} m-es rács</span></div></div>
    <div class="row" style="gap:6px"><button class="btn sm" id="ymShow">🗺️ Megjelenítés</button><button class="btn sm ghost" id="ymDel">Törlés</button></div></div></div>`;}
  h+=`<datalist id="cropList" data-noi18n>${CROPS.map(c=>`<option value="${esc(cropDisp(c))}">`).join('')}</datalist>
  <h3>Műveletek ${S.year}</h3>
  <div class="row" style="margin-bottom:8px">${Object.entries(OPTYPES).map(([k,v])=>`<button class="btn sm ${k==='irr'||k==='other'?'adv':''}" data-add="${k}">${v.ic} + ${v.t}</button>`).join('')}</div>
  <div class="card ops">${se.ops.length?se.ops.slice().sort((a,b)=>(a.date||'').localeCompare(b.date||'')).map(o=>opRow(se,o)).join(''):'<div class="meta">Még nincs rögzített művelet ebben az évben.</div>'}</div>`;
  box.innerHTML=h;bindCropGuess(f);fillHybList(f,S.year);
  const smS=$('#smShow');if(smS)smS.onclick=()=>{S.view='smap';save();renderAnaLayer();fit(f);if(isMob()){MAPBIG=true;mobApply();}};
  const smD=$('#smDel');if(smD)smD.onclick=()=>confirmBox('Vetési térkép törlése',`A ${S.year}. évi vetési térkép törlődik. Az évadatok (vetés dátuma, tőszám) megmaradnak.`,'Törlés',()=>{delete se.smap;if(S.view==='smap')S.view='none';save();renderAll();renderAnaLayer();});
  const ymS=$('#ymShow');if(ymS)ymS.onclick=()=>{S.view='ymap';save();renderAnaLayer();fit(f);if(isMob()){MAPBIG=true;mobApply();}};
  const ymD=$('#ymDel');if(ymD)ymD.onclick=()=>confirmBox('Hozamtérkép törlése',`A ${S.year}. évi kombájn-hozamtérkép törlődik. Az évadatok (dátum, hozam, nedvesség) megmaradnak.`,'Törlés',()=>{delete se.ymap;if(S.view==='ymap')S.view='none';save();renderAll();renderAnaLayer();});
  $('#yPrev').onclick=()=>setYear(S.year-1);$('#yNext').onclick=()=>setYear(S.year+1);
  $('#bSplit').onclick=()=>{if(se.parts.length===1)startSplit(se.parts[0].id);else{toast('Válassza ki a felosztandó részt a ✂️ gombbal.');}};
  $('#bAddPart').onclick=()=>{ if(se.parts.length===1&&se.parts[0].label==='Egész tábla'){se.parts[0].label='A';se.parts[0].areaHa=f.areaHa;}
    const lb=nextLabels(se,1)[0]||('R'+(se.parts.length+1));se.parts.push(Object.assign(newPart(lb,null,null),{crop:se.parts[0].crop}));save();renderAll();toast('Adja meg a részek hektárját.');};
  const cp=$('#bCopyPrev');if(cp)cp.onclick=()=>{const py=prevSplit(f),ps=f.seasons[py];se.parts=ps.parts.map(p=>Object.assign(newPart(p.label,p.areaHa,p.geometry?p.geometry.map(x=>x.slice()):null),{crop:''}));save();renderAll();toast(`A ${py}. évi felosztás átmásolva (adatok nélkül).`);};
  const un=$('#bUnsplit');if(un)un.onclick=()=>confirmBox('Felosztás megszüntetése','A részek egy részbe vonódnak össze; az első rész adatai maradnak meg, a műveletek az egész táblára vonatkoznak.','Összevonás',()=>{const p0=se.parts[0];se.parts=[Object.assign(p0,{label:'Egész tábla',geometry:null,areaHa:f.areaHa})];se.ops.forEach(o=>o.parts=['all']);save();renderAll();});
  box.querySelectorAll('[data-det]').forEach(d=>d.ontoggle=()=>{d.open?OPENDET.add(d.dataset.det):OPENDET.delete(d.dataset.det);});
  box.querySelectorAll('[data-more]').forEach(d=>d.ontoggle=()=>{const id=d.dataset.more;if(d.open){OPENMORE.add(id);OPENMORE.delete('x'+id);}else{OPENMORE.delete(id);OPENMORE.add('x'+id);}});
  box.querySelectorAll('[data-p] input[type="date"]').forEach(inp=>{const pf=()=>se.parts.find(x=>x.id===inp.closest('[data-p]').dataset.p);
    inp.onchange=()=>{const v=inp.value;if(v&&+v.slice(0,4)<1990)return;const p=pf();if(p){p[inp.dataset.k]=v;save();}};
    inp.onblur=()=>{const v=inp.value;if(v&&+v.slice(0,4)<1990){toast('Ellenőrizze az évszámot (pl. 2026)');return;}renderSeason();renderMap();};});
  box.querySelectorAll('[data-p] input:not([type="date"]),[data-p] select').forEach(inp=>inp.onchange=()=>{const p=se.parts.find(x=>x.id===inp.closest('[data-p]').dataset.p);const k=inp.dataset.k;let val=inp.value.trim();
    if(!p.crop&&k!=='crop'&&val)p.crop='Kukorica';
    if(k==='hybrid'){hybridAsk(val,(nm,rev)=>{p.hybrid=nm;if(rev&&nm)p.hybridReview=true;else delete p.hybridReview;save();renderSeason();});return;}
    if(k==='crop')val=cropCanon(val);
    if(k in NUM_KEYS){let v=normNumStr(val,NUM_KEYS[k]);if(v==null){toast(`„${val}” nem értelmezhető számként – pl. 10,4 vagy 10.4`);inp.value=numDisp(p[k]);return;}
      if(((k==='density'&&densUnit(p)==='mag/ha')||(k==='stand'&&standUnit(p)==='tő/ha'))&&v!==''&&+v>0&&+v<300){v=String(Math.round(+v*1000));toast(`Ezerben értelmezve: ${numDisp(v)} /ha`);}val=v;}
    p[k]=val;if(inp.dataset.k==='yieldWet'&&inp.value)p.totalT='';if(inp.dataset.k==='totalT'&&inp.value)p.yieldWet='';save();renderSeason();renderMap();});
  box.querySelectorAll('[data-split]').forEach(b=>b.onclick=()=>{const p=se.parts.find(x=>x.id===b.dataset.split);if(!p.geometry&&se.parts.some(x=>x.geometry)){toast('Csak térképen megrajzolt rész osztható tovább.');return;}if(!p.geometry&&se.parts.length>1){toast('Hektárral megadott részt nem lehet vonallal osztani.');return;}startSplit(p.id);});
  box.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{const p=se.parts.find(x=>x.id===b.dataset.del);confirmBox('Rész törlése',`Törli a(z) <b>${esc(p.label)}</b> részt és adatait?`,'Törlés',()=>{se.parts=se.parts.filter(x=>x!==p);if(!se.parts.length)se.parts=[newPart('Egész tábla',f.areaHa,null)];if(se.parts.length===1){se.parts[0].geometry=null;se.parts[0].areaHa=f.areaHa;}se.ops.forEach(o=>{o.parts=(o.parts||['all']).filter(x=>x!==p.id);if(!o.parts.length)o.parts=['all'];});save();renderAll();});});
  box.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>opForm(se,{type:b.dataset.add,date:'',parts:['all']},true));
  box.querySelectorAll('[data-op]').forEach(b=>b.onclick=()=>{const o=se.ops.find(x=>x.id===b.dataset.op);opForm(se,JSON.parse(JSON.stringify(o)),false);});
}
/* növényválasztó: elöl a kukorica, alatta a többi növény elővetemény rögzítéséhez */
function cropSelectHTML(c){const opt=x=>`<option value="${esc(x)}" ${x===c?'selected':''}>${esc(cropDisp(x))}</option>`;
  const other=CROPS.filter(x=>!isCorn(x));const extra=c&&!CROPS.includes(c)?opt(c):'';
  return `<select class="input" data-k="crop"><option value="" ${c?'':'selected'}>– válasszon –</option><optgroup label="🌽 Kukorica">${CORN_CROPS.map(opt).join('')}</optgroup><optgroup label="Elővetemény / más növény">${other.map(opt).join('')}</optgroup>${extra}</select>`;}
function prevSplit(f){for(let y=S.year-1;y>=S.year-6;y--){const s=f.seasons&&f.seasons[y];if(s&&s.parts.length>1)return y;}return null;}
function opRow(se,o){const t=OPTYPES[o.type]||OPTYPES.other;let d='';
  if(o.type==='till')d=`${esc(o.kind||'')}${o.depth?`, ${esc(o.depth)} cm`:''}`;
  if(o.type==='fert'){const n=nutrientsOf(o);d=`${esc(o.product||'')}: ${esc(o.amount||'?')} ${esc(o.unit||'kg/ha')}${o.method?` (${esc(o.method)})`:''}<br><span class="meta">N ${fmt0(n.N)} · P₂O₅ ${fmt0(n.P)} · K₂O ${fmt0(n.K)}${n.S?` · S ${fmt0(n.S)}`:''} kg/ha</span>`;}
  if(o.type==='spray')d=`${esc(o.product||'')} ${o.dose?esc(o.dose)+' '+esc(o.unit||'l/ha'):''}${o.target?` – ${esc(o.target)}`:''}`;
  if(o.type==='irr')d=`${esc(o.mm||'?')} mm`;
  if(o.type==='other')d=esc(o.desc||'');
  const pn=(o.parts||['all']).includes('all')?'Egész tábla':(o.parts||[]).map(id=>se.parts.find(p=>p.id===id)?.label).filter(Boolean).join(', ');
  return `<div class="op"><div class="ic">${t.ic}</div><div class="tx"><b>${t.t}</b> <span class="meta">${esc(o.date||'dátum nélkül')} · ${esc(pn)}</span><br>${d}${o.note?`<br><span class="meta">${esc(o.note)}</span>`:''}</div><button class="btn sm ghost" data-op="${o.id}">✎</button></div>`;}
function opForm(se,o,isNew){
  const t=OPTYPES[o.type];const partsSel=se.parts.length>1?`<label class="f" style="margin-top:10px">Melyik részre?</label><div class="row"><label class="chip"><input type="checkbox" data-pp="all" ${(o.parts||['all']).includes('all')?'checked':''}> Egész tábla</label>${se.parts.map(p=>`<label class="chip"><input type="checkbox" data-pp="${p.id}" ${(o.parts||[]).includes(p.id)?'checked':''}> ${esc(p.label)}</label>`).join('')}</div>`:'';
  let fields='';
  if(o.type==='till')fields=`<div class="grid2"><div><label class="f">Művelet</label><select class="input" data-o="kind">${TILLAGE.map(x=>`<option ${o.kind===x?'selected':''}>${x}</option>`).join('')}</select></div><div><label class="f">Mélység (cm)</label><input class="input" inputmode="numeric" data-o="depth" value="${esc(o.depth||'')}"></div></div>`;
  if(o.type==='fert'){const fd=FERT.find(x=>x.n===o.product)||FERT[0];if(!o.product)o.product=fd.n;
    fields=`<label class="f">Termék</label><select class="input" data-o="product">${FERT.map(x=>`<option ${o.product===x.n?'selected':''}>${x.n}</option>`).join('')}</select>
    <div id="customBox" style="display:${fd.custom?'block':'none'};margin-top:8px"><div class="grid3"><div><label class="f">N %</label><input class="input" inputmode="decimal" data-o="cN" value="${esc(o.cN||'')}"></div><div><label class="f">P₂O₅ %</label><input class="input" inputmode="decimal" data-o="cP" value="${esc(o.cP||'')}"></div><div><label class="f">K₂O %</label><input class="input" inputmode="decimal" data-o="cK" value="${esc(o.cK||'')}"></div></div><input class="input" data-o="cname" placeholder="Termék neve" value="${esc(o.cname||'')}" style="margin-top:8px"></div>
    <div class="grid3" style="margin-top:8px"><div><label class="f">Mennyiség</label><input class="input" inputmode="decimal" data-o="amount" value="${esc(o.amount||'')}"></div><div><label class="f">Egység</label><select class="input" data-o="unit">${['kg/ha','l/ha','t/ha'].map(u=>`<option ${(o.unit||fd.unit||'kg/ha')===u?'selected':''}>${u}</option>`).join('')}</select></div><div><label class="f">Mód</label><select class="input" data-o="method">${['','alaptrágya','starter (vetéssel)','fejtrágya','lombtrágya'].map(u=>`<option ${o.method===u?'selected':''}>${u}</option>`).join('')}</select></div></div>
    <div class="calc" id="nutrCalc"></div>`;}
  if(o.type==='spray')fields=`<label class="f">Készítmény</label><input class="input" data-o="product" value="${esc(o.product||'')}"><div class="grid3" style="margin-top:8px"><div><label class="f">Dózis</label><input class="input" inputmode="decimal" data-o="dose" value="${esc(o.dose||'')}"></div><div><label class="f">Egység</label><select class="input" data-o="unit">${['l/ha','kg/ha','g/ha','ml/ha'].map(u=>`<option ${(o.unit||'l/ha')===u?'selected':''}>${u}</option>`).join('')}</select></div><div><label class="f">Cél</label><select class="input" data-o="target">${['','gyom','rovar','gomba','csávázás','növekedésszabályzó','deszikkálás','egyéb'].map(u=>`<option ${o.target===u?'selected':''}>${u}</option>`).join('')}</select></div></div>`;
  if(o.type==='irr')fields=`<label class="f">Öntözővíz (mm)</label><input class="input" inputmode="decimal" data-o="mm" value="${esc(o.mm||'')}">`;
  if(o.type==='other')fields=`<label class="f">Leírás</label><input class="input" data-o="desc" value="${esc(o.desc||'')}">`;
  modal(`<h2>${t.ic} ${t.t}</h2><label class="f">Dátum</label><input class="input" type="date" data-o="date" value="${esc(o.date||'')}"><div style="margin-top:10px">${fields}</div>${partsSel}
  <label class="f" style="margin-top:10px">Megjegyzés</label><input class="input" data-o="note" value="${esc(o.note||'')}">
  <div class="row" style="justify-content:space-between;margin-top:14px">${isNew?'<span></span>':'<button class="btn danger" id="oDel">Törlés</button>'}<div class="row"><button class="btn" id="oC">Mégse</button><button class="btn primary" id="oOk">Mentés</button></div></div>`);
  const read=()=>{$('#dlg').querySelectorAll('[data-o]').forEach(i=>o[i.dataset.o]=i.value.trim());const pp=[...$('#dlg').querySelectorAll('[data-pp]')];if(pp.length){const all=pp.find(x=>x.dataset.pp==='all').checked;o.parts=all?['all']:pp.filter(x=>x.checked&&x.dataset.pp!=='all').map(x=>x.dataset.pp);if(!o.parts.length)o.parts=['all'];}else o.parts=['all'];const fd=FERT.find(x=>x.n===o.product);o.custom=!!(fd&&fd.custom);};
  const upd=()=>{if(o.type!=='fert')return;read();const fd=FERT.find(x=>x.n===o.product);$('#customBox').style.display=fd&&fd.custom?'block':'none';const n=nutrientsOf(o);$('#nutrCalc').innerHTML=`Hatóanyag: N <b>${fmt0(n.N)}</b> · P₂O₅ <b>${fmt0(n.P)}</b> · K₂O <b>${fmt0(n.K)}</b>${n.S?` · S <b>${fmt0(n.S)}</b>`:''} kg/ha <span class="meta">(közelítő, a termék összetétele szerint)</span>`;};
  $('#dlg').querySelectorAll('[data-o]').forEach(i=>{i.oninput=upd;i.onchange=()=>{if(i.dataset.o==='product'){const fd=FERT.find(x=>x.n===i.value);if(fd&&fd.unit){$('#dlg').querySelector('[data-o="unit"]').value=fd.unit;}}upd();};});
  $('#dlg').querySelectorAll('[data-pp]').forEach(c=>c.onchange=()=>{if(c.dataset.pp==='all'&&c.checked)$('#dlg').querySelectorAll('[data-pp]').forEach(x=>{if(x!==c)x.checked=false;});if(c.dataset.pp!=='all'&&c.checked)$('#dlg').querySelector('[data-pp="all"]').checked=false;});
  upd();
  $('#oC').onclick=closeModal;
  $('#oOk').onclick=()=>{read();if(isNew){o.id=uid();se.ops.push(o);}else{const i=se.ops.findIndex(x=>x.id===o.id);se.ops[i]=o;}save();closeModal();renderAll();toast('Mentve');};
  const d=$('#oDel');if(d)d.onclick=()=>{se.ops=se.ops.filter(x=>x.id!==o.id);save();closeModal();renderAll();};
}
