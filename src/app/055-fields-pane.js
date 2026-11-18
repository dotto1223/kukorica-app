/* ================= fields pane ================= */
/* egyszerű nézet: egy sor – település, az utolsó év kultúrája és hozama */
function simpleLine(f,last,crops){const fy=last&&typeof fieldYield==='function'?fieldYield(f,last):null;
  return `<div class="meta">${f.settlement?esc(f.settlement)+' · ':''}${last?`${last}: ${esc(crops||'–')}${fy?' · <b>'+fmt(fy.y,1)+' t/ha</b>':''}`:(todoOf(f)?'':'<span class="warnTxt">még nincs évadat</span>')}</div>`;}
function fieldSummary(f){const ys=Object.keys(f.seasons||{}).filter(y=>hasData(f.seasons[y])).sort();let t='';
  if(ys.length){const y=ys[ys.length-1];const fy=typeof fieldYield==='function'?fieldYield(f,y):null;const crops=[...new Set(f.seasons[y].parts.map(p=>p.crop).filter(Boolean))].join('+');t+=`${y}: ${esc(crops||'–')}${fy?' · '+fmt(fy.y,2)+' t/ha':''}`;}
  const a=typeof ANA!=='undefined'&&ANA[f.id];const st=JOB.cur===f.id?'⏳ elemzés fut':JOB.queue.includes(f.id)?'⏳ sorban':a?(a.homog?'zónák: homogén':`zónák: ${fmt0((a.spread||0)*100)}% eltérés`):'zónák: –';
  return `<div class="meta" style="margin-top:2px">${t?t+' · ':''}${st}</div>`;}
function renameDialog(f){modal(`<h2>Tábla adatai</h2><div class="meta">Kód: <b>${esc(f.code||'– (mentéskor kapja)')}</b>${f.settlement?' · '+esc(f.settlement)+(f.county?', '+esc(f.county):''):''}</div>
  <label class="f">Saját név (fantázianév)</label><input class="input" id="rnN" value="${esc(f.name||'')}" placeholder="pl. Trafó tábla">
  <label class="f">Település</label><input class="input" id="rnS" value="${esc(f.settlement||'')}">
  ${fCountry(f)!=='hu'?`<label class="f">Kataszteri község</label><input class="input" id="rnK" value="${esc(f.ko||'')}" placeholder="${esc(f.settlement||'')}">`:''}
  <label class="f">${parcelLabel(f)} (nem kötelező)</label><input class="input" id="rnH" value="${esc(f.hrsz||'')}" placeholder="pl. 0123/4, 0123/5">
  ${fCountry(f)==='hu'?`<label class="f">MePAR blokkazonosító(k) (nem kötelező)</label><input class="input" id="rnM" value="${esc(f.mepar||'')}" placeholder="a támogatási kérelemben szereplő azonosító">`:''}
  <p class="help">Több azonosítót vesszővel válasszon el. A keresőben ezekre is rá lehet keresni.</p>
  <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn" id="rnC">Mégse</button><button class="btn primary" id="rnOk">Mentés</button></div>`);
  $('#rnC').onclick=closeModal;$('#rnOk').onclick=()=>{f.name=normName($('#rnN').value);f.hrsz=idList($('#rnH').value).join(', ');f.settlement=$('#rnS').value.trim();const m=$('#rnM');if(m)f.mepar=idList(m.value).join(', ');const k=$('#rnK');if(k)f.ko=k.value.trim();closeModal();save();renderAll();};}
