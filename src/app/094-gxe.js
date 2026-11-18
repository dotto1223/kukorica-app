/* ================= Hibrid × környezet × technológia (G×E×M) =================
   A szerver (gxe_stats) csak küszöb feletti összesítést ad: relatív hozam a térség/év átlagához,
   három környezeti kategória, hibridprofil, tőszám- és vetésidő-sávok. */
const GXE={},GXF={};
const ENV_NAME=['Gyenge','Közepes','Jó'];
const SOW_BAND=['10+ nappal korábban','4–9 nappal korábban','a térségi átlag ±3 nap','4–9 nappal később','10+ nappal később'];
const GXE_TTL=10*60*1000;
/* egy kéréshez egyetlen ígéret (Promise): ha már fut, ugyanazt adjuk vissza, így a várakozó nézet csak egyszer frissül */
const GXE_P={},GXF_P={};
function loadGxe(crop,force){if(!statsOn()||!crop)return Promise.resolve(null);const k=crop+'|'+(STATS_PUBLIC?1:0);const c=GXE[k];
  if(c&&!force&&Date.now()-c.at<GXE_TTL)return Promise.resolve(c.d);if(GXE_P[k])return GXE_P[k];
  GXE_P[k]=statRpc('gxe_stats',{p_crop:crop,p_public:STATS_PUBLIC}).then(d=>{GXE[k]={d,at:Date.now()};return d;},
    e=>{GXE[k]={d:{err:e.message||String(e)},at:Date.now()};return GXE[k].d;}).finally(()=>{delete GXE_P[k];});
  return GXE_P[k];}
function gxeCached(crop){const c=GXE[crop+'|'+(STATS_PUBLIC?1:0)];return c?c.d:null;}
function loadGxf(fid,crop){if(!statsOn()||!fid||!crop)return Promise.resolve(null);const k=fid+'|'+crop;const c=GXF[k];
  if(c&&Date.now()-c.at<GXE_TTL)return Promise.resolve(c.d);if(GXF_P[k])return GXF_P[k];
  GXF_P[k]=statRpc('gxe_field',{p_field:fid,p_crop:crop}).then(d=>{GXF[k]={d,at:Date.now()};return d;},
    e=>{GXF[k]={d:{ok:false,err:e.message||String(e)},at:Date.now()};return GXF[k].d;}).finally(()=>{delete GXF_P[k];});
  return GXF_P[k];}

/* relatív hozam kiírása: +6% / −4% */
const relPct=r=>r==null?null:Math.round((r-1)*100);
const relTxt=r=>{const p=relPct(r);return p==null?'–':(p>0?'+':p<0?'−':'±')+Math.abs(p)+'%';};
const relCol=r=>{const p=relPct(r);return p==null?'':p>=3?'color:#2e7d32':p<=-3?'color:#b3261e':'';};
function hybType(s){if(s==null)return {t:'–',d:'Kevés adat a típushoz (legalább 8 tábla, 2 környezet)'};
  if(s>=1.1)return {t:'Intenzív',d:'Jó környezetben az átlagnál jobban emelkedik, gyengében jobban visszaesik'};
  if(s<=0.9)return {t:'Stabil',d:'Gyenge környezetben is tart, jóban kevésbé emelkedik'};
  return {t:'Univerzális',d:'Az átlaggal együtt mozog'};}
function gxeCell(c,best){if(!c||!c.ok)return `<td class="meta">${c&&c.n?`kevés adat (${c.n})`:'–'}</td>`;
  return `<td style="${relCol(c.rel)}${best?';font-weight:700':''}">${relTxt(c.rel)}${c.y!=null?`<div class="meta">${fmt(c.y,1)} t/ha${c.p90!=null?` · legjobb 10%: ${fmt(c.p90,1)}`:''}</div>`:''}</td>`;}
/* hibrid a közös statisztikában: kódnév + érési jellemző; a saját hibrid neve csak a termelőnek látszik */
const MAT_REL=['Korai érésű (a kultúrán belül)','Közepes érésű (a kultúrán belül)','Kései érésű (a kultúrán belül)'];
function matTxt(m){if(!m)return '';if(m.scale==='fao')return `<span>${FAO_N[m.g-1]}</span> · <span>${FAO_R[m.g-1]}</span>`;return `<span>${MAT_REL[m.g-1]}</span>`;}
function hybCellHTML(x){const m=matTxt(x.mat);
  return `<b>${esc(x.code||'–')}</b>${x.own&&x.name?` <span class="ownTag" title="Ezt a hibridet / fajtát Ön is termeli. A nevét csak Ön látja."><span>Saját:</span> <b>${esc(x.name)}</b></span>`:''}${!x.own&&x.name?` <span class="meta">(${esc(x.name)})</span>`:''}${m?`<div class="meta">${m}</div>`:''}`;}
