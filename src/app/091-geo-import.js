/* ================= Térképfájlok beolvasása: shapefile (ZIP vagy külön fájlok), KMZ, KML, GeoJSON =================
   Minden a böngészőben történik, a fájl nem megy fel szerverre.
   Vetület: a .prj alapján (EOV / WGS84 / UTM 33–34, ETRS89), .prj nélkül a koordináták nagyságrendjéből. */

const EOV_DEF='+proj=somerc +lat_0=47.14439372222222 +lon_0=19.04857177777778 +k_0=0.99993 +x_0=650000 +y_0=200000 +ellps=GRS67 +towgs84=52.17,-71.82,-14.9,0,0,0,0 +units=m +no_defs';

/* ---- ZIP olvasás (tárolt és deflate tömörítés) ---- */
const GEO_EXT=/\.(shp|shx|dbf|prj|cpg|kml|json|geojson|xml|bin|csv|txt)$/i;
async function unzipFiles(buf,want){
  const dv=new DataView(buf),u8=new Uint8Array(buf);let eo=-1;
  for(let i=buf.byteLength-22;i>=Math.max(0,buf.byteLength-65557);i--){if(dv.getUint32(i,true)===0x06054b50){eo=i;break;}}
  if(eo<0)throw new Error('nem ZIP fájl');
  const n=dv.getUint16(eo+10,true);let p=dv.getUint32(eo+16,true);const out={};
  for(let k=0;k<n;k++){
    if(dv.getUint32(p,true)!==0x02014b50)break;
    const meth=dv.getUint16(p+10,true),csz=dv.getUint32(p+20,true),nl=dv.getUint16(p+28,true),el=dv.getUint16(p+30,true),cl=dv.getUint16(p+32,true),lo=dv.getUint32(p+42,true),flags=dv.getUint16(p+8,true);
    const nameB=u8.subarray(p+46,p+46+nl);const name=new TextDecoder('utf-8').decode(nameB);p+=46+nl+el+cl;
    if(name.endsWith('/')||/(^|\/)__MACOSX\//.test(name))continue;
    if(want&&!want.test(name))continue;
    const ds=lo+30+dv.getUint16(lo+26,true)+dv.getUint16(lo+28,true);const raw=u8.subarray(ds,ds+csz);let data;
    if(meth===0)data=raw.slice();
    else if(meth===8){if(typeof DecompressionStream==='undefined')throw new Error('a böngésző nem tud ZIP-et kibontani – frissítse a böngészőt');
      data=new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());}
    else continue;
    out[name]=data;}
  return out;}

/* ---- DBF ---- */
function dbfParse(u8,enc){
  const dv=new DataView(u8.buffer,u8.byteOffset,u8.byteLength),nrec=dv.getUint32(4,true),hl=dv.getUint16(8,true),rl=dv.getUint16(10,true);
  const flds=[];for(let o=32;o<hl-1&&u8[o]!==0x0d;o+=32){let nm='';for(let i=0;i<11&&u8[o+i];i++)nm+=String.fromCharCode(u8[o+i]);flds.push({n:nm.trim(),t:String.fromCharCode(u8[o+11]),l:u8[o+16]});}
  const td=new TextDecoder(enc||'utf-8'),recs=[];
  for(let r=0;r<nrec;r++){const b=hl+r*rl;if(b+rl>u8.length)break;let o=b+1;const rec={};
    for(const f of flds){const s=td.decode(u8.subarray(o,o+f.l)).trim();o+=f.l;rec[f.n]=(f.t==='N'||f.t==='F')?(s===''?null:+s):s;}
    recs.push(rec);}
  return {fields:flds.map(f=>f.n),recs};}
function dbfEncoding(u8,cpg){
  const c=(cpg||'').trim().toLowerCase();
  if(c){if(/utf-?8/.test(c))return 'utf-8';if(/1250/.test(c))return 'windows-1250';if(/8859-?2|latin-?2/.test(c))return 'iso-8859-2';if(/1252/.test(c))return 'windows-1252';if(/852/.test(c))return 'iso-8859-2';}
  const ldid=u8[29];if(ldid===0xc8)return 'windows-1250';if(ldid===0x64)return 'iso-8859-2';
  // próba: ha UTF-8-ként hibás, közép-európai kódlap
  try{new TextDecoder('utf-8',{fatal:true}).decode(u8.subarray(0,Math.min(u8.length,200000)));return 'utf-8';}catch(e){return 'windows-1250';}}

