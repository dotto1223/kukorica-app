/* ===== Közös statisztika (összesített, anonim) + sáv a Tábláim tetején ===== */
/* --- település → járás (KSH Helységnévtár) --- */
let SETTL=null,SETTL_P=null;
function loadSettl(){if(SETTL)return Promise.resolve(SETTL);if(!SETTL_P)SETTL_P=fetch('settlements.json').then(r=>r.json()).then(j=>SETTL=j.s).catch(()=>null);return SETTL_P;}
async function ensureDistricts(){const need=S.fields.filter(f=>f.settlement&&(f.districtFor!==f.settlement||f.districtV!==2)&&(!f.country||f.country==='hu'));if(!need.length)return;const m=await loadSettl();if(!m)return;let ch=0;
  need.forEach(f=>{const hit=m[f.settlement]||m[Object.keys(m).find(k=>k.toLowerCase()===String(f.settlement).toLowerCase())];f.district=hit&&hit[1]?(hit[1]==='Budapest'?'Budapest':hit[1]+' járás'):'';if(hit&&!f.county)f.county=hit[0];f.districtFor=f.settlement;f.districtV=2;ch++;});
  if(ch){save();if(curTab==='season')renderSeason();}}
let STATS=null,STATS_AT=0,STATS_BUSY=false,STATS_PUBLIC=false,STATS_FAIL=0;
const ST={year:null,lvl:'all',region:'Összes',crop:null};
async function loadStats(force){
  if(!statsOn()||STATS_BUSY)return STATS;
  if(!force&&STATS&&Date.now()-STATS_AT<5*60e3)return STATS;if(!force&&!STATS&&Date.now()-STATS_FAIL<60e3)return null;
  STATS_BUSY=true;try{STATS=await statRpc('get_stats',{p_public:!!STATS_PUBLIC});STATS_AT=Date.now();}catch(e){console.warn('stats',e);STATS_FAIL=Date.now();}finally{STATS_BUSY=false;}
  renderStatBanner();if(curTab==='stats')renderStats();else if(curTab==='season'&&STATS)renderSeason();return STATS;
}
const stRows=(lvl,region,year)=>(STATS&&STATS.rows||[]).filter(r=>r.lvl===lvl&&r.region===region&&(year==null||r.year===year)&&(!CORN_ONLY||isCorn(r.crop)));
const stYears=()=>[...new Set((STATS&&STATS.rows||[]).map(r=>r.year).concat((STATS&&STATS.year_totals||[]).map(r=>r.year)))].sort((a,b)=>b-a);
const stYT=(lvl,region,year)=>(STATS&&STATS.year_totals||[]).find(r=>r.lvl===lvl&&r.region===region&&r.year===year);
const fT=v=>v==null?'–':fmt(v,1);const fY=v=>v==null?'–':fmt(v,2);

/* --- sáv --- */
let bannerMsgs=[],bannerI=0,bannerT=null;
function statBannerMsgs(){const m=[];if(!STATS)return m;const t=STATS.totals||{};
  if(t.ok)m.push(`📊 A rendszerben: <b>${fmt0(t.ha)} ha</b> · ${t.fields} tábla · ${t.owners} termelő · ${t.settlements} település`);
  const ys=stYears();for(const y of ys.slice(0,2)){const rows=stRows('all','Összes',y).filter(r=>r.crop!=='Nincs megadva');const yt=stYT('all','Összes',y);
    if(rows.length&&yt&&yt.ha){m.push(`🌱 ${y} vetésszerkezet: `+rows.slice(0,3).map(r=>`<b>${esc(r.crop)}</b> ${fmt0(r.ha/yt.ha*100)}%`).join(' · '));}
    rows.filter(r=>r.y_med!=null).slice(0,3).forEach(r=>m.push(`🌾 ${y} ${esc(r.crop)}: medián <b>${fY(r.y_med)} t/ha</b> (${r.ny} tábla)`));
    if(m.length>3)break;}
  if(STATS.admin&&HYB){const n=hybPending().length;if(n)m.unshift(`🔎 Admin: ${n} új hibrid/fajta név vár felülvizsgálatra`);}
  if(!m.length)m.push(`📊 Közös statisztika: az összesített számok legalább ${STATS.k_fields} tábla és ${STATS.k_owners} termelő adatától jelennek meg – az adatok most gyűlnek.`);
  return m;}
