# Demó v3 kiegészítés: 32 repcés háttértábla (repce–búza vetésforgó), 3 repcehibrid, repce-specifikus hatásokkal.
import random, json, datetime
R=random.Random(20261118)
YEARS=list(range(2018,2026))
KSH={'Őszi búza':{2018:5.05,2019:5.18,2020:5.74,2021:5.78,2022:4.46,2023:5.22,2024:5.37,2025:6.14},
 'Őszi káposztarepce':{2018:2.95,2019:3.10,2020:2.65,2021:2.67,2022:2.47,2023:3.52,2024:2.68,2025:3.36}}
SET=['Solt','Harta','Dunapataj','Kalocsa','Dunavecse']
# repcehibrid: (kód, szint, meredekség) – R2 intenzív, R3 stabil (gyenge helyen is tart), R1 közepes
RH=[('R1',1.00,1.00),('R2',1.02,1.35),('R3',0.99,0.70)]
WH=[('W1',1.0,0.85),('W2',1.0,1.2)]
F=[];P=[]
for i in range(41,73):
    own=(i-41)%8; ff=max(0.5,min(1.5,R.gauss(1,0.24)))
    F.append([f'demo-b{i}',own,f'DEMO-B{i}',f'Háttértábla {i}',SET[(own+i)%5],round(R.uniform(10,85),2)])
    off=R.randrange(2)
    for y in YEARS:
        c='Őszi káposztarepce' if (y+off)%2==0 else 'Őszi búza'
        if c=='Őszi káposztarepce':
            h=R.choice(RH)
            sd=datetime.date(y-1,8,15)+datetime.timedelta(days=R.randint(0,38))
            dd=(sd-datetime.date(y-1,8,30)).days
            spen=0.004*max(0,-dd-8)+0.011*max(0,dd-4)          # szept. eleje után gyorsan romlik
            d=round(R.uniform(30,68)); do=60-ff*16; dpen=min(0.35,1.0*((d-do)/38)**2)
            hv=datetime.date(y,7,R.randint(1,20)); m=round(R.uniform(7,10),1); sm=8; du=3
        else:
            h=R.choice(WH)
            sd=datetime.date(y-1,9,28)+datetime.timedelta(days=R.randint(0,40)); dd=(sd-datetime.date(y-1,10,12)).days
            spen=0.005*max(0,dd-10)+0.003*max(0,-dd-10)
            d=round(R.uniform(180,280)/5)*5; do=260-ff*45; dpen=min(0.35,1.1*((d-do)/100)**2)
            hv=datetime.date(y,7,R.randint(5,28)); m=round(R.uniform(12,15),1); sm=13; du=2
        gy=h[1]*(1+(h[2]-1)*(ff-1))
        std=round(KSH[c][y]*ff*gy*(1-dpen)*(1-spen)*R.gauss(1,0.06)/0.93,2)   # nyers; SQL-ben megyei átlagra kalibrálva
        P.append([f'b{i}',y-2000,du,h[0],0,sd.strftime('%y%m%d'),d,hv.strftime('%y%m%d'),m,std,R.choice([0,0,1,2])])
json.dump(F,open('/home/claude/demo/F3.json','w'),ensure_ascii=False,separators=(',',':'))
json.dump(P,open('/home/claude/demo/P3.json','w'),ensure_ascii=False,separators=(',',':'))
print(len(F),len(P),sum(1 for p in P if p[2]==3))
