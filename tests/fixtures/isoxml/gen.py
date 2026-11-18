"""Mesterséges ISO-XML aratási export a teszthez (tests/e2e_import.py).
300 × ~150 m-es tábla Solt környékén, 9 m-es vágószélesség, hozam nyugat→kelet 4→10 t/ha, nedvesség 18,5%.
Futtatás: python3 tests/fixtures/isoxml/gen.py  → aratas.zip ugyanebben a mappában."""
import struct, math, zipfile, datetime, os
lat0, lng0 = 46.70, 19.30
kx = 111320 * math.cos(math.radians(lat0)); ky = 110540
day = (datetime.date(2026, 9, 20) - datetime.date(1980, 1, 1)).days
t = 8 * 3600 * 1000
def rec(x, y, work, yld, moist):
    global t
    la = lat0 + y / ky; ln = lng0 + x / kx
    b = struct.pack('<IH', t, day) + struct.pack('<ii', round(la * 1e7), round(ln * 1e7))
    vals = [(0, 1 if work else 0), (1, 9000 if work else 0), (2, int(yld * 1e5) if work else 0), (3, int(moist * 1e4))]
    b += bytes([len(vals)]) + b''.join(struct.pack('<Bi', i, v) for i, v in vals); t += 1000; return b
out = b''
for k, yy in enumerate(range(5, 150, 9)):
    xs = range(0, 301, 2) if k % 2 == 0 else range(300, -1, -2)
    for x in xs: out += rec(x, yy, True, 4 + 6 * x / 300, 18.5)
    for i in range(5): out += rec(300 if k % 2 == 0 else 0, yy + i * 2, False, 0, 18.5)
