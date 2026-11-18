/* ===== Növényfelismerés műholdról (NDVI-idősor alakja alapján) ===== */
const CG={run:null,msg:'',fid:null};
const cgKey=(f,y)=>`crop1.${f.id}.${y}.${f.geometry.length}.${Math.round(f.areaHa*100)}`;
const CG_YEAR_DONE=y=>y<THIS_YEAR||new Date().getMonth()>=9; // az idei év csak október után teljes

async function cropSeries(f,y,run){
  const k=cgKey(f,y);const c=cacheGet(k);if(c&&(CG_YEAR_DONE(y)?c.full:c.at===isoToday()))return c.rows;
  const items=await stacMonths(f,`${y-1}-09-15`,`${y}-10-31`,40,run);
  // 15 napos ablakonként a legkevésbé felhős felvétel
  const bins={};items.forEach(it=>{const t=Date.parse(it.properties.datetime);const b=Math.floor((t-Date.parse(`${y-1}-09-15`))/(15*864e5));if(!bins[b]||it.properties['eo:cloud_cover']<bins[b].properties['eo:cloud_cover'])bins[b]=it;});
  const queue=Object.values(bins);const rows=[];
  async function worker(){while(queue.length&&!run.cancel){const it=queue.shift();try{const r=await indexForItem(it,f,'NDVI');if(r&&r.val!=null&&r.clear>=0.5)rows.push({date:r.date,val:r.val});}catch(e){}}}
  await Promise.all([worker(),worker(),worker()]);if(run.cancel)throw new Error('megszakítva');
  rows.sort((a,b)=>a.date.localeCompare(b.date));cacheSet(k,{at:isoToday(),full:CG_YEAR_DONE(y),rows});return rows;
}

function classifyCrop(rows,y){
  const j0=Date.parse(`${y}-01-01`);const P=rows.map(r=>({d:Math.round((Date.parse(r.date)-j0)/864e5),v:r.val}));
  const mx=(a,b)=>{const s=P.filter(p=>p.d>=a&&p.d<=b);return s.length?Math.max(...s.map(p=>p.v)):null;};
  const seasonPts=P.filter(p=>p.d>=60&&p.d<=300);
  if(seasonPts.length<5)return{crop:null,label:'Nem azonosítható',conf:0,why:`Kevés felhőmentes felvétel (${seasonPts.length} db a tenyészidőben).`};
  const pk=seasonPts.reduce((a,b)=>b.v>a.v?b:a);const pd=pk.d,pv=pk.v;
  const aut=mx(-80,-15),mar=mx(55,100),jun=mx(150,185),lateJul=mx(200,232),sep=mx(236,280);
  const dm=d=>{const t=new Date(j0+d*864e5);return `${MONTHS[t.getMonth()]} ${t.getDate()}.`;};
  const f2=v=>v==null?'–':v.toFixed(2).replace('.',',');
  const base=`csúcs ${f2(pv)} (${dm(pd)})`;
  if(pv<0.45)return{crop:'Ugar',label:'Ugar / gyenge állomány',conf:0.4,why:`Egész évben alacsony zöldtömeg, ${base}.`};
  if(mar!=null&&mar>=0.5&&sep!=null&&sep>=0.5&&aut!=null&&aut>=0.5)
    return{crop:'Lucerna',label:'Lucerna / évelő',conf:0.5,why:`Ősszel, márciusban és szeptemberben is zöld (${f2(aut)} / ${f2(mar)} / ${f2(sep)}) – évelő kultúrára utal.`};
  if(pd<=152&&(lateJul==null||lateJul<0.45)){
    const second=sep!=null&&sep>=0.55?' Aratás után újra zöldül: másodvetés vagy árvakelés valószínű.':'';
    if((mar!=null&&mar>=0.6)||(aut!=null&&aut>=0.6)){const both=mar!=null&&mar>=0.6&&aut!=null&&aut>=0.55;
      return{crop:'Őszi káposztarepce',label:'Őszi káposztarepce',conf:both?0.85:0.7,why:`Már ősszel és kora tavasszal erősen zöld (ősz ${f2(aut)}, március ${f2(mar)}), ${base}, július végére leszárad.${second}`};}
    if(mar!=null&&mar<0.35&&pd>=135)return{crop:'Tavaszi árpa',label:'Tavaszi kalászos',conf:0.45,why:`Márciusban még csupasz (${f2(mar)}), ${base}, nyár közepére leszárad.${second}`};
    return{crop:'Őszi búza',label:'Őszi kalászos (búza / árpa / tritikálé)',conf:0.7,why:`Ősszel kel, ${base}, július közepére leszárad.${second}`};
  }
  if(pd>=150&&(mar==null||mar<0.45)){
    if(pd<=208&&(sep==null||sep<0.42)&&(lateJul==null||lateJul<0.65))
      return{crop:'Napraforgó',label:'Napraforgó',conf:0.6,why:`Tavaszi vetés, ${base}, augusztus végére leszárad (aug. vége–szept. ${f2(sep)}).`};
    if(pd>=212&&(jun==null||jun<0.45))
      return{crop:'Szója',label:'Szója',conf:0.5,why:`Június végéig alacsony (${f2(jun)}), késői ${base}.`};
    if(pd>=185&&pd<=240&&sep!=null&&sep>=0.4)
      return{crop:'Kukorica',label:'Kukorica',conf:0.65,why:`Tavaszi vetés, ${base}, augusztus végén–szeptemberben még zöld (${f2(sep)}).`};
    return{crop:null,label:'Tavaszi vetésű (kukorica / napraforgó / szója)',conf:0.35,why:`Tavaszi vetésre utal, ${base}, de a görbe alapján nem egyértelmű.`};
  }
  return{crop:null,label:'Nem egyértelmű',conf:0.2,why:`A görbe nem illik egyik mintára sem (${base}).`};
}

