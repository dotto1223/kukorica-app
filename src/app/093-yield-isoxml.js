/* ================= Gépi munkaadatok (ISO-XML / ISOBUS TaskData): aratás és vetés =================
   Case IH / New Holland (AFS, IntelliView), Claas, Fendt, John Deere (ISO-XML export), Kverneland stb.
   TASKDATA.XML (+ XFR-rel hivatkozott DVC/PFD/PDT/TSK… fájlok) és TLGxxxxx.XML + TLGxxxxx.BIN idősor.
   Aratás → hozamtérkép (se.ymap), vetés → vetési térkép (se.smap); mindkettőből táblahatár-javaslat és évadat. */

const DDI_N={WORK:0x8D,WIDTH:0x43,YDRY:0xB5,YWET:0x54,MOIST:0x63,CNT_ACT:0x0C,CNT_SET:0x0B,MASS_ACT:0x07,MASS_SET:0x06,COND1:0xA1};

/* ---- szöveg: a gépek gyakran UTF-8-nak jelölik, de régi közép-európai kódlappal írják ---- */
function decodeText(u8){try{return new TextDecoder('utf-8',{fatal:true}).decode(u8);}catch(e){return new TextDecoder('windows-1250').decode(u8);}}
const dirOf=k=>k.includes('/')?k.slice(0,k.lastIndexOf('/')):'';
function xmlDocs(files,dir){const out={};
  Object.keys(files).forEach(k=>{if(dirOf(k)===dir&&/\.xml$/i.test(k)&&!/(^|\/)TLG\d+\.XML$/i.test(k))out[k.split('/').pop().toUpperCase()]=new DOMParser().parseFromString(decodeText(files[k]).replace(/^﻿/,''),'text/xml');});
  return out;}
function allEl(docs,tag){const r=[];Object.values(docs).forEach(d=>d.querySelectorAll(tag).forEach(e=>r.push(e)));return r;}

/* ---- TLG bináris idősor (ISO 11783-10 D.4); a nem ismételt értékek az előzőt viszik tovább ---- */
function tlgParse(head,bin){
  const tim=head.querySelector('TIM');if(!tim)return null;
  const ptn=tim.querySelector('PTN');const has=a=>!!ptn&&ptn.hasAttribute(a)&&ptn.getAttribute(a)==='';
  const dlvs=[...tim.querySelectorAll('DLV')].map(d=>parseInt(d.getAttribute('A'),16));
  const fixed={};if(ptn)['A','B'].forEach(a=>{if(ptn.hasAttribute(a)&&ptn.getAttribute(a)!=='')fixed[a]=+ptn.getAttribute(a);});
  const dv=new DataView(bin.buffer,bin.byteOffset,bin.byteLength),L=bin.byteLength;
  const timeIn=tim.getAttribute('A')==='';
  const rows=[];const cur=new Array(dlvs.length).fill(null);let o=0;
  while(o<L){
    let ms=0,day=0;if(timeIn){if(o+6>L)break;ms=dv.getUint32(o,true);day=dv.getUint16(o+4,true);o+=6;}
    let lat=fixed.A??null,lng=fixed.B??null;
    if(has('A')){if(o+4>L)break;lat=dv.getInt32(o,true)*1e-7;o+=4;}
    if(has('B')){if(o+4>L)break;lng=dv.getInt32(o,true)*1e-7;o+=4;}
    if(has('C'))o+=4;if(has('D'))o+=1;if(has('E'))o+=2;if(has('F'))o+=2;if(has('G'))o+=1;if(has('H'))o+=4;if(has('I'))o+=2;
    if(o+1>L)break;const n=dv.getUint8(o);o+=1;if(o+5*n>L)break;
    for(let i=0;i<n;i++){const ix=dv.getUint8(o),v=dv.getInt32(o+1,true);o+=5;if(ix<cur.length)cur[ix]=v;}
    rows.push([day,ms,lat,lng,...cur]);}
  return {dlvs,rows};}

/* ---- gép: teljes munkaszélesség és szakaszok (DPT 0043) ---- */
function deviceWidths(docs){
  const W={tot:null,sec:[]};
  allEl(docs,'DVC').forEach(dvc=>{const obj={};dvc.querySelectorAll('DPT').forEach(p=>obj[p.getAttribute('A')]=p);
    const wOf=det=>{for(const r of det.querySelectorAll('DOR')){const p=obj[r.getAttribute('A')];if(p&&parseInt(p.getAttribute('B'),16)===DDI_N.WIDTH)return +p.getAttribute('C');}return null;};
    const dets=[...dvc.querySelectorAll('DET')];
    dets.filter(d=>['1','2'].includes(d.getAttribute('C'))).forEach(d=>{const w=wOf(d);if(w&&(!W.tot||w>W.tot))W.tot=w;});
    const secs=dets.filter(d=>d.getAttribute('C')==='4').sort((a,b)=>+a.getAttribute('E')-+b.getAttribute('E')).map(wOf);
    if(secs.length>W.sec.length)W.sec=secs;});
  if(!W.tot&&W.sec.length&&W.sec.every(Boolean))W.tot=W.sec.reduce((a,b)=>a+b,0);
  return W;}

