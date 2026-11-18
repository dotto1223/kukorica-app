# Demó adatkészlet v4 (alapja v2): kukoricánál évjárathoz kötött tőszám-optimum (aszályos évben a ritkább vetés jobb),
# FAO-csoport × évjárat kölcsönhatás, életszerű tőszám- és vetésidő-eloszlás.
# Demó adatkészlet v2: a megye-év átlagok a KSH Bács-Kiskun vármegyei termésátlagaihoz igazítva (STADAT 19.1.2.4/5/11/12),
# nagy táblák közti különbség és jól látható technológiai hatások (hibrid × környezet, tőszám, vetésidő).
import random, json, math, uuid, datetime
R=random.Random(20261117)
YEARS=list(range(2018,2026))
KSH={ # Bács-Kiskun, t/ha
 'Kukorica':{2018:7.99,2019:7.27,2020:7.30,2021:5.19,2022:3.81,2023:7.87,2024:4.56,2025:4.25},
 'Őszi búza':{2018:5.05,2019:5.18,2020:5.74,2021:5.78,2022:4.46,2023:5.22,2024:5.37,2025:6.14},
 'Napraforgó':{2018:2.96,2019:2.96,2020:2.84,2021:2.60,2022:2.14,2023:2.83,2024:2.35,2025:2.41},
 'Őszi káposztarepce':{2018:2.95,2019:3.10,2020:2.65,2021:2.67,2022:2.47,2023:3.52,2024:2.68,2025:3.36}}
OWN=[str(uuid.UUID(int=0xD0000000000000000000000000000000+i)) for i in range(1,9)]
SET=['Solt','Harta','Dunapataj','Kalocsa','Dunavecse']
SAMPLES=[('m1','Minta 1','Harta',1.30),('m2','Minta 2','Harta',1.00),('m3','Minta 3','Harta',0.80),('m4','Minta 4','Solt',0.62),('m5','Minta 5','Solt',1.15),('m6','Minta 6','Solt',0.90)]
GEO=json.load(open('/home/claude/demo/fields.json'))
G={g['id']:g['geometry'] for g in GEO}
def ha(g):
    la0=math.radians(sum(p[0] for p in g)/len(g));Rr=6378137
    xy=[(math.radians(b)*Rr*math.cos(la0),math.radians(a)*Rr) for a,b in g]
    return abs(sum(xy[i][0]*xy[(i+1)%len(xy)][1]-xy[(i+1)%len(xy)][0]*xy[i][1] for i in range(len(xy))))/2/1e4
C={'Kukorica':dict(sm=14,hm=(16,25),du='mag/ha',d=(58000,86000),hv=(9,10)),
 'Napraforgó':dict(sm=8,hm=(7,11),du='mag/ha',d=(45000,65000),hv=(9,9)),
 'Őszi búza':dict(sm=13,hm=(12,15),du='kg/ha',d=(180,280),hv=(7,7)),
 'Őszi káposztarepce':dict(sm=8,hm=(7,10),du='mag/m²',d=(30,65),hv=(7,7))}
# hibrid: (név, FAO, szint, meredekség) – meredekség >1: intenzív (jó helyen sokat, gyenge helyen kevesebbet), <1: stabil
H={'Kukorica':[('DEMO 280',280,0.99,0.80),('DEMO 340',340,1.00,0.75),('DEMO 380',380,1.00,0.85),('DEMO 410',410,1.00,1.00),('DEMO 450',450,1.01,1.20),('DEMO 490',490,0.99,1.35),('DEMO 530',530,0.99,1.30)],
 'Napraforgó':[('DEMO N1',None,1.0,0.8),('DEMO N2',None,1.0,1.25),('DEMO N3',None,1.0,1.0)],
 'Őszi búza':[('DEMO W1',None,1.0,0.85),('DEMO W2',None,1.0,1.2)],
 'Őszi káposztarepce':[('DEMO R1',None,1.0,0.85),('DEMO R2',None,1.0,1.2)]}
fields=[]
for k,n,s,ff in SAMPLES:
    g=G['demo-'+k];fields.append(dict(id='demo-'+k,code='DEMO-0'+k[1],nick=n,set=s,ha=round(ha(g),3),own=int(k[1])-1,ff=ff,g=g))
i=0
for o in range(8):
    for j in range(5):
        i+=1;ff=max(0.5,min(1.5,R.gauss(1,0.24)))
        fields.append(dict(id=f'demo-b{i:02d}',code=f'DEMO-B{i:02d}',nick=f'Háttértábla {i}',set=SET[(o+j)%5],ha=round(R.uniform(8,90),2),own=o,ff=ff,g=None))
def dopt(crop,ff):
    if crop=='Kukorica': return 60000+ff*16000      # gyenge helyen ~68e, jó helyen ~80e
    if crop=='Napraforgó': return 46000+ff*8000
    if crop=='Őszi búza': return 260-ff*45          # jó helyen kevesebb vetőmag kell
    return 58-ff*12
