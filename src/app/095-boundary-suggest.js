/* ================= táblahatár-javaslat ================= */
const FTW_URL='https://data.source.coop/ftw/global-field-boundaries/pmtiles/ftw-global-fields-2025.pmtiles';
let FTW=null,autoGeom=null,autoSrc='',autoClick=null,autoBusy=false;
function ftwSrc(){if(!FTW)FTW={pm:new VT.PMTiles(FTW_URL),cache:{}};return FTW;}
function lng2x(lng,z){return (lng+180)/360*Math.pow(2,z);}
function lat2y(lat,z){const r=lat*Math.PI/180;return (1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*Math.pow(2,z);}
async function ftwTile(z,x,y){const F=ftwSrc(),k=z+'/'+x+'/'+y;if(k in F.cache)return F.cache[k];
  const r=await F.pm.getZxy(z,x,y);const out=[];
  if(r&&r.data){const t=new VT.VectorTile(new VT.Pbf(new Uint8Array(r.data)));
    for(const ln in t.layers){const L0=t.layers[ln];for(let i=0;i<L0.length;i++){const ft=L0.feature(i);if(ft.type!==3)continue;const gj=ft.toGeoJSON(x,y,z);
      const polys=gj.geometry.type==='Polygon'?[gj.geometry.coordinates]:gj.geometry.type==='MultiPolygon'?gj.geometry.coordinates:[];
      polys.forEach(p=>out.push({ring:p[0],holes:p.slice(1),props:ft.properties,id:ft.id,tk:x+'/'+y}));}}}
  return F.cache[k]=out;}
function ringBB(r){let w=180,e=-180,s=90,n=-90;r.forEach(p=>{w=Math.min(w,p[0]);e=Math.max(e,p[0]);s=Math.min(s,p[1]);n=Math.max(n,p[1]);});return{w,e,s,n};}
async function ftwSuggest(lat,lng){
  const F=ftwSrc();const h=await F.pm.getHeader();const z=Math.max(h.minZoom||0,Math.min(h.maxZoom||14,14));
  const tx=Math.floor(lng2x(lng,z)),ty=Math.floor(lat2y(lat,z));
  const tiles=[];for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)tiles.push([tx+dx,ty+dy]);
  const feats=(await Promise.all(tiles.map(([x,y])=>ftwTile(z,x,y).catch(()=>[])))).flat();
  if(!feats.length)return null;
  const hit=feats.filter(f=>pip(lng,lat,f.ring)&&!f.holes.some(hh=>pip(lng,lat,hh)));if(!hit.length)return null;
  // ha nem ér csempehatárt: közvetlenül
  const tb=(x,y)=>{const n2=Math.pow(2,z);const w=x/n2*360-180,e=(x+1)/n2*360-180;const yy=v=>Math.atan(Math.sinh(Math.PI*(1-2*v/n2)))*180/Math.PI;return{w,e,n:yy(y),s:yy(y+1)};};
  const T=tb(tx,ty),eps=1e-6;const b=ringBB(hit[0].ring);
  const touches=b.w<=T.w+eps||b.e>=T.e-eps||b.s<=T.s+eps||b.n>=T.n-eps||!(b.w>=T.w-eps&&b.e<=T.e+eps&&b.s>=T.s-eps&&b.n<=T.n+eps);
  if(!touches)return simplifyLL(hit[0].ring.map(p=>[p[1],p[0]]),2);
  // csempehatáron átnyúló tábla: raszteres összefűzés
  const A=tb(tx-1,ty+1),B=tb(tx+1,ty-1);const R=rasterGrid(A.w,B.e,A.s,B.n,4);
  const hid=hit[0].id;let parts=hid!=null?feats.filter(f=>f.id===hid):[];
  if(!parts.length){ // nincs azonosító: csak a csempehatáron át érintkező darabok
    parts=[hit[0]];}
  parts.forEach(f=>{rasterFill(R,f.ring,1);f.holes.forEach(hh=>rasterFill(R,hh,0));});
  const mask=floodFrom(R,lat,lng);if(!mask)return null;return maskToPoly(R,mask,4);
}
function rasterGrid(w,e,s,n,cellM){const lat0=(s+n)/2,dLat=cellM/110540,dLng=cellM/(111320*Math.cos(lat0*Math.PI/180));
  const nx=Math.ceil((e-w)/dLng),ny=Math.ceil((n-s)/dLat);return{w,n,dLat,dLng,nx,ny,m:new Uint8Array(nx*ny)};}