/* ---- feladatok (TSK) kiolvasása ---- */
function isoxmlTasks(files){
  const tds=Object.keys(files).filter(k=>/(^|\/)TASKDATA\.XML$/i.test(k));const out=[],notes=[];
  tds.forEach(tdk=>{const dir=dirOf(tdk),docs=xmlDocs(files,dir);
    const pfd={},pfdSuid={};allEl(docs,'PFD').forEach(e=>{const n=(e.getAttribute('C')||'').replace(/\s+/g,' ').trim();pfd[e.getAttribute('A')]=n;const s=e.getAttribute('P094_FieldSUID');if(s)pfdSuid[s]=n;});
    const pdt={};allEl(docs,'PDT').forEach(e=>pdt[e.getAttribute('A')]=(e.getAttribute('B')||'').trim());
    const W=deviceWidths(docs);
    allEl(docs,'TSK').forEach(t=>{
      const suid=t.getAttribute('P094_FieldSUID');const name=suid?(pfdSuid[suid]||''):(pfd[t.getAttribute('E')]||'');
      const pan=t.querySelector('PAN');const product=pan?(pdt[pan.getAttribute('A')]||''):'';
      t.querySelectorAll('TLG').forEach(tl=>{const base=tl.getAttribute('A');
        const fk=ext=>Object.keys(files).find(k=>dirOf(k)===dir&&k.split('/').pop().toUpperCase()===base.toUpperCase()+ext);
        const hx=fk('.XML'),bx=fk('.BIN');if(!hx||!bx){notes.push(`${base}: hiányzik az idősor (.XML/.BIN)`);return;}
        const head=new DOMParser().parseFromString(decodeText(files[hx]),'text/xml');
        let P;try{P=tlgParse(head,files[bx]);}catch(e){notes.push(`${base}: hibás idősor`);return;}
        if(!P||!P.rows.length)return;
        const col=d=>{const i=P.dlvs.indexOf(d);return i<0?-1:4+i;};
        const cols={w:col(DDI_N.WORK),wd:col(DDI_N.WIDTH),m:col(DDI_N.MOIST),cond:col(DDI_N.COND1),s:-1};
        let kind=null,scale=1,unit='',dry=false;
        if(col(DDI_N.YDRY)>=0||col(DDI_N.YWET)>=0){kind='harvest';dry=col(DDI_N.YDRY)>=0;cols.v=dry?col(DDI_N.YDRY):col(DDI_N.YWET);scale=1e-5;unit='t/ha';}
        else if(col(DDI_N.CNT_ACT)>=0||col(DDI_N.CNT_SET)>=0){kind='seed';cols.v=col(DDI_N.CNT_ACT);cols.s=col(DDI_N.CNT_SET);scale=1e-2;unit='k/ha';}// darab/m² × 0,001 → ezer mag/ha
        else if(col(DDI_N.MASS_ACT)>=0||col(DDI_N.MASS_SET)>=0){kind='seed';cols.v=col(DDI_N.MASS_ACT);cols.s=col(DDI_N.MASS_SET);scale=1e-2;unit='kg/ha';}// mg/m² → kg/ha
        if(!kind)return;
        out.push({kind,name,product,dry,cols,scale,unit,W,rows:P.rows,src:base});});});});
  return {tasks:out,notes};}

/* ---- helyi síkkoordináta ---- */
function locProj(lat0,lng0){const kx=111320*Math.cos(lat0*Math.PI/180),ky=110540;return{f:(la,ln)=>[(ln-lng0)*kx,(la-lat0)*ky],i:(x,y)=>[lat0+y/ky,lng0+x/kx]};}
const medianOf=a=>{const s=a.slice().sort((x,y)=>x-y);return s[s.length>>1];};