let SEARCH_HIT=null;
function renderFields(){if(typeof ensureDistricts==='function')ensureDistricts();normalizeAll();if(SB_ON&&SESS&&PROFILE&&!HYB)loadHybrids();if(typeof renderStatBanner==='function'){renderStatBanner();if(!STATS&&SB_ON&&SESS&&PROFILE)setTimeout(()=>loadStats(),1500);}
  const el=$('#fieldList');
  if(!S.fields.length){SELM=null;renderSelBar([]);el.innerHTML='<div class="empty">Még nincs tábla.<br>Kattintson az <b>＋ Új tábla</b> gombra.</div>';return;}
  const q=(($('#fieldSearch')||{}).value||'').trim().toLowerCase();
  const hay=f=>[f.code,f.name,f.settlement,f.county,idHay(f),f._ownerName,...Object.keys(f.seasons||{}),...Object.values(f.seasons||{}).flatMap(se=>(se.parts||[]).map(p=>(p.crop||'')+' '+(p.hybrid||'')))].join(' ').toLowerCase();
  const qw=q?q.split(/\s+/):[];let list=q?S.fields.filter(f=>{const h=hay(f);return qw.every(w=>h.includes(w)||h.includes(idNorm(w)));}):S.fields;
  if(q){const ex=f=>qw.some(w=>idExact(f,w));list=list.filter(ex).concat(list.filter(f=>!ex(f)));}
  SEARCH_HIT=q&&list.length&&(list.length===1||qw.some(w=>idExact(list[0],w)))?list[0].id:null;
  renderChips();if(LIST_CHIP!=='all')list=list.filter(f=>chipMatch(f,LIST_CHIP));
  $('#fieldSearchWrap').style.display=(S.fields.length>3||S.fields.some(f=>f.hrsz||f.mepar)||document.documentElement.classList.contains('mob'))?'':'none';
  renderSelBar(list);
  if(!list.length){el.innerHTML='<div class="empty">Nincs találat.</div>';return;}
  el.innerHTML=list.map(f=>{const ys=Object.keys(f.seasons||{}).filter(y=>hasData(f.seasons[y]));
    const last=ys.sort().slice(-1)[0];const crops=last?[...new Set(f.seasons[last].parts.map(p=>p.crop).filter(Boolean))].join(' + '):'';
    const ck=SELM?`<input type="checkbox" class="selCk" ${SELM.has(f.id)?'checked':''} tabindex="-1">`:'';
    return `<div class="card click fcard ${SELM?(SELM.has(f.id)?'pick':''):(f.id===S.sel?'sel':'')}" data-id="${f.id}">
      <div class="fc-top"><b>${ck}${esc(fieldLabel(f))}</b><span class="fc-ha">${fmt(f.areaHa,1)} ha</span></div>
      ${S.simple?simpleLine(f,last,crops):`<div class="meta">${f.settlement?'📍 '+esc(f.settlement)+' · ':''}${f._ownerName&&isAdmin()?'👤 '+esc(f._ownerName)+' · ':''}${ys.length?ys.length+' év kitöltve':'<span class="warnTxt">még nincs évadat</span>'}${crops?' · '+last+': '+esc(crops):''}</div>
      ${fieldSummary(f)}`}${(()=>{const t=todoOf(f);return t?`<div class="todo"><i></i>${esc(t)}</div>`:'';})()}</div>`;}).join('');
  el.querySelectorAll('.card').forEach(c=>c.onclick=()=>{if(SELM){const id=c.dataset.id;SELM.has(id)?SELM.delete(id):SELM.add(id);renderFields();}else selectField(c.dataset.id);});
}
/* ---- több tábla kijelölése és törlése ---- */
let SELM=null;// kijelölő mód: a kijelölt táblák azonosítói
function renderSelBar(list){const el=$('#selBar');if(!el)return;
  if(!S.fields.length){el.innerHTML='';return;}
  if(!SELM){el.innerHTML=`<div class="selBar"><button class="btn sm" id="selOn">☑ Több tábla kijelölése</button></div>`;$('#selOn').onclick=()=>{SELM=new Set();renderFields();};return;}
  const ids=list.map(f=>f.id);const all=ids.length&&ids.every(id=>SELM.has(id));const n=SELM.size;
  const ha=S.fields.filter(f=>SELM.has(f.id)).reduce((a,f)=>a+(f.areaHa||0),0);
  el.innerHTML=`<div class="selBar on"><span><b>${n}</b> kijelölve${n?` · ${fmt(ha,1)} ha`:''}</span>
    <span class="row" style="gap:6px;flex-wrap:wrap"><button class="btn sm" id="selAll">${all?'Kijelölés megszüntetése':'Mind kijelölése'}</button>
    <button class="btn sm danger" id="selDel" ${n?'':'disabled'}>🗑 Törlés</button><button class="btn sm" id="selX">Kész</button></span></div>`;
  $('#selAll').onclick=()=>{if(all)ids.forEach(id=>SELM.delete(id));else ids.forEach(id=>SELM.add(id));renderFields();};
  $('#selX').onclick=()=>{SELM=null;renderFields();};
  $('#selDel').onclick=()=>{const F=S.fields.filter(f=>SELM.has(f.id));if(!F.length)return;
    const names=F.slice(0,12).map(f=>'<li>'+esc(fieldLabel(f))+'</li>').join('')+(F.length>12?`<li>… és még ${F.length-12}</li>`:'');
    confirmBox('Táblák törlése',`Biztosan törli a kijelölt <b>${F.length}</b> táblát (${fmt(ha,1)} ha)? Minden évadatuk törlődik.<ul class="selList">${names}</ul>`,'Törlés',()=>{
      deleteFields(F.map(f=>f.id));SELM=null;renderFields();toast(`${F.length} tábla törölve`);});};}
