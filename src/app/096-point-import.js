/* ================= Pontszerű gépi adat: John Deere (GreenStar / Apex / Operations Center) és hasonló exportok =================
   – CSV: Longitude, Latitude, Field, Product, Date, Duration(s), Distance(m), Swth Wdth(m), Yld Mass(Dry/Wet)(tonne/ha), Moisture(%) …
   – pont-shapefile ugyanezekkel az oszlopokkal (10 karakterre rövidítve), aratás
   – Operations Center vetési shapefile + „-Deere-Metadata.json”: AppliedRate (seeds/ha vagy kg/ha), SWATHWIDTH, SECTIONID, IsoTime, Variety
   Kimenet: opsToH() bemenete (feladat kész pontlistával). */

const PCOL={lon:/^(longitude|lon|lng|long)$/i,lat:/^(latitude|lat)$/i,field:/^(field|fieldname|field_name)$/i,product:/^(product|variety|hybrid|productname)$/i,
  date:/^date$/i,iso:/^isotime$/i,time:/^time$/i,dur:/^duration/i,dist:/^distance/i,width:/^(swth[ _]?wdth|swathwidth|swath[ _]?width)/i,
  ydry:/^yld[ _]?mass[ _(]*d/i,ywet:/^yld[ _]?mass[ _(]*w/i,moist:/^moist/i,area:/^area[ _]?count/i,rate:/^applied[ _]?rat/i,target:/^(targetrate|controlrat)/i,sec:/^sectionid/i};
const findCol=(names,rx)=>names.findIndex(n=>rx.test(n.trim()));

/* dátum → nap 1980-01-01 óta (az ISO-XML-lel azonos), és másodperc */
function dayOf(s){if(s==null)return null;s=String(s).trim();let y,m,d;
  let a=s.match(/^(\d{4})-?(\d{2})-?(\d{2})/);if(a){y=+a[1];m=+a[2];d=+a[3];}
  else if((a=s.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})/))){m=+a[1];d=+a[2];y=+a[3];if(m>12){const t=m;m=d;d=t;}}
  else if((a=s.match(/^(\d{4})\.\s?(\d{1,2})\.\s?(\d{1,2})/))){y=+a[1];m=+a[2];d=+a[3];}
  else return null;
  return Math.round((Date.UTC(y,m-1,d)-Date.UTC(1980,0,1))/86400000);}
function cropFromToken(t){t=(t||'').toUpperCase();if(/CORN|MAIZE/.test(t))return 'Kukorica';if(/SUNFLOWER/.test(t))return 'Napraforgó';if(/CANOLA|RAPE/.test(t))return 'Őszi káposztarepce';
  if(/BARLEY/.test(t))return /SPR/.test(t)?'Tavaszi árpa':'Őszi árpa';if(/WHEAT|DURUM/.test(t))return 'Őszi búza';if(/SOY/.test(t))return 'Szója';if(/SORGHUM/.test(t))return 'Cirok';return '';}