function rasterFill(R,ring,val){const bb=ringBB(ring);const j0=Math.max(0,Math.floor((R.n-bb.n)/R.dLat)),j1=Math.min(R.ny-1,Math.ceil((R.n-bb.s)/R.dLat));
  for(let j=j0;j<=j1;j++){const la=R.n-(j+0.5)*R.dLat;const xs=[];for(let i=0,k=ring.length-1;i<ring.length;k=i++){const a=ring[i],b=ring[k];if((a[1]>la)!==(b[1]>la))xs.push(a[0]+(la-a[1])/(b[1]-a[1])*(b[0]-a[0]));}
    xs.sort((p,q)=>p-q);for(let t=0;t+1<xs.length;t+=2){const i0=Math.max(0,Math.ceil((xs[t]-R.w)/R.dLng-0.5)),i1=Math.min(R.nx-1,Math.floor((xs[t+1]-R.w)/R.dLng-0.5));for(let i=i0;i<=i1;i++)R.m[j*R.nx+i]=val;}}}
function floodFrom(R,lat,lng){const i=Math.floor((lng-R.w)/R.dLng),j=Math.floor((R.n-lat)/R.dLat);if(i<0||j<0||i>=R.nx||j>=R.ny||!R.m[j*R.nx+i])return null;
  const out=new Uint8Array(R.nx*R.ny),st=[j*R.nx+i];out[st[0]]=1;while(st.length){const k=st.pop(),x=k%R.nx,y=(k-x)/R.nx;
    [[x+1,y],[x-1,y],[x,y+1],[x,y-1]].forEach(([a,b])=>{if(a<0||b<0||a>=R.nx||b>=R.ny)return;const q=b*R.nx+a;if(!out[q]&&R.m[q]){out[q]=1;st.push(q);}});}
  return out;}
function fillHoles(nx,ny,m){const o=new Uint8Array(nx*ny),st=[];const push=k=>{if(!m[k]&&!o[k]){o[k]=1;st.push(k);}};
  for(let i=0;i<nx;i++){push(i);push((ny-1)*nx+i);}for(let j=0;j<ny;j++){push(j*nx);push(j*nx+nx-1);}
  while(st.length){const k=st.pop(),x=k%nx,y=(k-x)/nx;if(x>0)push(k-1);if(x<nx-1)push(k+1);if(y>0)push(k-nx);if(y<ny-1)push(k+nx);}
  for(let k=0;k<nx*ny;k++)m[k]=o[k]?0:1;return m;}
function maskToPoly(R,m,tolM){const nx=R.nx,ny=R.ny;fillHoles(nx,ny,m);
  const at=(i,j)=>i>=0&&j>=0&&i<nx&&j<ny&&m[j*nx+i];const next=new Map();const key=(i,j)=>i+','+j;
  for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){if(!m[j*nx+i])continue; // óramutató szerint (képi koordináták)
    if(!at(i,j-1))next.set(key(i,j),[i+1,j]);if(!at(i+1,j))next.set(key(i+1,j),[i+1,j+1]);
    if(!at(i,j+1))next.set(key(i+1,j+1),[i,j+1]);if(!at(i-1,j))next.set(key(i,j+1),[i,j]);}
  if(!next.size)return null;let best=null;const seen=new Set();
  for(const [k0] of next){if(seen.has(k0))continue;const loop=[];let k=k0,guard=0;while(!seen.has(k)&&guard++<1e6){seen.add(k);const [a,b]=k.split(',').map(Number);loop.push([a,b]);const nx2=next.get(k);if(!nx2)break;k=key(nx2[0],nx2[1]);}
    if(!best||loop.length>best.length)best=loop;}
  const ll=best.map(([i,j])=>[R.n-j*R.dLat,R.w+i*R.dLng]);return simplifyLL(ll,tolM);}
