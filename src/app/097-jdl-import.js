/* ================= John Deere .jdl kijelzőnapló (GreenStar / Gen4) – kísérleti olvasó =================
   Saját visszafejtés, a John Deere nem dokumentálja. A fájl rekordok sorozata: 1 bájt típus + 4 bájt hossz (LE) + protobuf.
   – 1-es típus: csatornaszótár (csatornaszám → jel / ISO DDI, egység, skála, eltolás)
   – 2-es típus: adatblokk; csatornánként alapérték (double), időlépések (packed varint, fél ms), értékváltozások (zigzag)
   Használt csatornák: 10020/10021 jel = szélesség/hosszúság (u32 / 1e7 − 210), 12001 jel = munkaszélesség (mm),
   DDI 87 = gabonaáram (mg/s), DDI 99 = nedvesség (ppm). Az idő a fájl kezdetéhez képest relatív, ezért a fájlnév
   (ÉÉÉÉ_HH_NN_[óó_pp]) adja az abszolút időt. Hozam = áram / (sebesség × munkaszélesség); a sebesség a GPS-ből jön.
   Munkaadatok (1-es rekord, 5-ös mező): 11 = ügyfél, 12 = gazdaság, 13 = tábla, 21 = kultúra (1.1 kód, 1.2 név a kijelző nyelvén)
   és fajta/hibrid (2.1.1.2). A tábla neve ékezetesen innen jön; ha hiányzik, a mappa nevéből (ott az ékezet helyén „-” áll). */

const JDL_LAG=2;// s: a gabonaáram ennyivel később látszik, mint ahol levágták – a 2023-as búzán és 2024-es kukoricán mérve
function jdlVar(b,o){let lo=0,hi=0,s=0,x;// 64 bites varint két 32 bites félben
  do{x=b[o++];if(s<28)lo+=(x&0x7f)*Math.pow(2,s);else if(s===28){lo+=(x&0x0f)*Math.pow(2,28);hi+=(x&0x7f)>>>4;}else hi+=(x&0x7f)*Math.pow(2,s-32);s+=7;}while(x&0x80);
  return [lo,hi,o];}
function jdlFields(b){// protobuf mezők: [mező, típus, érték]
  const out=[];let o=0;const dv=new DataView(b.buffer,b.byteOffset,b.byteLength);
  while(o<b.length){let k;[k,,o]=jdlVar(b,o);const f=Math.floor(k/8),wt=k&7;
    if(wt===0){const r=jdlVar(b,o);o=r[2];out.push([f,'v',r[0]+r[1]*4294967296,r[1]]);}
    else if(wt===1){out.push([f,'d',dv.getFloat64(o,true)]);o+=8;}
    else if(wt===5){out.push([f,'f',dv.getFloat32(o,true)]);o+=4;}
    else if(wt===2){const r=jdlVar(b,o);const L=r[0];o=r[2];if(o+L>b.length)throw 0;out.push([f,'b',b.subarray(o,o+L)]);o+=L;}
    else throw 0;}
  return out;}
function jdlPacked(b){const out=[];let o=0;while(o<b.length){const r=jdlVar(b,o);o=r[2];out.push(r[0]+r[1]*4294967296);}return out;}
const jdlZz=n=>n%2?-(n+1)/2:n/2;
function jdlRecs(u8){const R=[],dv=new DataView(u8.buffer,u8.byteOffset,u8.byteLength);let o=0;
  while(o+5<=u8.length){const L=dv.getUint32(o+1,true);if(o+5+L>u8.length)break;
    try{R.push(jdlFields(u8.subarray(o+5,o+5+L)));}catch(e){}o+=5+L;}
  return R;}
function jdlFirst(F){const d={};for(const x of F)if(!(x[0] in d))d[x[0]]=x;return d;}
/* csatornaszótár: kulcs 'sig:10020' vagy 'ddi:87' → csatornaszámok */
function jdlDict(R){const out=new Map();
  const walk=(b,dep)=>{let F;try{F=jdlFields(b);}catch(e){return;}const d=jdlFirst(F);
    if(d[1]&&d[1][1]==='v'&&d[7]&&d[7][1]==='v'&&d[4]&&d[4][1]==='d'){const ddi=d[7][2];
      const key=ddi===65535?'sig:'+(d[2]?d[2][2]:''):'ddi:'+ddi;if(!out.has(key))out.set(key,[]);out.get(key).push(d[1][2]);return;}
    if(dep<8)for(const x of F)if(x[1]==='b'&&x[2].length>6)walk(x[2],dep+1);};
  for(const F of R)if(F[0]&&F[0][2]===1)for(const x of F)if(x[1]==='b')walk(x[2],0);
  return out;}