/* ---- tisztítás: munkahelyzet, szakaszok, GPS, sebesség, töltődési késés, kiugró értékek ---- */
function opsClean(T){
  const c=T.cols||{},R=T.rows||[],P=T.pts||[],W=T.W||{};
  if(!T.pts)for(let i=0;i<R.length;i++){const r=R[i];const la=r[2],ln=r[3];
    if(la==null||ln==null||!(Math.abs(la)>1&&Math.abs(ln)>0.1&&Math.abs(la)<85))continue;
    const work=c.w<0?1:r[c.w];let wd=null;
    if(c.wd>=0&&r[c.wd]!=null)wd=r[c.wd]/1000;
    else if(c.cond>=0&&r[c.cond]!=null&&W.sec&&W.sec.length){const u=r[c.cond]>>>0;let s=0;for(let k=0;k<W.sec.length&&k<16;k++)if(((u>>>(2*k))&3)===1)s+=(W.sec[k]||0);wd=s/1000;}
    else if(W.tot)wd=W.tot/1000;
    let v=c.v>=0?r[c.v]:null;if((v==null||v===0)&&c.s>=0)v=r[c.s];
    P.push({t:r[0]*86400+r[1]/1000,day:r[0],la,ln,work:work!=null&&work>0&&(wd==null||wd>0),wd,y:v!=null?v*T.scale:null,m:c.m>=0&&r[c.m]!=null?r[c.m]/1e4:null,nm:T.name,prod:T.product});}
  if(!P.length)return null;
  const pr=locProj(medianOf(P.map(p=>p.la)),medianOf(P.map(p=>p.ln)));
  P.forEach(p=>{[p.px,p.py]=pr.f(p.la,p.ln);});
  const Q=P.filter(p=>Math.hypot(p.px,p.py)<30000);
  let runStart=-1;const keep=[];
  for(let i=0;i<Q.length;i++){const p=Q[i],q=Q[i-1];
    const dt=q?p.t-q.t:0,d=q?Math.hypot(p.px-q.px,p.py-q.py):0;p.d=d;p.v=dt>0?d/dt:0;
    const contig=q&&q.work&&dt>0&&dt<=5&&d<20;
    if(!p.work){runStart=-1;continue;}
    if(!contig)runStart=p.t;p.run=runStart;keep.push(p);}
  let wm=0;for(const p of keep)if(p.wd>wm)wm=p.wd;const wMax=wm>0?wm:(W.tot?W.tot/1000:null);// (nagy tömbre nem Math.max(...): túlcsordul)
  const delay=T.kind==='harvest'?8:0;
  const good=keep.filter(p=>p.y!=null&&p.y>0&&p.v>0.3&&p.v<(T.kind==='seed'?6:5)&&(p.t-p.run)>=delay&&(p.wd==null||p.wd>=0.25*(wMax||p.wd)));
  if(good.length<20)return {kind:T.kind,all:keep,good:[],wMax};
  const ys=good.map(p=>p.y).sort((a,b)=>a-b),q=f=>ys[Math.round(f*(ys.length-1))],md=q(0.5);
  const lo=T.kind==='seed'?md*0.5:Math.max(q(0.01),md*0.2),hi=T.kind==='seed'?md*1.6:Math.min(q(0.995),md*3);
  return {kind:T.kind,all:keep,good:good.filter(p=>p.y>=lo&&p.y<=hi),wMax};}

/* ---- pontok csoportosítása egymástól távoli táblákra (50 m-es rács összefüggő részei) ---- */
function clusterPts(all){
  const pr=locProj(medianOf(all.map(p=>p.la)),medianOf(all.map(p=>p.ln)));const cell=50,m=new Map();
  all.forEach((p,i)=>{const [x,y]=pr.f(p.la,p.ln);const k=Math.floor(x/cell)+','+Math.floor(y/cell);if(!m.has(k))m.set(k,[]);m.get(k).push(i);});
  const seen=new Map();let n=0;
  for(const k of m.keys()){if(seen.has(k))continue;const st=[k];seen.set(k,n);
    while(st.length){const c=st.pop();const [a,b]=c.split(',').map(Number);for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){const kk=(a+dx)+','+(b+dy);if(m.has(kk)&&!seen.has(kk)){seen.set(kk,n);st.push(kk);}}}
    n++;}
  const groups=Array.from({length:n},()=>[]);for(const [k,ids] of m)ids.forEach(i=>groups[seen.get(k)].push(i));
  return groups.map(g=>g.sort((a,b)=>a-b).map(i=>all[i]));}