function simplifyLL(ll,tolM){if(ll.length>2&&ll[0][0]===ll[ll.length-1][0]&&ll[0][1]===ll[ll.length-1][1])ll=ll.slice(0,-1);
  const c=ll.reduce((a,p)=>[a[0]+p[0]/ll.length,a[1]+p[1]/ll.length],[0,0]);const Lc=mkLocal(c[0],c[1]);const P=ll.map(Lc.f);
  const keep=new Uint8Array(P.length);keep[0]=1;keep[P.length-1]=1;const st=[[0,P.length-1]];
  while(st.length){const [a,b]=st.pop();let dm=0,im=-1;const ax=P[a][0],ay=P[a][1],vx=P[b][0]-ax,vy=P[b][1]-ay,L2=vx*vx+vy*vy;
    for(let i=a+1;i<b;i++){let t=L2?((P[i][0]-ax)*vx+(P[i][1]-ay)*vy)/L2:0;t=Math.max(0,Math.min(1,t));const d=Math.hypot(ax+t*vx-P[i][0],ay+t*vy-P[i][1]);if(d>dm){dm=d;im=i;}}
    if(dm>tolM&&im>0){keep[im]=1;st.push([a,im],[im,b]);}}
  const idx=[...keep.keys()].filter(i=>keep[i]);if(idx.length>3){const a0=P[idx[0]],z0=P[idx[idx.length-1]];if(Math.hypot(a0[0]-z0[0],a0[1]-z0[1])<tolM*1.5)idx.pop();}
  const out=idx.map(i=>ll[i]);if(out.length<3)return null;return out;}