/* a kért csatornák idősorai: csatorna → {t:[ms], v:[nyers]} */
function jdlSeries(R,want){const out=new Map();
  for(const F of R){if(!F[0]||F[0][2]!==2)continue;const g4=F.find(x=>x[0]===4&&x[1]==='b');if(!g4)continue;
    let G;try{G=jdlFields(g4[2]);}catch(e){continue;}const b9=G.find(x=>x[0]===9&&x[1]==='b');if(!b9)continue;
    let B;try{B=jdlFields(b9[2]);}catch(e){continue;}const idb=B.find(x=>x[0]===2&&x[1]==='b');if(!idb)continue;
    const ids=jdlPacked(idb[2]),S=B.filter(x=>x[0]===3).map(x=>x[2]);
    for(let i=0;i<ids.length&&i<S.length;i++){if(!want.has(ids[i]))continue;
      let d;try{d=jdlFirst(jdlFields(S[i]));}catch(e){continue;}
      if(!d[1]||d[1][1]!=='d'||!d[2]||d[2][1]!=='b'||!d[3]||d[3][1]!=='b')continue;
      let t0=0;if(d[12]&&d[12][1]==='v')t0=d[12][3]>=0x80000000?jdlNeg(S[i]):d[12][2];// negatív kezdőidő: s64
      const dt=jdlPacked(d[2][2]),dv=jdlPacked(d[3][2]).map(jdlZz);
      let acc=d[1][2],tt=0;if(!out.has(ids[i]))out.set(ids[i],{t:[],v:[]});const o=out.get(ids[i]);
      for(let k=0;k<dt.length&&k<dv.length;k++){tt+=dt[k]/2;acc+=dv[k];o.t.push(t0+tt);o.v.push(acc);}}}
  return out;}
/* negatív kezdőidő (s64) pontosan: a 12-es mező két félből */
function jdlNeg(b){let o=0;while(o<b.length){const k=jdlVar(b,o);o=k[2];const f=Math.floor(k[0]/8),wt=k[0]&7;
    if(wt===0){const r=jdlVar(b,o);if(f===12){const lo=r[0],hi=r[1];return -((4294967295-hi)*4294967296+(4294967296-lo));}o=r[2];}
    else if(wt===1)o+=8;else if(wt===5)o+=4;else if(wt===2){const r=jdlVar(b,o);o=r[2]+r[0];}else return 0;}
  return 0;}
function jdlInterp(x,X,Y){// X növekvő
  let lo=0,hi=X.length-1;if(x<=X[0])return Y[0];if(x>=X[hi])return Y[hi];
  while(hi-lo>1){const m=(lo+hi)>>1;if(X[m]<=x)lo=m;else hi=m;}const f=(x-X[lo])/((X[hi]-X[lo])||1);return Y[lo]+(Y[hi]-Y[lo])*f;}
function jdlSorted(s){if(!s)return null;const ix=s.t.map((_,i)=>i).sort((a,b)=>s.t[a]-s.t[b]);return {t:ix.map(i=>s.t[i]),v:ix.map(i=>s.v[i])};}
/* fájlnév → a napló kezdete (s, 1980-01-01 óta, mint az ISO-XML-nél) */
function jdlStart(name){const a=String(name).match(/(\d{4})_(\d{2})_(\d{2})_\[(\d{2})_(\d{2})\]/);if(!a)return null;
  return (Date.UTC(+a[1],+a[2]-1,+a[3],+a[4],+a[5])-Date.UTC(1980,0,1))/1000;}
/* mappanév → tábla: „2024_Ügyfél._Gazdaság._Tábla” */
function jdlFieldName(dir){const d=String(dir||'').split('/').filter(Boolean).pop()||'';const p=d.split('._');let f=p.length>1?p[p.length-1]:d.replace(/^\d{4}_/,'');
  return f.trim();}
const JDL_CROP={34:'Kukorica',44:'Őszi búza'};// a Vadas-naplókban látott kódok
function jdlMeta(R){const M={};const str=b=>{try{return new TextDecoder('utf-8',{fatal:true}).decode(b);}catch(e){return '';}};
  const sub=(b,path)=>{let cur=b;for(const f of path){let F;try{F=jdlFields(cur);}catch(e){return null;}const x=F.find(y=>y[0]===f);if(!x)return null;if(x[1]!=='b')return x[2];cur=x[2];}return cur;};
  for(const F of R){if(!F[0]||F[0][2]!==1)continue;const x=F.find(y=>y[0]===5&&y[1]==='b');if(!x)continue;
    const g=(path)=>{const v=sub(x[2],path);return v&&v.length!=null?str(v).trim():(v!=null?v:'');};
    M.field=M.field||g([13,1,2]);M.farm=M.farm||g([12,1,2]);M.client=M.client||g([11,1,2]);
    M.cropName=M.cropName||g([21,1,2]);M.cropId=M.cropId||g([21,1,1]);M.product=M.product||g([21,2,1,1,2]);
    if(M.field)break;}
  const cn=M.cropName||'';M.crop=(/arpa|árpa|barley/i.test(cn)&&/tavasz|spring/i.test(cn)?'Tavaszi árpa':'')||cropFromName(cn)||cropFromToken(cn)||JDL_CROP[M.cropId]||'';
  return M;}