function renderStatBanner(){const el=$('#statBanner');if(!el)return;if(!STATS){el.hidden=true;return;}
  bannerMsgs=statBannerMsgs();el.hidden=!bannerMsgs.length;bannerI=bannerI%Math.max(1,bannerMsgs.length);
  const show=()=>{el.innerHTML=`<span class="sbTxt">${bannerMsgs[bannerI]||''}</span><span class="sbGo">›</span>`;};show();
  clearInterval(bannerT);if(bannerMsgs.length>1)bannerT=setInterval(()=>{if(document.visibilityState!=='visible'||curTab!=='fields')return;bannerI=(bannerI+1)%bannerMsgs.length;show();},6000);}
$('#statBanner')&&($('#statBanner').onclick=()=>go('stats'));
$('#hdrStats')&&($('#hdrStats').onclick=()=>go('stats'));

/* --- saját adatok az összevetéshez --- */
function myCropYields(year){const by={};S.fields.forEach(f=>{const se=f.seasons&&f.seasons[year];if(!se)return;se.parts.forEach(p=>{if(!p.crop||(CORN_ONLY&&!isCorn(p.crop)))return;const a=partArea(f,p)||0;let y=null;try{y=calcYield(f,p).std;}catch(e){}
  const o=by[p.crop]||(by[p.crop]={ha:0,yw:0,ya:0,n:0});o.ha+=a;if(y!=null&&isFinite(y)&&y>0){o.yw+=y*a;o.ya+=a;o.n++;}});});
  Object.values(by).forEach(o=>o.y=o.ya?o.yw/o.ya:null);return by;}