const cgGroup=c=>{c=(c||'').toLowerCase();if(/búza|árpa|tritikálé|rozs|zab|kalász/.test(c))return'kalász';if(/kukorica/.test(c))return'kukorica';if(/repce/.test(c))return'repce';if(/napraforgó/.test(c))return'napraforgó';if(/szója/.test(c))return'szója';return c;};
const cgMatch=(given,crop)=>given.split(',').some(g=>cgGroup(g.trim())===cgGroup(crop));
function cgResult(f,y){const c=cacheGet(cgKey(f,y));if(!c)return null;return Object.assign(classifyCrop(c.rows,y),{n:c.rows.length});}
function cgYears(){return ANA_YEARS().filter(y=>y<=THIS_YEAR);}

async function runCropGuess(f){
  if(CG.run)return;const run={cancel:false};CG.run=run;CG.fid=f.id;const yrs=cgYears();
  try{for(let i=0;i<yrs.length;i++){CG.msg=`Felvételek feldolgozása: ${yrs[i]} (${i+1}/${yrs.length})`;if(curTab==='season'&&curField()===f)renderSeason();await cropSeries(f,yrs[i],run);}}
  catch(e){if(e.message!=='megszakítva')toast(/fetch|network|Failed/i.test(String(e.message||e))?'A növényfelismeréshez most nem érhetők el a műholdképek. Próbálja újra később.':'A növényfelismerés most nem sikerült. Próbálja újra később.');}
  finally{CG.run=null;CG.msg='';if(curTab==='season'&&curField()===f)renderSeason();}
}

function cgAccept(f,y,crop){const se=season(f,y,true);se.parts.forEach(p=>{if(!p.crop||se.parts.length===1){p.crop=crop;p.cropSrc='műhold';}});save();}

