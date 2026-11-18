/* ================= ZIP + shapefile ================= */
const CRC_T=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
function crc32(b){let c=0xFFFFFFFF;for(let i=0;i<b.length;i++)c=CRC_T[(c^b[i])&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0;}
const u8=s=>typeof s==='string'?new TextEncoder().encode(s):s instanceof Uint8Array?s:new Uint8Array(s);
function makeZip(files){ // [{name,data}] STORE
  const parts=[],cen=[];let off=0;const d=new Date();const dt=((d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1))&0xFFFF,dd=(((d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate())&0xFFFF;
  files.forEach(f=>{const nm=u8(f.name),data=u8(f.data),crc=crc32(data);
    const h=new DataView(new ArrayBuffer(30));h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x0800,true);h.setUint16(8,0,true);h.setUint16(10,dt,true);h.setUint16(12,dd,true);h.setUint32(14,crc,true);h.setUint32(18,data.length,true);h.setUint32(22,data.length,true);h.setUint16(26,nm.length,true);h.setUint16(28,0,true);
    parts.push(new Uint8Array(h.buffer),nm,data);
    const c=new DataView(new ArrayBuffer(46));c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x0800,true);c.setUint16(10,0,true);c.setUint16(12,dt,true);c.setUint16(14,dd,true);c.setUint32(16,crc,true);c.setUint32(20,data.length,true);c.setUint32(24,data.length,true);c.setUint16(28,nm.length,true);c.setUint32(42,off,true);
    cen.push(new Uint8Array(c.buffer),nm);off+=30+nm.length+data.length;});
  const cs=cen.reduce((a,b)=>a+b.length,0);const e=new DataView(new ArrayBuffer(22));e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,cs,true);e.setUint32(16,off,true);
  return new Blob([...parts,...cen,new Uint8Array(e.buffer)],{type:'application/zip'});}
const PRJ_WGS84='GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';
function ringArea(r){let s=0;for(let i=0;i<r.length-1;i++)s+=r[i][0]*r[i+1][1]-r[i+1][0]*r[i][1];return s/2;}
function shapefile(name,recs,fields){ // recs:[{rings:[[[x,y]..closed]],attrs:{}}], fields:[{n,t:'C'|'N',l,d}]
  recs=recs.map(r=>({attrs:r.attrs,rings:r.rings.map(g=>{g=g.slice();const a=g[0],b=g[g.length-1];if(a[0]!==b[0]||a[1]!==b[1])g.push(a);return ringArea(g)>0?g.reverse():g;})}));
  const bbox=rs=>{let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;rs.forEach(g=>g.forEach(p=>{x0=Math.min(x0,p[0]);y0=Math.min(y0,p[1]);x1=Math.max(x1,p[0]);y1=Math.max(y1,p[1]);}));return [x0,y0,x1,y1];};
  const all=bbox(recs.flatMap(r=>r.rings));const cl=recs.map(r=>{const np=r.rings.reduce((a,g)=>a+g.length,0);return 44+4*r.rings.length+16*np;});
  const shpLen=100+cl.reduce((a,c)=>a+8+c,0),shp=new DataView(new ArrayBuffer(shpLen)),shx=new DataView(new ArrayBuffer(100+8*recs.length));
  const hdr=(v,len)=>{v.setInt32(0,9994);v.setInt32(24,len/2);v.setInt32(28,1000,true);v.setInt32(32,5,true);[all[0],all[1],all[2],all[3]].forEach((x,i)=>v.setFloat64(36+8*i,x,true));};
  hdr(shp,shpLen);hdr(shx,100+8*recs.length);let o=100;
  recs.forEach((r,i)=>{shx.setInt32(100+8*i,o/2);shx.setInt32(104+8*i,cl[i]/2);shp.setInt32(o,i+1);shp.setInt32(o+4,cl[i]/2);let p=o+8;shp.setInt32(p,5,true);const b=bbox(r.rings);b.forEach((x,k)=>shp.setFloat64(p+4+8*k,x,true));
    const np=r.rings.reduce((a,g)=>a+g.length,0);shp.setInt32(p+36,r.rings.length,true);shp.setInt32(p+40,np,true);let q=p+44,idx=0;r.rings.forEach(g=>{shp.setInt32(q,idx,true);q+=4;idx+=g.length;});
    r.rings.forEach(g=>g.forEach(pt=>{shp.setFloat64(q,pt[0],true);shp.setFloat64(q+8,pt[1],true);q+=16;}));o+=8+cl[i];});
  // DBF
  const enc=new TextEncoder();const recLen=1+fields.reduce((a,f)=>a+f.l,0),hl=32+32*fields.length+1;const dbf=new Uint8Array(hl+recLen*recs.length+1);const dv=new DataView(dbf.buffer);
  const now=new Date();dbf[0]=3;dbf[1]=now.getFullYear()-1900;dbf[2]=now.getMonth()+1;dbf[3]=now.getDate();dv.setUint32(4,recs.length,true);dv.setUint16(8,hl,true);dv.setUint16(10,recLen,true);
  fields.forEach((f,i)=>{const b=32+32*i;for(let k=0;k<Math.min(10,f.n.length);k++)dbf[b+k]=f.n.charCodeAt(k);dbf[b+11]=f.t.charCodeAt(0);dbf[b+16]=f.l;dbf[b+17]=f.d||0;});dbf[hl-1]=0x0D;
  recs.forEach((r,i)=>{let p=hl+i*recLen;dbf[p++]=0x20;fields.forEach(f=>{let v=r.attrs[f.n];let bytes;
    if(f.t==='N'){const s=v==null||v===''||isNaN(+v)?'':(+v).toFixed(f.d||0);bytes=enc.encode(s.padStart(f.l).slice(-f.l));}
    else{v=v==null?'':asc(String(v));let b=enc.encode(v);if(b.length>f.l){let s=String(v);while(enc.encode(s).length>f.l)s=s.slice(0,-1);b=enc.encode(s);}bytes=new Uint8Array(f.l).fill(0x20);bytes.set(b);}
    dbf.set(bytes,p);p+=f.l;});});
  dbf[dbf.length-1]=0x1A;
  return [{name:name+'.shp',data:new Uint8Array(shp.buffer)},{name:name+'.shx',data:new Uint8Array(shx.buffer)},{name:name+'.dbf',data:dbf},{name:name+'.prj',data:PRJ_WGS84},{name:name+'.cpg',data:'UTF-8'}];}