function cropFromPath(p){const c=cropFromName(p);if(c)return c;const t=(p||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');if(/gerste/.test(t))return 'Őszi árpa';if(/durum/.test(t))return 'Őszi búza';return '';}

/* sorokból pontok: aratás vagy vetés felismerése az oszlopokból */
function pointsTask(names,rows,src,meta){
  const ix={};for(const k in PCOL)ix[k]=findCol(names,PCOL[k]);
  if(ix.lon<0||ix.lat<0)return null;
  let kind=null,vcol=-1,scale=1,unit='',dry=false;
  if(ix.ydry>=0||ix.ywet>=0){kind='harvest';dry=ix.ydry>=0;vcol=dry?ix.ydry:ix.ywet;unit='t/ha';const h=names[vcol]||'';if(/kg\/ha/i.test(h))scale=1e-3;}
  else if(ix.rate>=0||(meta&&/seed/i.test(meta.Operation||''))){kind='seed';vcol=ix.rate>=0?ix.rate:ix.target;
    const u=(meta&&((meta.DataAttributes||[]).find(a=>/applied ?rate/i.test(a.Name||''))||{}).Unit)||'';
    if(/seed/i.test(u)){unit='k/ha';scale=1e-3;}else if(/kg/i.test(u)){unit='kg/ha';}
    else{const vs=rows.slice(0,500).map(r=>+r[vcol]).filter(v=>v>0).sort((a,b)=>a-b);const md=vs[vs.length>>1]||0;if(md>2000){unit='k/ha';scale=1e-3;}else unit='kg/ha';}}
  if(!kind||vcol<0)return null;
  const crop=(meta&&cropFromToken(meta.CropToken))||cropFromPath(src);
  const fieldName=meta&&meta.FieldName;const prodName=meta&&meta.Product&&meta.Product.ProductName;
  // sorrend: vetésnél szakaszonként (soronként) időrendben, egyébként a fájl sorrendje
  let R=rows;if(kind==='seed'&&ix.sec>=0){const tk=r=>ix.iso>=0?Date.parse(r[ix.iso])||0:0;R=rows.slice().sort((a,b)=>(+a[ix.sec]-+b[ix.sec])||(tk(a)-tk(b)));}
  const pts=[];let tAcc=0,lastSec=null;
  for(const r of R){const la=+r[ix.lat],ln=+r[ix.lon];if(!isFinite(la)||!isFinite(ln))continue;
    let t,day;
    if(ix.iso>=0&&r[ix.iso]){const ms=Date.parse(String(r[ix.iso]).trim());if(isFinite(ms)){t=ms/1000-Date.UTC(1980,0,1)/1000;day=Math.floor(t/86400);}}
    if(t==null){day=dayOf(ix.date>=0?r[ix.date]:(ix.time>=0?r[ix.time]:null));if(day==null)day=0;
      if(ix.sec>=0&&r[ix.sec]!==lastSec){tAcc+=100;lastSec=r[ix.sec];}// új sor: időbeli szakadás
      tAcc+=ix.dur>=0&&+r[ix.dur]>0?+r[ix.dur]:1;t=day*86400+tAcc;}
    const on=ix.area<0||!/off/i.test(String(r[ix.area]));
    const v=+r[vcol];const wd=ix.width>=0?+r[ix.width]:null;
    pts.push({t,day,la,ln,work:on&&(wd==null||wd>0),wd:wd>0?wd:null,y:isFinite(v)&&v>0?v*scale:null,m:ix.moist>=0&&+r[ix.moist]>0?+r[ix.moist]:null,
      nm:(fieldName||(ix.field>=0?String(r[ix.field]||'').trim():''))||'',prod:(prodName||(ix.product>=0?String(r[ix.product]||'').trim():''))||'',crop});}
  if(pts.length<20)return null;
  return {kind,dry,unit,pts,hybOk:true,name:pts[0].nm,product:pts[0].prod,src};}

/* CSV: elválasztó (vessző / pontosvessző / tab) és tizedesvessző felismerése */
function csvRows(txt){
  const lines=txt.replace(/^﻿/,'').split(/\r?\n/).filter(l=>l.trim());if(lines.length<2)return null;
  const h=lines[0];const sep=[';','\t',','].map(c=>[c,h.split(c).length]).sort((a,b)=>b[1]-a[1])[0][0];
  const split=l=>{if(!l.includes('"'))return l.split(sep);const o=[];let cur='',q=false;for(let i=0;i<l.length;i++){const ch=l[i];if(ch==='"'){q=!q;continue;}if(ch===sep&&!q){o.push(cur);cur='';}else cur+=ch;}o.push(cur);return o;};
  const names=split(h).map(s=>s.trim());let rows=lines.slice(1).map(split);
  if(sep!==','){rows=rows.map(r=>r.map(c=>/^-?\d+,\d+$/.test(c.trim())?c.replace(',','.'):c));}
  return {names,rows};}

/* pont-shapefile (1, 11, 21 típus) */
function shpPoints(buf){const dv=new DataView(buf),out=[];let o=100;const type=dv.getInt32(32,true);if(![1,11,21].includes(type))return null;
  while(o+8<=buf.byteLength){const len=dv.getInt32(o+4)*2,p=o+8;o=p+len;if(len<20){out.push(null);continue;}const st=dv.getInt32(p,true);if(st===0){out.push(null);continue;}out.push([dv.getFloat64(p+4,true),dv.getFloat64(p+12,true)]);}
  return out;}

/* belépési pont: a beolvasott fájlokból (név → bájtok) pont-feladatok; a feldolgozott fájlt kiveszi a listából */
async function pointTasksFromFiles(files,notes,prog){
  const names=Object.keys(files);const base=n=>n.replace(/\.[^.\/]+$/,'').toLowerCase();const out=[];let done=0;
  const csvs=names.filter(n=>/\.(csv|txt)$/i.test(n));
  const shps=names.filter(n=>/\.shp$/i.test(n)&&files[n].byteLength>=100&&[1,11,21].includes(new DataView(files[n].buffer,files[n].byteOffset,files[n].byteLength).getInt32(32,true)));
  const tot=csvs.length+shps.length;
  for(const n of csvs){const t=decodeText(files[n]);delete files[n];const C=csvRows(t);done++;if(prog)await prog(done,tot);
    if(!C)continue;const T=pointsTask(C.names,C.rows,n,null);if(T)out.push(T);}
  for(const n of shps){const b=base(n);const get=ext=>{const k=names.find(x=>base(x)===b&&x.toLowerCase().endsWith(ext));return k?files[k]:null;};
    const dbfB=get('.dbf');if(!dbfB){notes.push(`${n.split('/').pop()}: nincs .dbf`);continue;}
    const sh=files[n];const P=shpPoints(sh.buffer.slice(sh.byteOffset,sh.byteOffset+sh.byteLength));
    const cpg=get('.cpg');const D=dbfParse(dbfB,dbfEncoding(dbfB,cpg?decodeText(cpg):''));
    let meta=null;const mk=names.find(x=>x.toLowerCase().startsWith(b)&&/deere-metadata\.json$/i.test(x));if(mk){try{meta=JSON.parse(decodeText(files[mk]));}catch(e){}}
    const prj=get('.prj');const pr=projFromPrj(prj?decodeText(prj):'');
    let def=pr&&pr.def;if(!pr&&P){const f0=P.find(Boolean);const g=f0&&projGuess(f0);def=g?g.def:null;}
    const cols=['Longitude','Latitude',...D.fields];
    const rows=[];P.forEach((xy,i)=>{if(!xy)return;const [lon,lat]=def?proj4(def,'EPSG:4326',xy):xy;rows.push([lon,lat,...D.fields.map(f=>(D.recs[i]||{})[f])]);});
    // a dBase dátum (ÉÉÉÉHHNN) mezőket a dayOf kezeli
    const T=pointsTask(cols,rows,n,meta);if(T)out.push(T);else notes.push(`${n.split('/').pop()}: nem találtam hozam- vagy vetési oszlopot`);
    names.filter(x=>base(x)===b||x===mk).forEach(k=>delete files[k]);done++;if(prog)await prog(done,tot);}
  return out;}