/* ---- SHP (poligon, poligonZ, poligonM) ---- */
function shpParse(buf){
  const dv=new DataView(buf),out=[];let o=100;const type=dv.getInt32(32,true);
  if(![5,15,25].includes(type))throw new Error('a shapefile nem poligon típusú (pont vagy vonal)');
  while(o+8<=buf.byteLength){const len=dv.getInt32(o+4)*2;const p=o+8;o=p+len;if(len<4)continue;
    const st=dv.getInt32(p,true);if(st===0){out.push(null);continue;}
    const np=dv.getInt32(p+36,true),npt=dv.getInt32(p+40,true),parts=[];for(let i=0;i<np;i++)parts.push(dv.getInt32(p+44+4*i,true));
    const q=p+44+4*np,rings=[];for(let i=0;i<np;i++){const a=parts[i],b=i+1<np?parts[i+1]:npt,r=[];for(let k=a;k<b;k++)r.push([dv.getFloat64(q+16*k,true),dv.getFloat64(q+16*k+8,true)]);rings.push(r);}
    out.push(rings);}
  return out;}
const ringSigned=r=>{let s=0;for(let i=0,n=r.length;i<n;i++){const a=r[i],b=r[(i+1)%n];s+=a[0]*b[1]-b[0]*a[1];}return s/2;};
function ptInRing(pt,r){let c=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];if((a[1]>pt[1])!==(b[1]>pt[1])&&pt[0]<(b[0]-a[0])*(pt[1]-a[1])/(b[1]-a[1])+a[0])c=!c;}return c;}
/* shapefile gyűrűk → poligonok: a külső gyűrű az óramutató járásával egyező, a lyuk ellentétes; a lyukat a befoglaló külsőhöz rendeljük */
function ringsToPolys(rings){
  const outers=[],holes=[];rings.forEach(r=>{if(r.length<4)return;(ringSigned(r)<0?outers:holes).push(r);});
  if(!outers.length)return holes.map(r=>({outer:r,holes:[]}));// rossz irányítású fájl: mindent külsőnek veszünk
  const P=outers.map(r=>({outer:r,holes:[]}));
  holes.forEach(h=>{const t=P.find(p=>ptInRing(h[0],p.outer));if(t)t.holes.push(h);else P.push({outer:h,holes:[]});});
  return P;}

/* ---- vetület ---- */
function projFromPrj(prj){
  if(!prj)return null;const s=prj.toUpperCase();
  if(/HUNGARIAN_1972|HD72|HD_1972|EOV|23700|HOTINE_OBLIQUE_MERCATOR_AZIMUTH_CENTER.*19\.04857/.test(s.replace(/\s/g,'')))return {def:EOV_DEF,name:'EOV (EPSG:23700)'};
  const m=s.match(/UTM[_ ]?ZONE[_ ]?(\d{1,2})([NS])?/);
  if(m){const z=+m[1],south=m[2]==='S';return {def:`+proj=utm +zone=${z}${south?' +south':''} +ellps=GRS80 +towgs84=0,0,0 +units=m +no_defs`,name:`UTM ${z}${south?'S':'N'}`};}
  if(/^\s*GEOGCS/.test(s)&&!/PROJCS/.test(s))return {def:null,name:'WGS84 (földrajzi koordináták)'};
  return {unknown:true,name:'ismeretlen vetület'};}
function projGuess(pt){
  const [x,y]=pt;
  if(x>15&&x<24&&y>44&&y<50)return {def:null,name:'WGS84 (a koordinátákból kikövetkeztetve)'};
  if(x>380000&&x<960000&&y>20000&&y<380000)return {def:EOV_DEF,name:'EOV (a koordinátákból kikövetkeztetve)'};
  if(x>100000&&x<900000&&y>4900000&&y<5400000)return {def:utmDef(32634),name:'UTM 34N? (a koordinátákból kikövetkeztetve)',warn:true};
  return null;}
function toLatLng(r,def){return r.map(c=>{const [lon,lat]=def?proj4(def,'EPSG:4326',[c[0],c[1]]):c;return [lat,lon];});}
const llOk=g=>g.every(p=>isFinite(p[0])&&isFinite(p[1])&&Math.abs(p[0])<=90&&Math.abs(p[1])<=180);