const ring=g=>g.map(p=>[p[1],p[0]]);
const safeName=s=>(asc(String(s||'tabla'))||'tabla').replace(/[^\w-]+/g,'_').replace(/_+/g,'_').slice(0,40);
function zoneRecs(f,a,rates){return zonesGeoJSON(f,a).features.filter(ft=>ft.geometry.coordinates.length).map(ft=>({rings:ft.geometry.coordinates.map(p=>p[0]),attrs:Object.assign({TABLA:f.name,ZONA:ft.properties.zona,ZONA_NEV:ft.properties.zona_nev,TERULET:ft.properties.terulet_ha},rates?{RATE:rates[ft.properties.zona]}:{})}));}
async function exportPackage(){
  if(!S.fields.length)return toast('Nincs tábla.');toast('Export csomag készül…');
  const files=[],st=stamp();
  files.push({name:'mentes_teljes.json',data:JSON.stringify({app:'tablatortenet',v:3,saved:new Date().toISOString(),fields:S.fields})});
  const grab=(id)=>new Promise(res=>{const orig=offerFile;offerFile=(n,t)=>{offerFile=orig;res(t);return Promise.resolve();};try{$('#'+id).onclick();}catch(e){offerFile=orig;res(null);}});
  const cy=await grab('btnCsvSeasons');if(cy)files.push({name:'evek.csv',data:cy});
  const co=await grab('btnCsvOps');if(co)files.push({name:'muveletek.csv',data:co});
  const gj=await grab('btnGeojson');if(gj)files.push({name:'tablak_reszek.geojson',data:gj});
  files.push(...shapefile('shp/tablak',S.fields.map(f=>({rings:[ring(f.geometry)],attrs:{NEV:f.name,TERULET:+f.areaHa.toFixed(2),ID:f.id}})),[{n:'NEV',t:'C',l:80},{n:'TERULET',t:'N',l:12,d:2},{n:'ID',t:'C',l:20}]));
  const pr=[];S.fields.forEach(f=>Object.keys(f.seasons||{}).forEach(y=>f.seasons[y].parts.forEach(p=>{if(p.geometry)pr.push({rings:[ring(p.geometry)],attrs:{TABLA:f.name,EV:+y,RESZ:p.label,NOVENY:p.crop||'',HIBRID:p.hybrid||'',TERULET:+haOf(p.geometry).toFixed(2)}});})));
  if(pr.length)files.push(...shapefile('shp/reszek',pr,[{n:'TABLA',t:'C',l:80},{n:'EV',t:'N',l:4},{n:'RESZ',t:'C',l:20},{n:'NOVENY',t:'C',l:40},{n:'HIBRID',t:'C',l:40},{n:'TERULET',t:'N',l:12,d:2}]));
  for(const f of S.fields){const a=ANA[f.id]||await loadAna(f);if(!a)continue;const nm=safeName(f.name);
    files.push({name:`zonak/${nm}_termozonak.geojson`,data:JSON.stringify(ascGeo(zonesGeoJSON(f,a)))});
    files.push(...shapefile(`zonak/${nm}_termozonak`,zoneRecs(f,a),[{n:'TABLA',t:'C',l:80},{n:'ZONA',t:'N',l:2},{n:'ZONA_NEV',t:'C',l:20},{n:'TERULET',t:'N',l:10,d:2}]));}
  files.push({name:'OLVASSEL.txt',data:`kukorica.app export – ${st}\r\n\r\nmentes_teljes.json – teljes mentés, az appba visszatölthető\r\nevek.csv, muveletek.csv – Excelben nyitható (pontosvessző elválasztó)\r\ntablak_reszek.geojson – QGIS / Google Earth\r\nshp/ – táblák és évenkénti részek shapefile-ban (WGS84)\r\nzonak/ – termőzónák GeoJSON és shapefile (zóna 1=gyenge, 2=átlagos, 3=erős, 4=szegély)\r\n`});
  const blob=makeZip(files);const name=`tablatortenet_export_${st}.zip`;
  try{const file=new File([blob],name,{type:'application/zip'});if(navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({files:[file],title:name});return;}}catch(e){if(e&&e.name==='AbortError')return;}
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},2000);}
