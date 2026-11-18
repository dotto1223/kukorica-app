/* ================= satellite indices & automatic analysis ================= */
const STAC='https://earth-search.aws.element84.com/v1/search';
const IDX={
 NDVI:{a:'nir',b:'red',res:10,lo:-0.1,hi:1,f:(A,B)=>(A-B)/(A+B),d:'Általános zöldtömeg, vigor. Sűrű állományban (nyár közepén) telítődik.'},
 NDRE:{a:'nir08',b:'rededge1',res:20,lo:0,hi:0.6,f:(A,B)=>(A-B)/(A+B),d:'Vörös él: klorofill- és N-ellátottság. Sűrű állományban is mutat különbséget (kukorica V8–címerhányás, búza szárbaindulás). 20 m.'},
 NDMI:{a:'nir08',b:'swir16',res:20,lo:-0.3,hi:0.6,f:(A,B)=>(A-B)/(A+B),d:'A lombozat víztartalma: vízstressz, aszálykár. Alacsonyabb érték = szárazabb állomány. 20 m.'},
 MSAVI:{a:'nir',b:'red',res:10,lo:-0.1,hi:1,f:(A,B)=>(2*A+1-Math.sqrt((2*A+1)*(2*A+1)-8*(A-B)))/2,d:'Talajhatásra korrigált zöldtömeg: kelés után, ritka állományban (kelési egyenletesség).'}
};
const ZONE_COL=[[215,48,31],[254,224,139],[26,152,80],[170,170,170]];
const ZONE_NAME=['Gyenge','Átlagos','Erős','Szegély'];
const EDGE_M=15,HOMOG_LIM=0.08,ZONE_DELTA=0.05; // zónahatár: a tábla belső átlagától ±5% relatív NDVI
let ndviRun=null;
const curIdx=()=>IDX[S.idx]?S.idx:'NDVI';
function utmDef(epsg){const z=epsg%100,south=Math.floor(epsg/100)===327;return `+proj=utm +zone=${z}${south?' +south':''} +datum=WGS84 +units=m +no_defs`;}
function itemEpsg(item){return item.properties['proj:epsg']||(item.properties['proj:code']&&+String(item.properties['proj:code']).split(':')[1]);}
async function readWindow(href,bb){
  const tiff=await GeoTIFF.fromUrl(href,{allowFullFile:false});const img=await tiff.getImage();
  const [ox,oy]=img.getOrigin(),[rx,ry]=img.getResolution(),W=img.getWidth(),Hh=img.getHeight();
  const c0=Math.max(0,Math.floor((bb.minx-ox)/rx)),c1=Math.min(W,Math.ceil((bb.maxx-ox)/rx));
  const r0=Math.max(0,Math.floor((bb.maxy-oy)/ry)),r1=Math.min(Hh,Math.ceil((bb.miny-oy)/ry));
  if(c1<=c0||r1<=r0)return null;
  const ras=await img.readRasters({window:[c0,r0,c1,r1],samples:[0]});
  return{data:ras[0],w:c1-c0,h:r1-r0,ox:ox+c0*rx,oy:oy+r0*ry,rx,ry};
}
function sample(Rw,x,y){if(!Rw)return null;const c=Math.floor((x-Rw.ox)/Rw.rx),r=Math.floor((y-Rw.oy)/Rw.ry);if(c<0||r<0||c>=Rw.w||r>=Rw.h)return null;return Rw.data[r*Rw.w+c];}
function reflOffset(item){const pr=item.properties||{};const applied=pr['earthsearch:boa_offset_applied'];const pb=parseFloat(pr['s2:processing_baseline']||'0');return (applied===false&&pb>=4)?-0.1:0;}

/* ---- IndexedDB kulcs-érték tár (nagy rácsokhoz) ---- */
const MEM={};
const DB={db:null,
  open(){if(this.db)return Promise.resolve(this.db);return new Promise((res,rej)=>{try{const r=indexedDB.open('tablatortenet',1);r.onupgradeneeded=()=>r.result.createObjectStore('kv');r.onsuccess=()=>{this.db=r.result;res(r.result);};r.onerror=()=>rej(r.error);}catch(e){rej(e);}});},
  async get(k){if(MEM[k])return MEM[k];try{const db=await this.open();const v=await new Promise((res,rej)=>{const t=db.transaction('kv').objectStore('kv').get(k);t.onsuccess=()=>res(t.result);t.onerror=()=>rej(t.error);});if(v)MEM[k]=v;return v;}catch(e){return null;}},
  async set(k,v){MEM[k]=v;try{const db=await this.open();await new Promise((res,rej)=>{const t=db.transaction('kv','readwrite');t.objectStore('kv').put(v,k);t.oncomplete=res;t.onerror=()=>rej(t.error);});}catch(e){}},
  async del(k){delete MEM[k];try{const db=await this.open();db.transaction('kv','readwrite').objectStore('kv').delete(k);}catch(e){}}
};
function geomKey(f){let h=0;const s=f.geometry.map(p=>p[0].toFixed(6)+','+p[1].toFixed(6)).join(';');for(let i=0;i<s.length;i++){h=((h<<5)-h+s.charCodeAt(i))|0;}return 'ana3.'+f.id+'.'+(h>>>0).toString(36);}

/* ---- közös, földrajzi rács a táblára (~10 m) ---- */
function makeGrid(f){
  const b=bboxOf(f.geometry),lat0=(b.s+b.n)/2;const dLat=10/110540,dLng=10/(111320*Math.cos(lat0*Math.PI/180));
  const nx=Math.max(1,Math.ceil((b.e-b.w)/dLng)),ny=Math.max(1,Math.ceil((b.n-b.s)/dLat));
  const lat=new Float64Array(nx*ny),lng=new Float64Array(nx*ny),inside=new Uint8Array(nx*ny);const poly=f.geometry.map(p=>[p[1],p[0]]);let nIn=0;
  for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const k=j*nx+i;const la=b.n-(j+0.5)*dLat,ln=b.w+(i+0.5)*dLng;lat[k]=la;lng[k]=ln;if(pip(ln,la,poly)){inside[k]=1;nIn++;}}
  return{w:b.w,n:b.n,dLat,dLng,nx,ny,lat,lng,inside,nIn,proj:{}};
}
function gridProj(G,epsg){
  if(G.proj[epsg])return G.proj[epsg];const def=utmDef(epsg);const N=G.nx*G.ny;const xs=new Float64Array(N),ys=new Float64Array(N);let minx=1e12,maxx=-1e12,miny=1e12,maxy=-1e12;
  for(let k=0;k<N;k++){if(!G.inside[k])continue;const [x,y]=proj4('EPSG:4326',def,[G.lng[k],G.lat[k]]);xs[k]=x;ys[k]=y;if(x<minx)minx=x;if(x>maxx)maxx=x;if(y<miny)miny=y;if(y>maxy)maxy=y;}
  return G.proj[epsg]={xs,ys,bb:{minx:minx-30,maxx:maxx+30,miny:miny-30,maxy:maxy+30}};
}
async function itemOnGrid(item,G,bands){ // reflektancia sávonként a táblarácson, felhő/árnyék maszkolva
  const epsg=itemEpsg(item);if(!epsg)throw new Error('nincs vetület');
  for(const b of bands)if(!item.assets[b])throw new Error('hiányzó sáv: '+b);
  const P=gridProj(G,epsg);const keys=bands.concat(item.assets.scl?['scl']:[]);
  const wins=await Promise.all(keys.map(k=>readWindow(item.assets[k].href,P.bb)));
  const scl=item.assets.scl?wins[wins.length-1]:null;const off=reflOffset(item);const N=G.nx*G.ny;
  const out={};bands.forEach(b=>out[b]=new Float32Array(N).fill(NaN));let clear=0;
  for(let k=0;k<N;k++){if(!G.inside[k])continue;const x=P.xs[k],y=P.ys[k];
    if(scl){const s=sample(scl,x,y);if(s!==4&&s!==5)continue;}
    let ok=true;const vals=[];for(let i=0;i<bands.length;i++){const v=sample(wins[i],x,y);if(!v){ok=false;break;}const r=v*0.0001+off;if(r<=0){ok=false;break;}vals.push(r);}
    if(!ok)continue;bands.forEach((b,i)=>out[b][k]=vals[i]);clear++;}
  return{bands:out,clear:G.nIn?clear/G.nIn:0,date:item.properties.datetime.slice(0,10),id:item.id};
}
function idxGrid(bandsOut,ix,G){const I=IDX[ix];const A=bandsOut[I.a],B=bandsOut[I.b];const N=G.nx*G.ny;const g=new Float32Array(N).fill(NaN);let s=0,n=0;
  for(let k=0;k<N;k++){const a=A[k],b=B[k];if(isNaN(a)||isNaN(b))continue;const v=I.f(a,b);if(!isFinite(v)||v<-1||v>1)continue;g[k]=v;s+=v;n++;}return{g,mean:n?s/n:null,n};}