/* ---- megmunkált terület raszterben → összefüggő részek → kontúr ---- */
function coverParts(A,wDef){
  if(A.length<10)return[];
  const pr=locProj(medianOf(A.map(p=>p.la)),medianOf(A.map(p=>p.ln)));const X=A.map(p=>pr.f(p.la,p.ln));
  let minx=1e9,miny=1e9,maxx=-1e9,maxy=-1e9;X.forEach(([x,y])=>{if(x<minx)minx=x;if(x>maxx)maxx=x;if(y<miny)miny=y;if(y>maxy)maxy=y;});
  let cs=2;while(((maxx-minx)/cs+30)*((maxy-miny)/cs+30)>3e6)cs*=1.5;
  const pad=12,ox=minx-pad*cs,oy=miny-pad*cs,nx=Math.ceil((maxx-minx)/cs)+2*pad,ny=Math.ceil((maxy-miny)/cs)+2*pad;
  const g=new Uint8Array(nx*ny);
  const stamp=(x,y,r)=>{const ci=(x-ox)/cs,cj=(y-oy)/cs,rr=r/cs;for(let j=Math.floor(cj-rr);j<=Math.ceil(cj+rr);j++)for(let i=Math.floor(ci-rr);i<=Math.ceil(ci+rr);i++){if(i<0||j<0||i>=nx||j>=ny)continue;if((i-ci)**2+(j-cj)**2<=rr*rr)g[j*nx+i]=1;}};
  for(let k=1;k<A.length;k++){const p=A[k],q=A[k-1];const [x1,y1]=X[k],[x0,y0]=X[k-1];const d=Math.hypot(x1-x0,y1-y0);if(d>15||p.t-q.t>5)continue;
    const r=Math.max(0.6,((p.wd>0?p.wd:(wDef||6)))/2);const st=Math.max(1,Math.ceil(d/(cs*0.7)));
    for(let s=0;s<=st;s++)stamp(x0+(x1-x0)*s/st,y0+(y1-y0)*s/st,r);}
  // zárás (dilatáció + erózió ~8 m): a fordulók és a sávközök rései eltűnnek
  const R=Math.max(1,Math.round(8/cs));
  const morph=(src,dil)=>{const tmp=new Uint8Array(nx*ny),out=new Uint8Array(nx*ny);
    for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){let v=dil?0:1;for(let k=-R;k<=R;k++){const ii=i+k;const s=ii<0||ii>=nx?0:src[j*nx+ii];if(dil&&s){v=1;break;}if(!dil&&!s){v=0;break;}}tmp[j*nx+i]=v;}
    for(let i=0;i<nx;i++)for(let j=0;j<ny;j++){let v=dil?0:1;for(let k=-R;k<=R;k++){const jj=j+k;const s=jj<0||jj>=ny?0:tmp[jj*nx+i];if(dil&&s){v=1;break;}if(!dil&&!s){v=0;break;}}out[j*nx+i]=v;}
    return out;};
  const cl=morph(morph(g,true),false);
  const outside=new Uint8Array(nx*ny),st=[];for(let i=0;i<nx;i++){st.push(i,(ny-1)*nx+i);}for(let j=0;j<ny;j++){st.push(j*nx,j*nx+nx-1);}
  while(st.length){const k=st.pop();if(outside[k]||cl[k])continue;outside[k]=1;const i=k%nx,j=(k/nx)|0;if(i>0)st.push(k-1);if(i<nx-1)st.push(k+1);if(j>0)st.push(k-nx);if(j<ny-1)st.push(k+nx);}
  const lab=new Int32Array(nx*ny);let nl=0;const comps=[];
  for(let k=0;k<nx*ny;k++){if(outside[k]||lab[k])continue;nl++;let cnt=0;const s=[k];lab[k]=nl;
    while(s.length){const c=s.pop();cnt++;const i=c%nx,j=(c/nx)|0;const nb=[i>0?c-1:-1,i<nx-1?c+1:-1,j>0?c-nx:-1,j<ny-1?c+nx:-1];for(const n of nb)if(n>=0&&!outside[n]&&!lab[n]){lab[n]=nl;s.push(n);}}
    comps.push({id:nl,ha:cnt*cs*cs/1e4});}
  const parts=[];
  comps.filter(c=>c.ha>=0.3).sort((a,b)=>b.ha-a.ha).forEach(c=>{
    const ring=traceOutline(lab,c.id,nx,ny);if(!ring)return;
    const xy=dpSimplify(ring.map(([i,j])=>[ox+i*cs,oy+j*cs]),Math.max(1.5,cs*0.8));if(xy.length<3)return;
    const ll=xy.map(([x,y])=>pr.i(x,y));parts.push({outline:ll,ha:haOf(ll)});});
  return parts;}
/* kontúrkövetés a cellahatárokon (a rész egyetlen külső gyűrűje, lyukak nélkül) */
function traceOutline(lab,id,nx,ny){
  const inC=(i,j)=>i>=0&&j>=0&&i<nx&&j<ny&&lab[j*nx+i]===id;
  const nxt=new Map();const key=(x,y)=>x*100003+y;let any=false;
  for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){if(!inC(i,j))continue;
    if(!inC(i,j-1)){nxt.set(key(i+1,j),[i,j]);any=true;}
    if(!inC(i+1,j))nxt.set(key(i+1,j+1),[i+1,j]);
    if(!inC(i,j+1))nxt.set(key(i,j+1),[i+1,j+1]);
    if(!inC(i-1,j))nxt.set(key(i,j),[i,j+1]);}
  if(!any)return null;
  let best=null;const used=new Set();
  for(const [k0] of nxt){if(used.has(k0))continue;const ring=[];let k=k0,guard=0;
    while(!used.has(k)&&guard++<4e6){used.add(k);const p=nxt.get(k);if(!p)break;ring.push(p);k=key(p[0],p[1]);}
    if(!best||ring.length>best.length)best=ring;}
  return best;}
function dpSimplify(pts,tol){if(pts.length<4)return pts;
  const keep=new Uint8Array(pts.length);keep[0]=keep[pts.length-1]=1;const st=[[0,pts.length-1]];
  while(st.length){const [a,b]=st.pop();let md=0,mi=-1;const [ax,ay]=pts[a],[bx,by]=pts[b],dx=bx-ax,dy=by-ay,L=Math.hypot(dx,dy)||1;
    for(let i=a+1;i<b;i++){const d=Math.abs(dy*pts[i][0]-dx*pts[i][1]+bx*ay-by*ax)/L;if(d>md){md=d;mi=i;}}
    if(md>tol&&mi>0){keep[mi]=1;st.push([a,mi],[mi,b]);}}
  return pts.filter((_,i)=>keep[i]);}