function cropGuessHTML(f,y){
  const busy=CG.run&&CG.fid===f.id;const yrs=cgYears();const res=yrs.map(yy=>({y:yy,r:cgResult(f,yy)})).filter(x=>x.r);
  const cur=res.find(x=>x.y===y);const se=season(f,y,false);const given=se?[...new Set(se.parts.map(p=>p.crop).filter(Boolean))].join(', '):'';
  let h=`<div class="card" id="cgCard" style="background:#f5f9f2"><b>🛰️ Növény a műholdkép alapján</b>`;
  if(cur){const r=cur.r;const pct=Math.round(r.conf*100);
    h+=`<div style="margin:6px 0"><b style="font-size:15px">${y}: <span>${esc(r.label)}</span></b> <span class="meta">· ${r.conf?`kb. ${pct}% biztos`:'bizonytalan'}</span></div><div class="help">${esc(r.why)}</div>`;
    if(r.crop&&given&&!cgMatch(given,r.crop))h+=`<div class="notice warn" style="margin-top:6px">A megadott növény (<b>${esc(given)}</b>) eltér a műholdas becsléstől – érdemes ellenőrizni.</div>`;
    if(r.crop&&!given)h+=`<div class="row" style="margin-top:8px"><button class="btn sm primary" data-cgacc="${y}" data-crop="${esc(r.crop)}">✓ Átveszem: ${esc(r.crop)}</button></div>`;
  }else if(!busy)h+=`<p class="help" style="margin:6px 0">A program a növényzet zöldülési görbéjéből (NDVI) (mikor kel, mikor a csúcs, mikor szárad le) megbecsüli, mi volt a táblán ${yrs[0]}–${yrs[yrs.length-1]} között. A javaslatot Ön hagyja jóvá.</p>`;
  if(busy)h+=`<div class="meta" style="margin-top:6px">⏳ ${esc(CG.msg)}</div><button class="btn sm ghost" id="cgStop" style="margin-top:6px">Megszakítás</button>`;
  else if(res.length<yrs.length)h+=`<div class="row" style="margin-top:8px"><button class="btn sm${cur?'':' primary'}" id="cgGo">${res.length?'Hiányzó évek felismerése':`Növények felismerése (${yrs[0]}–${yrs[yrs.length-1]})`}</button></div><p class="meta" style="margin-top:4px">Évente kb. 25 felvétel – számítógépen 1–3 perc, telefonon wifin ajánlott.</p>`;
  if(res.length>1){const todo=res.filter(x=>x.r.crop&&!(f.seasons&&f.seasons[x.y]&&f.seasons[x.y].parts.some(p=>p.crop)));
    h+=`<details style="margin-top:8px"${cur?'':' open'}><summary>Összes év (${res.length})</summary><div class="tw"><table><tr><th>Év</th><th>Becslés</th><th>Biztos</th><th>Megadva</th><th></th></tr>${res.map(x=>{const s2=f.seasons&&f.seasons[x.y];const g=s2?[...new Set(s2.parts.map(p=>p.crop).filter(Boolean))].join(', '):'';
      return `<tr><td>${x.y}</td><td title="${esc(x.r.why)}">${esc(x.r.label)}</td><td>${x.r.conf?Math.round(x.r.conf*100)+'%':'–'}</td><td>${esc(g)||'–'}</td><td>${x.r.crop&&!g?`<button class="btn sm" data-cgacc="${x.y}" data-crop="${esc(x.r.crop)}">Átvesz</button>`:''}</td></tr>`;}).join('')}</table></div>
      ${todo.length>1?`<button class="btn sm primary" id="cgAll" style="margin-top:6px">✓ Mind átvétele az üres évekbe (${todo.length})</button>`:''}</details>`;}
  return h+`</div>`;
}
function bindCropGuess(f){
  const g=$('#cgGo');if(g)g.onclick=()=>runCropGuess(f);const st=$('#cgStop');if(st)st.onclick=()=>{if(CG.run)CG.run.cancel=true;};
  document.querySelectorAll('[data-cgacc]').forEach(b=>b.onclick=()=>{cgAccept(f,+b.dataset.cgacc,b.dataset.crop);toast(`${b.dataset.cgacc}: ${b.dataset.crop} – átvéve, szükség esetén javítsa.`);renderSeason();renderMap();});
  const all=$('#cgAll');if(all)all.onclick=()=>{let n=0;cgYears().forEach(y=>{const r=cgResult(f,y);const s2=f.seasons&&f.seasons[y];if(r&&r.crop&&!(s2&&s2.parts.some(p=>p.crop))){cgAccept(f,y,r.crop);n++;}});toast(`${n} év növénye átvéve.`);renderSeason();renderMap();};
}