async function stacRange(f,from,to,maxCloud,limit){
  const b=bboxOf(f.geometry);const body={collections:['sentinel-2-l2a'],bbox:[b.w,b.s,b.e,b.n],datetime:`${from}T00:00:00Z/${to}T23:59:59Z`,limit:limit||150,query:{'eo:cloud_cover':{lt:maxCloud}}};
  const c=new AbortController();const t=setTimeout(()=>c.abort(),25000);
  try{const r=await fetch(STAC,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:c.signal});if(!r.ok)throw new Error('STAC HTTP '+r.status);const j=await r.json();
    const byDate={};(j.features||[]).forEach(it=>{const d=it.properties.datetime.slice(0,10);if(!byDate[d]||it.properties['eo:cloud_cover']<byDate[d].properties['eo:cloud_cover'])byDate[d]=it;});
    return Object.values(byDate).sort((a,b)=>a.properties.datetime.localeCompare(b.properties.datetime));}
  finally{clearTimeout(t);}
}

// hosszabb időszak havi bontásban, kis kérésekkel, újrapróbálással (egy nagy kérés több MB és csonkolódhat)
async function stacMonths(f,from,to,maxCloud,run){
  const out=[];let d=new Date(from+'T00:00:00Z');const end=new Date(to+'T00:00:00Z');
  while(d<=end){if(run&&run.cancel)throw new Error('megszakítva');
    const me=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0));const a=d.toISOString().slice(0,10),b=(me<end?me:end).toISOString().slice(0,10);
    let got=null;for(let t=0;t<3&&!got;t++){try{got=await stacRange(f,a,b,maxCloud,80);}catch(e){if(t===2)throw e;await new Promise(r=>setTimeout(r,1500*(t+1)));}}
    out.push(...got);d=new Date(Date.UTC(me.getUTCFullYear(),me.getUTCMonth()+1,1));}
  return out;
}
/* ---- automatikus elemzés: termőzónák + legutóbbi felvétel ---- */
const ANA={};             // fieldId -> elemzés (memóriában)
const JOB={queue:[],cur:null,cancel:false,prog:{d:0,n:0,msg:''}};
const ANA_FAIL={},ANA_FORCED=new Set();
/* háttérelemzés hibája: érthető mondat, felugró üzenet csak ha a felhasználó maga indította */
function friendlyAnaErr(m){m=String(m||'');if(/felhőmentes|kevés/i.test(m))return 'Ehhez a táblához még nincs elég felhőmentes műholdkép. A zónák később, újabb felvételekkel elkészülhetnek.';if(/fetch|network|hálózat|Failed/i.test(m))return 'A műholdképek most nem érhetők el (nincs internet vagy a szolgáltató foglalt). Próbálja újra később.';return 'Az elemzés most nem sikerült. Próbálja újra később.';}
function queueAnalysis(id,force){if(force){delete ANA_FAIL[id];}else if(ANA_FAIL[id])return;if(!JOB.queue.includes(id)&&JOB.cur!==id)JOB.queue.push(id);if(!JOB.cur)nextJob();}
async function nextJob(){
  const id=JOB.queue.shift();if(!id){JOB.cur=null;updJobUI();return;}
  const f=S.fields.find(x=>x.id===id);if(!f)return nextJob();
  try{if(await loadAna(f))return nextJob();}catch(e){} // már kiszámolva (eszközön tárolva)
  JOB.cur=id;JOB.cancel=false;JOB.prog={d:0,n:0,msg:'Felvételek keresése…'};updJobUI();
  try{const a=await analyzeField(f);if(a){a._key=geomKey(f);ANA[f.id]=a;await DB.set(geomKey(f),a);if(f.id===S.sel){if(!S.view||S.view==='none')S.view='zones';renderAnaLayer();}if(ANA_FORCED.has(id)||f.id===S.sel)toast(`Elemzés kész: ${fieldLabel(f)}`);}}
  catch(e){if(e.message!=='megszakítva'){ANA_FAIL[id]=friendlyAnaErr(e.message||e);if(ANA_FORCED.has(id))toast(ANA_FAIL[id]);}console.warn(e);}
  ANA_FORCED.delete(id);
  JOB.cur=null;updJobUI();if(curTab==='sat')renderSat();if(curTab==='fields')renderFields();nextJob();
}
function stepJob(msg){JOB.prog.d++;if(msg)JOB.prog.msg=msg;updJobUI();if(JOB.cancel)throw new Error('megszakítva');}
function updJobUI(){
  const pill=$('#jobPill');if(pill){if(JOB.cur){const f=S.fields.find(x=>x.id===JOB.cur);const p=JOB.prog.n?Math.round(JOB.prog.d/JOB.prog.n*100):0;pill.style.display='';pill.textContent=`⏳ Elemzés: ${f?f.name:''} ${p}%`;}else pill.style.display='none';}
  const bar=$('#anaBar'),txt=$('#anaTxt');if(bar&&JOB.cur===S.sel){bar.style.width=(JOB.prog.n?JOB.prog.d/JOB.prog.n*100:0)+'%';}if(txt&&JOB.cur===S.sel)txt.textContent=`${JOB.prog.msg} (${JOB.prog.d}/${JOB.prog.n||'?'})`;
}
const ANA_YEARS=()=>{const last=new Date().getMonth()>=8?THIS_YEAR:THIS_YEAR-1;const a=[];for(let y=last-8;y<=last;y++)a.push(y);return a;};
const WINDOWS=[['04-15','05-15'],['05-16','06-15'],['06-16','07-15'],['07-16','08-25']];
async function analyzeField(f){
  const G=makeGrid(f);if(G.nIn<4)throw new Error('túl kicsi tábla');const N=G.nx*G.ny;
  const edge=new Uint8Array(N);{const c0=centroid(f.geometry),Lc=mkLocal(c0[0],c0[1]);const P=f.geometry.map(Lc.f);
    for(let k=0;k<N;k++){if(!G.inside[k])continue;const q=Lc.f([G.lat[k],G.lng[k]]);let dmin=1e9;for(let i=0;i<P.length;i++){const a=P[i],b=P[(i+1)%P.length];const vx=b[0]-a[0],vy=b[1]-a[1],L2=vx*vx+vy*vy;let t=L2?((q[0]-a[0])*vx+(q[1]-a[1])*vy)/L2:0;t=Math.max(0,Math.min(1,t));const dx=a[0]+t*vx-q[0],dy=a[1]+t*vy-q[1];dmin=Math.min(dmin,Math.hypot(dx,dy));}if(dmin<EDGE_M)edge[k]=1;}}
  const years=ANA_YEARS();
  // 1) jelöltek keresése évenként: ablakonként a legkevésbé felhős felvétel
  const plan=[];
  for(const y of years){if(JOB.cancel)throw new Error('megszakítva');JOB.prog.msg=`Felvételek keresése: ${y}`;updJobUI();
    let items=[];try{items=await stacRange(f,`${y}-04-15`,`${y}-08-25`,25);}catch(e){}
    const picks=WINDOWS.map(([a,b])=>items.filter(it=>{const d=it.properties.datetime.slice(5,10);return d>=a&&d<=b;}).sort((p,q)=>p.properties['eo:cloud_cover']-q.properties['eo:cloud_cover'])[0]).filter(Boolean);
    plan.push({y,picks});}
  JOB.prog.n=plan.reduce((a,p)=>a+p.picks.length,0)+4;JOB.prog.d=0;updJobUI();
  // 2) évenkénti csúcs-NDVI a táblarácson
  const yearsOut=[];
  for(const p of plan){
    const res=await Promise.all(p.picks.map(async it=>{try{const r=await itemOnGrid(it,G,['red','nir']);stepJob(`NDVI ${p.y}`);if(r.clear<0.8)return null;const n=idxGrid(r.bands,'NDVI',G);return{date:r.date,mean:n.mean,g:n.g};}catch(e){if(e.message==='megszakítva')throw e;stepJob();return null;}}));
    const ok=res.filter(r=>r&&r.mean!=null).sort((a,b)=>b.mean-a.mean);if(!ok.length)continue;
    const best=ok[0];if(best.mean<0.35)continue; // nem volt zöld állomány (pl. ugar, rossz év)
    const use=ok.filter(r=>r.mean>=best.mean-0.03).slice(0,2);
    const peak=new Float32Array(N).fill(NaN);let s=0,n=0;
    for(let k=0;k<N;k++){if(!G.inside[k])continue;let a=0,c=0;use.forEach(u=>{const v=u.g[k];if(!isNaN(v)){a+=v;c++;}});if(c){peak[k]=a/c;s+=a/c;n++;}}
    const m=s/n;const rel=new Float32Array(N).fill(NaN);for(let k=0;k<N;k++)if(!isNaN(peak[k]))rel[k]=peak[k]/m;
    yearsOut.push({y:p.y,dates:use.map(u=>u.date),mean:m,rel});
  }
  if(yearsOut.length<2)throw new Error('kevés felhőmentes év a termőzónákhoz');
  // 3) többéves átlag, szórás, zónák
  const meanRel=new Float32Array(N).fill(NaN),cv=new Float32Array(N).fill(NaN);
  for(let k=0;k<N;k++){if(!G.inside[k])continue;let s=0,s2=0,c=0;yearsOut.forEach(Y=>{const v=Y.rel[k];if(!isNaN(v)){s+=v;s2+=v*v;c++;}});if(c>=Math.min(3,yearsOut.length)){const m=s/c;meanRel[k]=m;cv[k]=c>1?Math.sqrt(Math.max(0,s2/c-m*m))/m:0;}}
  const sm=new Float32Array(N).fill(NaN); // 3x3 simítás
  for(let j=0;j<G.ny;j++)for(let i=0;i<G.nx;i++){const k=j*G.nx+i;if(isNaN(meanRel[k]))continue;let s=0,c=0;for(let dj=-1;dj<=1;dj++)for(let di=-1;di<=1;di++){const jj=j+dj,ii=i+di;if(jj<0||ii<0||jj>=G.ny||ii>=G.nx)continue;const v=meanRel[jj*G.nx+ii];if(!isNaN(v)){s+=v;c++;}}sm[k]=s/c;}
  const vals=Array.from(sm).filter((v,k)=>!isNaN(v)&&!edge[k]).sort((a,b)=>a-b);if(vals.length<10)throw new Error('a tábla belseje túl kicsi a zónázáshoz');const q=p=>vals[Math.round(p*(vals.length-1))];const mIn=vals.reduce((a,b)=>a+b,0)/vals.length;const t1=mIn*(1-ZONE_DELTA),t2=mIn*(1+ZONE_DELTA);const p9010=q(0.9)-q(0.1);
  let zone=new Int8Array(N);for(let k=0;k<N;k++){if(isNaN(sm[k]))continue;if(edge[k]){zone[k]=4;continue;}zone[k]=sm[k]<t1?1:sm[k]<=t2?2:3;}
  const z2=new Int8Array(N); // 3x3 módusz-szűrő
  for(let j=0;j<G.ny;j++)for(let i=0;i<G.nx;i++){const k=j*G.nx+i;if(!zone[k])continue;if(zone[k]===4){z2[k]=4;continue;}const cnt=[0,0,0,0,0];for(let dj=-1;dj<=1;dj++)for(let di=-1;di<=1;di++){const jj=j+dj,ii=i+di;if(jj<0||ii<0||jj>=G.ny||ii>=G.nx)continue;const zz=zone[jj*G.nx+ii];if(zz>=1&&zz<=3)cnt[zz]++;}let best=zone[k];for(let z=1;z<=3;z++)if(cnt[z]>cnt[best])best=z;z2[k]=best;}
  zone=z2;
  const cellHa=(10*10)/1e4;const area=[0,0,0,0,0];const zs=[0,0,0,0,0],zc=[0,0,0,0,0];for(let k=0;k<N;k++){const z=zone[k];if(z>=1&&z<=4&&!isNaN(meanRel[k])){zs[z]+=meanRel[k];zc[z]++;}}const zMean=zs.map((v,i)=>zc[i]?v/zc[i]:null);for(let k=0;k<N;k++)if(zone[k])area[zone[k]]++;const inA=area[1]+area[2]+area[3];const offShare=inA?(area[1]+area[3])/inA:0;const spread=p9010;
  const zoneYear=yearsOut.map(Y=>{const s=[0,0,0,0,0],c=[0,0,0,0,0];for(let k=0;k<N;k++){const z=zone[k];if(!z||z>3||isNaN(Y.rel[k]))continue;s[z]+=Y.rel[k];c[z]++;}return{y:Y.y,dates:Y.dates,mean:Y.mean,z:[1,2,3].map(z=>c[z]?s[z]/c[z]:null)};});
  let unst=0,tot=0;for(let k=0;k<N;k++){if(isNaN(cv[k]))continue;tot++;if(cv[k]>0.12)unst++;}
  // 4) legutóbbi felhőmentes felvétel – mind a 4 index
  let latest=null;
  try{latest=await latestScene(f,G);}catch(e){if(e.message==='megszakítva')throw e;}
  JOB.prog.d=JOB.prog.n;updJobUI();
  return{v:3,zMean,spread,offShare,homog:offShare<0.15||spread<HOMOG_LIM,at:isoToday(),G:{w:G.w,n:G.n,dLat:G.dLat,dLng:G.dLng,nx:G.nx,ny:G.ny},inside:G.inside,meanRel,cv,zone,thr:[t1,t2],area:area.map(a=>a*cellHa),years:zoneYear,unstable:tot?unst/tot:0,latest};
}
async function latestScene(f,G){
  const today=isoToday();
  for(const days of [45,120,400]){
    let items=[];try{items=await stacRange(f,addDays(today,-days),today,30,60);}catch(e){continue;}
    items=items.reverse().slice(0,4);
    for(const it of items){const r=await itemOnGrid(it,G,['red','nir','nir08','rededge1','swir16']);stepJob(`Legutóbbi felvétel: ${r.date}`);
      if(r.clear<0.7)continue;const grids={},means={};Object.keys(IDX).forEach(ix=>{const o=idxGrid(r.bands,ix,G);grids[ix]=o.g;means[ix]=o.mean;});return{date:r.date,grids,means,id:it.id};}
  }
  return null;
}
async function loadAna(f){if(!f)return null;if(ANA[f.id]&&ANA[f.id]._key===geomKey(f))return ANA[f.id];const a=await DB.get(geomKey(f));if(a){a._key=geomKey(f);ANA[f.id]=a;}else delete ANA[f.id];return a||null;}

