/* ===== Excel-sablon: letöltés kitöltésre, majd visszatöltés a táblákhoz ===== */
const XL_MIME='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const XL_OPTYPE={till:'Talajművelés',fert:'Tápanyag-utánpótlás',spray:'Növényvédelem',irr:'Öntözés',other:'Egyéb'};
const XL_SEASON_COLS=[
  ['code','Táblakód',14],['name','Saját név',18],['settl','Település',14],['fha','Tábla (ha)',10],['year','Év',7],
  ['label','Rész',14],['pha','Rész területe (ha)',11],['crop','Növény',18],['hybrid','Hibrid / fajta',16],['fao','FAO',7],
  ['sowing','Vetés dátuma',13],['density','Tőszám / vetőmag-norma',13],['harvest','Aratás dátuma',13],['moisture','Aratási nedvesség (%)',12],
  ['yieldWet','Hozam (t/ha)',11],['totalT','Összes tonna',11],['src','Hozamadat forrása',26],['notes','Megjegyzés',30],['_fid','_tabla_id',4],['_pid','_resz_id',4],['stand','Kelt tőszám',13],['densUnit','Tőszám egysége',12],['tkm','Ezermagtömeg (g)',12]];
const XL_OP_COLS=[['code','Táblakód',14],['year','Év',7],['date','Dátum',13],['type','Művelet típusa',20],['what','Termék / művelet',30],['amount','Mennyiség',11],['unit','Egység',9],['note','Megjegyzés',30],['_fid','_tabla_id',4],['_oid','_muvelet_id',4]];
let _xlLib=null;async function xlLib(){if(!_xlLib){toast('Excel-modul betöltése…');const m=await import('exceljs');_xlLib=m.default||m;}return _xlLib;}

function xlTargetFields(scope){if(scope==='one'){const f=curField();return f?[f]:[];}return S.fields.slice().sort((a,b)=>String(a.code||'').localeCompare(String(b.code||'')));}
function xlDateOut(s){if(!s)return null;const d=new Date(s+'T12:00:00Z');return isNaN(d)?null:d;}