/* ---- fájlok begyűjtése ---- */
/* Beolvasás egységenként (ZIP, shapefile-csoport, CSV, ISO-XML mappa), hogy több GB-os mappánál se teljen meg a memória:
   egy egységet beolvas, feldolgoz, majd eldobja; csak a kis eredmény (határ, 10 m-es rács, minta) marad meg. */
const GEO_IN=/\.(zip|kmz|shp|shx|dbf|prj|cpg|kml|json|geojson|xml|bin|csv|txt)$/i;
function geoUnits(fileList,opts){
  const units=[],byDir=new Map(),jdl=new Map();let nJdl=0,nBig=0;
  for(const f of fileList){const nm=f.webkitRelativePath||f.name;
    if(/\.jdl$/i.test(nm)){nJdl++;const d=dirOf(nm);if(!jdl.has(d))jdl.set(d,[]);jdl.get(d).push(f);continue;}// John Deere napló: mappánként (= táblánként) egy egység
    if(opts&&opts.folder&&!GEO_IN.test(nm))continue;
    if(/\.(zip|kmz)$/i.test(nm)){if(f.size>150e6){nBig++;continue;}units.push([f]);continue;}
    const d=dirOf(nm);if(!byDir.has(d))byDir.set(d,[]);byDir.get(d).push(f);}
  for(const [d,fs] of byDir){
    if(fs.some(f=>/(^|\/)TASKDATA\.XML$/i.test(f.webkitRelativePath||f.name))){units.push(fs);continue;}// ISO-XML: a teljes mappa egy egység
    const g=new Map();fs.forEach(f=>{const n=(f.webkitRelativePath||f.name).toLowerCase().replace(/-deere-metadata\.json$/,'').replace(/\.[^.\/]+$/,'');if(!g.has(n))g.set(n,[]);g.get(n).push(f);});
    // egyedi fájlok (pl. több GeoJSON) egyben maradhatnak, ha kevés van
    units.push(...g.values());}
  for(const [d,fs] of jdl){fs.jdlDir=d;units.push(fs);}
  return {units,nJdl,nBig};}