YI={y:KSH['Kukorica'][y]/(sum(KSH['Kukorica'].values())/len(YEARS)) for y in YEARS}   # évjárat-index (1 = átlagos év)
HW={'Kukorica':[10,14,18,22,18,10,9]}   # FAO-csoportok gyakorisága: szuperkorai < korai < középérésű a leggyakoribb
rows=[]
for f in fields:
    rot=R.choice([['Kukorica','Kukorica','Őszi búza','Napraforgó'],['Kukorica','Őszi búza','Őszi káposztarepce','Kukorica'],['Kukorica','Napraforgó','Kukorica','Őszi búza']])
    off=R.randrange(4)
    for yi,y in enumerate(YEARS):
        c=rot[(yi+off)%4];cc=C[c]
        h=R.choices(H[c],weights=HW[c])[0] if c in HW else R.choice(H[c])
        dlo,dhi=cc['d'];d=R.uniform(dlo,dhi) if c!='Kukorica' else min(dhi,max(dlo,R.gauss(72000,6000)))
        d=round(d/1000)*1000 if cc['du']=='mag/ha' else (round(d/5)*5 if cc['du']=='kg/ha' else round(d))
        do=dopt(c,f['ff']);rng=dhi-dlo
        if c=='Kukorica': do+=20000*(YI[y]-1)                     # aszályos évben (YI<1) az optimum lejjebb kerül
        dpen=1.1*((d-do)/rng)**2
        if c=='Kukorica' and YI[y]<0.9 and d>do: dpen*=2.4          # aszályban a sűrű állomány különösen sokat veszít
        dpen=min(0.4,dpen)            # ±25% a sávból kb. 7%, a sáv széle 15–25%
        if c in ('Kukorica','Napraforgó'):
            sd=datetime.date(y,4,18)+datetime.timedelta(days=round(max(-17,min(27,R.gauss(0,8.5))))) if c=='Kukorica' else datetime.date(y,4,1)+datetime.timedelta(days=R.randint(0,45))
            dd=(sd-datetime.date(y,4,18)).days
            spen=0.006*max(0,-dd-6)+0.009*max(0,dd-8)   # korai: hideg; késői (máj. eleje után): erős visszaesés
        elif c=='Őszi búza':
            sd=datetime.date(y-1,9,25)+datetime.timedelta(days=R.randint(0,45));dd=(sd-datetime.date(y-1,10,12)).days;spen=0.005*max(0,dd-10)+0.003*max(0,-dd-10)
        else:
            sd=datetime.date(y-1,8,15)+datetime.timedelta(days=R.randint(0,30));dd=(sd-datetime.date(y-1,8,28)).days;spen=0.008*max(0,dd-5)
        gy=h[2]*(1+(h[3]-1)*(f['ff']-1))                 # hibrid × környezet (keresztező reakció)
        if c=='Kukorica': gy*=1+0.6*((h[1]-410)/100)*(YI[y]-1)   # FAO × évjárat: aszályban a korai, jó évben a kései hibrid nyer
        rows.append(dict(f=f,y=y,c=c,h=h,sd=sd,d=d,raw=f['ff']*gy*(1-dpen)*(1-spen)*R.gauss(1,0.06)))
# kalibrálás: kultúránként és évenként a területtel súlyozott átlag = KSH Bács-Kiskun
for c in KSH:
    for y in YEARS:
        rs=[r for r in rows if r['c']==c and r['y']==y]
        if not rs: continue
        m=sum(r['raw']*r['f']['ha'] for r in rs)/sum(r['f']['ha'] for r in rs)
        for r in rs: r['std']=KSH[c][y]*r['raw']/m
parts=[];local={}
for r in rows:
    c=r['c'];cc=C[c];m=round(R.uniform(*cc['hm']),1)
    wet=round(r['std']*(100-cc['sm'])/(100-m),1);std=round(wet*(100-m)/(100-cc['sm']),2)
    y=r['y'];hv=datetime.date(y,cc['hv'][0],R.randint(1,28)) if c!='Kukorica' else datetime.date(y,R.choice([9,10]),R.randint(1,28))
    p=dict(fid=r['f']['id'][5:],y=y,c=c,h=r['h'][0].split(' ')[1],fao=r['h'][1] or 0,sd=r['sd'],d=r['d'],hv=hv,m=m,std=std,wet=wet,src=R.choice([0,0,1,2]))
    parts.append(p)
    if r['f']['g']: local.setdefault(r['f']['id'],[]).append(p)
CR=['Kukorica','Napraforgó','Őszi búza','Őszi káposztarepce']
F=[[f['id'],f['own'],f['code'],f['nick'],f['set'],f['ha']] for f in fields]
P=[[p['fid'],p['y']-2000,CR.index(p['c']),p['h'],p['fao'],p['sd'].strftime('%y%m%d'),p['d'],p['hv'].strftime('%y%m%d'),p['m'],p['std'],p['src']] for p in parts]
json.dump(F,open('/home/claude/demo/F4.json','w'),ensure_ascii=False,separators=(',',':'))
json.dump(P,open('/home/claude/demo/P4.json','w'),ensure_ascii=False,separators=(',',':'))
units=['mag/ha','mag/ha','kg/ha','mag/m²'];srcs=['merleg','naplo','hozamterkep']
js=[]
for f in fields:
    if not f['g']: continue
    se={}
    for p in local[f['id']]:
        se[p['y']]=dict(crop=p['c'],hybrid='DEMO_'+p['h'],fao=str(p['fao'] or ''),sowing=p['sd'].isoformat(),density=str(p['d']),densUnit=units[CR.index(p['c'])],harvest=p['hv'].isoformat(),moisture=str(p['m']),yieldWet=str(p['wet']),src=srcs[p['src']])
    js.append(dict(id=f['id'],code=f['code'],name=f['nick'],settlement=f['set'],county='Bács-Kiskun',geometry=f['g'],seasons=se))
json.dump(js,open('/home/claude/demo/fields4.json','w'),ensure_ascii=False,separators=(',',':'))
# ellenőrzés
import statistics as st
for c in CR:
    for y in YEARS:
        v=[p['std'] for p in parts if p['c']==c and p['y']==y]
        if v: print(c[:5],y,'n',len(v),'átl',round(st.mean(v),2),'min',min(v),'max',max(v),'KSH',KSH[c][y])
for k in ['m1','m2','m3','m4','m5','m6']:
    print(k,[(p['y'],p['c'][:4],p['std']) for p in parts if p['fid']==k][:8])
