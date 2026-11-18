/* ================= reference data ================= */
/* vetésdátum és tőszám / vetőmag-norma minden kultúránál kötelező (G×E×M statisztikához); évelő és ugar kivétel */
const NO_SOW_REQ=['Lucerna','Ugar'];
function sowReq(c){return !!c&&!NO_SOW_REQ.includes(c)&&(!CORN_ONLY||isCorn(c));}
function reqMissing(p){if(!sowReq(p.crop))return [];const m=[];if(!p.sowing)m.push('vetés dátuma');if(!p.density)m.push('tőszám');return m;}
/* tőszám egysége kultúránként: soros kultúrák mag/ha, repce mag/m², kalászosok és a többi kg/ha (átírható) */
const DENS_UNITS=['mag/ha','mag/m²','kg/ha'];
const SEED_HA_CROPS=['Kukorica','Silókukorica','Csemegekukorica','Napraforgó','Szója','Cirok'];
function densUnitDef(c){if(SEED_HA_CROPS.includes(c))return 'mag/ha';if(c==='Őszi káposztarepce')return 'mag/m²';return 'kg/ha';}
function densUnit(p){return DENS_UNITS.includes(p.densUnit)?p.densUnit:densUnitDef(p.crop);}
function standUnit(p){return densUnit(p)==='mag/ha'?'tő/ha':'tő/m²';}
/* vetett mag/m² (kg/ha-nál ezermagtömeggel), illetve kelési arány összevethető egységekben */
function seedsM2(p){const d=num(p.density);if(!d)return null;const u=densUnit(p);if(u==='mag/m²')return d;if(u==='mag/ha')return d/10000;const t=num(p.tkm);return t?d*100/t:null;}
function emergencePct(p){const s=num(p.stand);if(!s)return null;if(standUnit(p)==='tő/ha'){const d=num(p.density);return d?s/d*100:null;}const m=seedsM2(p);return m?s/m*100:null;}
const DENS_PH={'mag/ha':'pl. 72000','mag/m²':'pl. 45','kg/ha':'pl. 220'};
const CROPS=['Kukorica','Napraforgó','Őszi búza','Őszi árpa','Tavaszi árpa','Őszi káposztarepce','Szója','Tritikálé','Rozs','Zab','Borsó','Cirok','Lucerna','Csemegekukorica','Silókukorica','Ugar'];
const STD_MOIST={'Kukorica':14,'Csemegekukorica':14,'Silókukorica':null,'Napraforgó':8,'Őszi káposztarepce':8,'Őszi búza':13,'Őszi árpa':13,'Tavaszi árpa':13,'Szója':13,'Tritikálé':13,'Rozs':13,'Zab':13,'Borsó':14,'Cirok':14};
const CROP_COL={'Kukorica':'#d69e2e','Őszi búza':'#b7791f','Napraforgó':'#ecc94b','Őszi káposztarepce':'#9ac43a','Szója':'#48bb78','Őszi árpa':'#a0aec0','Tavaszi árpa':'#cbd5e0','Tritikálé':'#c49a6c','Lucerna':'#38a169','Borsó':'#68d391'};
const PART_COL=['#f6c443','#4fc3f7','#f06292','#81c784','#ba68c8','#ff8a65'];
// Műtrágyák: hatóanyag-tartalom % (közelítő, módosítható). dens: kg/l folyékonyaknál
const FERT=[
 {n:'Ammónium-nitrát (AN 34%)',N:34,P:0,K:0,S:0},
 {n:'Mészammon-salétrom / Pétisó (27% N)',N:27,P:0,K:0,S:0},
 {n:'Karbamid (46% N)',N:46,P:0,K:0,S:0},
 {n:'Ammónium-szulfát (21% N, 24% S)',N:21,P:0,K:0,S:24},
 {n:'Nitrogénoldat UAN 30',N:30,P:0,K:0,S:0,dens:1.30},
 {n:'Nitrogénoldat UAN 32',N:32,P:0,K:0,S:0,dens:1.32},
 {n:'MAP 11-52-0',N:11,P:52,K:0,S:0},
 {n:'DAP 18-46-0',N:18,P:46,K:0,S:0},
 {n:'NPK 15-15-15',N:15,P:15,K:15,S:0},
 {n:'NPK 8-24-24',N:8,P:24,K:24,S:0},
 {n:'Kálium-klorid (60% K₂O)',N:0,P:0,K:60,S:0},
 {n:'Kálium-szulfát (50% K₂O, 18% S)',N:0,P:0,K:50,S:18},
 {n:'Istállótrágya (közelítő, t/ha)',N:0.5,P:0.25,K:0.6,S:0,unit:'t/ha'},
 {n:'Egyéb (saját összetétel)',N:0,P:0,K:0,S:0,custom:true}
];
const SRC_LABEL={'':'– nincs megadva –',merleg:'Mérlegjegy / átvételi bizonylat',hozamterkep:'Hozamtérkép (kalibrált)',naplo:'Napló / számla / nyilvántartás',bemondas:'Gazda bemondása (emlékezetből)',becsles:'Becslés'};
const SRC_CONF={merleg:1,hozamterkep:1,naplo:2,bemondas:3,becsles:3};
const OPENDET=new Set(),OPENMORE=new Set();
/* a „További adatok” blokkban hány mező van kitöltve */
function moreFilled(p){return ['harvest','moisture','totalT','stand','tkm','notes','fao','stdM'].filter(k=>p[k]!=null&&String(p[k]).trim()!=='').length;}
const TILLAGE=['Tarlóhántás','Szántás','Tárcsázás','Kultivátorozás','Középmély lazítás','Mélylazítás','Magágykészítés','Hengerezés','Sorközművelés','Direktvetés (nincs művelés)','Egyéb'];
const OPTYPES={
 till:{t:'Talajművelés',ic:'🚜'},
 fert:{t:'Tápanyag-utánpótlás',ic:'🧪'},
 spray:{t:'Növényvédelem',ic:'💧'},
 irr:{t:'Öntözés',ic:'🌧️'},
 other:{t:'Egyéb',ic:'📝'}
};