const ftwLayer=L.layerGroup().addTo(map);
/* műhold-alapú (Sentinel-2 NDVI-idősor) határkeresés: élerősség-rács (gyorsítótárazva) + jelölt-régiók */
let S2C=null; // {G,E,lat0,lng0}
async function s2Grid(lat,lng,prog){
  if(S2C){const G=S2C.G;const i=(lng-G.w)/G.dLng,j=(G.n-lat)/G.dLat;if(i>30&&j>30&&i<G.nx-30&&j<G.ny-30)return S2C;}
  const half=1100;const dLat=half/110540,dLng=half/(111320*Math.cos(lat*Math.PI/180));
  const box=[[lat+dLat,lng-dLng],[lat+dLat,lng+dLng],[lat-dLat,lng+dLng],[lat-dLat,lng-dLng]];const fake={geometry:box};
  const G=makeGrid(fake);G.inside.fill(1);G.nIn=G.nx*G.ny;
  const today=isoToday();prog('Felvételek keresése…');
  const items=await stacRange(fake,addDays(today,-600),today,15,200);
  const byMonth={};items.forEach(it=>{const m=it.properties.datetime.slice(0,7);if(!byMonth[m]||it.properties['eo:cloud_cover']<byMonth[m].properties['eo:cloud_cover'])byMonth[m]=it;});
  const cand=Object.values(byMonth).sort((a,b)=>a.properties['eo:cloud_cover']-b.properties['eo:cloud_cover']);
  const layers=[],MAXL=8;for(const it of cand){if(layers.length>=MAXL)break;prog(`Felvétel olvasása ${layers.length+1}/${MAXL}: ${it.properties.datetime.slice(0,10)}`);
    try{const r=await itemOnGrid(it,G,['red','nir']);await new Promise(z=>setTimeout(z,0));if(r.clear<0.6)continue;layers.push(idxGrid(r.bands,'NDVI',G).g);}catch(e){}}
  await new Promise(z=>setTimeout(z,0));
  if(layers.length<3)throw new Error('kevés felhőmentes felvétel');
  prog('Határvonalak számítása…');const nx=G.nx,ny=G.ny,N=nx*ny,D=layers.length;
  const E=new Float32Array(N);const vals=new Float32Array(D);
  for(let k=0;k<N;k++){const x=k%nx,y=(k-x)/nx;let nv=0;for(let d=0;d<D;d++){const Ld=layers[d],v=Ld[k];if(isNaN(v))continue;let m=0;
      if(x>0){const u=Ld[k-1];if(!isNaN(u))m=Math.max(m,Math.abs(v-u));}if(x<nx-1){const u=Ld[k+1];if(!isNaN(u))m=Math.max(m,Math.abs(v-u));}
      if(y>0){const u=Ld[k-nx];if(!isNaN(u))m=Math.max(m,Math.abs(v-u));}if(y<ny-1){const u=Ld[k+nx];if(!isNaN(u))m=Math.max(m,Math.abs(v-u));}vals[nv++]=m;}
    if(!nv){E[k]=1;continue;}let a1=0,a2=0,a3=0;for(let q=0;q<nv;q++){const v=vals[q];if(v>a1){a3=a2;a2=a1;a1=v;}else if(v>a2){a3=a2;a2=v;}else if(v>a3)a3=v;}E[k]=(a1+a2+a3)/Math.min(3,nv);}
  return S2C={G,E};
}
function s2Candidates(C,lat,lng){const {G,E}=C,nx=G.nx,ny=G.ny,N=nx*ny;
  const ci=Math.floor((lng-G.w)/G.dLng),cj=Math.floor((G.n-lat)/G.dLat);if(ci<0||cj<0||ci>=nx||cj>=ny)return[];let bk=cj*nx+ci;
  for(let dj=-3;dj<=3;dj++)for(let di=-3;di<=3;di++){const x=ci+di,y=cj+dj;if(x<0||y<0||x>=nx||y>=ny)continue;const k=y*nx+x;if(E[k]<E[bk])bk=k;}
  const flood=t=>{const m=new Uint8Array(N),st=[bk];m[bk]=1;let c=1,edge=false;
    while(st.length){const k=st.pop(),x=k%nx,y=(k-x)/nx;if(x===0||y===0||x===nx-1||y===ny-1)edge=true;
      if(x<nx-1&&!m[k+1]&&E[k+1]<=t){m[k+1]=1;st.push(k+1);c++;}if(x>0&&!m[k-1]&&E[k-1]<=t){m[k-1]=1;st.push(k-1);c++;}
      if(y<ny-1&&!m[k+nx]&&E[k+nx]<=t){m[k+nx]=1;st.push(k+nx);c++;}if(y>0&&!m[k-nx]&&E[k-nx]<=t){m[k-nx]=1;st.push(k-nx);c++;}}
    let sc=0,n=0;if(!edge)for(let k=0;k<N;k++){if(!m[k])continue;const x=k%nx;
      if(x>0&&!m[k-1]){sc+=E[k-1];n++;}if(x<nx-1&&!m[k+1]){sc+=E[k+1];n++;}if(k>=nx&&!m[k-nx]){sc+=E[k-nx];n++;}if(k<N-nx&&!m[k+nx]){sc+=E[k+nx];n++;}}
    return{m,c,edge,t,score:n?sc/n:0};};
  const out=[];let last=-1;for(let t=Math.max(0.03,E[bk]+0.005);t<=0.34;t+=0.01){const r=flood(t);if(r.edge||r.c>40000)break;if(r.c<50)continue;
    if(last>0&&r.c<last*1.04){out[out.length-1]=r.score>=out[out.length-1].score?r:out[out.length-1];last=r.c;continue;}last=r.c;out.push(r);}
  if(!out.length)return[];let mx=-Infinity;for(const r of out)if(r.score>mx)mx=r.score;
  // alapértelmezés: a legnagyobb olyan régió, amelynek határa közel olyan erős, mint a legjobbé
  let def=0;out.forEach((r,i)=>{if(r.score>=mx*0.93)def=i;});out.def=def;return out;}
