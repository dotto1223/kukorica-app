/* ===== Telefonos elrendezés: alsó menüsor (Térkép / Tábláim / Statisztika / Fiók), teljes képernyős térkép, alsó lap ===== */
const MOB_MQ=window.matchMedia('(max-width:700px)');
let MOBTAB='map';
const isMob=()=>MOB_MQ.matches;

(function buildMobileUI(){
  const nav=document.createElement('nav');nav.id='bnav';nav.setAttribute('aria-label','Fő menü');
  const I={map:'<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>',list:'<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
    stats:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',account:'<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>'};
  const L2={map:'Térkép',list:'Tábláim',stats:'Statisztika',account:'Fiók'};
  nav.innerHTML=Object.keys(I).map(k=>`<button data-b="${k}"><span class="bi"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[k]}</svg></span><span>${L2[k]}</span></button>`).join('');
  document.body.appendChild(nav);
  nav.querySelectorAll('button').forEach(b=>b.onclick=()=>{endMode();const k=b.dataset.b;closeSheet();
    if(k==='map'){MOBTAB='map';go('fields');}else if(k==='list'){MOBTAB='list';go('fields');}else go(k);});
  const mw=$('#mapWrap');
  const near=document.createElement('button');near.id='nearCard';near.className='nearCard';near.hidden=true;mw.appendChild(near);
  const fab=document.createElement('button');fab.id='fabNew';fab.className='fab';fab.setAttribute('aria-label','Új tábla');fab.title='Új tábla';
  fab.innerHTML='<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
  fab.onclick=()=>$('#btnNew').click();mw.appendChild(fab);
  const sh=document.createElement('div');sh.id='fSheet';sh.className='fSheet';sh.hidden=true;document.body.appendChild(sh);
  sh.addEventListener('click',e=>{if(e.target===sh)closeSheet();});
  const hs=document.createElement('button');hs.id='hdrSearch';hs.className='hbtn';hs.setAttribute('aria-label','Keresés');hs.title='Keresés';
  hs.innerHTML='<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>';
  hs.onclick=()=>{MOBTAB='list';go('fields');setTimeout(()=>{const i=$('#fieldSearch');if(i)i.focus();},60);};
  $('#hdrStats').before(hs);
  // tábla-nézetben kisebb térkép; gombbal nagyítható, határ-szerkesztéskor / rajzoláskor magától nagy
  const mg=document.createElement('button');mg.id='mapGrow';mg.className='mapGrow';mg.setAttribute('aria-label','Térkép nagyítása');mg.title='Térkép nagyítása / kicsinyítése';
  mg.innerHTML='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>';
  mg.onclick=()=>{MAPBIG=!MAPBIG;mobMapSize();};mw.appendChild(mg);
  setInterval(()=>{if(isMob()&&mobView()==='field')mobMapSize();},400);
  MOB_MQ.addEventListener&&MOB_MQ.addEventListener('change',()=>mobApply());
})();
let MAPBIG=false,MAPSZ=null;
function mobMapSize(){const de=document.documentElement;const auto=!!mode||curTab==='border';const big=MAPBIG||auto;
  const k=(big?'b':'s')+(auto?'a':'');if(k===MAPSZ)return;MAPSZ=k;de.classList.toggle('mapBig',big);
  const mg=document.getElementById('mapGrow');if(mg){mg.classList.toggle('on',big);mg.hidden=auto;}
  setTimeout(()=>{try{map.invalidateSize();}catch(e){}flushFit();},220);}

function mobView(){if(!isMob())return '';if(curTab==='fields')return MOBTAB==='list'?'list':'map';if(curTab==='stats')return 'stats';if(curTab==='account')return 'account';return 'field';}
function mobApply(){const de=document.documentElement;const v=mobView();if(v!=='field'){MAPBIG=false;}MAPSZ=null;if(v==='field')mobMapSize();else de.classList.remove('mapBig');de.classList.toggle('mob',isMob());de.dataset.mv=v;
  document.querySelectorAll('#bnav button').forEach(b=>b.classList.toggle('on',b.dataset.b===(v==='field'?'list':v)));
  setTimeout(()=>{try{map.invalidateSize();}catch(e){}flushFit();updateNear();},30);}

/* a térkép-nézetben táblára koppintva alsó lap; máshol közvetlenül megnyílik */
function pickField(id){if(mobView()==='map'){openSheet(id);return;}selectField(id,curTab==='fields'?'season':curTab);}
function openSheet(id){const f=S.fields.find(x=>x.id===id);if(!f)return;const sh=$('#fSheet');
  const ys=Object.keys(f.seasons||{}).filter(y=>hasData(f.seasons[y])).sort();const last=ys[ys.length-1];
  const crops=last?[...new Set(f.seasons[last].parts.map(p=>p.crop).filter(Boolean))].join(' + '):'';
  const a=ANA[f.id];const zones=a?(a.homog?'homogén':`${fmt0((a.spread||0)*100)}% eltérés`):(JOB.cur===f.id?'elemzés fut':'–');const todo=todoOf(f);
  sh.innerHTML=`<div class="sh-card" role="dialog" aria-label="${esc(fieldLabel(f))}"><div class="sh-grip"></div>
    <div class="sh-head"><div><b>${esc(fieldLabel(f))}</b><span>${f.settlement?esc(f.settlement)+' · ':''}${fmt(f.areaHa,1)} ha</span></div>
      <button class="sh-x" id="shX" aria-label="Bezár"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
    <div class="sh-tabs"><button data-g="season" class="on">Évek</button><button data-g="border">Határ</button><button data-g="analysis">Elemzés</button><button data-g="export">Export</button></div>
    <div class="sh-box"><div><span>${last||S.year}</span><b>${esc(crops||'–')}</b></div><div><span>Termőzónák</span><b>${esc(zones)}</b></div>${f.hrsz||f.mepar?`<div><span>${f.hrsz?(fCountry(f)==='hu'?'Helyrajzi szám':'Parcellaszám'):'MePAR blokk'}</span><b>${esc(f.hrsz||f.mepar)}</b></div>`:''}${todo?`<div class="todo"><i></i>${esc(todo)}</div>`:''}</div>
    <button class="btn primary sh-open" data-g="season">Tábla megnyitása</button></div>`;
  sh.hidden=false;requestAnimationFrame(()=>sh.classList.add('on'));
  $('#shX').onclick=closeSheet;sh.querySelectorAll('[data-g]').forEach(b=>b.onclick=()=>{closeSheet();selectField(f.id,b.dataset.g);});}
function closeSheet(){const sh=$('#fSheet');if(!sh||sh.hidden)return;sh.classList.remove('on');sh.hidden=true;}

/* legközelebbi tábla kártya (GPS-hely, ha van, különben a térkép közepe) */
function distKm(a,b){const R=6371,r=Math.PI/180,dl=(b.lat-a.lat)*r,dn=(b.lng-a.lng)*r;const h=Math.sin(dl/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dn/2)**2;return 2*R*Math.asin(Math.sqrt(h));}
function updateNear(){const el=$('#nearCard');if(!el)return;if(mobView()!=='map'||!S.fields.length||mode){el.hidden=true;return;}
  const me=meMarker?meMarker.getLatLng():null;const from=me||map.getCenter();let best=null,bd=1e9;
  S.fields.forEach(f=>{const c=L.polygon(f.geometry).getBounds().getCenter();const d=distKm(from,c);if(d<bd){bd=d;best=f;}});if(!best){el.hidden=true;return;}
  const ds=bd<1?`${Math.round(bd*1000)} m`:`${fmt(bd,bd<10?1:0)} km`;
  el.innerHTML=`<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#2e6b35" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-6-5.5-6-11a6 6 0 0112 0c0 5.5-6 11-6 11z"/><circle cx="12" cy="10" r="2"/></svg>
    <span><span class="nc-l">${me?'Legközelebbi tábla':'Legközelebbi a térkép közepéhez'} · ${ds}</span><b>${esc(fieldLabel(best))}</b></span>`;
  el.hidden=false;el.onclick=()=>{map.fitBounds(L.polygon(best.geometry).getBounds(),{maxZoom:16,paddingBottomRight:[0,90]});openSheet(best.id);};}
map.on('moveend',()=>{if(!meMarker)updateNear();});

/* Fiók nézet (telefonon a menüsorból) */
function renderAcc(){const box=$('#accBox');if(!box)return;const p=PROFILE||{};const signed=SB_ON&&SESS&&!DEMO;
  const st=($('#statusLine')||{}).innerHTML||'';
  const it=(id,ic,l,sub,cls)=>`<button class="accItem ${cls||''}" id="${id}"><span class="ai">${ic}</span><span class="at"><span>${l}</span>${sub?`<small>${sub}</small>`:''}</span><span class="ac" aria-hidden="true">›</span></button>`;
  box.innerHTML=`<div class="accHead"><div class="av">${esc(((p.full_name||p.email||'?').match(/\b\w/g)||['?']).slice(0,2).join('').toUpperCase())}</div>
    <div><b>${esc(DEMO?'🧪 Demó nézet':(p.full_name||p.email||'Nincs bejelentkezve'))}</b><div class="meta">${esc(p.email||'')}${isAdmin()?' · admin':''}</div><div class="meta">${st}</div></div></div>
    <div class="accList">
      ${signed?it('acProf','👤','Profil','név, gazdaság, telefon'):it('acLogin','🔑','Bejelentkezés','')}
      ${it('acLang','🌐',esc((window.I18N&&I18N.langs[I18N.lang])||'Magyar'),'Nyelv · Language','noi')}
      ${it('acXl','📊','Excel-sablon letöltése','kitöltés táblázatban, majd visszatöltés')}
      ${it('acXlIn','⬆','Excel betöltése','A kitöltött sablon visszatöltése')}
      ${it('acBackup','⬇','Teljes mentés (JSON)','')}
      ${it('acImport','⬆','Import (shapefile, KML, GeoJSON, mentés)','')}
      ${it('acPkg','📦','Export csomag (ZIP + shapefile)','')}
      ${signed?it('acPull','↻','Frissítés a szerverről',''):''}
      ${signed?it('acExp','⬇','Adataim letöltése','minden tábla, évadat és a profil egy fájlban'):''}
      ${signed?it('acGdpr','🔒','Adatkezelés','hozzájárulás, tájékoztató'):''}
      ${DEMO?it('acDemo','✅','Vissza az éles nézetre','kilépés a demóból'):it('acDemo','🧪','Demó nézet','kitalált adatokkal, példastatisztikával')}
      ${signed?it('acOut','↪','Kijelentkezés','','danger'):''}
      ${signed?it('acDel','🗑','Fiókom törlése','minden adat végleges törlése','danger'):''}
    </div>`;
  const on=(id,fn)=>{const b=$('#'+id);if(b)b.onclick=fn;};const clickEl=id=>()=>{const e=$('#'+id);if(e)e.click();};
  on('acLogin',()=>loginScreen());on('acLang',()=>langDialog());on('acXl',()=>xlTemplateDialog());on('acXlIn',clickEl('xlIn'));
  on('acBackup',clickEl('btnBackup'));on('acImport',clickEl('fileIn'));on('acPkg',clickEl('btnPkg'));on('acDemo',()=>{DEMO?demoMenu():demoEnterDialog();});
  on('acProf',()=>{userMenu();setTimeout(()=>{const b=$('#umProf');if(b)b.click();},30);});
  on('acGdpr',()=>{userMenu();setTimeout(()=>{const b=$('#umGdpr');if(b)b.click();},30);});
  on('acExp',()=>exportMyData());on('acDel',()=>deleteAccountDialog());
  on('acPull',()=>{userMenu();setTimeout(()=>{const b=$('#umPull');if(b)b.click();},30);});
  on('acOut',()=>{userMenu();setTimeout(()=>{const b=$('#umOut');if(b)b.click();},30);});
  const lb=$('#acLang');if(lb)lb.setAttribute('data-noi18n','');}