/* egy .jdl fájl → aratási pontok (vagy null, ha nincs benne helyzet és gabonaáram) */
function jdlPoints(u8,name,fieldName){
  const start=jdlStart(name);if(start==null)return null;
  const R=jdlRecs(u8);const D=jdlDict(R);const M=jdlMeta(R);const nm=M.field||fieldName,prod=M.product||'',crop=M.crop||'';
  const ch=k=>D.get(k)||[];if(!ch('sig:10020').length||!ch('sig:10021').length||!ch('ddi:87').length)return null;
  const want=new Set([...ch('sig:10020'),...ch('sig:10021'),...ch('sig:12001'),...ch('ddi:87'),...ch('ddi:99')]);
  const S=jdlSeries(R,want);
  const pick=k=>{let best=null;for(const i of ch(k)){const s=S.get(i);if(s&&s.t.length&&(!best||s.t.length>best.t.length))best=s;}return jdlSorted(best);};
  const LA=pick('sig:10020'),LO=pick('sig:10021'),FL=pick('ddi:87'),WD=pick('sig:12001'),MO=pick('ddi:99');
  if(!LA||!LO||!FL||LA.t.length<20)return null;
  const deg=v=>{const u=((v%4294967296)+4294967296)%4294967296;return u*1e-7-210;};
  const lat=LA.v.map(deg),lon=LO.v.map(deg);
  const lat0=lat[lat.length>>1];const kx=111320*Math.cos(lat0*Math.PI/180),ky=110540;
  const pts=[];const t0=LA.t[0],t1=LA.t[LA.t.length-1];
  for(let i=0;i<FL.t.length;i++){const tf=FL.t[i],t=tf+JDL_LAG*1000;if(t<t0||t>t1)continue;
    const la=jdlInterp(t,LA.t,lat),ln=jdlInterp(t,LO.t,lon);
    const dx=(jdlInterp(t+2000,LO.t,lon)-jdlInterp(t-2000,LO.t,lon))*kx,dy=(jdlInterp(t+2000,LA.t,lat)-jdlInterp(t-2000,LA.t,lat))*ky;
    const sp=Math.hypot(dx,dy)/4;// m/s
    const w=WD?jdlInterp(t,WD.t,WD.v)/1000:null;const m=MO?jdlInterp(tf,MO.t,MO.v)/1e4:null;
    const fl=FL.v[i]/1e6;// kg/s
    const y=sp>0.3&&w>0.5&&fl>0?fl/(sp*w)*10:null;// kg/s / (m²/s) → t/ha
    const ts=start+t/1000;
    pts.push({t:ts,day:Math.floor(ts/86400),la,ln,work:fl>0.3&&(w==null||w>0),wd:w>0?w:null,y,m:m>0&&m<60?m:null,nm,prod,crop});}
  return pts.length>=20?pts:null;}
/* belépési pont: egy mappa .jdl fájljai → egy aratási feladat (opsClean / opsToH bemenete) */
async function jdlTasksFromFiles(files,notes,dir){
  const names=Object.keys(files).filter(n=>/\.jdl$/i.test(n)).sort();if(!names.length)return [];
  const fieldName=jdlFieldName(dir);let P=[],nUse=0;
  for(const n of names){let p=null;try{p=jdlPoints(files[n],n.split('/').pop(),fieldName);}catch(e){p=null;}delete files[n];if(p){P=P.concat(p);nUse++;}}
  if(!P.length){notes.push(`${fieldName||dir}: ${names.length} db .jdl naplóban nem találtam aratási (helyzet + gabonaáram) adatot.`);return [];}
  P.sort((a,b)=>a.t-b.t);
  // a táblanév a naplóból (ékezetesen); fajtánként külön feladat (pl. sávkísérlet)
  const name=modeOf(P.map(p=>p.nm))||fieldName;P.forEach(p=>p.nm=name);
  const byP=new Map();P.forEach(p=>{if(!byP.has(p.prod))byP.set(p.prod,[]);byP.get(p.prod).push(p);});
  // száraz (szabványnedvességre számolt) hozam pontonként, ugyanazzal a szabállyal, mint az évad hozamánál (calcYield):
  // csak a szabványnál nedvesebb terményt számolja le, a szárazabbat nem számolja fel. Ehhez kell a kultúra és a nedvesség.
  const crop=modeOf(P.map(p=>p.crop).filter(Boolean))||'';let dry=false;
  if(crop&&P.some(p=>p.m!=null)){const sm=STD_MOIST[crop]??14;dry=true;
    P.forEach(p=>{if(p.y!=null&&p.m!=null&&p.m>sm)p.y=p.y*(100-p.m)/(100-sm);});}
  notes.push(`${name}: John Deere .jdl napló (kísérleti olvasó), ${nUse}/${names.length} fájl, ${dry?'száraz hozam ('+crop+', '+fmt(STD_MOIST[crop]??14,1)+'% szabványnedvesség)':'nedves hozam'}.`);
  return [...byP].map(([prod,pts])=>({kind:'harvest',dry,unit:'t/ha',pts,hybOk:!!prod,name,product:prod,src:dir}));}