const bestOk=(list,env)=>{let b=null;list.forEach(x=>{const c=env?((x.cells||[]).find(z=>z.env===env)):x;if(c&&c.ok&&c.rel!=null&&(!b||c.rel>b.rel))b={x,rel:c.rel};});return b&&b.x;};


/* ---- térségi gyakorlat és évjárat (crop_profile) ---- */
const PRF={},PRF_P={};
function prfCached(crop){const c=PRF[crop+'|'+(STATS_PUBLIC?1:0)];return c&&Date.now()-c.at<10*60e3?c.d:null;}
function loadPrf(crop){if(!statsOn()||!crop)return Promise.resolve(null);const k=crop+'|'+(STATS_PUBLIC?1:0);const c=PRF[k];if(c&&Date.now()-c.at<10*60e3)return Promise.resolve(c.d);
  if(PRF_P[k])return PRF_P[k];
  PRF_P[k]=statRpc('crop_profile',{p_crop:crop,p_public:STATS_PUBLIC}).then(d=>{PRF[k]={d,at:Date.now()};return d;},e=>{PRF[k]={d:{err:String(e.message||e)},at:Date.now()};return PRF[k].d;}).finally(()=>{delete PRF_P[k];});
  return PRF_P[k];}
const YCLS=['Gyenge év','Átlagos év','Jó év'];
const FAO_N=['Szuperkorai','Korai','Középérésű','Kései'],FAO_R=['FAO 300 alatt','FAO 300–399','FAO 400–499','FAO 500 felett'];
function doyTxt(d){try{return new Date(2023,0,d).toLocaleDateString(((window.I18N&&I18N.lang)||'hu')+'',{month:'short',day:'numeric'});}catch(e){return String(d);}}
const bestCls=(list,cls)=>{let b=null;list.forEach(x=>{const c=(x.cells||[]).find(z=>z.cls===cls);if(c&&c.ok&&c.rel!=null&&(!b||c.rel>b.rel))b={x,rel:c.rel};});return b&&b.x;};
function prfHTML(crop){const p=prfCached(crop);
  if(!p){loadPrf(crop).then(()=>{if(curTab==='stats'&&GX_CROP===crop&&prfCached(crop))renderStats();});return '<p class="meta">⏳ Térségi adatok betöltése…</p>';}
  if(p.err||!p.ok)return '';
  let h=`<h4>Térségi gyakorlat${hq('region')}</h4><ul class="prof">`;
  const D=p.density,U=D&&D.unit,dp=U==='ezer mag/ha'?0:U==='mag/m²'?0:0;
  if(D)h+=`<li>Leggyakoribb tőszám / vetőmag-norma: <b>${fmt(D.mode_lo,dp)}–${fmt(D.mode_hi,dp)} ${esc(U)}</b> (a tábla-évek ${fmt0(D.mode_share*100)}%-a). A táblák fele ${fmt(D.p25,dp)} és ${fmt(D.p75,dp)} között vetett (középérték: ${fmt(D.med,dp)}).</li>`;
  const SW=p.sowing;if(SW)h+=`<li>Vetésidő: a táblák fele <b>${doyTxt(SW.p25)} – ${doyTxt(SW.p75)}</b> között vetett (középérték: ${doyTxt(SW.med)}). A legkorábbi tized ${doyTxt(SW.p10)} előtt, a legkésőbbi ${doyTxt(SW.p90)} után.</li>`;
  const Y=p.years||[];if(Y.length>=3){const by=c=>Y.filter(y=>y.cls===c).map(y=>y.year).join(', ');h+=`<li>Évjáratok ebben a kultúrában: gyenge: <b>${by(1)}</b> · átlagos: ${by(2)} · jó: <b>${by(3)}</b>${hq('yearcls')}</li>`;}
  h+='</ul>';
  const FG=(p.fao||[]);if(FG.some(x=>x.ok)){const b=[1,2,3].map(c=>bestCls(FG,c)),b0=bestOk(FG);
    h+=`<h4>Hibridek érési csoport (FAO) szerint – évjárat szerint${hq('fao')}</h4><div class="tw"><table class="gxT"><tr><th>Érési csoport</th><th>Összes</th>${YCLS.map(n=>`<th>${n}</th>`).join('')}</tr>
    ${FG.map(x=>`<tr><td><b>${FAO_N[x.g-1]}</b><div class="meta">${FAO_R[x.g-1]}${x.share!=null?` · ${fmt0(x.share*100)}% terület`:''}</div></td>${gxeCell(x,b0===x)}${[1,2,3].map(c=>gxeCell((x.cells||[]).find(z=>z.cls===c),b[c-1]===x)).join('')}</tr>`).join('')}</table></div>`;}
  const DB=D&&D.bands||[];if(DB.some(x=>x.ok)){const b=[1,2,3].map(c=>bestCls(DB,c)),b0=bestOk(DB);
    h+=`<h4>Tőszám / vetőmag-norma évjárat szerint <span class="meta">${esc(U)}</span></h4><div class="tw"><table class="gxT"><tr><th>Sáv</th><th>Összes</th>${YCLS.map(n=>`<th>${n}</th>`).join('')}</tr>
    ${DB.map(x=>`<tr><td><b>${fmt(x.lo,dp)}–${fmt(x.hi,dp)}</b></td>${gxeCell(x,b0===x)}${[1,2,3].map(c=>gxeCell((x.cells||[]).find(z=>z.cls===c),b[c-1]===x)).join('')}</tr>`).join('')}</table></div>
    <p class="meta">Mindegyik sávban a tábla-évek negyede van. A vastag szám az oszlop legjobbja: így látszik, mikor fizetett ki a ritkább és mikor a sűrűbb vetés.</p>`;}
  return h;}