/* ---- térképi réteg a táblahatáron belül ---- */
const anaPane=map.createPane('ana');anaPane.style.zIndex=390;anaPane.style.pointerEvents='none';
let anaLayer=null,SELGRID=null; // SELGRID: idősorból kiválasztott felvétel {f,ix,date,g}
function viewOptions(f){const a=f&&ANA[f.id];const o=[['none','Nézet: csak határ']];
  if(a){o.push(['zones','Termőzónák (3 zóna)'],['rel','Termőképesség (relatív)'],['cv','Instabilitás (évek közti)']);
    if(a.latest)Object.keys(IDX).filter(ix=>!S.simple||ix==='NDVI').forEach(ix=>o.push([ix,`${ix} – ${a.latest.date}`]));}
  if(SELGRID&&f&&SELGRID.f===f.id)o.push(['sel',`${SELGRID.ix} – ${SELGRID.date}`]);
  const ys=f&&f.seasons&&f.seasons[S.year];if(ys&&ys.ymap)o.push(['ymap',`Hozamtérkép – ${S.year}`]);if(ys&&ys.smap)o.push(['smap',`Vetési térkép – ${S.year}`]);
  return o;}
function effView(f){const o=viewOptions(f);if(o.some(x=>x[0]===S.view))return S.view;return o.some(x=>x[0]==='zones')?'zones':'none';}
function renderViewSel(){const f=curField(),sel=$('#viewSel');if(!sel)return;const o=viewOptions(f),v=effView(f);
  sel.innerHTML=o.map(([k,l])=>`<option value="${k}" ${k===v?'selected':''}>${esc(l)}</option>`).join('');sel.style.display=f?'':'none';}