/* táblák törlése (helyben és a felhőben is, a következő szinkronizáláskor) */
function deleteFields(ids){const D=new Set(ids);S.fields=S.fields.filter(x=>!D.has(x.id));ids.forEach(id=>{delete ANA[id];});
  try{const t=JSON.parse(localStorage.getItem('tt.cloud.deleted')||'[]');t.push(...ids);localStorage.setItem('tt.cloud.deleted',JSON.stringify(t));}catch(e){}
  if(D.has(S.sel))S.sel=null;save();if(typeof renderAll==='function')renderAll();}
/* teendő egy táblán (a lista narancs jelzése) */
function todoOf(f){if(JOB.cur===f.id||JOB.queue.includes(f.id))return 'elemzés fut';const ys=Object.keys(f.seasons||{}).filter(y=>hasData(f.seasons[y])).sort();
  if(!ys.length)return 'hiányzik: növény';const y=ys[ys.length-1],se=f.seasons[y];
  if(se.parts.some(p=>!p.crop))return 'hiányzik: növény';if(se.parts.some(p=>!p.sowing))return 'hiányzik: vetés';if(se.parts.some(p=>sowReq(p.crop)&&!p.density))return 'hiányzik: tőszám';
  if(+y<THIS_YEAR&&se.parts.some(p=>!p.yieldWet&&!p.totalT))return 'hiányzik: hozam';return '';}
/* gyorsszűrők a lista felett */
let LIST_CHIP='all';
function chipMatch(f,c){if(c==='todo')return !!todoOf(f);if(c==='corn')return Object.values(f.seasons||{}).some(se=>se.parts.some(p=>isCorn(p.crop)));if(c.startsWith('crop:')){const k=c.slice(5);return Object.values(f.seasons||{}).some(se=>se.parts.some(p=>p.crop===k));}
  if(c.startsWith('town:'))return f.settlement===c.slice(5);return true;}
function renderChips(){const el=$('#chipRow');if(!el)return;if(S.fields.length<3){el.innerHTML='';return;}
  const cnt=(arr)=>{const m={};arr.forEach(x=>{if(x)m[x]=(m[x]||0)+1;});return Object.entries(m).sort((a,b)=>b[1]-a[1]).map(x=>x[0]);};
  const crops=cnt(S.fields.flatMap(f=>[...new Set(Object.values(f.seasons||{}).flatMap(se=>se.parts.map(p=>p.crop)))])).filter(c=>!isCorn(c)).slice(0,0);
  const towns=cnt(S.fields.map(f=>f.settlement)).slice(0,2);
  const C=[['all','Mind'],['corn','🌽 Volt rajta kukorica'],['todo','Teendő van']].concat(crops.map(c=>['crop:'+c,c]),towns.map(t=>['town:'+t,t]));
  if(!C.some(c=>c[0]===LIST_CHIP))LIST_CHIP='all';
  el.innerHTML=C.map(([k,l])=>`<button class="chipBtn${k===LIST_CHIP?' on':''}" data-c="${esc(k)}">${esc(l)}</button>`).join('');
  el.querySelectorAll('button').forEach(b=>b.onclick=()=>{LIST_CHIP=b.dataset.c;renderFields();});}