function gxeCrops(){const s=new Set();(STATS&&STATS.rows||[]).forEach(r=>{if(r.lvl==='all'&&r.crop&&r.crop!=='Nincs megadva'&&r.y_med!=null)s.add(r.crop);});
  S.fields.forEach(f=>Object.values(f.seasons||{}).forEach(se=>se.parts.forEach(p=>{if(p.crop&&sowReq(p.crop))s.add(p.crop);})));
  const a=[...s];a.sort((x,y)=>(x==='Kukorica'?-1:y==='Kukorica'?1:x.localeCompare(y,'hu')));return a;}
let GX_CROP=null;
function gxeHTML(){const crops=gxeCrops();if(!crops.length)return '';if(!crops.includes(GX_CROP))GX_CROP=crops[0];
  const d=gxeCached(GX_CROP);if(!d){const want=GX_CROP;loadGxe(want).then(()=>{if(curTab==='stats'&&GX_CROP===want&&gxeCached(want))renderStats();});}
  let h=`<h3 style="margin-top:22px">Hibridek, tőszám és vetésidő – hasonló környezetben${hq('rel')}</h3>
  <div class="row" style="gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:6px"><select class="input" id="gxCrop" style="max-width:260px">${crops.map(c=>`<option value="${esc(c)}" ${c===GX_CROP?'selected':''}>${esc(cropDisp(c))}</option>`).join('')}</select></div>
  <p class="help">+6% = 6%-kal több termett, mint a környék átlaga abban az évben. Csak mért hozam számít, és egy szám csak legalább ${d&&d.k_fields||5} tábla és ${d&&d.k_owners||3} termelő adatából jelenik meg.</p>`;
  if(!d)return h+'<p class="meta">⏳ Betöltés…</p>';
  if(d.err)return h+`<p class="help">Nem sikerült betölteni: ${esc(d.err)}</p>`;
  const t=d.totals||{};if(!t.ok)return h+`<p class="help">Ehhez a kultúrához még kevés a mért hozamadat (${t.nf||0} tábla, ${t.no||0} termelő). Az összehasonlítás legalább ${d.k_fields} tábla és ${d.k_owners} termelő adatától jelenik meg.</p>`;
  h+=`<p class="meta">Alap: ${t.n} tábla-év, ${t.nf} tábla, ${t.no} termelő, ${t.years} év.${(d.envs||[]).length===3?' Jellemző hozamszint: '+d.envs.map(e=>`${ENV_NAME[e.env-1].toLowerCase()} ${fmt(e.lo,1)}–${fmt(e.hi,1)}`).join(', ')+' t/ha.':''}</p>`;
  h+=prfHTML(GX_CROP);
  // hibridprofil
  const H=d.hybrids||[];
  h+=`<h4>Hibridek / fajták környezet szerint${hq('env')}</h4><p class="meta" style="margin:0 0 4px"><span>Oszlopok: gyenge, közepes és jó termőképességű környezet.</span> <span>A hibridek kódnévvel és érési csoporttal szerepelnek, a saját hibridjeit a nevével is látja.</span>${hq('hybcode')}</p>`;
  const OWN=H.filter(x=>x.own&&x.name);if(OWN.length)h+=`<p class="meta" style="margin:0 0 6px">Az Ön hibridjei ebben a táblázatban: ${OWN.map(x=>`<b>${esc(x.name)}</b> (<b>${esc(x.code)}</b>)`).join(' · ')}</p>`;
  if(H.length){const b=[1,2,3].map(e=>bestOk(H,e));
    h+=`<div class="tw"><table class="gxT"><tr><th>Hibrid / fajta (kód)</th><th>Típus${hq('type')}</th>${ENV_NAME.map(n=>`<th>${n}</th>`).join('')}<th>Tábla / term.</th></tr>
    ${H.map(x=>{const ty=hybType(x.slope);return `<tr${x.own?' class="ownRow"':''}><td>${hybCellHTML(x)}</td><td title="${esc(ty.d)}">${ty.t}${x.slope!=null?`<div class="meta">${fmt(x.slope,2)}</div>`:''}</td>${[1,2,3].map(e=>gxeCell((x.cells||[]).find(c=>c.env===e),b[e-1]===x)).join('')}<td class="meta">${x.nf} / ${x.no}</td></tr>`;}).join('')}</table></div>
    <p class="meta">A számok a környék átlagához képest értendők${hq('rel')}. A „legjobb 10%” a hasonló táblák legjobb tizedének hozama${hq('best10')}. </p>${d.hybrids_hidden?`<p class="meta">Még ${d.hybrids_hidden} hibrid / fajta kevés adat miatt nem látszik.</p>`:''}`;}
  else h+=`<p class="help">Még egy hibrid / fajta sem éri el a küszöböt.</p>${d.hybrids_hidden?`<p class="meta">${d.hybrids_hidden} hibrid / fajta adata gyűlik.</p>`:''}`;
  // tőszám
  const D=d.density||{},DB=D.bands||[];
  h+=`<h4>Tőszám / vetőmag-norma${D.unit?` <span class="meta">${esc(D.unit)}</span>`:''}</h4>`;
  if(DB.some(x=>x.ok)){const b0=bestOk(DB),b=[1,2,3].map(e=>bestOk(DB,e));
    h+=`<div class="tw"><table class="gxT"><tr><th>Sáv</th><th>Összes</th>${ENV_NAME.map(n=>`<th>${n}</th>`).join('')}</tr>
    ${DB.map(x=>`<tr><td><b>${fmt(x.lo,D.unit==='ezer mag/ha'?0:1)}–${fmt(x.hi,D.unit==='ezer mag/ha'?0:1)}</b></td>${gxeCell(x,b0===x)}${[1,2,3].map(e=>gxeCell((x.cells||[]).find(c=>c.env===e),b[e-1]===x)).join('')}</tr>`).join('')}</table></div>
    <p class="meta">A sávok egyforma elemszámúak (ötödök). A vastagon szedett érték az oszlop legjobbja.</p>`;}
  else h+=`<p class="help">Még kevés a tőszámadat ehhez a kultúrához.</p>`;
  // vetésidő
  const SW=d.sowing||[];
  h+=`<h4>Vetésidő a térségi átlaghoz képest</h4>`;
  if(SW.some(x=>x.ok)){const b0=bestOk(SW),b=[1,2,3].map(e=>bestOk(SW,e));
    h+=`<div class="tw"><table class="gxT"><tr><th>Vetés</th><th>Összes</th>${ENV_NAME.map(n=>`<th>${n}</th>`).join('')}</tr>
    ${SW.map(x=>`<tr><td><b>${SOW_BAND[x.band-1]}</b></td>${gxeCell(x,b0===x)}${[1,2,3].map(e=>gxeCell((x.cells||[]).find(c=>c.env===e),b[e-1]===x)).join('')}</tr>`).join('')}</table></div>`;}
  else h+=`<p class="help">Még kevés a vetésdátum-adat ehhez a kultúrához.</p>`;
  h+=`<p class="meta">Üzemi tapasztalat, nem kisparcellás kísérlet: a különbségeket a gazdálkodás is befolyásolja. Döntés előtt érdemes a saját táblák eredményével együtt nézni.</p>`;
  return h;}