/* --- oldal --- */
function renderStats(){const box=$('#statsBox');if(!box)return;
  if(!SB_ON||(!DEMO&&!SESS)){box.innerHTML='<p class="help">A közös statisztika bejelentkezés után érhető el.</p>';return;}
  if(!STATS){box.innerHTML='<p class="meta">⏳ Statisztika betöltése…</p>';loadStats(true);return;}
  const ys=stYears();if(ST.year==null||!ys.includes(ST.year))ST.year=ys[0]??THIS_YEAR;
  const regions={county:[...new Set((STATS.year_totals||[]).filter(r=>r.lvl==='county').map(r=>r.region))].sort(),district:[...new Set((STATS.year_totals||[]).filter(r=>r.lvl==='district').map(r=>r.region))].sort(),settlement:[...new Set((STATS.year_totals||[]).filter(r=>r.lvl==='settlement').map(r=>r.region))].sort()};
  if(ST.lvl!=='all'&&!regions[ST.lvl].includes(ST.region)){ST.lvl='all';ST.region='Összes';}
  const t=STATS.totals||{};const rows=stRows(ST.lvl,ST.region,ST.year);const yt=stYT(ST.lvl,ST.region,ST.year);
  const hidden=(STATS.hidden||[]).find(h=>h.lvl===ST.lvl&&h.region===ST.region&&h.year===ST.year);
  let h=`<div class="row" style="justify-content:space-between;align-items:center"><h2 style="margin:0">📊 Statisztika</h2>${STATS.admin?`<label class="meta" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="stPub" ${STATS_PUBLIC?'checked':''}> partner-nézet</label>`:''}</div>
  ${DEMO?`<div class="notice demoNote">🧪 <b>Példastatisztika kitalált adatokból</b> (78 tábla, 8 kitalált termelő, 2018–2025). Az évenkénti átlagok a KSH Bács-Kiskun vármegyei termésátlagaihoz igazodnak, a táblák közti különbségek és a technológiai hatások kitaláltak. Így fog kinézni, amikor elég termelői adat gyűlik össze.</div>`:(!t.ok||!(STATS.rows||[]).length)&&!STATS.raw?`<div class="notice">Még kevés a termelői adat a közös statisztikához. Addig nézze meg, hogyan fog kinézni: <button class="btn sm" id="stDemo">🧪 Példa a demóban</button></div>`:''}
  <p class="help" style="margin:4px 0 10px">Összesített, név és táblakód nélküli adatok. Egy csoport csak akkor jelenik meg, ha legalább <b>${STATS.k_fields} tábla</b> és <b>${STATS.k_owners} termelő</b> adatából áll.${STATS.raw?' <b style="color:#a15c00">Admin-nézet: küszöb nélkül.</b>':''}</p>`;
  h+=t.ok?`<div class="stats"><div><b>${fmt0(t.ha)}</b><span>hektár</span></div><div><b>${t.fields}</b><span>tábla</span></div><div><b>${t.owners}</b><span>termelő</span></div><div><b>${t.settlements}</b><span>település</span></div></div>`:`<div class="notice">A rendszer összesített számai néhány további termelő csatlakozása után jelennek meg.</div>`;
  h+=`<div class="grid3" style="margin:12px 0"><div><label class="f">Év</label><select class="input" id="stYear">${(ys.length?ys:[ST.year]).map(y=>`<option ${y===ST.year?'selected':''}>${y}</option>`).join('')}</select></div>
    <div><label class="f">Terület</label><select class="input" id="stLvl"><option value="all" ${ST.lvl==='all'?'selected':''}>Összes</option><option value="county" ${ST.lvl==='county'?'selected':''}>Megye</option><option value="district" ${ST.lvl==='district'?'selected':''}>Járás</option><option value="settlement" ${ST.lvl==='settlement'?'selected':''}>Település</option></select></div>
    <div><label class="f">${ST.lvl==='county'?'Megye':ST.lvl==='district'?'Járás':ST.lvl==='settlement'?'Település':'&nbsp;'}</label>${ST.lvl==='all'?'<input class="input" value="Összes" disabled>':`<select class="input" id="stReg">${regions[ST.lvl].map(r=>`<option ${r===ST.region?'selected':''}>${esc(r)}</option>`).join('')}</select>`}</div></div>`;
  // vetésszerkezet
  h+=`<h3>Vetésszerkezet ${ST.year}${ST.lvl!=='all'?' – '+esc(ST.region):''}</h3>`;
  if(rows.length&&yt&&yt.ok){const tot=yt.ha||rows.reduce((a,r)=>a+r.ha,0);const shown=rows.reduce((a,r)=>a+r.ha,0);
    h+=`<div class="stBars">${rows.map(r=>`<div class="stBar"><span class="stLbl">${esc(r.crop)}</span><span class="stTrack"><i style="width:${Math.max(2,r.ha/tot*100).toFixed(1)}%"></i></span><span class="stVal">${fmt0(r.ha/tot*100)}% · ${fT(r.ha)} ha</span></div>`).join('')}
      ${tot-shown>0.5?`<div class="stBar"><span class="stLbl meta">egyéb (kevés adat)</span><span class="stTrack"><i style="width:${((tot-shown)/tot*100).toFixed(1)}%;background:#bbb"></i></span><span class="stVal">${fmt0((tot-shown)/tot*100)}% · ${fT(tot-shown)} ha</span></div>`:''}</div>
      <p class="meta">Összesen ${fT(tot)} ha${yt.nf?` · ${yt.nf} tábla`:''}.</p>`;}
  else h+=`<p class="help">${hidden||(yt&&!yt.ok)?'Ehhez a területhez és évhez még kevés tábla vagy termelő van – az adatvédelmi küszöb miatt nem jeleníthető meg.':'Ehhez az évhez még nincs rögzített adat.'}</p>`;
  // hozamok
  const yr=rows.filter(r=>r.y_med!=null);
  h+=`<h3>Hozamok ${ST.year} <span class="meta">(szabványos nedvességre számolva, t/ha)</span></h3>`;
  if(yr.length)h+=`<div class="tw"><table><tr><th>Növény</th><th>Átlag*</th><th>Medián</th><th>Középső 50%</th><th>Tábla</th></tr>${yr.map(r=>`<tr><td>${esc(r.crop)}</td><td>${fY(r.y_mean)}</td><td><b>${fY(r.y_med)}</b></td><td>${fY(r.y_p25)}–${fY(r.y_p75)}</td><td>${r.ny}</td></tr>`).join('')}</table></div><p class="meta">* területtel súlyozott átlag. A medián kevésbé érzékeny a kiugró értékekre. A becsült (nem mért) hozamok nem számítanak bele.</p>`;
  else h+=`<p class="help">Hozamadat még nincs elég ehhez a nézethez.</p>`;
  // saját helyzet
  const mine=myCropYields(ST.year);const mk=Object.keys(mine).filter(c=>mine[c].y!=null);
  if(mk.length){h+=`<h3>Az én tábláim ${ST.year}</h3><div class="tw"><table><tr><th>Növény</th><th>Saját hozam</th><th>${ST.lvl==='all'?'Medián (összes)':'Medián – '+esc(ST.region)}</th><th>Eltérés</th></tr>${mk.map(c=>{const r=rows.find(x=>x.crop===c);const m=r&&r.y_med;const d=m?Math.round((mine[c].y/m-1)*100)+0:null;
      return `<tr><td>${esc(c)}</td><td><b>${fY(mine[c].y)}</b> <span class="meta">(${fT(mine[c].ha)} ha)</span></td><td>${m?fY(m):'<span class="meta">kevés adat</span>'}</td><td>${d==null?'–':`<b style="color:${d>=0?'#2e7d32':'#b3261e'}">${d>=0?'+':''}${fmt0(d)}%</b>`}</td></tr>`;}).join('')}</table></div>`;}
  // régiók összevetése
  const cropsY=[...new Set((STATS.rows||[]).filter(r=>r.year===ST.year&&r.lvl!=='all'&&r.crop!=='Nincs megadva').map(r=>r.crop))];
  if(cropsY.length){if(!cropsY.includes(ST.crop))ST.crop=cropsY[0];
    const LO={county:0,district:1,settlement:2};const rr=(STATS.rows||[]).filter(r=>r.year===ST.year&&r.crop===ST.crop&&r.lvl in LO&&(!CORN_ONLY||isCorn(r.crop))).sort((a,b)=>a.lvl===b.lvl?b.ha-a.ha:LO[a.lvl]-LO[b.lvl]);
    h+=`<h3>Régiók összevetése ${ST.year}</h3><select class="input" id="stCrop" style="max-width:260px;margin-bottom:8px">${cropsY.map(c=>`<option ${c===ST.crop?'selected':''}>${esc(c)}</option>`).join('')}</select>
    <div class="tw"><table><tr><th>Terület</th><th>Vetésterület</th><th>Medián hozam</th><th>Tábla</th></tr>${rr.map(r=>`<tr><td>${r.lvl==='county'?'<b>'+esc(r.region)+' megye</b>':r.lvl==='district'?'<i>'+esc(r.region)+'</i>':'&nbsp;&nbsp;'+esc(r.region)}</td><td>${fT(r.ha)} ha</td><td>${r.y_med!=null?fY(r.y_med)+' t/ha':'–'}</td><td>${r.nf}</td></tr>`).join('')}</table></div>
    <p class="meta">Csak azok a területek látszanak, ahol a küszöb teljesül.</p>`;}
  h+=`<div class="adv">${gxeHTML()}</div><p class="help simpleOnly">A hibrid-összehasonlítás a szakértői nézetben érhető el (Tábláim → Továbbiak, vagy a tábla ⋯ menüje).</p>`;
  h+=adminQualityHTML();
  h+=`<p class="meta" style="margin-top:14px">Frissítve: ${new Date(STATS_AT).toLocaleTimeString('hu-HU',{hour:'2-digit',minute:'2-digit'})} · <a href="#" id="stRefresh">frissítés</a></p>`;
  box.innerHTML=h;{const sd=$("#stDemo");if(sd)sd.onclick=()=>demoEnterDialog();}
  $('#stYear')&&($('#stYear').onchange=e=>{ST.year=+e.target.value;renderStats();});
  $('#stLvl').onchange=e=>{ST.lvl=e.target.value;ST.region=ST.lvl==='all'?'Összes':(regions[ST.lvl][0]||'Összes');renderStats();};
  $('#stReg')&&($('#stReg').onchange=e=>{ST.region=e.target.value;renderStats();});
  $('#stCrop')&&($('#stCrop').onchange=e=>{ST.crop=e.target.value;renderStats();});
  $('#stPub')&&($('#stPub').onchange=e=>{STATS_PUBLIC=e.target.checked;STATS=null;renderStats();});
  $('#stRefresh').onclick=e=>{e.preventDefault();STATS=null;AQ=null;HYB=null;Object.keys(GXE).forEach(k=>delete GXE[k]);renderStats();};bindHybReview();bindGxe();
}

