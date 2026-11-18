/* ================= Első lépések: 3 lépéses, kihagyható vezetés =================
   1) első tábla  2) első évadat (növény, hibrid, vetés, tőszám, hozam)  3) első eredmény (műholdas elemzés) */
function onbGet(k){try{return localStorage.getItem('tt.onb'+k);}catch(e){return null;}}
function onbSet(k,v){try{localStorage.setItem('tt.onb'+k,v);}catch(e){}}
function onbHasSeason(){return S.fields.some(f=>Object.values(f.seasons||{}).some(se=>(se.parts||[]).some(p=>p.crop)));}
function onbStep(){if(onbGet('')==='done')return 0;if(!S.fields.length)return 1;if(!onbHasSeason())return 2;if(!onbGet('3'))return 3;return 0;}
function onbFirstSeasonField(){return S.fields.find(f=>Object.values(f.seasons||{}).some(se=>(se.parts||[]).some(p=>p.crop)))||S.fields[0];}
function renderOnb(){let el=$('#onb');const st=onbStep();const show=st&&!DEMO&&curTab==='fields'&&!mode;
  if(!show){if(el)el.remove();return;}
  if(!el){el=document.createElement('div');el.id='onb';el.className='onb';$('#mapWrap').appendChild(el);}
  const steps=[
    {t:'Vegye fel az első tábláját',d:'Koppintson a tábla közepére a térképen, a program megrajzolja a határt. Rajzolhat kézzel is, vagy betöltheti Excelből.',b:'Első tábla felvétele'},
    {t:'Írja be, mi volt rajta',d:'Elég az öt fő adat: növény, hibrid, vetés napja, tőszám, hozam. A többi ráér később.',b:'Évadat kitöltése'},
    {t:'Nézze meg az eredményt',d:'A program műholdképekből megmutatja a tábla jobb és gyengébb foltjait, és összeveti a környék átlagával.',b:'Eredmény megnyitása'}];
  const s=steps[st-1];
  el.innerHTML=`<div class="onbTop"><span class="onbStep">Első lépések · ${st}/3</span><button class="onbX" id="onbX" title="Bezárás" aria-label="Bezárás">✕</button></div>
    <b class="onbT">${s.t}</b><p class="onbD">${s.d}</p>
    <div class="onbDots">${[1,2,3].map(i=>`<i class="${i<st?'done':i===st?'on':''}"></i>`).join('')}</div>
    <div class="row" style="gap:8px;justify-content:space-between;align-items:center"><a href="#" id="onbSkip" class="meta">Most nem</a><button class="btn primary" id="onbGo">${s.b}</button></div>`;
  $('#onbX').onclick=$('#onbSkip').onclick=e=>{e.preventDefault();onbSet('','done');renderOnb();};
  $('#onbGo').onclick=()=>{
    if(st===1){$('#btnNew').click();return;}
    const f=st===2?S.fields[0]:onbFirstSeasonField();if(!f)return;
    if(st===3){onbSet('3','1');onbSet('','done');}
    el.remove();selectField(f.id,st===2?'season':'sat');};}