function stretch(g,inside){const v=[];for(let k=0;k<g.length;k++)if(inside[k]&&!isNaN(g[k]))v.push(g[k]);v.sort((a,b)=>a-b);if(!v.length)return[0,1];const q=p=>v[Math.round(p*(v.length-1))];let lo=q(0.02),hi=q(0.98);if(hi-lo<0.04){const m=(hi+lo)/2;lo=m-0.02;hi=m+0.02;}return[lo,hi];}
function renderAnaLayer(){
  if(anaLayer){map.removeLayer(anaLayer);anaLayer=null;}const lb=$('#legendBox');lb.style.display='none';
  renderViewSel();const f=curField();const V=effView(f);if(!f||V==='none')return;const a=ANA[f.id];
  let G,inside,draw,legend='';
  if(V==='sel'&&SELGRID&&SELGRID.f===f.id){G=SELGRID.G;inside=SELGRID.inside;const [lo,hi]=stretch(SELGRID.g,inside);draw=k=>{const v=SELGRID.g[k];return isNaN(v)?null:palette((v-lo)/(hi-lo));};legend=lgGrad(`${SELGRID.ix} ${SELGRID.date}`,lo,hi,'a tábla saját tartománya');}
  else if(V==='ymap'){const Y=f.seasons[S.year].ymap,YG=ymapGrid(Y);G=YG.G;inside=YG.inside;const [lo,hi]=stretch(YG.g,inside);draw=k=>{const v=YG.g[k];return isNaN(v)?null:palette((v-lo)/(hi-lo));};legend=lgGrad(`Hozamtérkép ${Y.date} (t/ha)`,lo,hi,`átlag ${fmt(Y.mean,2)} t/ha · ${Y.cell} m-es rács`);}
  else if(V==='smap'){const Y=f.seasons[S.year].smap,YG=ymapGrid(Y);G=YG.G;inside=YG.inside;let [lo,hi]=stretch(YG.g,inside);if(hi-lo<Y.mean*0.06){const m=(lo+hi)/2;lo=m-Y.mean*0.03;hi=m+Y.mean*0.03;}draw=k=>{const v=YG.g[k];return isNaN(v)?null:palette((v-lo)/(hi-lo));};
    legend=lgGrad(`Vetési térkép ${Y.date} (${unitTxt(Y.unit)})`,lo,hi,`átlag ${Y.unit==='k/ha'?fmt0(Y.mean*1000)+' mag/ha':fmt0(Y.mean)+' kg/ha'} · ${Y.cell} m-es rács`);}
  else if(a){G=a.G;inside=a.inside;
    if(V==='zones'){draw=k=>a.zone[k]?ZONE_COL[a.zone[k]-1]:null;legend=`<b>Termőzónák ${ANA_YEARS()[0]}–${ANA_YEARS().slice(-1)[0]}</b>${a.homog?'<div style="color:#8a5a12;font-size:11.5px">Homogén tábla: a legjobb és leggyengébb 10% közt csak '+fmt0((a.spread||0)*100)+'%</div>':''}`+[2,1,0,3].filter(i=>a.area[i+1]).map(i=>`<div style="display:flex;align-items:center;gap:6px;margin-top:3px"><span class="sw" style="background:rgb(${ZONE_COL[i].join(',')})"></span>${ZONE_NAME[i]} · ${fmt(a.area[i+1],1)} ha</div>`).join('');}
    else if(V==='rel'){const lo=0.85,hi=1.15;draw=k=>{const v=a.meanRel[k];return isNaN(v)?null:palette((v-lo)/(hi-lo));};legend=lgGrad('Relatív termőképesség',lo,hi,'1,00 = a tábla átlaga');}
    else if(V==='cv'){draw=k=>{const v=a.cv[k];if(isNaN(v))return null;const t=Math.min(1,v/0.25);return[255,Math.round(255-155*t),Math.round(255-225*t)];};legend=lgGrad('Instabilitás (CV)',0,0.25,'világos = stabil',true);}
    else if(IDX[V]&&a.latest){const g=a.latest.grids[V];const [lo,hi]=stretch(g,inside);draw=k=>{const v=g[k];return isNaN(v)?null:palette((v-lo)/(hi-lo));};legend=lgGrad(`${V} ${a.latest.date}`,lo,hi,`átlag ${fmt(a.latest.means[V],2)} · a tábla saját tartománya`);}
  }
  if(!draw)return;
  const B=[[G.n-G.ny*G.dLat,G.w],[G.n,G.w+G.nx*G.dLng]];let url,cls='pix';
  if(S.pix){const cv=document.createElement('canvas');cv.width=G.nx;cv.height=G.ny;const ctx=cv.getContext('2d');const im=ctx.createImageData(G.nx,G.ny);
    for(let k=0;k<G.nx*G.ny;k++){if(!inside[k])continue;const c=draw(k);if(!c)continue;im.data[k*4]=c[0];im.data[k*4+1]=c[1];im.data[k*4+2]=c[2];im.data[k*4+3]=200;}
    ctx.putImageData(im,0,0);url=cv.toDataURL();}
  else{url=smoothLayer(G,inside,draw,V==='zones',f.geometry);cls='';}
  anaLayer=L.imageOverlay(url,B,{pane:'ana',className:cls,interactive:false}).addTo(map);
  lb.innerHTML=legend+`<label class="pixSw"><input type="checkbox" id="pixSw" ${S.pix?'checked':''}> <span>Pixeles nézet (eredeti 10 m-es rács)</span></label>`;lb.classList.remove('open');lb.style.display='block';
  const ps=$('#pixSw');ps.onclick=e=>e.stopPropagation();ps.onchange=()=>{S.pix=ps.checked;save();renderAnaLayer();};
}
/* ---- simított megjelenítés: folyamatos rétegnél kétlineáris színkeverés, zónánál többségi döntés;
   kis zónaszigetek beolvasztása; a táblahatárral levágva. Csak a kép változik, a számítás az eredeti rácson marad. ---- */