/* --- körzeti összevetés az Évek fülön --- */
function stYieldHint(f,p,year,myY){if(!p.crop)return '';if(!STATS){if(statsOn())setTimeout(()=>loadStats(),0);return '';}
  const cand=[['settlement',f.settlement,f.settlement],['district',f.district||null,f.district||null],['county',f.county,(f.county||'')+' megye'],['all','Összes','az összes tábla']];
  for(const [lvl,reg,lab] of cand){if(!reg)continue;const r=stRows(lvl,reg,+year).find(x=>x.crop===p.crop);if(r&&r.y_med!=null){const d0=myY!=null&&r.y_med?(myY/r.y_med-1)*100:null;const d=d0==null?null:Math.round(d0)+0;
    return `<div class="meta" style="margin-top:4px">📊 ${esc(lab)} – ${esc(p.crop)} ${year}: medián <b>${fY(r.y_med)} t/ha</b> (${r.ny} tábla)${d!=null?` · az Öné <b style="color:${d>=0?'#2e7d32':'#b3261e'}">${d>=0?'+':''}${fmt0(d)}%</b>`:''}</div>`;}}
  return '';}

/* --- admin: adatminőség --- */
let AQ=null,AQ_BUSY=false;
async function loadAQ(){if(AQ_BUSY)return;AQ_BUSY=true;try{AQ=await rpc('admin_quality',{});}catch(e){AQ={err:e.message||String(e)};}finally{AQ_BUSY=false;}if(curTab==='stats')renderStats();}
function adminQualityHTML(){if(!STATS||!STATS.admin)return '';if(!AQ){loadAQ();return '<h3>Adatminőség (admin)</h3><p class="meta">⏳ betöltés…</p>';}
  if(AQ.err)return `<h3>Adatminőség (admin)</h3><p class="meta">Nem sikerült: ${esc(AQ.err)}</p>`;
  const P=AQ.partners||[],X=AQ.suspicious||[];const dt=s=>s?new Date(s).toLocaleDateString('hu-HU'):'–';
  let h=`<h3>Adatminőség (csak admin)</h3><div class="tw"><table><tr><th>Partner</th><th>Tábla</th><th>ha</th><th>Utolsó módosítás</th><th>Növény hiányzik</th><th>Hozam hiányzik</th><th>Vetés hiányzik</th><th>Tőszám hiányzik</th><th>Kutatás</th></tr>
    ${P.map(p=>`<tr><td>${esc(p.name||'')}${p.farm&&p.farm!==p.name?`<div class="meta">${esc(p.farm)}</div>`:''}</td><td>${p.fields}</td><td>${fmt0(p.ha)}</td><td>${dt(p.last)}</td>${['miss_crop','miss_yield','miss_sowing','miss_density'].map(k=>`<td style="${p[k]?'color:#a15c00;font-weight:600':''}">${p[k]}${p.rows?` / ${p.rows}`:''}</td>`).join('')}<td>${p.research?'✓':'–'}</td></tr>`).join('')}</table></div>
    <p class="meta">„x / y”: hány évsorból hiányzik az adat az összes közül. A hozamhiány csak a lezárt (előző) évekre számít.</p>`;
  h+=X.length?`<h3>Gyanús értékek (${X.length})</h3><div class="tw"><table><tr><th>Partner</th><th>Tábla</th><th>Év</th><th>Növény</th><th>Probléma</th></tr>${X.slice(0,100).map(x=>`<tr><td>${esc(x.owner||'')}</td><td>${esc(x.code||'')}${x.part&&x.part!=='Egész tábla'?` · ${esc(x.part)}`:''}</td><td>${x.year}</td><td>${esc(x.crop||'–')}</td><td>${esc(x.issue)}</td></tr>`).join('')}</table></div>`:'<p class="meta">Nincs gyanús érték. ✓</p>';
  h+=hybReviewHTML();
  return h;}
