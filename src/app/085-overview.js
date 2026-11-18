/* ================= overview ================= */
function renderOverview(){
  const f=curField(),box=$('#ovBox');if(!f){box.innerHTML='';return;}
  const rows=[];Object.keys(f.seasons||{}).sort().forEach(y=>{const se=f.seasons[y];if(!hasData(se))return;se.parts.forEach(p=>{const yl=calcYield(f,p),n=partNutr(se,p.id);rows.push({y,p,yl,n,a:partArea(f,p)});});});
  if(!rows.length){box.innerHTML=`<h2>${esc(fieldLabel(f))}</h2><div class="empty">Még nincs kitöltött év. Az <b>Évadatok</b> fülön kezdje.</div>`;return;}
  const byY={};rows.forEach(r=>{if(r.yl.std==null)return;const o=byY[r.y]||(byY[r.y]={w:0,a:0,crops:new Set()});o.w+=r.yl.std*r.a;o.a+=r.a;if(r.p.crop)o.crops.add(r.p.crop);});
  const ys=Object.keys(byY).sort();
  let chart='';if(ys.length){const W=460,H=180,pl=30,pb=22,pt=14,pr=6;const vals=ys.map(y=>byY[y].w/byY[y].a);const mx=Math.max(4,...vals)*1.15;const bw=(W-pl-pr)/ys.length;
    chart=`<svg viewBox="0 0 ${W} ${H}" width="100%">`+ys.map((y,i)=>{const v=vals[i],h=v/mx*(H-pb-pt),x=pl+i*bw;const c=[...byY[y].crops][0];return `<rect x="${x+bw*.15}" y="${H-pb-h}" width="${bw*.7}" height="${h}" rx="3" fill="${CROP_COL[c]||'#718096'}"/><text x="${x+bw/2}" y="${H-pb-h-3}" font-size="10" text-anchor="middle">${fmt(v,1)}</text><text x="${x+bw/2}" y="${H-6}" font-size="10" text-anchor="middle" fill="#5f6d61">${y}</text>`;}).join('')+'</svg>';}
  box.innerHTML=`<div class="row" style="justify-content:space-between"><h2 style="margin:0">${esc(fieldLabel(f))} – összesítő</h2><button class="btn sm primary" id="ovRep">📄 Táblajelentés</button></div><p class="help">Hozam szabvány nedvességen, több rész esetén területtel súlyozva.</p>${chart}
  <h3>Évek és részek</h3><div class="tw"><table><tr><th>Év</th><th>Rész</th><th>Növény</th><th>Hibrid</th><th>Vetés</th><th>Tőszám</th><th>Aratás</th><th>Nedv.</th><th>t/ha</th><th>N</th></tr>`+
  rows.map(r=>`<tr><td>${r.y}</td><td>${esc(r.p.label)}</td><td>${esc(r.p.crop||'–')}</td><td>${esc(r.p.hybrid||'–')}</td><td>${esc((r.p.sowing||'–').slice(5))}</td><td>${esc(r.p.density||'–')}</td><td>${esc((r.p.harvest||'–').slice(5))}</td><td>${esc(r.p.moisture||'–')}</td><td><b>${fmt(r.yl.std,2)}</b></td><td>${r.n.N?fmt0(r.n.N):'–'}</td></tr>`).join('')+`</table></div>`;
}