async function readGeoFiles(fileList,opts){
  const notes=[],feats=[],H=[],PT=[];let hasSave=false,iso=false;
  const {units,nJdl,nBig}=geoUnits(fileList,opts);
  if(nBig)notes.push(`${nBig} db 150 MB-nál nagyobb ZIP kihagyva – csomagolja ki, és a mappát válassza ki.`);
  const multi=fileList.length>1;const ptSeen=new Map();
  for(const U of units){
    const files={};// név → Uint8Array (csak erre az egységre)
    for(const f of U){const nm=f.webkitRelativePath||f.name;const b=new Uint8Array(await f.arrayBuffer());
      if(/\.(zip|kmz)$/i.test(nm)||(b[0]===0x50&&b[1]===0x4b&&b[2]===3&&b[3]===4)){const z=await unzipFiles(b.buffer,GEO_EXT);const pre=multi?nm+'/':'';for(const k in z)files[pre+k]=z[k];}else files[nm]=b;
      if(opts&&opts.prog)await opts.prog('read');}
    const isJ=U.jdlDir!=null;
    if(!isJ&&Object.keys(files).some(n=>/(^|\/)TASKDATA\.XML$/i.test(n))){iso=true;const r=harvestFromFiles(files);H.push(...r.H);notes.push(...r.notes);}
    // pontadat: a feldolgozott (tisztított) pontok maradnak meg a táblánkénti összevonásig; az ismétlődő export (CSV és shapefile ugyanarról) kimarad
    for(const T of isJ?await jdlTasksFromFiles(files,notes,U.jdlDir):await pointTasksFromFiles(files,notes,null)){const C=opsClean(T);if(!C||!C.all.length)continue;
      const k=[T.kind,T.name,T.product,C.all[0].day,Math.round(C.all.length/50)].join('|');const crop=C.all[0].crop||'';
      const E={kind:T.kind,dry:T.dry,unit:T.unit,hybOk:T.hybOk,name:T.name,product:T.product,C,crop,jdl:isJ};
      if(ptSeen.has(k)){const i=ptSeen.get(k);if(!PT[i].crop&&crop)PT[i]=E;continue;}// ismétlődő export: a kultúrát is hordozó változat marad
      ptSeen.set(k,PT.length);PT.push(E);}
    if(isJ)continue;
    const r=polyFromFiles(files,notes);feats.push(...r.feats);hasSave=hasSave||r.hasSave;}
  // ha ugyanarról a tábláról export (CSV, shapefile) is van, a .jdl napló kimarad (a mappanévben az ékezetes betű helyén „-” áll)
  const yr=T=>dayISO(T.C.all[0].day).slice(0,4);const nk=s=>(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const same=(j,e)=>{const a=nk(j.name),b=nk(e.name);if(a.length!==b.length)return false;for(let i=0;i<a.length;i++)if(a[i]!==b[i]&&a[i]!=='-')return false;return true;};
  for(let i=PT.length-1;i>=0;i--){const J=PT[i];if(J.jdl&&PT.some(E=>!E.jdl&&E.kind===J.kind&&yr(E)===yr(J)&&same(J,E))){notes.push(`${J.name}: a .jdl napló helyett a táblához tartozó exportot használtam.`);PT.splice(i,1);}}
  // azonos tábla, munka és év pontjai együtt (pl. hibridenként külön fájl egy sávkísérletnél)
  const grp=new Map();PT.forEach(T=>{const d=T.C.all[0].day;const k=[T.kind,T.name,dayISO(d).slice(0,4)].join('|');if(!grp.has(k))grp.set(k,[]);grp.get(k).push(T);});
  for(const G of grp.values()){H.push(...opsToH(G,notes));G.forEach(T=>T.C=null);if(opts&&opts.prog)await opts.prog('calc');}
  const seenH=new Set();const HH=H.filter(h=>{const k=[h.kind,h.name,h.date,Math.round(h.part.ha*2)].join('|');if(seenH.has(k))return false;seenH.add(k);return true;});
  const hv=HH.length||PT.length||iso?{H:HH.sort((a,b)=>a.date.localeCompare(b.date)||a.name.localeCompare(b.name)),notes}:null;
  return {feats,notes,hv,hasSave,nJdl};}
/* táblahatárok (shapefile poligon, KML, GeoJSON) egy egység fájljaiból */
function polyFromFiles(files,notes){
  const feats=[];const base=n=>n.replace(/\.[^.\/]+$/,'').toLowerCase();const td=new TextDecoder();
  const names=Object.keys(files);
  // shapefile-ok
  names.filter(n=>/\.shp$/i.test(n)).forEach(shpN=>{
    const b=base(shpN),get=ext=>{const k=names.find(n=>base(n)===b&&n.toLowerCase().endsWith(ext));return k?files[k]:null;};
    const shp=files[shpN];let geoms;try{geoms=shpParse(shp.buffer.slice(shp.byteOffset,shp.byteOffset+shp.byteLength));}catch(e){notes.push(`${shpN}: ${e.message}`);return;}
    const dbfB=get('.dbf'),prjB=get('.prj'),cpgB=get('.cpg');
    const dbf=dbfB?dbfParse(dbfB,dbfEncoding(dbfB,cpgB?td.decode(cpgB):'')):{fields:[],recs:[]};
    let pr=projFromPrj(prjB?td.decode(prjB):'');
    const first=geoms.find(g=>g&&g[0]&&g[0][0]);
    if(!pr||pr.unknown){const g=first?projGuess(first[0][0]):null;if(g){if(pr&&pr.unknown)g.name+=' – a .prj nem ismert';pr=g;}else if(!pr){notes.push(`${shpN}: nincs .prj fájl, a vetület nem állapítható meg`);return;}}
    if(pr.unknown){notes.push(`${shpN}: a vetület nem ismert (${prjB?td.decode(prjB).slice(0,60):''}…)`);return;}
    geoms.forEach((g,i)=>{if(!g)return;ringsToPolys(g).forEach((p,k,arr)=>{
      feats.push({src:shpN.split('/').pop(),proj:pr.name,warn:pr.warn,props:dbf.recs[i]||{},part:arr.length>1?k+1:0,outer:toLatLng(p.outer,pr.def),holes:p.holes.length});});});
    if(!dbfB)notes.push(`${shpN}: nincs .dbf, a tábláknak nem lesz neve`);
  });
  if(names.some(n=>/\.(dbf|prj)$/i.test(n))&&!names.some(n=>/\.shp$/i.test(n)))notes.push('A .shp fájl hiányzik – jelölje ki a .shp, .dbf és .prj fájlt együtt, vagy töltse fel a ZIP-et.');
  // KML (KMZ-ből is)
  names.filter(n=>/\.kml$/i.test(n)).forEach(n=>{const doc=new DOMParser().parseFromString(td.decode(files[n]),'text/xml');
    doc.querySelectorAll('Placemark').forEach(pm=>{const nm=pm.querySelector('name')?.textContent||'';const ex={};pm.querySelectorAll('ExtendedData Data, ExtendedData SimpleData').forEach(d=>{const k=d.getAttribute('name');if(k)ex[k]=(d.querySelector('value')?.textContent??d.textContent).trim();});
      const polys=[...pm.querySelectorAll('Polygon')];polys.forEach((pg,k)=>{const c=pg.querySelector('outerBoundaryIs coordinates')||pg.querySelector('coordinates');if(!c)return;
        const g=c.textContent.trim().split(/\s+/).map(t=>t.split(',').map(Number)).filter(a=>a.length>=2&&isFinite(a[0])).map(a=>[a[1],a[0]]);
        feats.push({src:n.split('/').pop(),proj:'WGS84',props:Object.assign({name:nm},ex),part:polys.length>1?k+1:0,outer:g,holes:pg.querySelectorAll('innerBoundaryIs').length});});});});
  // GeoJSON
  names.filter(n=>/\.(geo)?json$/i.test(n)).forEach(n=>{let j;try{j=JSON.parse(td.decode(files[n]));}catch(e){notes.push(`${n}: hibás JSON`);return;}
    if(j.app==='tablatortenet')return;
    let def=null,pn='WGS84';const crs=JSON.stringify(j.crs||'');if(/23700/.test(crs)){def=EOV_DEF;pn='EOV (EPSG:23700)';}else{const m=crs.match(/326(3[34])/);if(m){def=utmDef(+('326'+m[1]));pn='UTM '+m[1]+'N';}}
    const fs=j.type==='FeatureCollection'?j.features:j.type==='Feature'?[j]:[{geometry:j,properties:{}}];
    fs.forEach(ft=>{const g=ft&&ft.geometry;if(!g)return;const p=ft.properties||{};if(p.kind==='resz')return;
      const P=g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[];
      if(!def&&P[0]&&P[0][0]&&P[0][0][0]){const gs=projGuess(P[0][0][0]);if(gs&&gs.def){def=gs.def;pn=gs.name;}}
      P.forEach((c,k)=>feats.push({src:n.split('/').pop(),proj:pn,props:p,part:P.length>1?k+1:0,outer:toLatLng(c[0],def),holes:c.length-1}));});});
  // zárt gyűrű vége, hibás pontok
  const ok=[];feats.forEach(f=>{const g=f.outer;if(g.length>3){const a=g[0],b=g[g.length-1];if(Math.abs(a[0]-b[0])<1e-12&&Math.abs(a[1]-b[1])<1e-12)g.pop();}
    if(g.length>=3&&llOk(g)){f.ha=haOf(g);ok.push(f);}});
  if(ok.length<feats.length)notes.push(`${feats.length-ok.length} alakzat hibás koordináták miatt kimaradt.`);
  return {feats:ok,hasSave:names.some(n=>/\.json$/i.test(n)&&!/deere-metadata/i.test(n))};}

/* ---- névoszlop ajánlása ---- */
function nameKeyGuess(feats){
  const keys=[...new Set(feats.flatMap(f=>Object.keys(f.props)))];
  const pref=['name','NAME','Name','nev','NEV','Nev','NÉV','tabla','TABLA','Tabla','TABLA_NEV','TABLANEV','FIELD','Field','field_name','FIELD_NAME','megnevezes','MEGNEVEZES','blokk','BLOKK','BLOKKAZON','MEPAR','HRSZ','hrsz','ID','id'];
  for(const k of pref)if(keys.includes(k)&&feats.some(f=>String(f.props[k]??'').trim()))return k;
  return keys.find(k=>feats.some(f=>typeof f.props[k]==='string'&&f.props[k].trim()))||'';}

/* ---- ismétlődés: van-e már ilyen tábla (közel azonos terület és súlypont) ---- */
function dupOf(f){const c=centroidOf(f.outer);
  return S.fields.find(x=>{if(!x.geometry||x.geometry.length<3)return false;const d=Math.abs(x.areaHa-f.ha)/Math.max(f.ha,0.01);if(d>0.03)return false;const c2=centroidOf(x.geometry);return Math.hypot((c[0]-c2[0])*111000,(c[1]-c2[1])*76000)<25;});}
function centroidOf(g){let a=0,b=0;g.forEach(p=>{a+=p[0];b+=p[1];});return [a/g.length,b/g.length];}

/* ---- előnézet SVG ---- */
function geoPreviewSVG(feats,on){
  let mi=[90,180],ma=[-90,-180];feats.forEach(f=>f.outer.forEach(p=>{mi=[Math.min(mi[0],p[0]),Math.min(mi[1],p[1])];ma=[Math.max(ma[0],p[0]),Math.max(ma[1],p[1])];}));
  const kx=Math.cos((mi[0]+ma[0])/2*Math.PI/180),w=Math.max((ma[1]-mi[1])*kx,1e-9),h=Math.max(ma[0]-mi[0],1e-9),W=320,H=Math.max(90,Math.min(220,W*h/w)),s=Math.min((W-8)/w,(H-8)/h);
  const X=p=>(4+(p[1]-mi[1])*kx*s).toFixed(1),Y=p=>(H-4-(p[0]-mi[0])*s).toFixed(1);
  return `<svg class="giSvg" viewBox="0 0 ${W} ${H.toFixed(0)}">${feats.map((f,i)=>`<polygon data-i="${i}" points="${f.outer.map(p=>X(p)+','+Y(p)).join(' ')}" class="${on[i]?'on':''}${f.dup?' dup':''}"/>`).join('')}</svg>`;}

/* ---- párbeszéd ---- */
async function geoImportFiles(fileList,opts){
  toast('Feldolgozás…');await new Promise(r=>setTimeout(r,30));
  let nr=0,nc=0;const prog=async k=>{if(k==='read')nr++;else nc++;if((nr+nc)%5===0){toast(k==='read'?`Beolvasás: ${nr} fájl`:`Feldolgozás: ${nc} tábla`);await new Promise(r=>setTimeout(r,0));}};
  let R;try{R=await readGeoFiles(fileList,Object.assign({prog},opts||{}));}catch(e){toast('A fájl nem olvasható: '+(e.message||e));return;}
  if(R.hv&&(R.hv.H.length||!R.feats.length)){const nt=R.hv.notes;if(R.feats.length)nt.push(`${R.feats.length} táblahatár is van a fájlok között – ezeket külön töltse fel.`);harvestDialog(R.hv.H,nt);return;}
  if(!R.feats.length&&!R.hasSave&&fileList.length===1&&!/\.(zip|kmz|kml|shp|dbf|prj|cpg|shx|json|geojson|csv|txt|xml)$/i.test(fileList[0].name)){
    modal(`<h2>Nem találtam táblahatárt</h2><p class="help">Ezt a fájltípust a program nem tudja beolvasni.</p><p class="help">Elfogadott fájlok: shapefile (ZIP-ben, vagy a .shp, .dbf és .prj együtt kijelölve), KML, KMZ, GeoJSON, korábbi Táblatörténet-mentés.</p><div class="row" style="justify-content:flex-end"><button class="btn primary" id="giX">Rendben</button></div>`);$('#giX').onclick=closeModal;return;}
  if(!R.feats.length){
    // mentés visszatöltése vagy régi út
    if(R.hasSave&&fileList.length===1){const rd=new FileReader();rd.onload=()=>{try{importText(fileList[0].name,rd.result);}catch(err){toast('A fájl nem olvasható: '+(err.message||err));}};rd.readAsText(fileList[0]);return;}
    modal(`<h2>Nem találtam beolvasható adatot</h2><p class="help">${R.notes.length?R.notes.map(esc).join('<br>'):'A fájlban nincs poligon.'}</p>${R.nJdl?`<p class="help"><b>A John Deere .jdl naplókból csak az aratási adatot olvassa a program (kísérleti), és csak akkor, ha a mappában a táblánkénti naplómappák vannak (pl. JD-Data/log).</b> Megbízhatóbb a John Deere Operations Centerből vagy a kijelzőről exportált shapefile, CSV vagy ISO-XML.</p>`:''}<p class="help">Elfogadott fájlok: shapefile (ZIP-ben, vagy a .shp, .dbf és .prj együtt kijelölve), KML, KMZ, GeoJSON, gépi adat (ISO-XML, John Deere CSV vagy pont-shapefile), korábbi Táblatörténet-mentés.</p><div class="row" style="justify-content:flex-end"><button class="btn primary" id="giX">Rendben</button></div>`);$('#giX').onclick=closeModal;return;}
  const F=R.feats;F.forEach(f=>{f.dup=dupOf(f);});
  const on=F.map(f=>!f.dup);let nk=nameKeyGuess(F);
  const keys=[...new Set(F.flatMap(f=>Object.keys(f.props)))];
  const projs=[...new Set(F.map(f=>f.proj))],holes=F.reduce((a,f)=>a+(f.holes||0),0),warn=F.some(f=>f.warn);
  const nameOf=f=>{let v=nk?String(f.props[nk]??'').trim():'';if(f.part)v=(v||'Tábla')+` (${f.part})`;return v;};
  const draw=()=>{
    const nOn=on.filter(Boolean).length,ha=F.reduce((a,f,i)=>a+(on[i]?f.ha:0),0);
    modal(`<h2>Táblahatárok beolvasása</h2>
      <p class="help" style="margin:0 0 6px"><span>Vetület:</span> <b>${esc(projs.join(', '))}</b>${warn?' <span class="meta">– ellenőrizze a térképen, hogy a táblák a helyükre kerültek-e</span>':''}</p>
      ${notesBox(R.notes)}
      ${geoPreviewSVG(F,on)}
      <div class="row" style="gap:8px;align-items:center;margin:8px 0;flex-wrap:wrap"><label class="meta" for="giKey">A tábla neve ebből az oszlopból:</label>
        <select class="input" id="giKey" style="width:auto;flex:1;min-width:140px"><option value="">Nincs név</option>${keys.map(k=>`<option ${k===nk?'selected':''}>${esc(k)}</option>`).join('')}</select></div>
      <div class="row" style="gap:6px;margin-bottom:6px"><button class="btn sm ghost" id="giAll">Mind</button><button class="btn sm ghost" id="giNone">Egyik sem</button><span class="meta" style="margin-left:auto"><span>Kijelölve:</span> ${nOn} / ${F.length} · ${fmt(ha,1)} ha</span></div>
      <div class="giList">${F.map((f,i)=>`<label class="giRow${f.dup?' dup':''}"><input type="checkbox" data-i="${i}" ${on[i]?'checked':''}><span class="giN">${(nameOf(f)?`<span data-noi18n>${esc(nameOf(f))}</span>`:'<span>Névtelen</span>')}</span><span class="meta">${fmt(f.ha,2)} ha${f.holes?` · <span>${f.holes} lyuk</span>`:''}${f.dup?` · <span class="giDup"><span>Már megvan:</span> <b data-noi18n>${esc(f.dup.name||'')}</b></span>`:''}</span></label>`).join('')}</div>
      ${holes?`<p class="help" style="margin:6px 0 0">A belső kivágásokat (lyukakat) a program nem tárolja, a tábla a külső határral kerül be. A területet utólag a tábla adatainál lehet javítani.</p>`:''}
      <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn" id="giC">Mégse</button><button class="btn primary" id="giOk" ${nOn?'':'disabled'}>⬆ ${nOn} tábla beolvasása</button></div>`);
    $('#giKey').onchange=e=>{nk=e.target.value;draw();};
    $('#giAll').onclick=()=>{on.fill(true);draw();};$('#giNone').onclick=()=>{on.fill(false);draw();};
    document.querySelectorAll('.giList input').forEach(c=>c.onchange=()=>{on[+c.dataset.i]=c.checked;draw();});
    document.querySelectorAll('.giSvg polygon').forEach(p=>p.onclick=()=>{const i=+p.dataset.i;on[i]=!on[i];draw();});
    $('#giC').onclick=closeModal;
    $('#giOk').onclick=()=>{let n=0;F.forEach((f,i)=>{if(!on[i])return;addImported(nameOf(f),f.outer.map(p=>[p[0],p[1]]));n++;});
      closeModal();save();renderAll();
      const sel=S.fields.slice(-n);if(sel.length){map.fitBounds(L.featureGroup(sel.map(f=>L.polygon(f.geometry))).getBounds(),{padding:[20,20]});}
      toast(n+' tábla beolvasva');};};
  draw();}
