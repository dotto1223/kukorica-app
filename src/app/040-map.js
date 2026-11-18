/* ================= map ================= */
const IS_PHONE=window.matchMedia('(max-width:700px)').matches;
const map=L.map('map',{zoomControl:true,tap:true,renderer:L.svg({padding:1}),fadeAnimation:false,maxZoom:21}).setView([46.80,19.00],13);
/* Rejtett (pl. telefonon a lista mögötti) térképen a ráillesztés hibás nagyítást adna – ilyenkor elhalasztjuk, amíg látható nem lesz. */
let PENDFIT=null;const _fitB=map.fitBounds.bind(map);
map.fitBounds=function(b,o){const c=map.getContainer();if(c.clientWidth<60||c.clientHeight<60){PENDFIT=[b,o];return map;}PENDFIT=null;const z=map.getSize();if(Math.abs(z.x-c.clientWidth)>2||Math.abs(z.y-c.clientHeight)>2)map.invalidateSize(false);return _fitB(b,o);};
function flushFit(){if(!PENDFIT)return;const c=map.getContainer();if(c.clientWidth<60||c.clientHeight<60)return;const [b,o]=PENDFIT;PENDFIT=null;try{map.invalidateSize();_fitB(b,o);}catch(e){}}
const BASES={
 esri:['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:21,maxNativeZoom:19,attribution:'Esri, Maxar, Earthstar'}],
 s2_2023:['https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2023_3857/default/g/{z}/{y}/{x}.jpg',{maxZoom:21,maxNativeZoom:17,attribution:'Sentinel-2 cloudless 2023 – s2maps.eu, EOX (Copernicus)'}],
 s2_2021:['https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2021_3857/default/g/{z}/{y}/{x}.jpg',{maxZoom:21,maxNativeZoom:17,attribution:'Sentinel-2 cloudless 2021 – s2maps.eu, EOX (Copernicus)'}],
 s2_2019:['https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2019_3857/default/g/{z}/{y}/{x}.jpg',{maxZoom:21,maxNativeZoom:17,attribution:'Sentinel-2 cloudless 2019 – s2maps.eu, EOX (Copernicus)'}],
 osm:['https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:21,maxNativeZoom:19,attribution:'© OpenStreetMap'}]
};
let base=null,baseOk=false,baseErr=0;
function setBase(k){if(base)map.removeLayer(base);baseOk=false;baseErr=0;base=L.tileLayer(BASES[k][0],Object.assign({keepBuffer:6,updateWhenZooming:false},BASES[k][1]));base.on('tileload',()=>{baseOk=true;$('#map').classList.remove('nobase');});base.on('tileerror',()=>{baseErr++;if(!baseOk&&baseErr>6){$('#map').classList.add('nobase');if(!window.__baseWarn){window.__baseWarn=1;toast('A háttértérkép most nem tölthető be. Ellenőrizze az internetkapcsolatot.');}}});base.addTo(map);}
/* település- és határnevek átlátszó rétegként a műholdkép fölött (a táblák alatt, nem fogja el a koppintást) */
map.createPane('labels');map.getPane('labels').style.zIndex=350;map.getPane('labels').style.pointerEvents='none';
/* tartalék: Esri raszteres feliratok, ha a vektoros réteg nem tölthető (pl. nincs WebGL) */
const labelRaster=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',{pane:'labels',maxZoom:21,maxNativeZoom:19,keepBuffer:4,attribution:'Esri feliratok'});
let labelLayer=null,labelLoading=null;
function getLabelLayer(){if(labelLayer)return Promise.resolve(labelLayer);
  if(!labelLoading)labelLoading=window.loadVectorLabels().then(m=>{const c=document.createElement('canvas');if(!(c.getContext('webgl2')||c.getContext('webgl')))throw new Error('no webgl');labelLayer=m.makeLabelLayer('labels');return labelLayer;}).catch(e=>{console.warn('vektoros feliratok helyett raszter',e);labelLayer=labelRaster;return labelLayer;});
  return labelLoading;}
let BASE_KEY='esri';
function labelsWanted(){try{return localStorage.getItem('tt.labels')!=='0';}catch(e){return true;}}
function syncLabels(){const on=labelsWanted()&&BASE_KEY!=='osm';
  getLabelLayer().then(ly=>{const want=labelsWanted()&&BASE_KEY!=='osm';if(want&&!map.hasLayer(ly))ly.addTo(map);if(!want&&map.hasLayer(ly))map.removeLayer(ly);});
  if(!on&&labelLayer&&map.hasLayer(labelLayer))map.removeLayer(labelLayer);}
setBase('esri');syncLabels();
$('#baseSel').onchange=e=>{BASE_KEY=e.target.value;setBase(BASE_KEY);syncLabels();};
let fieldLayers=L.layerGroup().addTo(map),partLayers=L.layerGroup().addTo(map),ndviLayer=null,meMarker=null;

function renderMap(){
  fieldLayers.clearLayers();partLayers.clearLayers();fieldPins.clearLayers();
  PIN_DATA=S.fields.map(x=>({x,c:L.polygon(x.geometry).getBounds().getCenter()}));
  pinToggle();
  const f=curField();
  S.fields.forEach(x=>{
    const sel=x.id===S.sel;
    const pl=L.polygon(x.geometry,{color:sel?'#ffe066':'#ffffff',weight:sel?4:(IS_PHONE?3:2),fillOpacity:sel?0.05:0.22,fillColor:'#3f8a4c'});
    const ss=sel&&x.seasons&&x.seasons[S.year];if(!(ss&&ss.parts.length>1&&ss.parts.some(q=>q.geometry)))pl.bindTooltip(esc(fieldLabel(x)),{permanent:true,direction:'center',className:'flabel'});
    pl.on('click',()=>{if(!mode)pickField(x.id);});
    fieldLayers.addLayer(pl);
  });
  if(f){const se=season(f,S.year,false);
    if(se&&se.parts.length>1){se.parts.forEach((p,i)=>{const g=partGeom(f,p);if(p.geometry){const pl=L.polygon(g,{color:PART_COL[i%PART_COL.length],weight:2,fillOpacity:.25});pl.bindTooltip(esc(p.label)+(p.hybrid?' · '+esc(p.hybrid):''),{permanent:true,direction:'center',className:'flabel'});partLayers.addLayer(pl);}});}
  }
  if(f&&f.soil&&f.soil.samples)f.soil.samples.forEach(sm=>{if(sm.lat){const m=L.circleMarker([sm.lat,sm.lng],{radius:6,color:'#fff',weight:2,fillColor:'#6b3fa0',fillOpacity:1});m.bindTooltip(`🧪 ${esc(sm.date||'')}${sm.phKCl?' · pH '+esc(sm.phKCl):''}${sm.p?' · P '+esc(sm.p):''}${sm.k?' · K '+esc(sm.k):''}`);partLayers.addLayer(m);}});
  if(typeof loadAna==='function'){const ff=curField();if(ff)loadAna(ff).then(()=>{if(curField()===ff)renderAnaLayer();});else renderAnaLayer();}
}

/* drawing / split modes */
let mode=null,pts=[],tmp=L.layerGroup().addTo(map),splitTarget=null;
function hint(msg,showOk){$('#hint').classList.add('on');$('#hintMsg').textContent=msg;$('#hintOk').style.display=showOk?'':'none';}
function endMode(){mode=null;setTimeout(()=>typeof renderOnb==='function'&&renderOnb(),0);try{geoEdit=null;vtx=[];}catch(e){}try{ftwLayer.clearLayers();}catch(e){}pts=[];tmp.clearLayers();$('#hint').classList.remove('on');$('#hintAlt').style.display='none';$('#hintMinus').style.display='none';$('#hintPlus').style.display='none';$('#hintUndo').style.display='';$('#hintOk').textContent='Kész';map.getContainer().style.cursor='';map.doubleClickZoom.enable();}
function redrawTmp(){tmp.clearLayers();if(!pts.length)return;
  if(mode==='draw'){L.polyline(pts.concat(pts.length>2?[pts[0]]:[]),{color:'#ffe066',weight:3,dashArray:'6 6'}).addTo(tmp);
    pts.forEach((p,i)=>{const m=L.marker(p,{draggable:true,icon:L.divIcon({className:'vtx big'+(i===0?' first':'')})}).addTo(tmp);if(i===0)m.on('click',finishDraw);m.on('dragend',e=>{const q=e.target.getLatLng();pts[i]=[q.lat,q.lng];redrawTmp();});});
    hint(pts.length<3?`Koppintson a tábla sarokpontjaira (${pts.length} pont).`:`${fmt(haOf(pts),2)} ha – koppintson az első pontra vagy a „Kész” gombra.`,pts.length>=3);}
  if(mode==='split'){pts.forEach(p=>L.marker(p,{icon:L.divIcon({className:'vtx'})}).addTo(tmp));if(pts.length===2)L.polyline(pts,{color:'#ff5252',weight:3}).addTo(tmp);}
}
map.on('click',e=>{
  if(mode==='soil'&&soilPick){const {f,s,isNew}=soilPick;soilPick=null;endMode();s.lat=e.latlng.lat;s.lng=e.latlng.lng;s.zone=zoneAt(f,s.lat,s.lng);soilForm(f,s,isNew);return;}
  if(mode==='auto'){autoAt(e.latlng.lat,e.latlng.lng,false);return;}
  if(mode==='geo'){if(geoEdit&&geoEdit.sel>=0){geoEdit.sel=-1;drawGeoEdit();}return;}
  if(!mode)return;pts.push([e.latlng.lat,e.latlng.lng]);
  if(mode==='split'){redrawTmp();if(pts.length===1)hint('Most koppintson a vonal másik végére (a táblán túl).',false);if(pts.length===2)doSplit();return;}
  redrawTmp();
});
$('#fieldSearch').oninput=()=>renderFields();
$('#fieldSearch').onkeydown=e=>{if(e.key==='Enter'){renderFields();if(SEARCH_HIT){e.target.blur();selectField(SEARCH_HIT);}else toast('Több találat – válasszon a listából, vagy pontosítsa (pl. település + helyrajzi szám).');}};
$('#btnGeo').onclick=()=>{const f=curField();if(f)editGeom(f);};
$('#btnDraw').onclick=()=>{if(mode)return endMode();endMode();mode='draw';map.doubleClickZoom.disable();map.getContainer().style.cursor='crosshair';hint('Koppintson a tábla sarokpontjaira.',false);};
$('#hintUndo').onclick=()=>{if(mode==='geo'){if(geoEdit&&geoEdit.hist.length){geoEdit.g=geoEdit.hist.pop();geoEdit.sel=-1;drawGeoEdit();}return;}pts.pop();redrawTmp();if(mode==='split'&&!pts.length)hint('Koppintson az osztóvonal egyik végére (a táblán kívül).',false);};
$('#hintCancel').onclick=()=>{if(mode==='geo')return finishGeoEdit(false);endMode();};
function hintOkDefault(){if(mode==='draw')finishDraw();else if(mode==='auto')acceptAuto();else if(mode==='geo')finishGeoEdit(true);}
$('#hintOk').onclick=hintOkDefault;
function finishDraw(){if(pts.length<3)return toast('Legalább 3 pont kell.');const g=pts.slice();endMode();
  ask('Saját név (nem kötelező)','pl. Trafó tábla – a táblakódot a program adja','',name=>{const f={id:uid(),name:normName(name||''),geometry:g,areaHa:haOf(g),seasons:{},notes:''};S.fields.push(f);S.sel=f.id;save();renderAll();fit(f);queueAnalysis(f.id);go('border');editGeom(f);ensureCode(f).then(()=>{save();renderHeader();renderFields();});});}
function fit(f){if(!f)return;const small=IS_PHONE&&!mode&&map.getContainer().clientHeight<320;map.fitBounds(L.polygon(f.geometry).getBounds(),small?{paddingTopLeft:[56,14],paddingBottomRight:[56,14],maxZoom:17}:{paddingTopLeft:[40,mode?150:60],paddingBottomRight:[40,40],maxZoom:17});}
function startSplit(pid){const f=curField();if(!f)return;splitTarget=pid;endMode();mode='split';map.doubleClickZoom.disable();fit(f);hint('Osztóvonal: koppintson a vonal egyik végére a táblán KÍVÜL, majd a másikra a túloldalon.',false);
  if(window.innerWidth<900)document.getElementById('mapWrap').scrollIntoView({behavior:'smooth'});}
function doSplit(){
  const f=curField(),se=season(f,S.year,true),idx=se.parts.findIndex(p=>p.id===splitTarget);if(idx<0)return endMode();
  const p=se.parts[idx],g=partGeom(f,p),res=splitPoly(g,pts[0],pts[1]);
  if(res.length<2){toast('A vonal nem metszi át a részt – próbálja újra, a táblán kívülről kívülre.');pts=[];redrawTmp();hint('Koppintson az osztóvonal egyik végére (a táblán kívül).',false);return;}
  const labels=nextLabels(se,2,p);
  const a=Object.assign({},p,{id:uid(),label:labels[0],geometry:res[0],areaHa:null});
  const b=Object.assign(newPart(labels[1],null,res[1]),{crop:p.crop});
  se.parts.splice(idx,1,a,b);endMode();save();renderAll();toast(`Felosztva: ${a.label} ${fmt(haOf(res[0]),2)} ha, ${b.label} ${fmt(haOf(res[1]),2)} ha`);
}
function nextLabels(se,n,old){const used=new Set(se.parts.filter(p=>p!==old).map(p=>p.label));const out=[];const AB='ABCDEFGHIJ';for(const c of AB){if(!used.has(c)){out.push(c);if(out.length===n)break;}}return out;}

$('#btnLocate').onclick=()=>locateMe(16,false);

/* kis nagyításnál a táblák helyett jól látható jelölők (a határ ilyenkor pár pixel) */
const fieldPins=L.layerGroup().addTo(map);
let PIN_DATA=[];
// egymáshoz közeli jelölők összevonása (képernyőn ~60 px-en belül) – darabszámmal
function drawPins(){fieldPins.clearLayers();const pts=PIN_DATA.map(d=>({d,p:map.latLngToLayerPoint(d.c)}));const used=new Set();
  pts.forEach((a,i)=>{if(used.has(i))return;const grp=[a];used.add(i);pts.forEach((b,j)=>{if(!used.has(j)&&Math.abs(a.p.x-b.p.x)<70&&Math.abs(a.p.y-b.p.y)<34){grp.push(b);used.add(j);}});
    if(grp.length===1){const {x,c}=a.d;const sel=x.id===S.sel;
      const m=L.marker(c,{icon:L.divIcon({className:'fpin'+(sel?' sel':''),html:`<span>${esc(x.code||x.name||'')}</span>`,iconSize:null}),keyboard:false});
      m.on('click',()=>{if(!mode){map.setView(c,Math.max(map.getZoom(),15));pickField(x.id);}});fieldPins.addLayer(m);}
    else{const b=L.latLngBounds(grp.map(g=>g.d.c));const sel=grp.some(g=>g.d.x.id===S.sel);
      const m=L.marker(b.getCenter(),{icon:L.divIcon({className:'fpin grp'+(sel?' sel':''),html:`<span>${grp.length} tábla</span>`,iconSize:null}),keyboard:false});
      m.on('click',()=>{if(!mode)map.fitBounds(b.pad(0.6),{maxZoom:16});});fieldPins.addLayer(m);}});}
function pinToggle(){const z=map.getZoom();const far=z<13;const el=map.getContainer();el.classList.toggle('zfar',far);
  if(far){if(!map.hasLayer(fieldPins))map.addLayer(fieldPins);drawPins();}else if(map.hasLayer(fieldPins))map.removeLayer(fieldPins);}
map.on('zoomend',pinToggle);

/* indulás: a telefon aktuális helyzete (ha engedélyezett), különben az összes tábla */
function locateMe(zoom,silent){if(!navigator.geolocation){if(!silent)toast('A helymeghatározás nem érhető el.');return;}
  navigator.geolocation.getCurrentPosition(p=>{const ll=[p.coords.latitude,p.coords.longitude];if(meMarker)map.removeLayer(meMarker);
    meMarker=L.circleMarker(ll,{radius:8,color:'#fff',weight:3,fillColor:'#2b6cb0',fillOpacity:1}).addTo(map);if(zoom)map.setView(ll,zoom);if(typeof updateNear==='function')setTimeout(updateNear,50);},
    e=>{if(!silent)toast('Helymeghatározás sikertelen: '+(e.message||'nincs engedély'));},{enableHighAccuracy:!silent,timeout:silent?8000:12000,maximumAge:silent?300000:0});}
function startView(){fitAll();if(curTab!=='fields')return;let pref='gps';try{pref=localStorage.getItem('tt.startView')||'gps';}catch(e){}
  if(pref==='gps')locateMe(15,true);}

/* telefonon a rétegválasztók egy gomb mögött */
function layersDialog(){const vs=$('#viewSel'),bs=$('#baseSel');const opts=s=>[...s.options].map(o=>`<option value="${esc(o.value)}" ${o.selected?'selected':''}>${esc(o.textContent)}</option>`).join('');
  let pref='gps';try{pref=localStorage.getItem('tt.startView')||'gps';}catch(e){}
  modal(`<h2>🗺️ Térkép</h2>${vs.style.display!=='none'&&vs.options.length?`<label class="f">Nézet</label><select class="input" id="lyV">${opts(vs)}</select>`:''}
    <label class="f">Háttér</label><select class="input" id="lyB">${opts(bs)}</select>
    <label class="row" style="gap:8px;margin-top:12px;align-items:center"><input type="checkbox" id="lyL" ${labelsWanted()?'checked':''}> Településnevek, utak és határok</label>
    <label class="f">Induláskor</label><select class="input" id="lyS"><option value="gps" ${pref==='gps'?'selected':''}>Saját helyem (GPS)</option><option value="all" ${pref==='all'?'selected':''}>Összes táblám</option></select>
    <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn primary" id="lyOk">Kész</button></div>`);
  const sync=(a,b)=>{const x=$(a);if(x)x.onchange=()=>{b.value=x.value;b.dispatchEvent(new Event('change'));};};sync('#lyV',vs);sync('#lyB',bs);
  $('#lyL').onchange=e=>{try{localStorage.setItem('tt.labels',e.target.checked?'1':'0');}catch(_){}syncLabels();};
  $('#lyS').onchange=e=>{try{localStorage.setItem('tt.startView',e.target.value);}catch(_){}};$('#lyOk').onclick=closeModal;}
$('#btnLayers').onclick=layersDialog;
$('#legendBox').addEventListener('click',e=>{if(IS_PHONE)e.currentTarget.classList.toggle('open');});