/* ---- térkép 10 m-es földrajzi rácson (képként a térképre tehető) ---- */
function wAvg(pts,wDef){let a=0,s=0;pts.forEach(p=>{const w=(p.wd||wDef||1)*Math.min(p.d||1,8);a+=w;s+=w*p.y;});return a?s/a:null;}
function buildGrid(pts0,polyLL,wDef,meta){
  const pts=pts0.filter(p=>!polyLL||pip(p.la,p.ln,polyLL));if(pts.length<20)return null;
  let n=-90,s=90,w=180,e=-180;(polyLL||pts.map(p=>[p.la,p.ln])).forEach(([la,ln])=>{if(la>n)n=la;if(la<s)s=la;if(ln<w)w=ln;if(ln>e)e=ln;});
  const lat0=(n+s)/2;let cell=10,dLat,dLng,nxg,nyg;
  const dims=()=>{dLat=cell/110540;dLng=cell/(111320*Math.cos(lat0*Math.PI/180));nxg=Math.ceil((e-w)/dLng)+1;nyg=Math.ceil((n-s)/dLat)+1;};dims();
  while(nxg*nyg>60000){cell*=1.5;dims();}
  const sy=new Float64Array(nxg*nyg),sm=new Float64Array(nxg*nyg),cm=new Uint32Array(nxg*nyg),c=new Uint32Array(nxg*nyg);
  pts.forEach(p=>{const i=Math.floor((p.ln-w)/dLng),j=Math.floor((n-p.la)/dLat);if(i<0||j<0||i>=nxg||j>=nyg)return;const k=j*nxg+i;sy[k]+=p.y;c[k]++;if(p.m!=null&&p.m>0){sm[k]+=p.m;cm[k]++;}});
  const val=new Float32Array(nxg*nyg).fill(NaN);let lo=Infinity,hi=-Infinity;
  for(let k=0;k<val.length;k++)if(c[k]>=2){val[k]=sy[k]/c[k];if(val[k]<lo)lo=val[k];if(val[k]>hi)hi=val[k];}
  let ma=0,mm=0;pts.forEach(p=>{if(p.m!=null&&p.m>0){const wa=(p.wd||wDef||1)*Math.min(p.d||1,8);ma+=wa;mm+=wa*p.m;}});
  const G=Object.assign({cell:Math.round(cell),n,w,dLat,dLng,nx:nxg,ny:nyg},gridEnc(val,lo,hi),{mean:+wAvg(pts,wDef).toFixed(2),npts:pts.length},meta);
  if(ma)G.moist=+(mm/ma).toFixed(1);
  return G;}
/* 8 bites tárolás: 0–254 a [lo,hi] tartományban, 255 = nincs adat (a böngésző tárhelye miatt) */
function gridEnc(val,lo,hi){if(!isFinite(lo)){lo=0;hi=1;}if(hi-lo<1e-6)hi=lo+1e-6;const b=new Uint8Array(val.length);
  for(let k=0;k<val.length;k++)b[k]=isNaN(val[k])?255:Math.round((val[k]-lo)/(hi-lo)*254);
  let s='';for(let i=0;i<b.length;i+=8192)s+=String.fromCharCode.apply(null,b.subarray(i,i+8192));
  return {q:8,lo:+lo.toFixed(4),hi:+hi.toFixed(4),v:btoa(s)};}
/* rács levágása egy táblahatárra (meglévő táblához rendeléskor) */
function gridClip(Y,geom){const Z=Object.assign({},Y);const g=ymapGrid(Y);const val=new Float32Array(g.g.length).fill(NaN);let s=0,n=0,lo=Infinity,hi=-Infinity;
  for(let j=0;j<Y.ny;j++)for(let i=0;i<Y.nx;i++){const k=j*Y.nx+i;const v=g.g[k];if(isNaN(v))continue;if(!pip(Y.n-(j+0.5)*Y.dLat,Y.w+(i+0.5)*Y.dLng,geom))continue;val[k]=v;s+=v;n++;if(v<lo)lo=v;if(v>hi)hi=v;}
  if(n<3)return null;Object.assign(Z,gridEnc(val,lo,hi));if(n<g.inside.reduce((a,b)=>a+b,0)*0.98)Z.mean=+(s/n).toFixed(2);return Z;}
function u16b64(a){const b=new Uint8Array(a.buffer);let s='';for(let i=0;i<b.length;i+=8192)s+=String.fromCharCode.apply(null,b.subarray(i,i+8192));return btoa(s);}
function b64u16(s){const bin=atob(s),b=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)b[i]=bin.charCodeAt(i);return new Uint16Array(b.buffer);}
function ymapGrid(Y){if(!Y)return null;if(Y._g)return Y._g;let g,inside;
  if(Y.q===8){const bin=atob(Y.v);g=new Float32Array(bin.length);inside=new Uint8Array(bin.length);for(let k=0;k<bin.length;k++){const b=bin.charCodeAt(k);if(b===255)g[k]=NaN;else{g[k]=Y.lo+b/254*(Y.hi-Y.lo);inside[k]=1;}}}
  else{const v=b64u16(Y.v);g=new Float32Array(v.length);inside=new Uint8Array(v.length);for(let k=0;k<v.length;k++){if(v[k]===65535)g[k]=NaN;else{g[k]=v[k]/100;inside[k]=1;}}}
  Object.defineProperty(Y,'_g',{value:{G:{n:Y.n,w:Y.w,dLat:Y.dLat,dLng:Y.dLng,nx:Y.nx,ny:Y.ny},g,inside},enumerable:false});return Y._g;}
