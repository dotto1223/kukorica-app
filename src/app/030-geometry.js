/* ================= geometry ================= */
function geodesicArea(ll){const R=6378137,d=Math.PI/180;let a=0;const n=ll.length;if(n<3)return 0;for(let i=0;i<n;i++){const p=ll[i],q=ll[(i+1)%n];a+=((q[1]-p[1])*d)*(2+Math.sin(p[0]*d)+Math.sin(q[0]*d));}return Math.abs(a*R*R/2);}
const haOf=g=>geodesicArea(g)/1e4;
function centroid(g){let la=0,ln=0;g.forEach(p=>{la+=p[0];ln+=p[1];});return [la/g.length,ln/g.length];}
function bboxOf(g){let s=90,w=180,n=-90,e=-180;g.forEach(p=>{s=Math.min(s,p[0]);n=Math.max(n,p[0]);w=Math.min(w,p[1]);e=Math.max(e,p[1]);});return {s,w,n,e};}
function mkLocal(lat0,lng0){const kx=Math.cos(lat0*Math.PI/180)*111320,ky=110540;return{f:p=>[(p[1]-lng0)*kx,(p[0]-lat0)*ky],i:q=>[q[1]/ky+lat0,q[0]/kx+lng0]};}
function clipHalf(poly,a,b,keepLeft){ // poly: [[x,y]], line a->b
  const side=p=>((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]))*(keepLeft?1:-1);
  const out=[];
  for(let i=0;i<poly.length;i++){
    const P=poly[i],Q=poly[(i+1)%poly.length],sp=side(P),sq=side(Q);
    if(sp>=0)out.push(P);
    if((sp>=0)!==(sq>=0)){const t=sp/(sp-sq);out.push([P[0]+t*(Q[0]-P[0]),P[1]+t*(Q[1]-P[1])]);}
  }
  return out;
}
function splitPoly(gLL,p1,p2){
  const c=centroid(gLL),L=mkLocal(c[0],c[1]);
  const poly=gLL.map(L.f),a=L.f(p1),b=L.f(p2);
  const A=clipHalf(poly,a,b,true).map(L.i),B=clipHalf(poly,a,b,false).map(L.i);
  return [A,B].filter(x=>x.length>=3&&haOf(x)>0.01);
}
function pip(x,y,poly){let ins=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const xi=poly[i][0],yi=poly[i][1],xj=poly[j][0],yj=poly[j][1];if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi))ins=!ins;}return ins;}