function candPoly(C,r){const {G}=C,nx=G.nx,ny=G.ny,N=nx*ny,m=r.m;
  const dil=new Uint8Array(N);for(let k=0;k<N;k++){const x=k%nx;dil[k]=m[k]||(x>0&&m[k-1])||(x<nx-1&&m[k+1])||(k>=nx&&m[k-nx])||(k<N-nx&&m[k+nx])?1:0;}
  const g=maskToPoly({w:G.w,n:G.n,dLat:G.dLat,dLng:G.dLng,nx,ny},dil,6);return g?regularize(g):null;}
/* egyenesítés: ha a sokszög közel téglalap, a legkisebb befoglaló téglalapra cseréli; egyébként erősebb egyszerűsítés */
function regularize(g){const c=g.reduce((a,p)=>[a[0]+p[0]/g.length,a[1]+p[1]/g.length],[0,0]);const Lc=mkLocal(c[0],c[1]);const P=g.map(Lc.f);
  const A=Math.abs(ringArea(P.concat([P[0]])));
  const pts=P.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]);const cr=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);const lo=[],up=[];
  for(const p of pts){while(lo.length>=2&&cr(lo[lo.length-2],lo[lo.length-1],p)<=0)lo.pop();lo.push(p);}
  for(let i=pts.length-1;i>=0;i--){const p=pts[i];while(up.length>=2&&cr(up[up.length-2],up[up.length-1],p)<=0)up.pop();up.push(p);}
  const H=lo.slice(0,-1).concat(up.slice(0,-1));let best=null;
  for(let i=0;i<H.length;i++){const a=H[i],b=H[(i+1)%H.length];const L0=Math.hypot(b[0]-a[0],b[1]-a[1]);if(!L0)continue;const ux=(b[0]-a[0])/L0,uy=(b[1]-a[1])/L0;
    let s0=1e12,s1=-1e12,t0=1e12,t1=-1e12;H.forEach(p=>{const s=p[0]*ux+p[1]*uy,t=-p[0]*uy+p[1]*ux;s0=Math.min(s0,s);s1=Math.max(s1,s);t0=Math.min(t0,t);t1=Math.max(t1,t);});
    const ar=(s1-s0)*(t1-t0);if(!best||ar<best.ar)best={ar,ux,uy,s0,s1,t0,t1};}
  const inv=([x,y])=>[c[0]+y/110540,c[1]+x/(Math.cos(c[0]*Math.PI/180)*111320)];
  if(best&&A/best.ar>0.9){const {ux,uy,s0,s1,t0,t1}=best;const pt=(s,t)=>[s*ux-t*uy,s*uy+t*ux];return [pt(s0,t0),pt(s1,t0),pt(s1,t1),pt(s0,t1)].map(inv);}
  return simplifyLL(g,9)||g;}

let autoCands=null,autoIdx=0;
function showAuto(g,src){autoGeom=g;autoSrc=src;tmp.clearLayers();
  L.polygon(g,{color:'#ffe066',weight:3,dashArray:'6 4',fillColor:'#ffe066',fillOpacity:.15}).addTo(tmp);
  if(autoClick)L.circleMarker(autoClick,{radius:5,color:'#fff',fillColor:'#c53030',fillOpacity:1,weight:2}).addTo(tmp);
  const many=src==='s2'&&autoCands&&autoCands.length>1;
  hint(`${src==='ftw'?'Fields of the World térkép':'Műholdas javaslat'+(many?` (${autoIdx+1}/${autoCands.length})`:'')}: ${fmt(haOf(g),2)} ha.${many?' Ha nem pontos: ＋ nagyobb / － kisebb.':''}`,true);
  $('#hintOk').textContent='Elfogad';$('#hintMinus').style.display=many?'':'none';$('#hintPlus').style.display=many?'':'none';
  $('#hintMinus').disabled=!many||autoIdx<=0;$('#hintPlus').disabled=!many||autoIdx>=autoCands.length-1;
  const alt=$('#hintAlt');alt.style.display='';alt.textContent=src==='s2'?'🗺 Más forrás':'🛰 Műholdas';}