function bindGxe(){const s=$('#gxCrop');if(s)s.onchange=e=>{GX_CROP=e.target.value;renderStats();};}

/* a kártya kultúrája: az adott év első kitöltött kultúrája, különben a legutóbbi évé */
function gxeCropFor(f,se){const ok=c=>c&&(!CORN_ONLY||isCorn(c));const c=se&&se.parts&&se.parts.map(p=>p.crop).find(ok);if(c)return c;const ys=Object.keys(f.seasons||{}).sort().reverse();for(const y of ys){const p=(f.seasons[y].parts||[]).find(p=>ok(p.crop));if(p)return p.crop;}return CORN_ONLY?'Kukorica':'';}
/* ---- ajánlókártya az Évek fülön: a tábla környezete + ami a hasonló táblákon bevált ---- */
function gxeCardHTML(f,crop){if(!statsOn()||!f||!crop||!sowReq(crop))return '';
  const d=gxeCached(crop),fk=GXF[f.id+'|'+crop];
  if(!d||!fk){Promise.all([loadGxe(crop),loadGxf(f.id,crop)]).then(()=>{if(curTab==='season'&&curField()===f&&gxeCached(crop)&&GXF[f.id+'|'+crop])renderSeason();});return '';}
  const g=fk.d||{};const t=d.totals||{};
  if(!t.ok||!g.ok)return `<div class="card gxCard"><b>🧭 Hasonló táblák</b><p class="meta" style="margin:4px 0 0">Még kevés a mért adat a hasonló környezetű táblák összevetéséhez. Minél több tábla kap hozamot, tőszámot és vetésdátumot, annál hamarabb jelenik meg itt ajánlás.</p></div>`;
  const env=g.env,en=ENV_NAME[env-1];
  const H=(d.hybrids||[]).map(x=>({x,c:(x.cells||[]).find(c=>c.env===env)})).filter(o=>o.c&&o.c.ok).sort((a,b)=>b.c.rel-a.c.rel).slice(0,3);
  const DB=((d.density||{}).bands||[]);const db=bestOk(DB,env)||bestOk(DB);const dbEnv=db&&((db.cells||[]).find(c=>c.env===env)||{}).ok;
  const SW=d.sowing||[];const sb=bestOk(SW,env)||bestOk(SW);const sbEnv=sb&&((sb.cells||[]).find(c=>c.env===env)||{}).ok;
  const du=(d.density||{}).unit;const dec=du==='ezer mag/ha'?0:1;
  return `<div class="card gxCard"><b>🧭 Hasonló táblák alapján</b> – <b>${esc(cropDisp(crop))}</b>
    <p class="meta" style="margin:4px 0 8px">A tábla környezete: <b>${en}</b><span>${g.own_history?` (saját eddigi hozamai a térségi átlag ${fmt0(g.ff*100)}%-án).`:' (saját hozamtörténet még nincs, a térségi átlag alapján).'}</span></p>
    ${H.length?`<div><span class="meta">Ebben a környezetben legjobban teljesített:</span><ol style="margin:4px 0 8px 18px;padding:0">${H.map(o=>`<li><b>${esc(o.x.code||'–')}</b>${o.x.own&&o.x.name?` <span class="ownTag"><span>Saját:</span> <b>${esc(o.x.name)}</b></span>`:''} <span style="${relCol(o.c.rel)}">${relTxt(o.c.rel)}</span> <span class="meta">${o.x.mat?`· <span>${matTxt(o.x.mat)}</span> `:''}· <span>${hybType(o.x.slope).t}</span> · <span>${o.c.n} tábla</span></span></li>`).join('')}</ol></div>`:'<p class="meta">Hibrid-összevetéshez ebben a környezetben még kevés az adat.</p>'}
    ${db?`<div>Tőszám / norma: <b>${fmt(db.lo,dec)}–${fmt(db.hi,dec)}</b> <b>${esc(du||'')}</b> <span class="meta">${dbEnv?'(ebben a környezetben)':'(összes környezet)'}</span></div>`:''}
    ${sb?`<div>Vetésidő: <b>${SOW_BAND[sb.band-1]}</b> <span class="meta">${sbEnv?'(ebben a környezetben)':'(összes környezet)'}</span></div>`:''}
    <p class="meta" style="margin:8px 0 0">Üzemi tapasztalat a hasonló táblákról, nem garancia. Részletek: Statisztika.</p></div>`;}
