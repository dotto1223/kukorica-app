/* ================= export / import ================= */
async function offerFile(name,text,mime){
  const blob=new Blob([text],{type:mime});
  try{const file=new File([blob],name,{type:mime});if(navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({files:[file],title:name});return;}}catch(e){if(e&&e.name==='AbortError')return;}
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},2000);
}
const stamp=()=>isoToday();
$('#btnBackup').onclick=()=>offerFile(`tablatortenet_mentes_${stamp()}.json`,JSON.stringify({app:'tablatortenet',v:3,saved:new Date().toISOString(),fields:S.fields},null,1),'application/json');
const csvq=v=>{v=v==null?'':asc(String(v));return /[";\n,]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;};
$('#btnCsvSeasons').onclick=()=>{const h=['tabla','tabla_ha','ev','resz','resz_ha','noveny','hibrid','fao','vetes','toszam','aratas','nedvesseg_pct','hozam_nedves_t_ha','osszes_t','hozam_szabvany_t_ha','szabvany_nedv_pct','N_kg_ha','P2O5_kg_ha','K2O_kg_ha','megjegyzes','hozam_forras','megbizhatosag_1_3'];const L=[h.join(';')];
  S.fields.forEach(f=>Object.keys(f.seasons||{}).sort().forEach(y=>{const se=f.seasons[y];if(!hasData(se))return;se.parts.forEach(p=>{const yl=calcYield(f,p),n=partNutr(se,p.id);L.push([f.name,fmt(f.areaHa,2),y,p.label,fmt(partArea(f,p),2),p.crop,p.hybrid,p.fao,p.sowing,p.density,p.harvest,p.moisture,yl.wet!=null?fmt(yl.wet,2):'',p.totalT,yl.std!=null?fmt(yl.std,2):'',stdMoistFor(p),fmt0(n.N),fmt0(n.P),fmt0(n.K),p.notes,SRC_LABEL[p.src||'']&&p.src?SRC_LABEL[p.src]:'',SRC_CONF[p.src||'']||''].map(csvq).join(';'));});}));
  offerFile(`tablatortenet_evek_${stamp()}.csv`,'﻿'+L.join('\n'),'text/csv');};
$('#btnCsvOps').onclick=()=>{const h=['tabla','ev','datum','muvelet','reszek','termek_vagy_tipus','mennyiseg','egyseg','mod_cel','melyseg_cm','ontozes_mm','N_kg_ha','P2O5_kg_ha','K2O_kg_ha','S_kg_ha','megjegyzes'];const L=[h.join(';')];
  S.fields.forEach(f=>Object.keys(f.seasons||{}).sort().forEach(y=>{const se=f.seasons[y];se.ops.forEach(o=>{const n=nutrientsOf(o)||{};const pn=(o.parts||['all']).includes('all')?'Egész tábla':(o.parts||[]).map(id=>se.parts.find(p=>p.id===id)?.label).join('+');
    L.push([f.name,y,o.date,OPTYPES[o.type]?.t,pn,o.type==='till'?o.kind:(o.custom?o.cname:o.product)||o.desc,o.amount||o.dose,o.unit,o.method||o.target,o.depth,o.mm,n.N!=null?fmt0(n.N):'',n.P!=null?fmt0(n.P):'',n.K!=null?fmt0(n.K):'',n.S!=null?fmt0(n.S):'',o.note].map(csvq).join(';'));});}));
  offerFile(`tablatortenet_muveletek_${stamp()}.csv`,'﻿'+L.join('\n'),'text/csv');};
$('#btnGeojson').onclick=()=>{const feats=[];S.fields.forEach(f=>{feats.push({type:'Feature',properties:{kind:'tabla',name:f.name,area_ha:+f.areaHa.toFixed(2)},geometry:{type:'Polygon',coordinates:[f.geometry.map(p=>[p[1],p[0]]).concat([[f.geometry[0][1],f.geometry[0][0]]])]}});
  Object.keys(f.seasons||{}).forEach(y=>f.seasons[y].parts.forEach(p=>{if(!p.geometry)return;feats.push({type:'Feature',properties:{kind:'resz',tabla:f.name,ev:+y,resz:p.label,noveny:p.crop,hibrid:p.hybrid,area_ha:+haOf(p.geometry).toFixed(2)},geometry:{type:'Polygon',coordinates:[p.geometry.map(q=>[q[1],q[0]]).concat([[p.geometry[0][1],p.geometry[0][0]]])]}});}));});
  offerFile(`tablatortenet_${stamp()}.geojson`,JSON.stringify(ascGeo({type:'FeatureCollection',features:feats})),'application/geo+json');};
$('#fileIn').onchange=e=>{const fl=[...e.target.files];e.target.value='';if(fl.length)geoImportFiles(fl);};
$('#dirIn').onchange=e=>{const fl=[...e.target.files];e.target.value='';if(fl.length)geoImportFiles(fl,{folder:true});};
function importText(name,txt){
  if(/<kml/i.test(txt)){const doc=new DOMParser().parseFromString(txt,'text/xml');let n=0;doc.querySelectorAll('Placemark').forEach(pm=>{const c=pm.querySelector('Polygon coordinates');if(!c)return;const g=c.textContent.trim().split(/\s+/).map(t=>t.split(',').map(Number)).filter(a=>a.length>=2).map(a=>[a[1],a[0]]);addImported(pm.querySelector('name')?.textContent,g);n++;});done(n);return;}
  const j=JSON.parse(txt);
  if(j.app==='tablatortenet'&&Array.isArray(j.fields)){confirmBox('Mentés visszatöltése',`${j.fields.length} tábla a mentésből. Az azonos azonosítójú táblák felülíródnak, a többi megmarad.`,'Visszatöltés',()=>{j.fields.forEach(f=>{const i=S.fields.findIndex(x=>x.id===f.id);if(i>=0)S.fields[i]=f;else S.fields.push(f);});S.sel=j.fields[0]?.id||S.sel;save();renderAll();fit(curField());toast('Visszatöltve');});return;}
  const feats=j.type==='FeatureCollection'?j.features:j.type==='Feature'?[j]:[{geometry:j,properties:{}}];let n=0;
  feats.forEach(ft=>{const g=ft.geometry;if(!g)return;const p=ft.properties||{};if(p.kind==='resz')return;const rings=g.type==='Polygon'?[g.coordinates[0]]:g.type==='MultiPolygon'?g.coordinates.map(c=>c[0]):[];rings.forEach(r=>{addImported(p.name||p.NAME||p.nev||p.tabla,r.map(c=>[c[1],c[0]]));n++;});});
  done(n);
  function done(n){if(!n)return toast('Nem találtam poligont.');save();renderAll();fit(curField());toast(n+' tábla importálva');}
}
function addImported(name,g){if(g.length>3){const a=g[0],b=g[g.length-1];if(a[0]===b[0]&&a[1]===b[1])g.pop();}if(g.length<3)return;const f={id:uid(),name:normName(name||''),geometry:g,areaHa:haOf(g),seasons:{},notes:''};S.fields.push(f);S.sel=f.id;queueAnalysis(f.id);setTimeout(()=>ensureCode(f).then(()=>{save();renderHeader();renderFields();}),300*S.fields.length);}