function hybPending(){return (HYB||[]).filter(h=>!h.approved&&h.n>0);}
function hybReviewHTML(){if(!HYB){loadHybrids(true).then(()=>{if(curTab==='stats')renderStats();});return '';}
  const P=hybPending();if(!P.length)return '<h3>Hibrid- és fajtanevek</h3><p class="meta">Nincs felülvizsgálatra váró név. ✓</p>';
  const appr=(HYB||[]).filter(h=>h.approved);
  const simOf=h=>{let b=null,bd=9;appr.forEach(a=>{const d=lev(h.key,a.key);if(d<bd){bd=d;b=a;}});return bd<=2?b:null;};
  return `<h3>Hibrid- és fajtanevek felülvizsgálata (${P.length})</h3><p class="help">Új vagy még nem jóváhagyott nevek. <b>Jóváhagy</b>: bekerül az ismert nevek közé (a partnereknek felajánljuk). <b>Javít</b>: minden partnernél kicseréli az elírt nevet a helyesre.</p>
  <div class="tw"><table><tr><th>Név</th><th>Növény</th><th>Használat</th><th>Javaslat</th><th></th></tr>${P.map(h=>{const s=simOf(h);return `<tr data-hk="${esc(h.key)}"><td><b>${esc(h.name)}</b></td><td>${esc(h.crop||'–')}</td><td>${h.n} sor · ${h.no} termelő</td>
    <td>${s?`<button class="btn sm" data-hfix="${esc(s.name)}">→ ${esc(s.name)}</button>`:'<span class="meta">–</span>'}</td>
    <td style="white-space:nowrap"><button class="btn sm primary" data-happ>✓ Jóváhagy</button> <button class="btn sm" data-hren>Javít…</button></td></tr>`;}).join('')}</table></div>`;}