const unitTxt=u=>u==='k/ha'?'ezer mag/ha':u||'t/ha';

/* ---- kultúra kitalálása a névből ---- */
function cropFromName(s){const t=(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  if(/kuk|corn|maize|mais/.test(t))return 'Kukorica';if(/napra|sunfl/.test(t))return 'Napraforgó';if(/repce|rape|osr|canola/.test(t))return 'Őszi káposztarepce';
  if(/arpa|barley/.test(t))return 'Őszi árpa';if(/buza|wheat|weizen/.test(t))return 'Őszi búza';if(/szoja|soy/.test(t))return 'Szója';return '';}
const dayISO=d=>new Date(Date.UTC(1980,0,1)+d*86400000).toISOString().slice(0,10);
const modeOf=a=>{const c={};let b=null,bn=0;a.forEach(x=>{if(x==null||x==='')return;c[x]=(c[x]||0)+1;if(c[x]>bn){bn=c[x];b=x;}});return b;};
/* vetésnél az évadat éve: őszi vetés (aug.–dec.) a következő évi aratáshoz tartozik */
const seedYear=d=>{const y=+d.slice(0,4),m=+d.slice(5,7);return m>=8?y+1:y;};

/* ---- belépési pont: feladatok → tisztítás → táblák szerinti csoportok → részek ---- */
function harvestFromFiles(files){const {tasks,notes}=isoxmlTasks(files);return {H:opsToH(tasks,notes),notes};}
function opsToH(tasks,notes){const H=[];
  ['harvest','seed'].forEach(kind=>{
    const Cs=tasks.filter(t=>t.kind===kind).map(t=>({t,C:t.C||opsClean(t)})).filter(x=>x.C&&x.C.all.length);
    if(!Cs.length)return;
    const all=[].concat(...Cs.map(x=>x.C.all)),good=new Set([].concat(...Cs.map(x=>x.C.good)));
    const wDef=Math.max(...Cs.map(x=>x.C.wMax||0))||6;const T0=Cs[0].t;
    // a gépen megadott táblanév szerint külön (szomszédos táblák ne olvadjanak össze), azon belül térbeli csoportok
    const byName=new Map();all.forEach(p=>{const k=p.nm||'';if(!byName.has(k))byName.set(k,[]);byName.get(k).push(p);});
    [].concat(...[...byName.values()].map(clusterPts)).forEach(grp=>{
      const gg=grp.filter(p=>good.has(p));if(gg.length<20)return;
      coverParts(grp,wDef).forEach(part=>{
        const pts=gg.filter(q=>pip(q.la,q.ln,part.outline));if(pts.length<20)return;
        let d1=Infinity,d2=-Infinity;pts.forEach(p=>{if(p.day<d1)d1=p.day;if(p.day>d2)d2=p.day;});
        const date=kind==='harvest'?dayISO(+modeOf(pts.map(p=>p.day))):dayISO(d1);
        const h={kind,name:modeOf(pts.map(p=>p.nm))||'',product:modeOf(pts.map(p=>p.prod))||'',crop:modeOf(pts.map(p=>p.crop))||'',hybOk:!!T0.hybOk,date,date2:kind==='seed'&&d2>d1?dayISO(d2):'',
          dry:T0.dry,unit:T0.unit,wDef,part,mean:wAvg(pts,wDef)};
        const meta=kind==='seed'?{date,unit:T0.unit}:{date,dry:T0.dry};if(h.date2)meta.date2=h.date2;if(kind==='seed'&&h.product)meta.product=h.product;
        h.grid=buildGrid(pts,part.outline,wDef,meta);if(!h.grid)return;
        // hibridenként (sávkísérlet, több fajta egy táblán): részarány és átlag
        const bp=new Map();pts.forEach(p=>{const k=p.prod||'';if(!bp.has(k))bp.set(k,[]);bp.get(k).push(p);});
        h.byProd=[...bp.entries()].map(([prod,a])=>({prod,share:a.length/pts.length,mean:wAvg(a,wDef)})).filter(x=>x.share>=0.05).sort((a,b)=>b.share-a.share);
        const st=Math.max(1,Math.floor(pts.length/600));h.sample=pts.filter((_,i)=>i%st===0).map(p=>({la:p.la,ln:p.ln}));
        H.push(h);});});
    if(Cs.every(x=>!x.C.good.length))notes.push(kind==='harvest'?'Az aratási adatban nincs használható hozampont.':'A vetési adatban nincs használható pont.');});
  H.sort((a,b)=>a.date.localeCompare(b.date));
  return H;}
/* kultúra a hibridnévből: a közös katalógus vagy a saját korábbi adatok alapján */
function cropForHybrid(name){const k=hybKey(normHybrid(name));const c=(HYB||[]).find(h=>h.key===k&&h.crop);if(c)return c.crop;
  for(const f of S.fields)for(const se of Object.values(f.seasons||{}))for(const p of se.parts||[])if(p.crop&&p.hybrid&&hybKey(p.hybrid)===k)return p.crop;
  if(/^(DKC|P\d{4}|KWS|LG\s?3|SY\s?(Gibr|Inove|Talisman))/i.test(name))return 'Kukorica';return '';}
const realHybrid=s=>!!s&&!/^(no product|---|-|n\/?a)$/i.test(s.trim())&&!/magok|seed\s*\d|default|\+/i.test(s);

/* ---- párbeszéd: aratás és vetés ---- */
/* egysoros összefoglaló és lenyitható részletek az import után */
function hvSummary(H){const nh=H.filter(h=>h.kind!=='seed').length,ns=H.length-nh,ha=H.reduce((a,h)=>a+(h.part.ha||0),0);
  return [nh?`${nh} hozamtérkép`:'',ns?`${ns} vetési térkép`:''].filter(Boolean).join(', ')+` · ${fmt(ha,1)} ha`;}
function notesBox(notes,intro){const n=(notes||[]).length;if(!n&&!intro)return '';
  return `<details class="giNotes"><summary>ℹ Részletek a beolvasásról${n?` (${n})`:''}</summary>${intro?`<p class="help">${intro}</p>`:''}${n?`<p class="help">${notes.map(esc).join('<br>')}</p>`:''}</details>`;}
function harvestDialog(H,notes){
  if(!H.length){modal(`<h2>Nem találtam aratási vagy vetési adatot</h2><p class="help">${notes.length?notes.map(esc).join('<br>'):'Az ISO-XML exportban nincs hozam- vagy vetési adat.'}</p><div class="row" style="justify-content:flex-end"><button class="btn primary" id="giX">Rendben</button></div>`);$('#giX').onclick=closeModal;return;}
  const cnt={};H.forEach(h=>{const k=h.kind+'|'+h.name;cnt[k]=(cnt[k]||0)+1;});const seen={};
  H.forEach(h=>{const k=h.kind+'|'+h.name;seen[k]=(seen[k]||0)+1;h.label=(h.name||(h.kind==='seed'?'Vetés':'Aratás'))+(cnt[k]>1?` (${seen[k]})`:'');
    let best=null,bn=0;S.fields.forEach(f=>{if(!f.geometry||f.geometry.length<3)return;let n=0;for(const q of h.sample)if(pip(q.la,q.ln,f.geometry))n++;if(n>bn){bn=n;best=f;}});
    h.target=best&&bn/h.sample.length>=0.5?best.id:'new';
    h.near=S.fields.filter(f=>f.geometry&&f.geometry.length>2&&nearField(f,h.part.outline)).map(f=>f.id);});
  const on=H.map(()=>true);
  const valTxt=h=>h.kind==='seed'?(h.unit==='k/ha'?`${fmt0(h.mean*1000)} mag/ha`:`${fmt0(h.mean)} kg/ha`):`${fmt(h.mean,2)} t/ha`;
  const draw=()=>{
    modal(`<h2>🚜 Gépi munkaadatok</h2>
      <p class="giSum">✅ ${hvSummary(H)}</p>
      <p class="help" style="margin:0 0 6px">Nézze meg, melyik táblához kerüljön.</p>
      ${notesBox(notes,'A program a gép nyomvonalából rajzolta meg a megmunkált terület határát, és 10 m-es térképet készített (aratásnál hozam-, vetésnél tőszámtérképet).')}
      ${geoPreviewSVG(H.map(h=>({outer:h.part.outline})),on)}
      <div class="giList">${H.map((h,i)=>{const opts=[['new','Új tábla ebből a határból'],...S.fields.filter(f=>f.id===h.target||h.near.includes(f.id)).map(f=>[f.id,fieldLabel(f)])];
        return `<div class="giRow hvRow"><label style="display:flex;gap:8px;align-items:center;flex:1;min-width:0"><input type="checkbox" data-i="${i}" ${on[i]?'checked':''}><span>${h.kind==='seed'?'🌱':'🌾'}</span><span class="giN"><span data-noi18n>${esc(h.label)}</span></span></label>
          <span class="meta"><span>${h.kind==='seed'?'Vetés':'Aratás'}</span> · ${esc(h.date)}${h.date2?' – '+esc(h.date2.slice(5)):''} · ${fmt(h.part.ha,2)} ha · <b>${valTxt(h)}</b>${h.kind==='harvest'&&!h.dry?' <span>(nedves)</span>':''}${h.byProd&&h.byProd.length>1?` · <span data-noi18n>${h.byProd.map(x=>esc(x.prod||'?')+' '+fmt0(x.share*100)+'%').join(', ')}</span>`:(h.product?` · <span data-noi18n>${esc(h.product)}</span>`:'')}</span>
          <select class="input hvT" data-i="${i}" style="width:100%;margin-top:4px">${opts.map(([v,l])=>`<option value="${esc(v)}" ${v===h.target?'selected':''}>${v==='new'?esc(l):'→ '+esc(l)}</option>`).join('')}</select></div>`;}).join('')}</div>
      <p class="help" style="margin:6px 0 0">Az évadatnál a program csak az üres mezőket tölti ki (vetés és aratás dátuma, tőszám, nedvesség, hozam), a már beírt adatot nem írja felül. A gép által mért érték a kalibrációtól függ.</p>
      <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn" id="giC">Mégse</button><button class="btn primary" id="giOk" ${on.some(Boolean)?'':'disabled'}>Mentés</button></div>`);
    document.querySelectorAll('.giList input[type=checkbox]').forEach(c=>c.onchange=()=>{on[+c.dataset.i]=c.checked;draw();});
    document.querySelectorAll('.hvT').forEach(s=>s.onchange=()=>{H[+s.dataset.i].target=s.value;});
    document.querySelectorAll('.giSvg polygon').forEach(p=>p.onclick=()=>{const i=+p.dataset.i;on[i]=!on[i];draw();});
    $('#giC').onclick=closeModal;
    $('#giOk').onclick=()=>{let nNew=0,nMap=0,last=null;const made=[];
      H.forEach((h,i)=>{if(!on[i])return;let f;
        if(h.target==='new'){// ha egy most létrehozott tábla nagyrészt lefedi (pl. ugyanott vetés és aratás), ahhoz kerül
          f=made.find(m=>{let n=0;for(const q of h.sample)if(pip(q.la,q.ln,m.geometry))n++;return n/h.sample.length>=0.5;});
          if(!f){addImported(h.label,h.part.outline.map(x=>x.slice()));f=S.fields[S.fields.length-1];Object.defineProperty(f,'_srcH',{value:h,enumerable:false,configurable:true});made.push(f);nNew++;}}
        else f=S.fields.find(x=>x.id===h.target);
        if(!f)return;
        const Y=made.includes(f)&&f._srcH===h?h.grid:gridClip(h.grid,f.geometry);if(!Y)return;
        const yr=h.kind==='seed'?seedYear(h.date):+h.date.slice(0,4),se=season(f,yr,true);
        const BP=(h.byProd||[]).filter(x=>x.prod);
        const empty=se.parts.length===1&&!['crop','hybrid','sowing','density','harvest','yieldWet','totalT'].some(k=>se.parts[0][k])&&se.parts[0].yieldStd==null;
        if(BP.length>1&&empty){const A=f.areaHa;se.parts=BP.map((x,i)=>Object.assign(newPart(x.prod.slice(0,24),+(A*x.share).toFixed(2),null),{}));}
        const fillPart=(p,mean)=>{
          const prod=p._prod!=null?p._prod:h.product;
          if(!p.crop){const c=h.crop||cropFromName(h.name)||(h.hybOk&&realHybrid(prod)?cropForHybrid(prod):'');if(c)p.crop=c;}
          if(!p.hybrid&&h.hybOk&&realHybrid(prod))p.hybrid=normHybrid(prod);
          if(h.kind==='seed'){if(!p.sowing)p.sowing=h.date;
            if(p.density===''||p.density==null){if(Y.unit==='k/ha'){p.density=String(Math.round(mean*10)*100);p.densUnit='mag/ha';}else{p.density=String(Math.round(mean));p.densUnit='kg/ha';}}}
          else{if(!p.harvest)p.harvest=h.date;
            if((p.moisture===''||p.moisture==null)&&Y.moist!=null)p.moisture=String(Y.moist);
            const noYield=[p.yieldWet,p.totalT].every(v=>v===''||v==null)&&p.yieldStd==null;
            if(noYield){// a kombájn „száraz” hozama a beállított nedvességre korrigált: ha a mért nedvesség nem nagyobb a szabványnál, a két érték azonos
              const v=+mean.toFixed(2);if(!h.dry||(Y.moist!=null&&Y.moist<=stdMoistFor(p)))p.yieldWet=String(v);else p.yieldStd=v;if(!p.src)p.src='hozamterkep';}}
          delete p._prod;};
        if(h.kind==='seed')se.smap=Y;else se.ymap=Y;
        if(BP.length>1&&se.parts.length>1){// hibridenként: a hibridnévvel egyező (vagy azonos címkéjű) részbe
          BP.forEach(x=>{const k=hybKey(normHybrid(x.prod));const p=se.parts.find(q=>(q.hybrid&&hybKey(q.hybrid)===k)||q.label===x.prod.slice(0,24));if(p){p._prod=x.prod;fillPart(p,x.mean);}});}
        else{const p=se.parts.length===1?se.parts[0]:se.parts.slice().sort((a,b)=>(partArea(f,b)||0)-(partArea(f,a)||0))[0];fillPart(p,Y.mean);}
        nMap++;last={f,yr,kind:h.kind};});
      closeModal();
      if(last){S.sel=last.f.id;S.year=last.yr;S.view=last.kind==='seed'?'smap':'ymap';}
      save();renderAll();if(last)fit(last.f);renderAnaLayer();
      toast(`${nMap} térkép mentve`+(nNew?`, ${nNew} új tábla`:''));};};
  draw();}
function nearField(f,ll){const c=centroidOf(ll),c2=centroidOf(f.geometry);return Math.hypot((c[0]-c2[0])*111000,(c[1]-c2[1])*76000)<1500;}