function hasData(se){return se&&(se.ops.length||se.parts.some(p=>p.crop||p.hybrid||p.yieldWet||p.totalT||p.sowing||p.yieldStd!=null));}
let vtx=[],geoEdit=null;
function editGeom(f){endMode();renderAll();
  geoEdit={f,g:f.geometry.map(p=>p.slice()),hist:[],sel:-1};mode='geo';fit(f);toast('Húzza a pontokat · „+”: új pont · pontra koppintás: törlés');$('#btnGeo').style.display='none';map.doubleClickZoom.disable();
  $('#hintUndo').style.display='';$('#hintOk').textContent='Kész';drawGeoEdit();}
function geoSnap(){geoEdit.hist.push(geoEdit.g.map(p=>p.slice()));if(geoEdit.hist.length>50)geoEdit.hist.shift();}
function drawGeoEdit(){const E=geoEdit;if(!E)return;tmp.clearLayers();vtx=[];
  L.polygon(E.g,{color:'#ffe066',weight:3,fillColor:'#ffe066',fillOpacity:.12,interactive:false}).addTo(tmp);
  const n=E.g.length;
  // felezőpontok: húzással vagy koppintással új sarokpont
  for(let i=0;i<n;i++){const a=E.g[i],b=E.g[(i+1)%n];const mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];
    const mm=L.marker(mid,{draggable:true,icon:L.divIcon({className:'vtxMid',html:'+'}),zIndexOffset:500}).addTo(tmp);
    mm.on('dragstart',()=>{geoSnap();E.g.splice(i+1,0,mid.slice());E.dragIns=i+1;});
    mm.on('drag',e=>{const p=e.target.getLatLng();if(E.dragIns!=null){E.g[E.dragIns]=[p.lat,p.lng];livePoly();}});
    mm.on('dragend',()=>{E.sel=E.dragIns;E.dragIns=null;drawGeoEdit();});
    mm.on('click',()=>{geoSnap();E.g.splice(i+1,0,mid.slice());E.sel=i+1;drawGeoEdit();});}
  E.g.forEach((ll,i)=>{const m=L.marker(ll,{draggable:true,icon:L.divIcon({className:'vtx big'+(i===E.sel?' sel':'')}),zIndexOffset:1000}).addTo(tmp);
    m.on('dragstart',()=>{geoSnap();E.sel=i;});m.on('drag',e=>{const p=e.target.getLatLng();E.g[i]=[p.lat,p.lng];livePoly();});
    m.on('dragend',()=>drawGeoEdit());m.on('click',()=>{E.sel=(E.sel===i?-1:i);drawGeoEdit();});vtx.push(m);});
  geoHint();}
function livePoly(){const E=geoEdit;tmp.eachLayer(l=>{if(l instanceof L.Polygon)l.setLatLngs(E.g);});$('#hintMsg').textContent=`${fmt(haOf(E.g),2)} ha · ${E.g.length} pont`;}
function geoHint(){const E=geoEdit;
  hint(`📐 ${fmt(haOf(E.g),2)} ha · ${E.g.length} pont`,true);
  const alt=$('#hintAlt');if(E.sel>=0&&E.g.length>3){alt.style.display='';alt.textContent='🗑 Pont törlése';}else alt.style.display='none';
  $('#hintUndo').disabled=!E.hist.length;}
function finishGeoEdit(save_){const E=geoEdit;if(!E)return;geoEdit=null;tmp.clearLayers();vtx=[];
  if(save_){E.f.geometry=E.g;E.f.areaHa=haOf(E.g);save();queueAnalysis(E.f.id,true);toast(`Határ mentve: ${fmt(E.f.areaHa,2)} ha`);}
  endMode();renderAll();}
