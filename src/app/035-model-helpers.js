/* ================= model helpers ================= */
function newPart(label,areaHa,geom){return{id:uid(),label,geometry:geom||null,areaHa:areaHa??null,crop:'',hybrid:'',fao:'',sowing:'',density:'',stand:'',tkm:'',harvest:'',moisture:'',yieldWet:'',totalT:'',yieldStd:null,stdM:'',notes:''};}
function newSeason(f){return{parts:[newPart('Egész tábla',f.areaHa,null)],ops:[]};}
function curField(){return S.fields.find(f=>f.id===S.sel)||null;}
function season(f,y,create){if(!f)return null;f.seasons=f.seasons||{};if(!f.seasons[y]&&create)f.seasons[y]=newSeason(f);return f.seasons[y]||null;}
function partGeom(f,p){return p.geometry||f.geometry;}
function partArea(f,p){return p.geometry?haOf(p.geometry):(num(p.areaHa)??f.areaHa);}
function stdMoistFor(p){const m=num(p.stdM);if(m!=null)return m;return STD_MOIST[p.crop]??14;}
function calcYield(f,p){ // returns {wet, std}
  let wet=num(p.yieldWet);const tot=num(p.totalT),a=partArea(f,p);
  if(wet==null&&tot!=null&&a>0)wet=tot/a;
  if(wet==null)return{wet:null,std:num(p.yieldStd)};
  const m=num(p.moisture),sm=stdMoistFor(p);
  const std=(m!=null&&sm!=null&&m>sm)?wet*(100-m)/(100-sm):wet;
  return{wet,std};
}
function nutrientsOf(op){ // kg/ha
  if(op.type!=='fert')return null;
  const fd=FERT.find(x=>x.n===op.product)||{};
  const pct=k=>op.custom?num(op['c'+k])||0:(fd[k]||0);
  let amt=num(op.amount)||0,u=op.unit||'kg/ha';
  let kg=amt;if(u==='l/ha')kg=amt*(num(op.dens)||fd.dens||1);if(u==='t/ha')kg=amt*1000;
  if(fd.unit==='t/ha'&&!op.custom&&u==='t/ha'){ // trágya: % per kg → kg/t
    return{N:amt*fd.N*10,P:amt*fd.P*10,K:amt*fd.K*10,S:0};}
  return{N:kg*pct('N')/100,P:kg*pct('P')/100,K:kg*pct('K')/100,S:kg*pct('S')/100};
}
function partNutr(se,pid){const t={N:0,P:0,K:0,S:0};se.ops.forEach(o=>{if(o.type!=='fert')return;if(!(o.parts||['all']).includes('all')&&!(o.parts||[]).includes(pid))return;const n=nutrientsOf(o);if(n){t.N+=n.N;t.P+=n.P;t.K+=n.K;t.S+=n.S;}});return t;}