async function xlBuildTemplate(fields,y0,y1){
  const EX=await xlLib();const wb=new EX.Workbook();wb.creator='kukorica.app';wb.created=new Date();
  const head=(ws,cols,color)=>{ws.columns=cols.map(([k,h,w])=>({key:k,header:k.startsWith('_')?h:T_(h),width:w}));const r=ws.getRow(1);r.font={bold:true,color:{argb:'FFFFFFFF'}};r.fill={type:'pattern',pattern:'solid',fgColor:{argb:color}};r.alignment={wrapText:true,vertical:'middle'};r.height=32;ws.views=[{state:'frozen',xSplit:2,ySplit:1}];
    cols.forEach(([k],i)=>{if(k.startsWith('_'))ws.getColumn(i+1).hidden=true;});};
  const lock=(ws,row,keys,cols)=>keys.forEach(k=>{const c=row.getCell(cols.findIndex(x=>x[0]===k)+1);c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFEFF3EC'}};c.font={color:{argb:'FF555555'}};});
  // Útmutató
  const g=wb.addWorksheet(T_('Útmutató'));g.getColumn(1).width=110;
  ['TÁBLATÖRTÉNET – adatkitöltő sablon','',
   `Készült: ${isoToday()} · ${fields.length} tábla · ${y0}–${y1}`,'',
   'Hogyan töltse ki?',
   '1. Az „Évek” lapon minden tábla minden évéhez van egy sor. A szürke oszlopokat (Táblakód, név, település, terület, év) ne módosítsa – ezek alapján tölti vissza a program az adatokat a megfelelő táblához.',
   '2. Csak azt írja be, amit tud. Az üresen hagyott cella NEM törli a programban már meglévő adatot.',
   '3. Dátum: 2025.04.18 vagy 2025-04-18 formában (vagy Excel-dátumként). Számoknál tizedesvessző és -pont is jó.',
   '4. Ha egy táblán egy évben több hibrid / fajta volt: másolja le az év sorát, írjon új nevet a „Rész” oszlopba (pl. „DKC 5092 rész”) és adja meg a „Rész területe (ha)” értékét.',
   '5. A „Műveletek” lapra soronként egy műveletet írjon (talajművelés, trágyázás, permetezés, öntözés). A Táblakódot és az évet mindig adja meg.',
   '6. Mentés után a programban: Tábláim → „⬆ Excel betöltése”. Betöltés előtt a program megmutatja, mit fog módosítani, és figyelmeztet a gyanús értékekre.','',
   'Hozam: vagy t/ha (betakarításkori nedvességen), vagy a táblán összesen mért tonna (mérlegjegy) – elég az egyik.',
   'A rejtett oszlopokat (_tabla_id, _resz_id, _muvelet_id) ne törölje – ezek biztosítják a pontos visszatöltést.'].forEach((t0,i)=>{const t=T_(t0);const c=g.getCell(i+1,1);c.value=t;c.alignment={wrapText:true};if(i===0)c.font={bold:true,size:16,color:{argb:'FF2E6B35'}};if(t0==='Hogyan töltse ki?')c.font={bold:true};});
  // Listák (legördülőkhöz)
  const L=wb.addWorksheet('Listák');L.state='veryHidden';
  CROPS.forEach((c,i)=>L.getCell(i+1,1).value=cropDisp(c));Object.values(SRC_LABEL).slice(1).forEach((c,i)=>L.getCell(i+1,2).value=T_(c));Object.values(XL_OPTYPE).forEach((c,i)=>L.getCell(i+1,3).value=T_(c));
  const dv=(ws,col,list,n)=>{for(let r=2;r<=n;r++)ws.getCell(r,col).dataValidation={type:'list',allowBlank:true,showErrorMessage:false,formulae:[list]};};
  // Évek
  const ws=wb.addWorksheet(T_('Évek'));head(ws,XL_SEASON_COLS,'FF3F8A4C');
  fields.forEach(f=>{for(let y=y1;y>=y0;y--){const se=f.seasons&&f.seasons[y];const parts=se&&se.parts.length?se.parts:[null];
    parts.forEach(p=>{const row=ws.addRow({code:f.code||'',name:f.name&&f.name!==f.code?f.name:'',settl:f.settlement||'',fha:+num(f.areaHa||0).toFixed(2),year:y,
      label:p?(p.label==='Egész tábla'?T_(p.label):p.label):T_('Egész tábla'),pha:p&&parts.length>1?+(partArea(f,p)||0).toFixed(2):null,crop:cropDisp(p?.crop||''),hybrid:p?.hybrid||'',fao:num(p?.fao),
      sowing:xlDateOut(p?.sowing),density:num(p?.density),harvest:xlDateOut(p?.harvest),moisture:num(p?.moisture),yieldWet:num(p?.yieldWet),totalT:num(p?.totalT),
      src:p&&p.src?T_(SRC_LABEL[p.src]||''):'',notes:p?.notes||'',stand:num(p?.stand),densUnit:p&&(p.density||p.crop)?densUnit(p):'',tkm:num(p?.tkm),_fid:f.id,_pid:p?(p.label==='Egész tábla'?p.id+'@whole':p.id):'@whole'});
      lock(ws,row,['code','name','settl','fha','year'],XL_SEASON_COLS);});}});
  const nS=Math.max(ws.rowCount+200,300);
  ['sowing','harvest'].forEach(k=>ws.getColumn(k).numFmt='yyyy.mm.dd');
  dv(ws,XL_SEASON_COLS.findIndex(c=>c[0]==='crop')+1,`Listák!$A$1:$A$${CROPS.length}`,nS);
  dv(ws,XL_SEASON_COLS.findIndex(c=>c[0]==='src')+1,`Listák!$B$1:$B$${Object.keys(SRC_LABEL).length-1}`,nS);
  ws.autoFilter={from:'A1',to:{row:1,column:XL_SEASON_COLS.length-2}};
  // Műveletek
  const wo=wb.addWorksheet(T_('Műveletek'));head(wo,XL_OP_COLS,'FF6B5A2E');
  fields.forEach(f=>{for(let y=y1;y>=y0;y--){const se=f.seasons&&f.seasons[y];(se?se.ops:[]).slice().sort((a,b)=>String(a.date).localeCompare(String(b.date))).forEach(o=>{
    const w=o.type==='till'?o.kind:o.type==='irr'?'Öntözés':o.type==='other'?o.desc:o.product;const am=o.type==='till'?o.depth:o.type==='irr'?o.mm:o.type==='spray'?o.dose:o.amount;const un=o.type==='till'?(o.depth?'cm':''):o.type==='irr'?'mm':o.unit;
    wo.addRow({code:f.code||'',year:y,date:xlDateOut(o.date),type:T_(XL_OPTYPE[o.type]||'Egyéb'),what:o.type==='till'?T_(w||''):(w||''),amount:num(am),unit:un||'',note:o.note||'',_fid:f.id,_oid:o.id});});}});
  if(wo.rowCount<2)fields.slice(0,1).forEach(f=>wo.addRow({code:f.code||'',year:y1}));
  wo.getColumn('date').numFmt='yyyy.mm.dd';dv(wo,4,`Listák!$C$1:$C$5`,Math.max(wo.rowCount+300,400));
  return await wb.xlsx.writeBuffer();
}

function xlTemplateDialog(){
  const one=curField();const yEnd=new Date().getMonth()>=8?THIS_YEAR:THIS_YEAR-1;
  modal(`<h2>📊 Excel-sablon kitöltéshez</h2>
  <p class="help">A sablonban minden táblához és évhez van egy sor (a már rögzített adatokkal előre kitöltve). Az Excelben kitöltheti a vetést, hibridet, tőszámot, aratást, hozamot és a műveleteket, majd a „⬆ Excel betöltése” gombbal visszatöltheti – a program a táblakód alapján a megfelelő táblához írja.</p>
  <div class="grid2"><div><label class="f">Évektől</label><input class="input" id="xlY0" inputmode="numeric" value="${yEnd-4}"></div><div><label class="f">Évig</label><input class="input" id="xlY1" inputmode="numeric" value="${yEnd}"></div></div>
  ${one?`<label class="f" style="margin-top:10px">Táblák</label><select class="input" id="xlScope"><option value="all">Összes táblám (${S.fields.length})</option><option value="one">Csak: ${esc(fieldLabel(one))}</option></select>`:''}
  <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn" id="xlC">Mégse</button><button class="btn primary" id="xlOk">⬇ Letöltés</button></div>`);
  $('#xlC').onclick=closeModal;
  $('#xlOk').onclick=async()=>{let y0=parseInt($('#xlY0').value),y1=parseInt($('#xlY1').value);if(!(y0>=1990&&y1<=THIS_YEAR+1&&y0<=y1)){toast('Adjon meg érvényes évkört (1990–'+(THIS_YEAR+1)+').');return;}
    if(y1-y0>15)y0=y1-15;const fields=xlTargetFields($('#xlScope')?$('#xlScope').value:'all');if(!fields.length){toast('Még nincs tábla.');return;}
    const btn=$('#xlOk');btn.disabled=true;btn.textContent='Készül…';
    try{const buf=await xlBuildTemplate(fields,y0,y1);closeModal();await offerFile(`tablatortenet_sablon_${isoToday()}.xlsx`,buf,XL_MIME);}
    catch(e){console.warn(e);toast('A sablon nem készült el: '+(e.message||e));btn.disabled=false;btn.textContent='⬇ Letöltés';}};
}

/* --- beolvasás --- */
function xlCellVal(c){let v=c&&c.value;if(v==null)return '';if(typeof v==='object'){if(v instanceof Date)return v;if(v.result!=null)v=v.result;else if(v.richText)v=v.richText.map(t=>t.text).join('');else if(v.text!=null)v=v.text;else if(v.hyperlink)v=v.text||'';}return typeof v==='string'?v.trim():v;}
function xlDate(v,year){if(v===''||v==null)return '';if(v instanceof Date&&!isNaN(v))return v.toISOString().slice(0,10);
  if(typeof v==='number'&&v>20000&&v<80000){const d=new Date(Date.UTC(1899,11,30)+v*864e5);return d.toISOString().slice(0,10);}
  const s=String(v).trim().replace(/\s+/g,'');let m=s.match(/^(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})\.?$/);if(m)return xlIso(+m[1],+m[2],+m[3]);
  m=s.match(/^(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{4})\.?$/);if(m)return xlIso(+m[3],+m[2],+m[1]);
  m=s.match(/^(\d{1,2})[.\-\/](\d{1,2})\.?$/);if(m&&year)return xlIso(+year,+m[1],+m[2]);return null;}
function xlIso(y,m,d){if(m<1||m>12||d<1||d>31)return null;const t=new Date(Date.UTC(y,m-1,d));if(t.getUTCMonth()!==m-1)return null;return t.toISOString().slice(0,10);}
function xlNum(v){if(v===''||v==null)return '';if(typeof v==='number')return v;const pn=parseNumHU(v);if(pn!=null)return pn;const s=String(v).replace(/\s| /g,'').replace(',','.').replace(/[^0-9.\-]/g,'');const n=parseFloat(s);return isNaN(n)?null:n;}
function xlCrop(v){if(!v)return '';const s=String(v).trim();const hit=CROPS.find(c=>c.toLowerCase()===s.toLowerCase()||cropDisp(c).toLowerCase()===s.toLowerCase());if(hit)return hit;
  const al={'kukorica':'Kukorica','tengeri':'Kukorica','napraforgo':'Napraforgó','napraforgó':'Napraforgó','búza':'Őszi búza','buza':'Őszi búza','őszi búza':'Őszi búza','árpa':'Őszi árpa','repce':'Őszi káposztarepce','szója':'Szója','szoja':'Szója'};return al[s.toLowerCase()]||s;}
const XL_YIELD_RANGE={'Kukorica':[1,20],'Napraforgó':[0.5,6],'Őszi búza':[1,13],'Őszi árpa':[1,12],'Tavaszi árpa':[1,10],'Őszi káposztarepce':[0.5,7],'Szója':[0.5,6],'Tritikálé':[1,11],'Rozs':[1,9],'Silókukorica':[15,80],'Csemegekukorica':[5,35]};

async function xlReadFile(file){
  const EX=await xlLib();const wb=new EX.Workbook();await wb.xlsx.load(await file.arrayBuffer());
  const sh=n=>wb.getWorksheet(n)||wb.getWorksheet(T_(n))||wb.worksheets.find(w=>w.name.toLowerCase()===n.toLowerCase());const ws=sh('Évek')||wb.worksheets.find(w=>w.state!=='veryHidden'&&w.getRow(1).values.includes('_tabla_id')&&w.getRow(1).values.includes('_resz_id')),wo=sh('Műveletek')||wb.worksheets.find(w=>w.getRow(1).values.includes('_muvelet_id'));if(!ws&&!wo)throw new Error('Ez nem a Táblatörténet sablonja (hiányzik az „Évek” lap).');
  const colMap=(sheet,cols)=>{const m={};sheet.getRow(1).eachCell((c,i)=>{const h=String(xlCellVal(c)).toLowerCase().trim();const hit=cols.find(x=>x[1].toLowerCase()===h||T_(x[1]).toLowerCase()===h);if(hit)m[hit[0]]=i;});return m;};
  const rowsOf=(sheet,cols)=>{if(!sheet)return[];const m=colMap(sheet,cols);cols.forEach(([k],i)=>{if(!m[k]&&String(xlCellVal(sheet.getRow(1).getCell(i+1)))!=='')m[k]=i+1;});const out=[];sheet.eachRow((r,i)=>{if(i===1)return;const o={_row:i};cols.forEach(([k])=>{o[k]=m[k]?xlCellVal(r.getCell(m[k])):'';});if(Object.entries(o).some(([k,v])=>k!=='_row'&&v!==''&&v!=null))out.push(o);});return out;};
  const L=wb.getWorksheet('Listák');const lists={crop:{},src:{},op:{}};
  if(L){CROPS.forEach((c,i)=>{const v=String(xlCellVal(L.getCell(i+1,1))).toLowerCase();if(v)lists.crop[v]=c;});
    Object.keys(SRC_LABEL).slice(1).forEach((k,i)=>{const v=String(xlCellVal(L.getCell(i+1,2))).toLowerCase();if(v)lists.src[v]=k;});
    Object.keys(XL_OPTYPE).forEach((k,i)=>{const v=String(xlCellVal(L.getCell(i+1,3))).toLowerCase();if(v)lists.op[v]=k;});}
  return{seasons:rowsOf(ws,XL_SEASON_COLS),ops:rowsOf(wo,XL_OP_COLS),lists};
}

function xlPlan(data){
  const byCode={},byId={};S.fields.forEach(f=>{if(f.code)byCode[String(f.code).toUpperCase()]=f;byId[f.id]=f;});
  const P={changes:[],newParts:[],ops:[],warn:[],err:[],touched:new Set()};
  const findF=r=>(r._fid&&byId[r._fid])||byCode[String(r.code||'').trim().toUpperCase()];
  data.seasons.forEach(r=>{const at=`Évek ${r._row}. sor`;const f=findF(r);if(!f){P.err.push(r.code?`${at}: ismeretlen táblakód „${r.code}” – ez a tábla nincs a fiókjában.`:`${at}: hiányzik a táblakód.`);return;}
    const y=parseInt(r.year);if(!(y>=1990&&y<=THIS_YEAR+1)){P.err.push(`${at} (${f.code||f.name}): hiányzó vagy hibás év.`);return;}
    const v={};const fl=f.code||f.name||'tábla';const w=m=>P.warn.push(`${at} (${fl} ${y}): ${m}`);
    if(r.crop!=='')v.crop=(data.lists&&data.lists.crop[String(r.crop).trim().toLowerCase()])||xlCrop(r.crop);if(v.crop&&!CROPS.includes(v.crop))w(`a „${v.crop}” növénynév nincs a listában – így mentjük.`);
    if(r.hybrid!==''){v.hybrid=normHybrid(r.hybrid);if(!isKnownHybrid(v.hybrid)){const sim=similarHybrid(v.hybrid);v.hybridReview=true;w(sim?`a „${v.hybrid}” hibrid/fajta ismeretlen – talán „${sim}”? Így mentjük, az admin felülvizsgálja.`:`új hibrid/fajta név: „${v.hybrid}” – az admin felülvizsgálja.`);}}
    const fao=xlNum(r.fao);if(fao!=='')if(fao==null||fao<50||fao>900)w(`a FAO-szám (${r.fao}) nem értelmezhető, kihagyjuk.`);else v.fao=String(Math.round(fao));
    const so=xlDate(r.sowing,y);if(so===null)w(`a vetés dátuma (${r.sowing}) nem értelmezhető, kihagyjuk.`);else if(so){v.sowing=so;const sy=+so.slice(0,4);if(sy<y-1||sy>y)w(`a vetés dátuma (${so}) nem illik a ${y}. évhez.`);}
    const ha=xlDate(r.harvest,y);if(ha===null)w(`az aratás dátuma (${r.harvest}) nem értelmezhető, kihagyjuk.`);else if(ha){v.harvest=ha;if(+ha.slice(0,4)!==y)w(`az aratás dátuma (${ha}) nem a ${y}. évre esik.`);}
    if(v.sowing&&v.harvest&&v.harvest<=v.sowing)w('az aratás a vetés előtt van – ellenőrizze.');
    const cropNow=v.crop||(f.seasons&&f.seasons[y]&&f.seasons[y].parts[0]&&f.seasons[y].parts[0].crop)||'';
    let du='';if(r.densUnit!==''&&r.densUnit!=null){const t=String(r.densUnit).toLowerCase().replace(/\s/g,'').replace('m2','m²');du=DENS_UNITS.find(u=>u===t||T_(u).toLowerCase().replace(/\s/g,'')===t)||'';if(!du)w(`ismeretlen tőszám-egység: „${r.densUnit}”, az alapértelmezettet használjuk.`);else v.densUnit=du;}
    const unit=du||densUnitDef(cropNow);
    let de=xlNum(r.density);if(de===null)w(`a tőszám (${r.density}) nem szám, kihagyjuk.`);else if(de!==''){if(unit==='mag/ha'&&de>0&&de<300){w(`a tőszámot (${de}) ezerben értelmeztük: ${Math.round(de*1000)} mag/ha.`);de=de*1000;}v.density=String(unit==='mag/ha'?Math.round(de):+(+de).toFixed(1));}
    let sd=xlNum(r.stand);if(sd===null)w(`a kelt tőszám (${r.stand}) nem szám, kihagyjuk.`);else if(sd!==''&&sd!=null){if(unit==='mag/ha'&&sd>0&&sd<300){w(`a kelt tőszámot (${sd}) ezerben értelmeztük: ${Math.round(sd*1000)} tő/ha.`);sd=sd*1000;}v.stand=String(unit==='mag/ha'?Math.round(sd):+(+sd).toFixed(1));}
    const tk=xlNum(r.tkm);if(tk===null)w(`az ezermagtömeg (${r.tkm}) nem szám, kihagyjuk.`);else if(tk!==''&&tk!=null){if(tk<1||tk>1000)w(`szokatlan ezermagtömeg: ${tk} g.`);v.tkm=String(tk);}
    if(sowReq(cropNow)&&(r.density===''||r.density==null)&&(r.hybrid!==''||r.sowing!==''||r.yieldWet!=='')&&!(f.seasons&&f.seasons[y]&&f.seasons[y].parts.some(q=>q.density)))w('a tőszám / vetőmag-norma kötelező – kérjük, pótolja.');
    const mo=xlNum(r.moisture);if(mo===null)w('a nedvesség nem szám, kihagyjuk.');else if(mo!==''){if(mo<5||mo>40)w(`szokatlan aratási nedvesség: ${mo}%.`);v.moisture=String(mo);}
    const yw=xlNum(r.yieldWet);if(yw===null)w('a hozam nem szám, kihagyjuk.');else if(yw!==''){let val=yw;if(val>100){w(`a hozamot (${yw}) kg/ha-nak értelmeztük: ${(val/1000).toFixed(2)} t/ha.`);val=val/1000;}v.yieldWet=String(+val.toFixed(3));const c=v.crop||(f.seasons&&f.seasons[y]&&f.seasons[y].parts[0]&&f.seasons[y].parts[0].crop);const rg=XL_YIELD_RANGE[c];if(rg&&(val<rg[0]||val>rg[1]))w(`a ${String(val).replace('.',',')} t/ha hozam szokatlan ${c} esetén – ellenőrizze.`);}
    const tt=xlNum(r.totalT);if(tt===null)w('az összes tonna nem szám, kihagyjuk.');else if(tt!=='')v.totalT=String(tt);
    if(r.src!==''){const k=(data.lists&&data.lists.src[String(r.src).trim().toLowerCase()])||Object.keys(SRC_LABEL).find(k=>SRC_LABEL[k].toLowerCase()===String(r.src).toLowerCase()||T_(SRC_LABEL[k]).toLowerCase()===String(r.src).toLowerCase());if(k)v.src=k;else w(`ismeretlen hozamforrás: „${r.src}”, kihagyjuk.`);}
    if(r.notes!=='')v.notes=String(r.notes);
    let pid=String(r._pid||'');let label=String(r.label||'').trim()||'Egész tábla';if(pid.endsWith('@whole')){label='Egész tábla';pid=pid.slice(0,-6);}if(label.toLowerCase()===T_('Egész tábla').toLowerCase())label='Egész tábla';const pha=xlNum(r.pha);
    if(!Object.keys(v).length&&!(pha>0))return;
    P.changes.push({f,y,pid,label,pha:pha>0?pha:null,v,row:r._row});P.touched.add(f.id);});
  data.ops.forEach(r=>{const at=`Műveletek ${r._row}. sor`;const f=findF(r);if(!f){P.err.push(r.code?`${at}: ismeretlen táblakód „${r.code}”.`:`${at}: hiányzik a táblakód.`);return;}
    const y=parseInt(r.year)||(()=>{const d=xlDate(r.date);return d?+d.slice(0,4):NaN;})();if(!(y>=1990&&y<=THIS_YEAR+1)){P.err.push(`${at} (${f.code||f.name}): hiányzó év.`);return;}
    const typ=(data.lists&&data.lists.op[String(r.type||'').trim().toLowerCase()])||Object.keys(XL_OPTYPE).find(k=>XL_OPTYPE[k].toLowerCase()===String(r.type||'').toLowerCase()||T_(XL_OPTYPE[k]).toLowerCase()===String(r.type||'').toLowerCase());if(!typ){if(r.what||r.amount)P.err.push(`${at}: hiányzó vagy ismeretlen művelettípus.`);return;}
    const d=xlDate(r.date,y);if(d===null){P.warn.push(`${at}: a dátum (${r.date}) nem értelmezhető – dátum nélkül mentjük.`);}
    const am=xlNum(r.amount);const o={type:typ,date:d||'',note:r.note?String(r.note):'',parts:['all']};const W=String(r.what||'').trim();const U=String(r.unit||'').trim();
    if(typ==='till'){o.kind=TILLAGE.find(t=>t.toLowerCase()===W.toLowerCase()||T_(t).toLowerCase()===W.toLowerCase())||W||'Egyéb';if(am)o.depth=String(am);}
    else if(typ==='fert'){const fd=FERT.find(x=>x.n.toLowerCase()===W.toLowerCase())||FERT.find(x=>W&&x.n.toLowerCase().includes(W.toLowerCase()));o.product=fd?fd.n:W;if(!fd&&W)P.warn.push(`${at}: a „${W}” műtrágya nincs a listában – a hatóanyag-számításhoz a programban adja meg az összetételt.`);if(am!=='')o.amount=String(am??'');o.unit=U||(fd&&fd.unit)||'kg/ha';}
    else if(typ==='spray'){o.product=W;if(am!=='')o.dose=String(am??'');o.unit=U||'l/ha';}
    else if(typ==='irr'){if(am!=='')o.mm=String(am??'');}
    else o.desc=W;
    P.ops.push({f,y,oid:r._oid||'',o,row:r._row});P.touched.add(f.id);});
  return P;
}

function xlApply(P){let nP=0,nC=0,nO=0,nOu=0;
  P.changes.forEach(c=>{const se=season(c.f,c.y,true);let p=c.pid&&se.parts.find(x=>x.id===c.pid);
    if(!p)p=se.parts.find(x=>(x.label||'').toLowerCase()===c.label.toLowerCase());
    if(!p&&se.parts.length===1&&!se.parts.some(x=>x.crop||x.hybrid||x.sowing)&&c.label.toLowerCase()==='egész tábla')p=se.parts[0];
    if(!p){p=newPart(c.label,c.pha,null);se.parts.push(p);nP++;}
    if(c.pha&&!p.geometry&&se.parts.length>1)p.areaHa=c.pha;
    Object.assign(p,c.v);if(c.v.crop)p.cropSrc='excel';nC++;});
  P.ops.forEach(x=>{const se=season(x.f,x.y,true);let o=x.oid&&se.ops.find(q=>q.id===x.oid);
    if(!o)o=se.ops.find(q=>q.type===x.o.type&&q.date===x.o.date&&(q.product||q.kind||q.desc||'')===(x.o.product||x.o.kind||x.o.desc||''));
    if(o){Object.entries(x.o).forEach(([k,v])=>{if(k!=='parts'&&v!==''&&v!=null)o[k]=v;});nOu++;}else{se.ops.push(Object.assign({id:uid()},x.o));nO++;}});
  save();renderAll();return{nC,nP,nO,nOu};}

async function xlImportFile(file){
  let data;try{data=await xlReadFile(file);}catch(e){console.warn(e);toast('Az Excel nem olvasható: '+(e.message||e));return;}
  const P=xlPlan(data);const nF=P.touched.size;
  const li=a=>a.slice(0,40).map(t=>`<li>${esc(t)}</li>`).join('')+(a.length>40?`<li>… és még ${a.length-40}</li>`:'');
  modal(`<h2>⬆ Excel betöltése – ellenőrzés</h2>
   <div class="stats"><div><b>${nF}</b><span>tábla</span></div><div><b>${P.changes.length}</b><span>évsor adattal</span></div><div><b>${P.ops.length}</b><span>művelet</span></div></div>
   ${P.err.length?`<div class="notice warn" style="margin-top:10px"><b>Nem tölthető be (${P.err.length})</b><ul style="margin:6px 0 0 18px">${li(P.err)}</ul></div>`:''}
   ${P.warn.length?`<div class="notice" style="margin-top:10px;background:#fff8e6"><b>Ellenőrizendő (${P.warn.length})</b> – ezeket így töltjük be:<ul style="margin:6px 0 0 18px">${li(P.warn)}</ul></div>`:''}
   <p class="help" style="margin-top:10px">Az üres cellák nem törlik a meglévő adatot. A kitöltött mezők felülírják a programban lévő értéket.</p>
   <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn" id="xiC">Mégse</button><button class="btn primary" id="xiOk" ${P.changes.length||P.ops.length?'':'disabled'}>✓ Betöltés</button></div>`);
  $('#xiC').onclick=closeModal;$('#xiOk').onclick=()=>{const r=xlApply(P);closeModal();toast(`Betöltve: ${r.nC} évsor${r.nP?`, ${r.nP} új rész`:''}, ${r.nO} új és ${r.nOu} frissített művelet.`);};
}

function bindExcelIO(){
  const t=$('#btnXlTpl');if(t)t.onclick=xlTemplateDialog;
  const i=$('#xlIn');if(i)i.onchange=e=>{const f=e.target.files&&e.target.files[0];e.target.value='';if(f)xlImportFile(f);};
  const t2=$('#btnXlTpl2');if(t2)t2.onclick=xlTemplateDialog;
}
bindExcelIO();