here = os.path.dirname(os.path.abspath(__file__))
with zipfile.ZipFile(os.path.join(here, 'aratas.zip'), 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('EXPORT/TASKDATA.XML', '<?xml version="1.0" encoding="UTF-8"?><ISO11783_TaskData VersionMajor="4" VersionMinor="2" DataTransferOrigin="2"><PFD A="PFD-0" C="Kukorica teszt"/><DVC A="DVC-1" B="TEST"><DPD A="2" B="008D" E="Work State"/><DPD A="4" B="0043" E="Working Width"/><DPD A="5" B="00B5" E="Yield Dry Mass Per Area"/><DPD A="6" B="0063" E="Crop Moisture"/></DVC><TSK A="TSK-0" B="teszt" E="PFD-0" G="2"><TLG A="TLG00001"/></TSK></ISO11783_TaskData>')
    z.writestr('EXPORT/TLG00001.XML', '<?xml version="1.0" encoding="UTF-8"?><TIM A="" D="4"><PTN A="" B="" D="15"/><DLV A="008D" C="DET-1"/><DLV A="0043" C="DET-1"/><DLV A="00B5" C="DET-1"/><DLV A="0063" C="DET-1"/></TIM>')
    z.writestr('EXPORT/TLG00001.BIN', out)
    z.writestr('EXPORT/proprietary.cn1/nagy_fajl.dat', b'\0' * 200000)  # gyártói mappa: kihagyandó

# --- Mesterséges vetési ISO-XML: 6 szakasz × 0,75 m (a szélesség a gépleírásban, nem az idősorban),
#     szakaszállapot (DDI 0x00A1), tőszám (DDI 0x000B/0x000C, darab/m² × 0,001), táblanév régi kódlappal (cp1250)
lat0, lng0 = 46.65, 19.40
kx = 111320 * math.cos(math.radians(lat0)); ky = 110540
day = (datetime.date(2026, 4, 18) - datetime.date(1980, 1, 1)).days
t = 7 * 3600 * 1000
def srec(x, y, on, rate):
    global t
    la = lat0 + y / ky; ln = lng0 + x / kx
    b = struct.pack('<IH', t, day) + struct.pack('<ii', round(la * 1e7), round(ln * 1e7))
    cond = (0xFFFFF555 if on else 0xFFFFF000) - (1 << 32)
    vals = [(0, 1), (1, cond), (2, 7000), (3, int(rate * 1000) if on else 0)]
    b += bytes([len(vals)]) + b''.join(struct.pack('<Bi', i, v) for i, v in vals); t += 1000; return b
out = b''
for k, yy in enumerate([2.25 + 4.5 * i for i in range(33)]):
    xs = range(0, 251, 2) if k % 2 == 0 else range(250, -1, -2)
    for x in xs: out += srec(x, yy, True, 7.0 + (0.6 if x > 125 else 0))
    for i in range(4): out += srec(250 if k % 2 == 0 else 0, yy + i, False, 0)
dvc = ('<DVC A="DVC-1" B="TPT"><DET A="DET-2" B="60" C="1" D="Main" E="0" F="0"><DOR A="65"/></DET><DPT A="65" B="0043" C="4500" D="width"/>'
       '<DET A="DET-4" B="70" C="2" D="seed" E="2" F="60"/>'
       + ''.join(f'<DET A="DET-{6+i}" B="{83+6*i}" C="4" D="section {i+1}" E="{4+i}" F="70"><DOR A="{86+6*i}"/></DET><DPT A="{86+6*i}" B="0043" C="750" D="w"/>' for i in range(6))
       + '</DVC>')
with zipfile.ZipFile(os.path.join(here, 'vetes.zip'), 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('TASKDATA/TASKDATA.XML', '<?xml version="1.0" encoding="UTF-8"?><ISO11783_TaskData VersionMajor="3" VersionMinor="0" DataTransferOrigin="2"><XFR A="DVC00000" B="1"/><XFR A="PFD00000" B="1"/><XFR A="TSK00000" B="1"/></ISO11783_TaskData>')
    z.writestr('TASKDATA/DVC00000.XML', '<?xml version="1.0" encoding="UTF-8"?><XFC>' + dvc + '</XFC>')
    z.writestr('TASKDATA/PFD00000.XML', ('<?xml version="1.0" encoding="UTF-8"?><XFC><PFD A="PFD-0" C="Szabó dűlő kukorica" P094_FieldSUID="AAA"/></XFC>').encode('cp1250'))
    z.writestr('TASKDATA/TSK00000.XML', '<?xml version="1.0" encoding="UTF-8"?><XFC><TSK A="TSK-1" B="v" E="PFD-0" P094_FieldSUID="AAA"><TLG A="TLG00001"/></TSK></XFC>')
    z.writestr('TASKDATA/TLG00001.XML', '<?xml version="1.0" encoding="UTF-8"?><TIM A="" D="4"><PTN A="" B=""/><DLV A="008D" C="DET-2"/><DLV A="00A1" C="DET-4"/><DLV A="000B" C="DET-4"/><DLV A="000C" C="DET-4"/></TIM>')
    z.writestr('TASKDATA/TLG00001.BIN', out)

# --- Mesterséges John Deere exportok: aratási CSV (GreenStar-oszlopok) és Operations Center vetési pont-shapefile + metaadat
import shapefile, json, io
lat0, lng0 = 46.60, 19.50
kx = 111320 * math.cos(math.radians(lat0)); ky = 110540
hdr = 'Longitude,Latitude,Field,Dataset,Product,Obj. Id,Time,Duration(s),Area Count,Speed(km/h),Distance(m),Moisture(%),Swth Wdth(m),Pass Num,Yld Mass(Wet)(tonne/ha),Yld Mass(Dry)(tonne/ha),Date'
L = [hdr]; oid = 0
for k, yy in enumerate([3 + 6 * i for i in range(25)]):
    xs = range(0, 201, 2) if k % 2 == 0 else range(200, -1, -2)
    for x in xs:
        oid += 1; y = 5 + 4 * yy / 150
        L.append(f'{lng0 + x / kx:.8f},{lat0 + yy / ky:.8f},Vada Próba,TaskName 9/25/2024 (GreenStar 4 Monitor),DKC 4933,{oid},9/25/2024,1.000,On,7.2,2.0,16.0,6.000,{k+1},{y*1.02:.3f},{y:.3f},9/25/2024')
open(os.path.join(here, 'jd_aratas.csv'), 'w', encoding='cp1250').write('\n'.join(L) + '\n')
# vetés: 8 sor (szakasz) × 0,75 m, soronként külön pontok
w = shapefile.Writer(os.path.join(here, 'jd_vetes'), shapeType=1)
for f, t, a in (('Time','C',40),('Crop','N',10),('AppliedRat','N',18),('SWATHWIDTH','N',18),('DISTANCE','N',18),('SECTIONID','N',10),('TargetRate','N',18),('Variety','C',40),('IsoTime','C',40)):
    w.field(f, t, a, 2 if t == 'N' and f not in ('Crop','SECTIONID') else 0)
import datetime as dt
t0 = dt.datetime(2024, 4, 12, 8, 0, 0)
for k in range(25):
    yy = 3 + 6 * k
    for s in range(8):
        ys = yy - 3 + 0.375 + 0.75 * s
        xs = range(0, 201, 2) if k % 2 == 0 else range(200, -1, -2)
        for i, x in enumerate(xs):
            tt = t0 + dt.timedelta(seconds=k * 120 + i)
            w.point(lng0 + x / kx, lat0 + ys / ky)
            w.record(tt.isoformat(), 34, 70000 + (4000 if x > 100 else 0), 0.75, 2.0, 1000 + s, 70000, 'DKC 4933', tt.isoformat() + '.000Z')
w.close()
open(os.path.join(here, 'jd_vetes.prj'), 'w').write('GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]')
json.dump({"FieldName": "Vada Próba", "Operation": "Seeding", "CropToken": "CORN_EURO", "Product": {"ProductName": "DKC 4933"},
           "DataAttributes": [{"Name": "AppliedRate", "Unit": "seeds1ha-1"}]}, open(os.path.join(here, 'jd_vetes-Deere-Metadata.json'), 'w'))
with zipfile.ZipFile(os.path.join(here, 'jd_vetes.zip'), 'w', zipfile.ZIP_DEFLATED) as z:
    for e in ('.shp', '.shx', '.dbf', '.prj', '-Deere-Metadata.json'):
        z.write(os.path.join(here, 'jd_vetes' + e), 'doc/jd_vetes' + e)
for e in ('.shp', '.shx', '.dbf', '.prj', '-Deere-Metadata.json'): os.remove(os.path.join(here, 'jd_vetes' + e))

# ---- John Deere .jdl napló (szintetikus, a visszafejtett szerkezettel): 200 × 150 m, 6 m munkaszélesség, 2 m/s, ~8 t/ha ----
import struct
def vi(n):
    n &= (1 << 64) - 1; o = b''
    while True:
        b = n & 0x7f; n >>= 7
        if n: o += bytes([b | 0x80])
        else: return o + bytes([b])
def fv(f, v): return vi(f << 3) + vi(v)
def fd(f, v): return vi((f << 3) | 1) + struct.pack('<d', v)
def fb(f, b): return vi((f << 3) | 2) + vi(len(b)) + b
def rec(body): return b'\x01' + struct.pack('<I', len(body)) + body
zzE = lambda n: (n << 1) ^ (n >> 63)
CH = [(101, 10020, 65535, 1e7, -210.0, b'unitless'), (102, 10021, 65535, 1e7, -210.0, b'unitless'), (103, 12001, 65535, 1000.0, 0.0, b'm'),
      (104, 510, 87, 1.0, 0.0, b'mg1sec-1'), (105, 6, 99, 1.0, 0.0, b'ppm')]
dic = b''.join(fb(1, fv(1, i) + fv(2, s) + fd(3, off) + fd(4, sc) + fb(5, u) + fv(7, ddi)) for i, s, ddi, sc, off, u in CH)
jlat0, jlng0 = lat0 + 0.02, lng0
T, LA, LO = [], [], []; t = 0
for k in range(25):
    yy = 3 + 6 * k; xs = range(0, 201, 2) if k % 2 == 0 else range(200, -1, -2)
    for x in xs:
        T.append(t); LA.append(round((jlat0 + yy / ky + 210) * 1e7)); LO.append(round((jlng0 + x / kx + 210) * 1e7)); t += 1000
    t += 15000
def series(vals, base_t=-500):
    dt = [2 * (T[0] - base_t)] + [2 * (T[i] - T[i - 1]) for i in range(1, len(T))]
    dv = [vals[0]] + [vals[i] - vals[i - 1] for i in range(1, len(vals))]
    return fd(1, 0.0) + fb(2, b''.join(vi(a) for a in dt)) + fb(3, b''.join(vi(zzE(a)) for a in dv)) + fv(12, base_t)
FLW = [round((8 if x < 100 else 9) / 10 * 2 * 6 * 1e6) for x in [((i % 101) * 2) for i in range(len(T))]]
data = [(101, LA), (102, LO), (103, [6000] * len(T)), (104, FLW), (105, [150000] * len(T))]
B = fb(2, b''.join(vi(i) for i, _ in data)) + b''.join(fb(3, series(v)) for _, v in data)
gid = b'{11111111-2222-3333-4444-555555555555}'
meta = fb(13, fb(1, fb(1, gid) + fb(2, 'Jdl próba'.encode()))) + fb(21, fb(1, fv(1, 34) + fb(2, 'Kukorica (európai)'.encode())) + fb(2, fb(1, fb(1, fb(1, gid) + fb(2, b'DKC 4933')))))
jdl = rec(fv(1, 1) + fb(2, dic) + fb(5, meta)) + rec(fv(1, 2) + fb(4, fb(9, B)))
open(os.path.join(here, 'jd_naplo.jdl'), 'wb').write(jdl)