function stepCand(d){if(!autoCands||!S2C)return;const i=autoIdx+d;if(i<0||i>=autoCands.length)return;autoIdx=i;const g=candPoly(S2C,autoCands[i]);if(g)showAuto(g,'s2');}
async function autoAt(lat,lng,useFtw){if(autoBusy)return;autoBusy=true;autoClick=[lat,lng];autoCands=null;tmp.clearLayers();L.circleMarker(autoClick,{radius:5,color:'#fff',fillColor:'#c53030',fillOpacity:1,weight:2}).addTo(tmp);
  ['#hintAlt','#hintMinus','#hintPlus'].forEach(id=>$(id).style.display='none');let g=null,err='';
  try{if(!useFtw){try{const C=await s2Grid(lat,lng,m=>{if(mode==='auto')hint('🛰 '+m,false);});const cs=s2Candidates(C,lat,lng);
        if(cs.length){autoCands=cs;autoIdx=cs.def;g=candPoly(C,cs[autoIdx]);}else err='nem található egyértelmű határ a pont körül';}catch(e){err=e.message||String(e);}
      if(g&&haOf(g)>0.3){if(mode==='auto')showAuto(g,'s2');return;}}
    if(mode==='auto')hint('Keresés a Fields of the World térképen…',false);
    try{g=await ftwSuggest(lat,lng);}catch(e){console.warn('FTW',e);g=null;}
    if(g&&haOf(g)>0.3){autoCands=null;if(mode==='auto')showAuto(regularize(g),'ftw');return;}
    throw new Error(err||'itt nincs ismert tábla');}
  catch(e){if(mode==='auto'){hint(/fetch|network|Failed/i.test(String(e.message||e))?'A műholdképek most nem érhetők el, ezért nem tudok határt javasolni. Rajzolja meg kézzel, vagy próbálja később.':'Itt nem találtam tábla-határt. Koppintson máshova a táblán belül, vagy rajzolja meg kézzel.',false);}}
  finally{autoBusy=false;}}
let ftwAttr=false;function startAuto(){if(!ftwAttr){ftwAttr=true;try{map.attributionControl.addAttribution('Táblajavaslat: <a href="https://fieldsofthe.world" target="_blank">Fields of the World</a> (CC BY 4.0)');}catch(e){}}endMode();mode='auto';map.doubleClickZoom.disable();map.getContainer().style.cursor='crosshair';autoGeom=null;
  $('#hintUndo').style.display='none';hint(map.getZoom()<13?'Nagyítson rá a táblára, majd koppintson a belsejébe.':'Koppintson a tábla belsejébe.',false);}
function acceptAuto(){if(!autoGeom)return;const g=autoGeom.slice(),src=autoSrc;endMode();
  ask('Saját név (nem kötelező)','pl. Trafó tábla – a táblakódot a program adja','',name=>{const f={id:uid(),name:normName(name||''),geometry:g,areaHa:haOf(g),seasons:{},notes:'',src:src==='ftw'?'FTW 2025 (CC BY 4.0) javaslat':'Sentinel-2 javaslat'};setTimeout(()=>ensureCode(f).then(()=>{save();renderHeader();renderFields();}),50);S.fields.push(f);S.sel=f.id;save();renderAll();fit(f);queueAnalysis(f.id);
    go('border');editGeom(f);});}
$('#btnAuto').onclick=()=>{if(mode==='auto')return endMode();startAuto();};
$('#hintMinus').onclick=()=>stepCand(-1);$('#hintPlus').onclick=()=>stepCand(1);
$('#hintAlt').onclick=()=>{if(mode==='geo'){const E=geoEdit;if(E&&E.sel>=0&&E.g.length>3){geoSnap();E.g.splice(E.sel,1);E.sel=-1;drawGeoEdit();}return;}if(mode!=='auto'||!autoClick)return;autoAt(autoClick[0],autoClick[1],autoSrc==='s2');};
