/* ================= Összefoglaló vágólapra (szövegként, elemzéshez) ================= */
function summaryText(f){
  const [la,ln]=centroid(f.geometry);const L=[`TÁBLA: ${f.name} | ${fmt(f.areaHa,2)} ha | középpont ${la.toFixed(5)}, ${ln.toFixed(5)}`];
  const sg=f.soil&&f.soil.sg;if(sg&&sg.props){const v=k=>sg.props[k]&&sg.props[k].v;const fx=(k,d,u)=>v(k)!=null?`${k} ${fmt(v(k),d)}${u}`:'';L.push(('TALAJ (SoilGrids 0–30 cm): '+(sg.wrb&&sg.wrb.name?'WRB '+sg.wrb.name+' | ':'')+[fx('clay',0,'%'),fx('silt',0,'%'),fx('sand',0,'%'),fx('soc',1,' g/kg'),fx('phh2o',1,''),fx('cec',1,''),fx('bdod',2,'')].filter(Boolean).join(', ')));}
  (f.soil&&f.soil.samples||[]).forEach(s=>L.push('TALAJMINTA: '+Object.keys(s).filter(k=>!['id','lat','lng'].includes(k)&&s[k]!==''&&s[k]!=null).map(k=>k+'='+s[k]).join(', ')));
  const a=ANA[f.id];if(a)L.push(`TERMŐZÓNÁK (Sentinel-2, ${a.years.map(y=>y.y).join(',')}): `+[1,2,3,4].filter(z=>a.area[z]).map(z=>`${ZONE_NAME[z-1]} ${fmt(a.area[z],1)} ha (rel. ${a.zMean&&a.zMean[z]!=null?fmt(a.zMean[z],2):'–'})`).join('; ')+` | különbség ${fmt0((a.spread||0)*100)}%${a.homog?' (homogén)':''}`);
  Object.keys(f.seasons||{}).sort().forEach(y=>{const se=f.seasons[y];if(!hasData(se))return;
    se.parts.forEach(p=>{const yl=calcYield(f,p),n=partNutr(se,p.id);L.push(`${y} ${p.label} (${fmt(partArea(f,p),2)} ha): ${p.crop||'?'} ${p.hybrid||''}${p.fao?' FAO'+p.fao:''} | vetés ${p.sowing||'–'} | tőszám ${p.density||'–'} | aratás ${p.harvest||'–'} | nedv. ${p.moisture||'–'}% | hozam ${yl.std!=null?fmt(yl.std,2)+' t/ha szabv.':'–'} | N ${fmt0(n.N)} P2O5 ${fmt0(n.P)} K2O ${fmt0(n.K)} kg/ha${p.src?' | forrás: '+(SRC_LABEL[p.src]||p.src):''}${p.notes?' | '+p.notes:''}`);});
    se.ops.forEach(o=>L.push(`  ${o.date||'?'} ${OPTYPES[o.type]?.t||o.type}: ${o.type==='till'?(o.kind||''):(o.custom?o.cname:(o.product||o.desc||''))} ${o.amount||o.dose||''} ${o.unit||''} ${o.method||o.target||''}${o.depth?' '+o.depth+' cm':''}${o.mm?' '+o.mm+' mm':''}${o.note?' – '+o.note:''}`.replace(/\s+/g,' ')));});
  if(f.notes)L.push('MEGJEGYZÉS: '+f.notes);
  return L.join('\n');}
async function copySummary(){const f=curField();if(!f)return toast('Válasszon táblát.');
  const t='Az alábbi a kukorica.app-ból exportált tábla-előzmény. Kérem, elemezd (hozamtrend, korlátozó tényezők, javaslatok a következő évre):\n\n'+summaryText(f);
  try{await navigator.clipboard.writeText(t);toast('Összefoglaló vágólapra másolva');}
  catch(e){modal(`<h2>Összefoglaló</h2><p class="help">Jelölje ki és másolja:</p><textarea class="input" style="height:260px;font-size:12px">${esc(t)}</textarea><div class="row" style="justify-content:flex-end;margin-top:10px"><button class="btn" id="clC">Bezár</button></div>`);$('#clC').onclick=closeModal;}}
