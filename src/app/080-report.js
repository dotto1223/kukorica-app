/* ================= éves táblajelentés ================= */
function zoneMapDataURL(f,a,scale){
  const G=a.G;scale=scale||4;const W=G.nx*scale,H=G.ny*scale;const cv=document.createElement('canvas');cv.width=W;cv.height=H;const ctx=cv.getContext('2d');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);
  for(let j=0;j<G.ny;j++)for(let i=0;i<G.nx;i++){const z=a.zone[j*G.nx+i];if(!z)continue;const c=ZONE_COL[z-1];ctx.fillStyle=`rgb(${c[0]},${c[1]},${c[2]})`;ctx.fillRect(i*scale,j*scale,scale,scale);}
  const px=ll=>[(ll[1]-G.w)/G.dLng*scale,(G.n-ll[0])/G.dLat*scale];ctx.strokeStyle='#1d2a1f';ctx.lineWidth=2;ctx.beginPath();f.geometry.forEach((ll,i)=>{const [x,y]=px(ll);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.closePath();ctx.stroke();
  // É-nyíl
  ctx.fillStyle='#1d2a1f';ctx.font='bold 14px sans-serif';ctx.fillText('É ↑',6,18);
  return cv.toDataURL('image/png');
}
async function openReport(f){
  if(!f)return;await loadAna(f);const a=ANA[f.id];const y=S.year;const se=season(f,y,false);
  let wx=null;try{const [lat,lng]=centroid(f.geometry);wx=await fetchWeather(lat,lng,y);}catch(e){}
  const years=Object.keys(f.seasons||{}).sort().filter(k=>hasData(f.seasons[k]));
  let h=`<div class="rp-head"><div><div class="rp-k">Táblajelentés</div><h1>${esc(fieldLabel(f))}</h1><div class="meta">${fmt(f.areaHa,2)} ha · kiemelt év: ${y} · készült: ${isoToday()}</div></div><div class="rp-logo">🌱 Táblatörténet</div></div>`;
  // zónák
  h+=`<h2>Termőzónák</h2>`;
  if(a){h+=`<div class="rp-row"><img class="rp-map" src="${zoneMapDataURL(f,a)}" alt="Zónatérkép"><div>
    <table><tr><th>Zóna</th><th>Terület</th><th>Rel. NDVI</th></tr>${[3,2,1,4].filter(z=>a.area[z]).map(z=>`<tr><td><i class="sw" style="background:rgb(${ZONE_COL[z-1].join(',')})"></i> ${ZONE_NAME[z-1]}</td><td>${fmt(a.area[z],1)} ha</td><td>${a.zMean&&a.zMean[z]!=null?fmt(a.zMean[z],2):'–'}</td></tr>`).join('')}</table>
    <p class="meta">Alap: ${a.years.length} év (${a.years.map(x=>x.y).join(', ')}) legzöldebb felhőmentes Sentinel-2 felvétele, a tábla átlagához viszonyítva (1,00 = átlag), az évek átlagából. Zónahatár: gyenge &lt; átlag −5%, erős &gt; átlag +5%. A ${EDGE_M} m-es szegély külön kezelve.</p>
    ${a.homog?`<p class="rp-warn">Homogén tábla: a terület nagy része a táblaátlag ±5%-án belül van (legjobb és leggyengébb 10% közt ${fmt0(a.spread*100)}%).</p>`:`<p>A tábla legjobb és leggyengébb 10%-a közti különbség: <b>${fmt0((a.spread||0)*100)}%</b>.</p>`}
    </div></div>`;h+=zoneYieldHTML(f,a);}
  else h+=`<p class="meta">A termőzóna-elemzés még nem készült el ehhez a táblához.</p>`;
  // évek
  h+=`<h2>Évek összesítése</h2>`;
  if(years.length){h+=`<table><tr><th>Év</th><th>Rész</th><th>Növény</th><th>Hibrid/fajta</th><th>Vetés</th><th>Tőszám</th><th>Aratás</th><th>Nedv. %</th><th>Hozam t/ha</th><th>N kg/ha</th><th>Forrás</th></tr>`+
    years.map(yy=>{const s2=f.seasons[yy];return s2.parts.map(p=>{const yl=calcYield(f,p),n=partNutr(s2,p.id);return `<tr><td>${yy}</td><td>${esc(p.label)}</td><td>${esc(p.crop||'–')}</td><td>${esc(p.hybrid||'–')}</td><td>${esc(p.sowing||'–')}</td><td>${esc(p.density||'–')}</td><td>${esc(p.harvest||'–')}</td><td>${esc(p.moisture||'–')}</td><td><b>${fmt(yl.std,2)}</b></td><td>${n.N?fmt0(n.N):'–'}</td><td>${esc(SRC_LABEL[p.src]||'')}</td></tr>`;}).join('');}).join('')+`</table>`;}
  else h+=`<p class="meta">Még nincs rögzített év.</p>`;
  // kiemelt év műveletei
  if(se&&se.ops.length){h+=`<h2>Műveletek ${y}</h2><table><tr><th>Dátum</th><th>Művelet</th><th>Rész</th><th>Részletek</th></tr>`+se.ops.slice().sort((p,q)=>(p.date||'').localeCompare(q.date||'')).map(o=>{const t=OPTYPES[o.type]||OPTYPES.other;const n=nutrientsOf(o);const pn=(o.parts||['all']).includes('all')?'Egész tábla':(o.parts||[]).map(id=>se.parts.find(p=>p.id===id)?.label).join(', ');
    let d=o.type==='till'?`${esc(o.kind||'')} ${o.depth?esc(o.depth)+' cm':''}`:o.type==='fert'?`${esc(o.custom?o.cname:o.product)} ${esc(o.amount||'')} ${esc(o.unit||'')} → N ${fmt0(n.N)} · P₂O₅ ${fmt0(n.P)} · K₂O ${fmt0(n.K)} kg/ha`:o.type==='spray'?`${esc(o.product||'')} ${esc(o.dose||'')} ${esc(o.unit||'')}`:o.type==='irr'?`${esc(o.mm||'')} mm`:esc(o.desc||'');
    return `<tr><td>${esc(o.date||'–')}</td><td>${t.t}</td><td>${esc(pn)}</td><td>${d}</td></tr>`;}).join('')+`</table>`;}
  // időjárás
  if(wx){const veg=wxStats(wx,`${y}-04-01`,`${y}-09-30`),yr=wxStats(wx,`${y}-01-01`,`${y}-12-31`),jul=wxStats(wx,`${y}-07-01`,`${y}-08-15`),sum=wxStats(wx,`${y}-06-01`,`${y}-08-31`);
    h+=`<h2>Időjárás ${y}</h2><table><tr><th>Éves csapadék</th><th>Ápr–szept csapadék</th><th>Vízmérleg ápr–szept</th><th>Hőösszeg (GDD)</th><th>≥32 °C napok (júl–aug 15)</th><th>Leghosszabb száraz időszak (jún–aug)</th></tr><tr><td>${fmt0(yr.P)} mm</td><td>${fmt0(veg.P)} mm</td><td>${fmt0(veg.bal)} mm</td><td>${fmt0(veg.gdd)} °C</td><td>${jul.h32}</td><td>${sum.maxDry} nap</td></tr></table>`;}
  // indexek
  if(a&&a.latest)h+=`<h2>Legutóbbi felhőmentes felvétel (${a.latest.date})</h2><table><tr>${Object.keys(IDX).map(k=>`<th>${k}</th>`).join('')}</tr><tr>${Object.keys(IDX).map(k=>`<td>${fmt(a.latest.means[k],2)}</td>`).join('')}</tr></table>`;
  // talaj
  const so=f.soil||{samples:[]};if(so.sg||so.samples.length){h+=`<h2>Talaj</h2>`;
    if(so.sg){const g=k=>so.sg.props[k]?so.sg.props[k].v:null;h+=`<p>SoilGrids (250 m, becslés, 0–30 cm): pH ${fmt(g('phh2o'),1)} · agyag ${fmt(g('clay'),0)}% · homok ${fmt(g('sand'),0)}% · humusz ~${fmt(g('soc')!=null?g('soc')*1.724/10:null,1)}% · fizikai féleség: ${esc(usdaTexture(g('sand'),g('silt'),g('clay'))||'–')}${so.sg.wrb&&so.sg.wrb.prob?` · valószínű talajtípus: ${so.sg.wrb.prob.map(([n,p])=>`${esc(WRB_HU[n]||n)} ${p}%`).join(', ')}`:''}</p>`;}
    if(so.samples.length)h+=`<table><tr><th>Dátum</th><th>Zóna</th>${SOIL_FIELDS.map(x=>`<th>${x[1]}</th>`).join('')}<th>Fiz. féleség</th></tr>${so.samples.map(sm=>`<tr><td>${esc(sm.date||'')}</td><td>${sm.zone?ZONE_NAME[sm.zone-1]:'tábla'}</td>${SOIL_FIELDS.map(x=>`<td>${esc(sm[x[0]]||'')}</td>`).join('')}<td>${esc(kaClass(sm.KA))}</td></tr>`).join('')}</table>`;}
  h+=`<p class="rp-foot">Források: Copernicus Sentinel-2 (Element84 Earth Search), Open-Meteo (ERA5), ISRIC SoilGrids, a gazdálkodó saját adatai. A zónák és a becsült értékek tájékoztató jellegűek; döntés előtt terepi ellenőrzés és talajvizsgálat javasolt.</p>`;
  let ov=$('#report');if(!ov){ov=document.createElement('div');ov.id='report';document.body.appendChild(ov);}
  ov.innerHTML=`<div class="rp-bar"><button class="btn primary" id="rpPrint">🖨️ Nyomtatás / PDF</button><button class="btn" id="rpClose">Bezárás</button><span class="meta">iPhone-on: Nyomtatás → a megosztás ikonnal mentse PDF-be.</span></div><div class="rp-page">${h}</div>`;
  ov.style.display='block';document.body.classList.add('rp-open');
  $('#rpClose').onclick=()=>{ov.style.display='none';document.body.classList.remove('rp-open');};
  $('#rpPrint').onclick=()=>{try{window.print();}catch(e){toast('A nyomtatás itt nem érhető el.');}};
}
