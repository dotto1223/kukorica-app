/* ===== Lépésenkénti bemutató a Demó nézetben: kiemeli a fontos részeket és röviden elmagyarázza őket ===== */
const TOUR=[
  {go:()=>{endMode();MOBTAB='map';go('fields');},sel:['#modeSw'],t:'Éles és Demó',d:'Itt vált a két nézet között. A demóban kitalált adatok vannak: nyugodtan kattintgasson, bármit módosíthat, a valódi adatokat nem érinti.'},
  {go:()=>{MOBTAB='map';go('fields');try{fitAll();}catch(e){}},sel:['#map'],t:'A táblák a térképen',d:'Minden tábla a valós határával látszik. A demóban 6 minta tábla van Solt és Harta határában. Új táblát a „+” gombbal vagy az „Új tábla” gombbal vehet fel: ott állva GPS-szel, a térképre koppintva vagy rajzolva.'},
  {go:()=>{MOBTAB='list';go('fields');},sel:['#fieldList .card','#fieldList'],t:'Tábláim',d:'A táblák listája kóddal, területtel és a hiányzó adatok jelzésével. Egy táblára koppintva nyílik meg a tábla adatlapja.'},
  {go:()=>{const f=S.fields.find(x=>x.id==='demo-m1')||S.fields[0];if(f)selectField(f.id,'season');},sel:['#yBar:not([hidden])','#hdrYear:not([hidden])'],t:'Évek',d:'Minden év külön lap. Az évváltóval lapozhat a korábbi évek között: így áll össze a tábla története.'},
  {sel:['#seasonBox .card .grid2.quick','#seasonBox .card'],t:'Mi termett, hogyan vetették',d:'A fő adatok: növény, hibrid, vetés ideje, tőszám és hozam. A csillagos mezők kötelezők. A „További adatok” alatt van a nedvesség, a mérlegjegy és a kelt tőszám. Ebből számol minden statisztika.'},
  {sel:['.gxCard'],t:'Ajánlás hasonló táblák alapján',d:'A program megnézi, milyen termőképességű a tábla, és megmutatja, melyik hibridtípus, tőszám és vetésidő vált be a hasonló táblákon. A hibridek kódnévvel és érési csoporttal szerepelnek, a saját hibridjeit a nevével látja.'},
  {go:()=>go('sat'),sel:['#legendBox','#satBox'],t:'Műholdas elemzés',d:'Több év műholdképe alapján a tábla gyengébb és erősebb foltjai (termőzónák). Ez a változó adagolású vetés és trágyázás alapja lehet.'},
  {go:()=>{endMode();go('stats');},sel:['#statsBox .stats','#statsBox h2'],t:'Közös statisztika',d:'A térség összesített adatai: terület, vetésszerkezet, hozamok. Csak összesítés látszik, név és táblakód nélkül, legalább 5 tábla és 3 termelő adatából.'},
  {sel:['ul.prof'],t:'Térségi gyakorlat',d:'A leggyakoribb tőszám, a szokásos vetésidő és az évjáratok besorolása: mit csinálnak a környék gazdái, és melyik év volt gyenge vagy jó.'},
  {sel:['ul.prof ~ .tw .gxT'],t:'Mi vált be gyenge és jó évben?',d:'Az érési csoportok és a tőszámsávok eredménye évjárat szerint. A vastag szám az oszlop legjobbja. A demóban jól látszik, hogy aszályos évben a ritkább vetés és a korai hibrid nyert, jó évben fordítva.'},
  {go:()=>{MOBTAB='map';go('fields');},sel:['#modeSw [data-mode="live"]'],t:'Vissza az éleshez',d:'Ha kipróbálta, itt vált a saját tábláira. A bemutatót a 🧪 Demó gombra koppintva bármikor újraindíthatja.'}];
let TOUR_I=-1;
function tourVis(sel){for(const s of sel){const els=[...document.querySelectorAll(s)];const e=els.find(x=>{const r=x.getBoundingClientRect();return r.width>4&&r.height>4&&x.offsetParent!==null;});if(e)return e;}return null;}
function tourEnd(){TOUR_I=-1;const o=$('#tourOv');if(o)o.remove();window.removeEventListener('resize',tourPlace);try{localStorage.setItem('tt.tour','1');}catch(e){}}
let TOUR_T=null;function tourStart(){TOUR_I=0;tourShow();clearInterval(TOUR_T);TOUR_T=setInterval(()=>{if(TOUR_I<0){clearInterval(TOUR_T);return;}tourPlace();},600);}
function tourShow(){const st=TOUR[TOUR_I];if(!st)return tourEnd();
  let ov=$('#tourOv');if(!ov){ov=document.createElement('div');ov.id='tourOv';ov.innerHTML='<div class="tourHole"></div><div class="tourCard" role="dialog" aria-live="polite"></div>';document.body.appendChild(ov);window.addEventListener('resize',tourPlace);}
  if(st.go)try{st.go();}catch(e){}
  const card=ov.querySelector('.tourCard');
  card.innerHTML=`<div class="tourTop"><span class="tourN">${TOUR_I+1} / ${TOUR.length}</span><button class="tourX" id="tourX" aria-label="Bezár">✕</button></div>
    <b class="tourT">${esc(st.t)}</b><p class="tourD">${esc(st.d)}</p>
    <div class="tourBtns">${TOUR_I>0?'<button class="btn sm" id="tourBack">← Vissza</button>':'<span></span>'}<button class="btn sm primary" id="tourNext">${TOUR_I===TOUR.length-1?'Kész':'Tovább →'}</button></div>`;
  $('#tourX').onclick=tourEnd;$('#tourNext').onclick=()=>{TOUR_I++;tourShow();};const bk=$('#tourBack');if(bk)bk.onclick=()=>{TOUR_I--;tourShow();};
  // a cél megjelenhet késve (betöltés, nézetváltás): legfeljebb 3 mp-ig keressük
  st._done=false;st._el=null;let tries=0;const find=()=>{if(TOUR_I<0||TOUR[TOUR_I]!==st)return;const el=tourVis(st.sel);if(el||tries>=15){st._el=el;st._done=true;if(el)el.scrollIntoView({block:'center',behavior:'smooth'});setTimeout(tourPlace,el?350:0);}else{tries++;setTimeout(find,200);}};find();}
function tourPlace(){const ov=$('#tourOv');if(!ov||TOUR_I<0)return;const st=TOUR[TOUR_I];const hole=ov.querySelector('.tourHole'),card=ov.querySelector('.tourCard');
  let el=st._el&&document.contains(st._el)?st._el:null;if(!el&&st._done){el=tourVis(st.sel);st._el=el;}const vw=innerWidth,vh=innerHeight;
  if(!el){hole.style.cssText='left:50%;top:40%;width:0;height:0';card.style.cssText=`left:${Math.max(8,(vw-Math.min(360,vw-16))/2)}px;top:${vh*0.3}px`;return;}
  const r=el.getBoundingClientRect(),p=6;const x=Math.max(4,r.left-p),y=Math.max(4,r.top-p),w=Math.min(vw-8,r.width+2*p),h=Math.min(vh-8,r.height+2*p);
  hole.style.cssText=`left:${x}px;top:${y}px;width:${w}px;height:${h}px`;
  const cw=Math.min(360,vw-16);const ch=card.offsetHeight||180;let top=y+h+10;if(top+ch>vh-8)top=y-ch-10;if(top<8)top=Math.max(8,vh-ch-8);
  card.style.cssText=`left:${Math.min(Math.max(8,x),vw-cw-8)}px;top:${top}px;width:${cw}px`;}