function bindHybReview(){document.querySelectorAll('[data-hk]').forEach(tr=>{const key=tr.dataset.hk;const h=(HYB||[]).find(x=>x.key===key);if(!h)return;
  const ren=async nn=>{nn=normHybrid(nn);if(!nn)return;try{const n=await rpc('admin_rename_hybrid',{p_old_key:key,p_new_name:nn});await rpc('admin_approve_hybrid',{p_key:hybKey(nn),p_name:nn,p_crop:h.crop||null});toast(`Javítva: ${h.name} → ${nn} (${n} helyen)`);await loadHybrids(true);acctPull(true);renderStats();}catch(e){toast('Nem sikerült: '+(e.message||e));}};
  const a=tr.querySelector('[data-happ]');if(a)a.onclick=async()=>{try{await rpc('admin_approve_hybrid',{p_key:key,p_name:h.name,p_crop:h.crop||null});toast(`Jóváhagyva: ${h.name}`);await loadHybrids(true);renderStats();}catch(e){toast('Nem sikerült: '+(e.message||e));}};
  const f=tr.querySelector('[data-hfix]');if(f)f.onclick=()=>ren(f.dataset.hfix);
  const r=tr.querySelector('[data-hren]');if(r)r.onclick=()=>ask(`„${h.name}” javítása erre:`,'pl. DKC_4897',h.name,v=>ren(v));});}
