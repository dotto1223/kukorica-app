/* ================= weather ================= */
const WX={};
async function getJSON(url,ms=20000){const c=new AbortController();const t=setTimeout(()=>c.abort(),ms);try{const r=await fetch(url,{signal:c.signal});if(!r.ok)throw new Error('HTTP '+r.status);return await r.json();}finally{clearTimeout(t);}}
function cacheGet(k){try{const v=localStorage.getItem('tt.cache.'+k);return v?JSON.parse(v):null;}catch(e){return null;}}
function cacheSet(k,v){try{localStorage.setItem('tt.cache.'+k,JSON.stringify(v));}catch(e){}}
async function fetchWeather(lat,lng,year){
  const k=`wx.${lat.toFixed(2)}.${lng.toFixed(2)}.${year}`;
  const lastArchive=addDays(isoToday(),-6);
  const done=year<THIS_YEAR;const c=cacheGet(k);if(c&&(done||c.fetched===isoToday()))return c;
  const end=done?`${year}-12-31`:lastArchive;
  const vars='temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,et0_fao_evapotranspiration';
  const j=await getJSON(`https://archive-api.open-meteo.com/v1/archive?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&start_date=${year}-01-01&end_date=${end}&daily=${vars}&timezone=Europe%2FBudapest`);
  const d=j.daily;const out={fetched:isoToday(),time:d.time,tmax:d.temperature_2m_max,tmin:d.temperature_2m_min,tmean:d.temperature_2m_mean,p:d.precipitation_sum,et0:d.et0_fao_evapotranspiration,forecast:null};
  if(!done){try{const fj=await getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,et0_fao_evapotranspiration&past_days=7&forecast_days=8&timezone=Europe%2FBudapest`);
      const fd=fj.daily,today=isoToday();
      fd.time.forEach((t,i)=>{if(t>end&&t<today){out.time.push(t);out.tmax.push(fd.temperature_2m_max[i]);out.tmin.push(fd.temperature_2m_min[i]);out.tmean.push(fd.temperature_2m_mean[i]);out.p.push(fd.precipitation_sum[i]);out.et0.push(fd.et0_fao_evapotranspiration[i]);}});
      out.forecast=fd.time.map((t,i)=>({t,tmax:fd.temperature_2m_max[i],tmin:fd.temperature_2m_min[i],p:fd.precipitation_sum[i],pp:fd.precipitation_probability_max[i],w:fd.wind_speed_10m_max[i]})).filter(x=>x.t>=today);
    }catch(e){}}
  cacheSet(k,out);return out;
}
async function fetchClim(lat,lng){
  const k=`clim.${lat.toFixed(1)}.${lng.toFixed(1)}`;const c=cacheGet(k);if(c)return c;
  const j=await getJSON(`https://archive-api.open-meteo.com/v1/archive?latitude=${lat.toFixed(2)}&longitude=${lng.toFixed(2)}&start_date=1995-01-01&end_date=2024-12-31&daily=temperature_2m_mean,precipitation_sum&timezone=Europe%2FBudapest`,40000);
  const P=Array(12).fill(0),T=Array(12).fill(0),n=Array(12).fill(0);const yrs=new Set();
  j.daily.time.forEach((t,i)=>{const m=+t.slice(5,7)-1;yrs.add(t.slice(0,4));P[m]+=j.daily.precipitation_sum[i]||0;T[m]+=j.daily.temperature_2m_mean[i]??0;n[m]++;});
  const ny=yrs.size;const out={p:P.map(v=>v/ny),t:T.map((v,i)=>v/n[i]),years:'1995–2024'};cacheSet(k,out);return out;
}
function wxStats(w,from,to){
  let P=0,ET=0,gdd=0,h32=0,h35=0,dry=0,maxDry=0,n=0,tsum=0;
  w.time.forEach((t,i)=>{if(t<from||t>to)return;n++;const p=w.p[i]||0;P+=p;ET+=w.et0[i]||0;tsum+=w.tmean[i]??0;
    const tx=Math.min(w.tmax[i]??0,30),tn=Math.max(w.tmin[i]??0,10);gdd+=Math.max(0,(tx+tn)/2-10);
    if((w.tmax[i]??0)>=32)h32++;if((w.tmax[i]??0)>=35)h35++;if(p<1){dry++;maxDry=Math.max(maxDry,dry);}else dry=0;});
  return{n,P,ET,bal:P-ET,gdd,h32,h35,maxDry,tavg:n?tsum/n:null};
}
function monthly(w){const P=Array(12).fill(null),T=Array(12).fill(null),c=Array(12).fill(0);w.time.forEach((t,i)=>{const m=+t.slice(5,7)-1;P[m]=(P[m]||0)+(w.p[i]||0);T[m]=(T[m]||0)+(w.tmean[i]??0);c[m]++;});return{P,T:T.map((v,i)=>c[i]?v/c[i]:null),c};}
async function renderWeather(){
  const f=curField(),box=$('#weatherBox');if(!f){box.innerHTML='';return;}
  const [lat,lng]=centroid(f.geometry),y=S.year;
  box.innerHTML=`<h2>${esc(fieldLabel(f))} – időjárás ${y}</h2><p class="help">Napi adatok a tábla középpontjára (Open-Meteo, ERA5-alapú reanalízis, kb. 10–25 km-es rács). Tájékoztató jellegű, nem helyi mérőállomás.</p><div class="meta">Lekérés…</div>`;
  let w,cl;
  try{[w,cl]=await Promise.all([fetchWeather(lat,lng,y),fetchClim(lat,lng).catch(()=>null)]);}
  catch(e){box.innerHTML+=`<div class="notice warn">Az időjárási adatok nem érhetők el (nincs internet, vagy a szolgáltatás nem válaszol). ${esc(e.message||'')}</div>`;return;}
  if(curTab!=='weather'||S.year!==y||curField()!==f)return;
  const se=season(f,y,false);const veg=wxStats(w,`${y}-04-01`,`${y}-09-30`),yr=wxStats(w,`${y}-01-01`,`${y}-12-31`),summer=wxStats(w,`${y}-06-01`,`${y}-08-31`),jul=wxStats(w,`${y}-07-01`,`${y}-08-15`);
  const mo=monthly(w);const climVeg=cl?cl.p.slice(3,9).reduce((a,b)=>a+b,0):null,climYr=cl?cl.p.reduce((a,b)=>a+b,0):null;
  let h=`<h2>${esc(fieldLabel(f))} – időjárás ${y}</h2><p class="help">Napi adatok a tábla középpontjára (Open-Meteo, ERA5-alapú reanalízis, kb. 10–25 km-es rács). Tájékoztató jellegű, nem helyi mérőállomás.${y===THIS_YEAR?` Adatok: ${w.time[w.time.length-1]}-ig.`:''}</p>
  <div class="stats">
    <div><b>${fmt0(yr.P)} mm</b><span>éves csapadék${climYr?` (átlag ${fmt0(climYr)})`:''}</span></div>
    <div><b>${fmt0(veg.P)} mm</b><span>ápr–szept${climVeg?` (átlag ${fmt0(climVeg)})`:''}</span></div>
    <div><b>${fmt0(veg.bal)} mm</b><span>vízmérleg ápr–szept (csapadék − ET₀)</span></div>
    <div><b>${fmt0(veg.gdd)} °C</b><span>hőösszeg ápr–szept (GDD, 10/30 °C)</span></div>
    <div><b>${jul.h32} / ${jul.h35} nap</b><span>≥32 / ≥35 °C júl 1–aug 15</span></div>
    <div><b>${summer.maxDry} nap</b><span>leghosszabb száraz időszak jún–aug (&lt;1 mm)</span></div>
  </div>`;
  if(se&&se.parts.some(p=>p.sowing)){h+=`<h3>Vetéstől aratásig</h3><div class="tw"><table><tr><th>Rész</th><th>Növény</th><th>Időszak</th><th>Csap.</th><th>GDD</th><th>≥32°C</th></tr>`+
    se.parts.filter(p=>p.sowing).map(p=>{const to=p.harvest||w.time[w.time.length-1];const s=wxStats(w,p.sowing,to);return `<tr><td>${esc(p.label)}</td><td>${esc(p.crop||'–')}</td><td>${esc(p.sowing.slice(5))} → ${esc(to.slice(5))}${p.harvest?'':' (eddig)'}</td><td>${fmt0(s.P)} mm</td><td>${fmt0(s.gdd)}</td><td>${s.h32}</td></tr>`;}).join('')+`</table></div>`;}
  h+=`<h3>Havi csapadék (mm)${cl?' – sáv: '+y+', vonal: sokéves átlag '+cl.years:''}</h3>${barChart(mo.P,cl?cl.p:null,'mm','#4a90c2')}
  <h3>Havi középhőmérséklet (°C)</h3>${barChart(mo.T,cl?cl.t:null,'°C','#e07b39',true)}`;
  if(w.forecast&&w.forecast.length){h+=`<h3>Előrejelzés (7 nap)</h3><div class="tw"><table class="fc"><tr><th>Nap</th><th>Max</th><th>Min</th><th>Csap.</th><th>Esély</th><th>Szél max</th></tr>`+
    w.forecast.slice(0,8).map(d=>`<tr><td>${['V','H','K','Sze','Cs','P','Szo'][new Date(d.t+'T12:00').getDay()]} ${d.t.slice(5)}</td><td>${fmt(d.tmax,0)}°</td><td>${fmt(d.tmin,0)}°</td><td>${fmt(d.p,1)} mm</td><td>${d.pp??'–'}%</td><td>${fmt(d.w,0)} km/h</td></tr>`).join('')+`</table></div>`;}
  h+=`<p class="meta" style="margin-top:10px">Adatforrás: Open-Meteo.com (CC BY 4.0), ERA5 / ERA5-Land reanalízis és időjárási modellek.</p>`;
  box.innerHTML=h;
}
function barChart(vals,ref,unit,col,isTemp){
  const W=460,H=170,pl=34,pb=22,pt=10,pr=6;const all=vals.concat(ref||[]).filter(v=>v!=null);
  let mn=isTemp?Math.min(0,...all):0,mx=Math.max(1,...all)*1.12;const sc=v=>H-pb-((v-mn)/(mx-mn))*(H-pb-pt);
  const bw=(W-pl-pr)/12;let s=`<svg viewBox="0 0 ${W} ${H}" width="100%">`;
  const step=(mx-mn)>60?20:(mx-mn)>25?10:5;for(let v=Math.ceil(mn/step)*step;v<=mx;v+=step){s+=`<line x1="${pl}" x2="${W-pr}" y1="${sc(v)}" y2="${sc(v)}" stroke="#eef1ea"/><text x="${pl-5}" y="${sc(v)+4}" font-size="10" text-anchor="end" fill="#8a968c">${v}</text>`;}
  vals.forEach((v,i)=>{const x=pl+i*bw;if(v!=null){const y0=sc(Math.max(0,mn)),y1=sc(v);s+=`<rect x="${x+bw*.15}" y="${Math.min(y0,y1)}" width="${bw*.7}" height="${Math.abs(y0-y1)}" rx="2" fill="${col}"><title>${MONTHS[i]}: ${fmt(v,1)} ${unit}</title></rect>`;}
    s+=`<text x="${x+bw/2}" y="${H-7}" font-size="9.5" text-anchor="middle" fill="#5f6d61">${MONTHS[i]}</text>`;});
  if(ref){let d='';ref.forEach((v,i)=>{if(v==null)return;const x=pl+i*bw+bw/2;d+=(d?'L':'M')+x+','+sc(v);});s+=`<path d="${d}" fill="none" stroke="#1d2a1f" stroke-width="1.5" stroke-dasharray="4 3"/>`;ref.forEach((v,i)=>{if(v!=null)s+=`<circle cx="${pl+i*bw+bw/2}" cy="${sc(v)}" r="2.5" fill="#1d2a1f"/>`;});}
  return s+'</svg>';
}