function smoothLayer(G,inside,draw,cat,geom){
  const nx=G.nx,ny=G.ny,N=nx*ny;const col=new Array(N);
  for(let k=0;k<N;k++)col[k]=inside[k]?draw(k):null;
  if(cat){// 1–2 pixeles szigetek: ha 8 szomszédjából legfeljebb egy azonos, a szomszédok többségi zónáját kapja
    for(let it=0;it<2;it++){const nc=col.slice();
      for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const k=j*nx+i,c=col[k];if(!c)continue;const cnt=new Map();let same=0,tot=0;
        for(let dj=-1;dj<=1;dj++)for(let di=-1;di<=1;di++){if(!di&&!dj)continue;const ii=i+di,jj=j+dj;if(ii<0||jj<0||ii>=nx||jj>=ny)continue;const q=col[jj*nx+ii];if(!q)continue;tot++;if(q===c){same++;continue;}const key=q.join();cnt.set(key,(cnt.get(key)||[0,q]));cnt.get(key)[0]++;}
        if(tot>=5&&same<=1){let best=null;for(const v of cnt.values())if(!best||v[0]>best[0])best=v;if(best)nc[k]=best[1];}}
      for(let k=0;k<N;k++)col[k]=nc[k];}}
  // hiányzó cellák kitöltése a szomszédokból (csak a kép kedvéért; a széleken a vágás eltünteti a táblán kívüli részt)
  for(let it=0;it<4;it++){const nc=col.slice();let ch=0;
    for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const k=j*nx+i;if(col[k])continue;let r=0,g=0,b=0,n=0;const cnt=new Map();
      for(let dj=-1;dj<=1;dj++)for(let di=-1;di<=1;di++){if(!di&&!dj)continue;const ii=i+di,jj=j+dj;if(ii<0||jj<0||ii>=nx||jj>=ny)continue;const q=col[jj*nx+ii];if(!q)continue;n++;
        if(cat){const key=q.join();const e=cnt.get(key)||[0,q];e[0]++;cnt.set(key,e);}else{r+=q[0];g+=q[1];b+=q[2];}}
      if(n>=(it?2:3)){if(cat){let best=null;for(const e of cnt.values())if(!best||e[0]>best[0])best=e;nc[k]=best[1];}else nc[k]=[r/n,g/n,b/n];ch++;}}
    for(let k=0;k<N;k++)col[k]=nc[k];if(!ch)break;}
  const sc=Math.max(2,Math.min(8,Math.round(1600/Math.max(nx,ny))));const W=nx*sc,H=ny*sc;
  const off=document.createElement('canvas');off.width=W;off.height=H;const octx=off.getContext('2d');const im=octx.createImageData(W,H);const d=im.data;
  for(let Y=0;Y<H;Y++){const v=(Y+0.5)/sc-0.5,j0=Math.floor(v),fy=v-j0;
    for(let X=0;X<W;X++){const u=(X+0.5)/sc-0.5,i0=Math.floor(u),fx=u-i0;
      let r=0,g=0,b=0,ws=0;const votes=cat?new Map():null;
      if(cat){// zóna: többségi döntés 1,6 cella sugarú kúpos súllyal → sima határvonal
        for(let j=j0-1;j<=j0+2;j++)for(let i=i0-1;i<=i0+2;i++){if(i<0||j<0||i>=nx||j>=ny)continue;const c=col[j*nx+i];if(!c)continue;
          const w=1-Math.hypot(i-u,j-v)/1.6;if(w<=0)continue;const key=c.join();const e=votes.get(key)||[0,c];e[0]+=w;votes.set(key,e);ws+=w;}}
      else for(let dj=0;dj<=1;dj++)for(let di=0;di<=1;di++){const i=i0+di,j=j0+dj;if(i<0||j<0||i>=nx||j>=ny)continue;const c=col[j*nx+i];if(!c)continue;
        const w=(di?fx:1-fx)*(dj?fy:1-fy);if(w<=0)continue;r+=c[0]*w;g+=c[1]*w;b+=c[2]*w;ws+=w;}
      if(ws<=0){// a szélen: a legközelebbi cella színe, hogy a vágásig kitöltött legyen
        const i=Math.min(nx-1,Math.max(0,Math.round(u))),j=Math.min(ny-1,Math.max(0,Math.round(v)));const c=col[j*nx+i];if(!c)continue;r=c[0];g=c[1];b=c[2];ws=1;
        if(cat){votes.set(c.join(),[1,c]);}}
      const o=(Y*W+X)*4;
      if(cat){let best=null;for(const e of votes.values())if(!best||e[0]>best[0])best=e;d[o]=best[1][0];d[o+1]=best[1][1];d[o+2]=best[1][2];}
      else{d[o]=r/ws;d[o+1]=g/ws;d[o+2]=b/ws;}
      d[o+3]=200;}}
  octx.putImageData(im,0,0);
  const cv=document.createElement('canvas');cv.width=W;cv.height=H;const ctx=cv.getContext('2d');
  if(geom&&geom.length>2){ctx.beginPath();geom.forEach(([la,ln],i)=>{const x=(ln-G.w)/G.dLng*sc,y=(G.n-la)/G.dLat*sc;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.closePath();ctx.clip();}
  ctx.drawImage(off,0,0);return cv.toDataURL();}
function lgGrad(title,lo,hi,note,heat){const grad=heat?'linear-gradient(90deg,#fff,rgb(255,100,30))':'linear-gradient(90deg,rgb(165,0,38),rgb(244,109,67),rgb(254,224,139),rgb(166,217,106),rgb(26,152,80),rgb(0,104,55))';
  return `<b>${esc(title)}</b><div style="display:flex;align-items:center;gap:4px;margin-top:4px">${fmt(lo,2)} <span style="display:inline-block;width:100px;height:10px;border-radius:3px;background:${grad}"></span> ${fmt(hi,2)}</div><div class="meta" style="font-size:11px">${esc(note)}</div>`;}
function palette(t){const stops=[[0,[165,0,38]],[0.25,[244,109,67]],[0.45,[254,224,139]],[0.65,[166,217,106]],[0.85,[26,152,80]],[1,[0,104,55]]];t=Math.max(0,Math.min(1,t));
  for(let i=1;i<stops.length;i++){if(t<=stops[i][0]){const [a,ca]=stops[i-1],[b,cb]=stops[i];const u=(t-a)/(b-a);return ca.map((x,k)=>Math.round(x+(cb[k]-x)*u));}}return stops[stops.length-1][1];}
function clearNdviLayer(){S.view='none';renderAnaLayer();}

/* ---- zónák exportja (GeoJSON, soronkénti téglalapokból) ---- */
function zonesGeoJSON(f,a){const G=a.G,feats=[];
  for(let z=1;z<=4;z++){if(z===4&&!(a.area[4]>0))continue;const polys=[];for(let j=0;j<G.ny;j++){let i=0;while(i<G.nx){if(a.zone[j*G.nx+i]!==z){i++;continue;}let i2=i;while(i2+1<G.nx&&a.zone[j*G.nx+i2+1]===z)i2++;const w=G.w+i*G.dLng,e=G.w+(i2+1)*G.dLng,n=G.n-j*G.dLat,s=G.n-(j+1)*G.dLat;polys.push([[[w,n],[e,n],[e,s],[w,s],[w,n]]]);i=i2+1;}}
    feats.push({type:'Feature',properties:{tabla:f.name,zona:z,zona_nev:ZONE_NAME[z-1],terulet_ha:+a.area[z].toFixed(2),evek:a.years.map(y=>y.y).join(',')},geometry:{type:'MultiPolygon',coordinates:polys}});}
  return{type:'FeatureCollection',features:feats};}

/* ---- index-idősor (átlagértékek) ---- */
async function indexForItem(item,f,ix){
  const I=IDX[ix];const epsg=itemEpsg(item);if(!epsg)throw new Error('nincs vetület');if(!item.assets[I.a]||!item.assets[I.b])throw new Error('hiányzó sáv');
  const def=utmDef(epsg);const poly=f.geometry.map(ll=>proj4('EPSG:4326',def,[ll[1],ll[0]]));
  const pad=I.res;const bb={minx:Math.min(...poly.map(p=>p[0]))-pad,maxx:Math.max(...poly.map(p=>p[0]))+pad,miny:Math.min(...poly.map(p=>p[1]))-pad,maxy:Math.max(...poly.map(p=>p[1]))+pad};
  const [A,B,C]=await Promise.all([readWindow(item.assets[I.a].href,bb),readWindow(item.assets[I.b].href,bb),item.assets.scl?readWindow(item.assets.scl.href,bb):Promise.resolve(null)]);
  if(!A||!B)return null;const off=reflOffset(item);let sum=0,cnt=0,tot=0;
  for(let r=0;r<A.h;r++)for(let c=0;c<A.w;c++){const x=A.ox+(c+0.5)*A.rx,y=A.oy+(r+0.5)*A.ry;if(!pip(x,y,poly))continue;tot++;
    const av=A.data[r*A.w+c],bv=sample(B,x,y);if(!av||!bv)continue;if(C){const s=sample(C,x,y);if(s!==4&&s!==5)continue;}
    const a=av*0.0001+off,b=bv*0.0001+off;if(a<=0||b<=0)continue;const v=I.f(a,b);if(!isFinite(v)||v<-1||v>1)continue;sum+=v;cnt++;}
  return{date:item.properties.datetime.slice(0,10),val:cnt?sum/cnt:null,clear:tot?cnt/tot:0,cloud:item.properties['eo:cloud_cover'],id:item.id};
}
const idxKey=(f,y,ix)=>`idx4.${ix}.${f.id}.${y}.${f.geometry.length}.${Math.round(f.areaHa*100)}`;
async function runIdx(f,year,ix){
  const k=idxKey(f,year,ix);const cached=cacheGet(k);if(cached&&(year<THIS_YEAR||cached.at===isoToday()))return cached.rows;
  const run={cancel:false};ndviRun=run;const items=await stacMonths(f,`${year}-02-15`,`${year}-11-30`,60,run);
  const G=makeGrid(f);const I=IDX[ix];const a=ANA[f.id];const zone=a&&a.G&&a.G.nx===G.nx&&a.G.ny===G.ny?a.zone:null;
  const rows=[];let done=0;setProg(0,items.length);const queue=items.slice();
  async function worker(){while(queue.length&&!run.cancel){const it=queue.shift();try{
      const r=await itemOnGrid(it,G,[...new Set([I.a,I.b])]);const o=idxGrid(r.bands,ix,G);
      if(o.mean!=null){let z=null;if(zone){const s=[0,0,0,0],c=[0,0,0,0];for(let q=0;q<o.g.length;q++){const zz=zone[q];if(zz>=1&&zz<=3&&!isNaN(o.g[q])){s[zz]+=o.g[q];c[zz]++;}}z=[1,2,3].map(zz=>c[zz]>=3?s[zz]/c[zz]:null);}
        rows.push({date:r.date,val:o.mean,clear:r.clear,cloud:it.properties['eo:cloud_cover'],id:it.id,z});}
    }catch(e){console.warn(e);}done++;setProg(done,items.length);}}
  await Promise.all([worker(),worker(),worker()]);if(run.cancel)throw new Error('megszakítva');
  rows.sort((a,b)=>a.date.localeCompare(b.date));cacheSet(k,{at:isoToday(),rows});return rows;
}
function setProg(d,n){const b=$('#ndviBar'),t=$('#ndviTxt');if(b)b.style.width=(n?d/n*100:0)+'%';if(t)t.textContent=n?`${d} / ${n} felvétel feldolgozva`:'Felvételek keresése…';}

function fieldYield(f,y){const se=f.seasons&&f.seasons[y];if(!se)return null;let w=0,ar=0;const crops=new Set();se.parts.forEach(p=>{const yl=calcYield(f,p).std,a=partArea(f,p);if(yl!=null&&a){w+=yl*a;ar+=a;if(p.crop)crops.add(p.crop);}});return ar?{y:w/ar,crop:[...crops].join('+')}:null;}
function zoneYieldHTML(f,a){
  const rows=a.years.map(Y=>{const fy=fieldYield(f,Y.y);return fy?{y:Y.y,crop:fy.crop,fy:fy.y,z:Y.z.map(r=>r==null?null:fy.y*r)}:null;}).filter(Boolean);
  if(!rows.length)return `<div class="notice" style="margin-top:10px">Ha az <b>Évek</b> fülön megadja az egyes évek termésátlagát, itt zónánkénti becsült hozamot is lát (a tábla hozama × a zóna növényzeti értéke).</div>`;
  const byCrop={};rows.forEach(r=>{(byCrop[r.crop||'?']=byCrop[r.crop||'?']||[]).push(r);});
  return `<h3>Becsült zónahozam (t/ha)</h3><p class="meta" style="margin-bottom:6px">A megadott táblahozam szétosztva a zónák növényzeti értéke (NDVI) szerint. Becslés: a zónák közti különbség nem mindig arányos a hozamkülönbséggel (pl. aszály a virágzás után).</p>
  <div class="tw"><table><tr><th>Év</th><th>Növény</th><th>Tábla</th><th>Gyenge</th><th>Átlagos</th><th>Erős</th></tr>${rows.map(r=>`<tr><td>${r.y}</td><td>${esc(r.crop||'–')}</td><td><b>${fmt(r.fy,2)}</b></td>${r.z.map(v=>`<td>${fmt(v,2)}</td>`).join('')}</tr>`).join('')}
  ${Object.entries(byCrop).filter(([c,a])=>a.length>1).map(([c,arr])=>{const m=i=>{const v=arr.map(r=>i<0?r.fy:r.z[i]).filter(v=>v!=null);return v.length?v.reduce((p,q)=>p+q,0)/v.length:null;};return `<tr style="background:#f6f8f4"><td colspan="2"><b>${esc(c)} átlag (${arr.length} év)</b></td><td><b>${fmt(m(-1),2)}</b></td>${[0,1,2].map(i=>`<td><b>${fmt(m(i),2)}</b></td>`).join('')}</tr>`;}).join('')}</table></div>`;
}
/* ---- Műhold fül ---- */
async function renderSat(){
  const f=curField(),box=$('#satBox');if(!f){box.innerHTML='';return;}
  await loadAna(f);if(curField()!==f||curTab!=='sat')return;
  const a=ANA[f.id],ix=curIdx(),I=IDX[ix];const [lat,lng]=centroid(f.geometry);const running=JOB.cur===f.id,queued=JOB.queue.includes(f.id);
  const yrs=ANA_YEARS();
  let h=`<h2>${esc(fieldLabel(f))} – műholdas elemzés</h2>`;
  h+=`<div class="card"><b>🛰️ Automatikus elemzés</b><p class="help" style="margin:6px 0">A program ${yrs[0]}–${yrs[yrs.length-1]} között minden évből a legzöldebb felhőmentes műholdképet veszi, és ezek átlagából jelöli ki a tábla <b>gyengébb, átlagos és erősebb</b> részeit${hq('zone')}. A térképen a bal felső <b>Nézet</b> választóval jelenítheti meg.</p>`;
  if(running)h+=`<div class="bar"><i id="anaBar"></i></div><div class="meta" id="anaTxt"></div><button class="btn sm ghost" id="anaStop" style="margin-top:6px">Megszakítás</button>`;
  else if(queued)h+=`<div class="meta">Sorban áll…</div>`;
  else if(a){
    h+=`<div class="row" style="margin:6px 0">${[3,2,1,4].filter(z=>a.area[z]).map(z=>`<span class="chip"><i class="sw" style="background:rgb(${ZONE_COL[z-1].join(',')})"></i>${ZONE_NAME[z-1]} · ${fmt(a.area[z],1)} ha${a.zMean&&a.zMean[z]!=null?` · ${fmt(a.zMean[z],2)}`:''}</span>`).join('')}</div>
    ${a.homog?`<div class="notice warn"><b>Homogén tábla.</b> A tábla nagy része a táblaátlag ±5%-án belül van (a legjobb és leggyengébb 10% közt csak ${fmt0(a.spread*100)}% a különbség) – itt a zónák szerinti differenciálás valószínűleg nem éri meg.</div>`:(a.spread?`<div class="notice">A tábla legjobb és leggyengébb 10%-a között a többéves átlagban <b>${fmt0(a.spread*100)}%</b> a különbség.</div>`:'')}
    <div class="meta">${a.years.length} év felhasználva · a zónák mellett a többéves növényzeti érték a tábla átlagához képest (1,00 = átlag) · a ${EDGE_M} m-es szegély külön („Szegély”), mert ott a forduló és a vegyes pixelek torzítanak · évek közt instabil: ${fmt0(a.unstable*100)}% · számolva: ${a.at}</div>
    <div class="row" style="margin-top:8px">${[['zones','Zónák'],['rel','Termőképesség'],['cv','Instabilitás']].concat(a.latest?Object.keys(IDX).map(k=>[k,`${k} · ${a.latest.date.slice(5)}`]):[]).map(([v,l])=>`<button class="btn sm ${S.view===v?'primary':''}" data-view="${v}">${l}</button>`).join('')}</div>
    <h3>Zónák évenként (a tábla átlagához képest, 1,00 = átlag)${hq('zone')}</h3>
    <div class="tw"><table><tr><th>Év</th><th>Felvétel</th><th>Növényzet (NDVI)${hq('ndvi')}</th><th>Gyenge</th><th>Átlagos</th><th>Erős</th></tr>${a.years.map(y=>`<tr><td>${y.y}</td><td>${y.dates.map(d=>d.slice(5)).join(', ')}</td><td>${fmt(y.mean,2)}</td>${y.z.map(v=>`<td>${fmt(v,2)}</td>`).join('')}</tr>`).join('')}</table></div>
    ${zoneYieldHTML(f,a)}
    ${a.latest?`<h3>Legutóbbi felhőmentes felvétel: ${a.latest.date}</h3><p class="help">Ez a pillanatnyi állapot (pl. betakarítás után tarló vagy csupasz talaj) – nem a zónák alapja. A zónák a fenti, többéves csúcs-felvételekből készülnek.</p><div class="stats">${Object.keys(IDX).map(k=>`<div><b>${fmt(a.latest.means[k],2)}</b><span>${k} átlag</span></div>`).join('')}</div>`:'<div class="meta" style="margin-top:8px">Nem találtam friss felhőmentes felvételt.</div>'}
    <div class="row" style="margin-top:8px"><button class="btn sm" id="anaZonesGj">⬇ Zónák (GeoJSON)</button><button class="btn sm ghost" id="anaRe">↻ Újraszámolás</button></div>
    <p class="meta" style="margin-top:6px">Zónahatárok: <b>gyenge</b> = a tábla belső átlaga alatt több mint 5%-kal, <b>erős</b> = felette több mint 5%-kal, a többi <b>átlagos</b> (többéves növényzeti érték, NDVI). Így a zónák mérete a tábla valós változatosságát mutatja. Ellenőrizze terepen és talajmintával.</p>`;}
  else h+=`${ANA_FAIL[f.id]?`<div class="notice">${esc(ANA_FAIL[f.id])}</div>`:''}<div class="row"><button class="btn primary" id="anaGo">${ANA_FAIL[f.id]?'Újrapróbálás':'Elemzés indítása'}</button></div><p class="meta" style="margin-top:6px">Kb. 30–40 felvétel, wifin 1–3 perc.</p>`;
  h+=`</div>`;
  h+=`<div class="card" id="curveCard"><b>📈 Vegetációs görbe – ${S.year}</b><p class="help" style="margin:6px 0">Az év összes felhőmentes felvétele: hogyan alakult az állomány a vegetáció során${a?', zónánként is (gyenge / átlagos / erős)':''}. Az évet a fejlécben válthatja.</p><div class="seg" id="idxSeg" style="margin:4px 0 8px">${Object.keys(IDX).map(k=>`<button data-ix="${k}" class="${k===ix?'on':''}">${k}</button>`).join('')}</div>
  <p class="help"><b>${ix}:</b> <span>${esc(I.d)}</span> Egy év kb. 30–80 felvétel (mobilneten akár 20–100 MB) – telefonon érdemes wifin lekérni; az eredményt az eszköz megjegyzi. Egy pontra koppintva a felvétel képe megjelenik a térképen.</p>
  <div class="row"><button class="btn primary" id="ndviGo">${ix}-görbe lekérése (${S.year})</button><button class="btn sm ghost" id="ndviStop" style="display:none">Megszakítás</button></div>
  <div id="ndviProg" style="display:none;margin-top:10px"><div class="bar"><i id="ndviBar"></i></div><div class="meta" id="ndviTxt"></div></div>
  <div id="ndviOut"></div></div>
  <h3>Külső nézet</h3><a class="btn sm" href="https://browser.dataspace.copernicus.eu/?zoom=15&lat=${lat.toFixed(5)}&lng=${lng.toFixed(5)}" target="_blank" rel="noopener">Megnyitás a Copernicus Browserben ↗</a>`;
  box.innerHTML=h;updJobUI();
  const st=$('#anaStop');if(st)st.onclick=()=>{JOB.cancel=true;};
  const go1=$('#anaGo');if(go1)go1.onclick=()=>{ANA_FORCED.add(f.id);queueAnalysis(f.id,true);renderSat();};
  const re=$('#anaRe');if(re)re.onclick=()=>{DB.del(geomKey(f));delete ANA[f.id];ANA_FORCED.add(f.id);queueAnalysis(f.id,true);renderSat();};
  const gj=$('#anaZonesGj');if(gj)gj.onclick=()=>offerFile(`${safeName(f.name)}_termozonak.geojson`,JSON.stringify(ascGeo(zonesGeoJSON(f,a))),'application/geo+json');
  box.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{S.view=b.dataset.view;save();renderAnaLayer();renderSat();});
  box.querySelectorAll('[data-ix]').forEach(b=>b.onclick=()=>{S.idx=b.dataset.ix;save();renderSat();});
  $('#ndviGo').onclick=async()=>{const y=S.year,ix2=curIdx();$('#ndviProg').style.display='';$('#ndviStop').style.display='';$('#ndviGo').disabled=true;setProg(0,0);
    try{const rows=await runIdx(f,y,ix2);if(curField()!==f||S.year!==y||curIdx()!==ix2)return;drawIdx(f,y,ix2,rows);}
    catch(e){const o=$('#ndviOut');if(o)o.innerHTML=`<div class="notice warn">A lekérés nem sikerült: ${esc(e.message||e)}. Lehet, hogy nincs internet, vagy a műholdas adatszolgáltatás most nem érhető el.</div>`;}
    finally{const g=$('#ndviGo');if(g)g.disabled=false;const s=$('#ndviStop');if(s)s.style.display='none';const p=$('#ndviProg');if(p)p.style.display='none';}};
  $('#ndviStop').onclick=()=>{if(ndviRun)ndviRun.cancel=true;};
  const c=cacheGet(idxKey(f,S.year,ix));if(c)drawIdx(f,S.year,ix,c.rows);
  else{const cn=navigator.connection;const cell=cn&&(cn.saveData||cn.type==='cellular'||/2g|3g/.test(cn.effectiveType||''));const mobile=window.innerWidth<900;if(!cell&&!mobile&&!(running||queued))$('#ndviGo').click();}
}
function drawIdx(f,y,ix,rows){
  const out=$('#ndviOut');if(!out)return;const I=IDX[ix];const good=rows.filter(r=>r.clear>=0.6);
  if(!good.length){out.innerHTML='<div class="notice warn">Nem találtam elég felhőmentes felvételt erre az évre.</div>';return;}
  const se=season(f,y,false);
  const W=460,H=200,pl=34,pb=24,pt=10,pr=8;const t0=Date.parse(`${y}-02-15`),t1=Date.parse(`${y}-11-30`);const X=d=>pl+(Date.parse(d)-t0)/(t1-t0)*(W-pl-pr);
  const lo=Math.min(I.lo,...good.map(r=>r.val)),hi=Math.max(I.hi,...good.map(r=>r.val));const Y=v=>H-pb-(v-lo)/(hi-lo)*(H-pb-pt);
  let s=`<svg viewBox="0 0 ${W} ${H}" width="100%">`;
  const step=(hi-lo)>0.8?0.2:0.1;for(let v=Math.ceil(lo/step)*step;v<=hi+1e-9;v+=step)s+=`<line x1="${pl}" x2="${W-pr}" y1="${Y(v)}" y2="${Y(v)}" stroke="#eef1ea"/><text x="${pl-4}" y="${Y(v)+4}" font-size="10" text-anchor="end" fill="#8a968c">${(Math.round(v*10)/10).toString().replace('.',',')}</text>`;
  for(let m=2;m<=11;m++){const d=`${y}-${String(m).padStart(2,'0')}-01`;s+=`<text x="${X(d)}" y="${H-7}" font-size="9.5" fill="#5f6d61">${MONTHS[m-1]}</text>`;}
  if(se)se.parts.forEach((p,i)=>{[['sowing','vetés'],['harvest','aratás']].forEach(([k,l])=>{if(p[k]&&p[k].startsWith(String(y))){const x=X(p[k]);s+=`<line x1="${x}" x2="${x}" y1="${pt}" y2="${H-pb}" stroke="${se.parts.length>1?PART_COL[i%PART_COL.length]:'#2f6b3a'}" stroke-dasharray="3 3"/><text x="${x+2}" y="${pt+9+i*10}" font-size="9" fill="#2f6b3a">${l}${se.parts.length>1?' '+esc(p.label):''}</text>`;}});});
  const hasZ=good.some(r=>r.z&&r.z.some(v=>v!=null));
  if(hasZ)[0,1,2].forEach(zi=>{let dz='';good.forEach(r=>{const v=r.z&&r.z[zi];if(v==null)return;dz+=(dz?'L':'M')+X(r.date)+','+Y(v);});if(dz)s+=`<path d="${dz}" fill="none" stroke="rgb(${ZONE_COL[zi].join(',')})" stroke-width="${zi===1?1.6:2}" opacity=".95"/>`;});
  let d='';good.forEach(r=>{d+=(d?'L':'M')+X(r.date)+','+Y(r.val);});s+=`<path d="${d}" fill="none" stroke="${hasZ?'#1d2a1f':'#3f8a4c'}" stroke-width="1.5" ${hasZ?'stroke-dasharray="4 3"':''}/>`;
  good.forEach((r,i)=>s+=`<circle data-i="${i}" cx="${X(r.date)}" cy="${Y(r.val)}" r="5" fill="#2f6b3a" stroke="#fff" stroke-width="1.5" style="cursor:pointer"><title>${r.date}: ${ix} ${fmt(r.val,2)} (${fmt0(r.clear*100)}% felhőmentes)</title></circle>`);
  s+='</svg>';const pk=good.reduce((a,b)=>b.val>a.val?b:a);
  out.innerHTML=`<div class="stats" style="margin-top:10px"><div><b>${good.length}</b><span>felhőmentes felvétel</span></div><div><b>${fmt(pk.val,2)}</b><span>csúcs-${ix}</span></div><div><b>${pk.date.slice(5)}</b><span>csúcs dátuma</span></div></div>${s}${hasZ?`<div class="row" style="font-size:12.5px;gap:12px"><span><i class="sw" style="background:rgb(${ZONE_COL[2].join(',')})"></i> Erős zóna</span><span><i class="sw" style="background:rgb(${ZONE_COL[1].join(',')})"></i> Átlagos</span><span><i class="sw" style="background:rgb(${ZONE_COL[0].join(',')})"></i> Gyenge</span><span>┄ tábla átlag</span></div>`:''}<div class="meta" id="ndviSel">Koppintson egy pontra: a felvétel ${ix}-képe megjelenik a térképen.</div>`;
  out.querySelectorAll('circle[data-i]').forEach(c=>c.onclick=()=>showIdxMap(f,ix,good[+c.dataset.i]));
}
async function showIdxMap(f,ix,row){
  const sel=$('#ndviSel');if(sel)sel.textContent=`${row.date} ${ix}-kép betöltése…`;
  try{const r=await fetch(`https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a/items/${row.id}`);const item=await r.json();
    const G=makeGrid(f);const I=IDX[ix];const res=await itemOnGrid(item,G,[...new Set([I.a,I.b])]);const o=idxGrid(res.bands,ix,G);if(!o.n)throw new Error('nincs felhőmentes pixel');
    SELGRID={f:f.id,ix,date:row.date,g:o.g,G:{w:G.w,n:G.n,dLat:G.dLat,dLng:G.dLng,nx:G.nx,ny:G.ny},inside:G.inside};S.view='sel';renderAnaLayer();
    if(sel)sel.textContent=`${row.date}: ${ix} átlag ${fmt(o.mean,2)} – a térképen látható (Nézet: ${ix} – ${row.date}).`;fit(f);
    if(window.innerWidth<900)document.getElementById('mapWrap').scrollIntoView({behavior:'smooth'});
  }catch(e){if(sel)sel.textContent='A kép nem tölthető be: '+(e.message||e);}
}
