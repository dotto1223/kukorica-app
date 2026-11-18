"""Táblahatár-import teszt: EOV shapefile ZIP-ben (cp1250, lyukas és kétrészes poligon), külön kijelölt
WGS84 shapefile .prj nélkül, KMZ. A tesztfájlokat a tests/fixtures/import mappa tartalmazza.
Futtatás: npx vite preview --port 4173 (külön), majd: python3 tests/e2e_import.py"""
import asyncio, json, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from sbmock import Mock
from playwright.async_api import async_playwright

FX = os.path.join(os.path.dirname(__file__), 'fixtures', 'import')
FXI = os.path.join(os.path.dirname(__file__), 'fixtures', 'isoxml')
M = Mock()
FAIL = []
def check(cond, msg):
    print(('OK   ' if cond else 'HIBA ') + msg)
    if not cond: FAIL.append(msg)

async def route(r):
    st, body = M.handle(r.request.method, r.request.url.replace('https://rmbfykiroxpjuoawhtoo.supabase.co', 'https://mock.supabase.co'),
                        {k.lower(): v for k, v in r.request.headers.items()}, r.request.post_data)
    await r.fulfill(status=st, body='' if body is None else json.dumps(body), headers={'Content-Type': 'application/json'})
async def blank(r): await r.fulfill(status=204, body='')

async def cards2_click(pg, i):
    c = await pg.query_selector_all('#fieldList .fcard'); await c[i].click(); await pg.wait_for_timeout(150)

async def main():
    errs = []
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': 1200, 'height': 900}, locale='hu-HU')
        await ctx.route('https://rmbfykiroxpjuoawhtoo.supabase.co/**', route)
        for host in ('https://server.arcgisonline.com/**', 'https://tiles.openfreemap.org/**', 'https://tile.openstreetmap.org/**', 'https://nominatim.openstreetmap.org/**'):
            await ctx.route(host, blank)
        await ctx.add_init_script("try{localStorage.setItem('tt.onb','done')}catch(e){}")
        pg = await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('http://localhost:4173/'); await pg.wait_for_timeout(1200)
        await pg.click('#lgTabUp'); await pg.fill('#lgName', 'Import'); await pg.fill('#lgEmail', 'imp@x.hu'); await pg.fill('#lgPw', '12345678')
        await pg.click('#lgGo'); await pg.wait_for_timeout(600); await pg.click('#cnA'); await pg.click('#cnOk'); await pg.wait_for_timeout(900)

        # 1) EOV shapefile ZIP-ben
        await pg.set_input_files('#fileIn', os.path.join(FX, 'eov.zip')); await pg.wait_for_timeout(1200)
        txt = await pg.text_content('#dlg')
        if os.environ.get('DBG'): print('DLG:', txt[:600], errs, await pg.evaluate("[...document.querySelectorAll('.toast')].map(t=>t.innerText).join('|')"))
        check('EOV' in txt, 'ZIP: a vetületet EOV-nek ismeri fel')
        check('Őszi búza dűlő' in txt and 'Kút melletti' in txt, 'ZIP: ékezetes nevek (cp1250) helyesen')
        check('Két rész (1)' in txt and 'Két rész (2)' in txt, 'ZIP: a kétrészes poligonból két tábla')
        check('1 lyuk' in txt, 'ZIP: a lyukat jelzi')
        check(await pg.locator('.giRow').count() == 4, 'ZIP: 4 sor az előnézetben')
        await pg.click('#giOk'); await pg.wait_for_timeout(900)
        st = await pg.evaluate("JSON.parse(localStorage.getItem('tablatortenet.v3'))")
        F = st['fields']
        check(len(F) == 4, f'ZIP: 4 tábla bekerült ({len(F)})')
        f0 = next((f for f in F if f['name'].startswith('Őszi')), None)
        if f0:
            lat, lng = f0['geometry'][0]
            check(abs(lat - 46.80) < 0.0005 and abs(lng - 19.00) < 0.0005, f'ZIP: EOV → WGS84 átszámítás pontos ({lat:.5f}, {lng:.5f})')
            exp = 0.006 * 111.2 * 0.006 * 1.4 * 111.2 * 0.6845 * 100
            check(abs(f0['areaHa'] - exp) / exp < 0.03, f"ZIP: terület rendben ({f0['areaHa']:.2f} ha, várható ~{exp:.2f})")

        # 2) ugyanaz újra: mind ismétlődés, alapból nincs kijelölve
        await pg.set_input_files('#fileIn', os.path.join(FX, 'eov.zip')); await pg.wait_for_timeout(1200)
        check(await pg.locator('.giDup').count() == 4, 'Újra beolvasva: mind a 4 táblát már meglévőként jelzi')
        check(await pg.is_disabled('#giOk'), 'Újra beolvasva: alapból semmi nincs kijelölve')
        await pg.click('#giC'); await pg.wait_for_timeout(300)

        # 3) külön kijelölt shapefile-fájlok, .prj nélkül, UTF-8
        await pg.set_input_files('#fileIn', [os.path.join(FX, n) for n in ('gps.shp', 'gps.dbf', 'gps.shx', 'gps.cpg')]); await pg.wait_for_timeout(1000)
        txt = await pg.text_content('#dlg')
        check('WGS84' in txt and 'Gépes tábla' in txt, 'Külön fájlok: WGS84 a koordinátákból, név a FIELD_NAME oszlopból')
        await pg.click('#giOk'); await pg.wait_for_timeout(600)

        # 4) KMZ
        await pg.set_input_files('#fileIn', os.path.join(FX, 't.kmz')); await pg.wait_for_timeout(1000)
        check('KMZ tábla' in await pg.text_content('#dlg'), 'KMZ: a tábla megjelenik')
        await pg.click('#giOk'); await pg.wait_for_timeout(600)

        # 5) csak .dbf: értelmes hibaüzenet
        await pg.set_input_files('#fileIn', os.path.join(FX, 'gps.dbf')); await pg.wait_for_timeout(800)
        check('.shp fájl hiányzik' in await pg.text_content('#dlg'), 'Csak .dbf: szól, hogy hiányzik a .shp')
        await pg.click('#giX')

        # 6) kombájn ISO-XML (mesterséges): határ a nyomvonalból + hozamtérkép
        IX = os.path.join(os.path.dirname(__file__), 'fixtures', 'isoxml', 'aratas.zip')
        await pg.set_input_files('#fileIn', IX); await pg.wait_for_selector('#giOk', timeout=20000)
        txt = await pg.text_content('#dlg')
        check('Kukorica teszt' in txt and '2026-09-20' in txt, 'ISO-XML: a feladat neve és dátuma megjelenik')
        await pg.click('#giOk'); await pg.wait_for_timeout(1200)
        st = await pg.evaluate("JSON.parse(localStorage.getItem('tablatortenet.v3'))")
        f = next((x for x in st['fields'] if x['name'].startswith('Kukorica_teszt')), None)
        check(f is not None, 'ISO-XML: új tábla a nyomvonalból')
        if f:
            check(4.2 < f['areaHa'] < 5.0, f"ISO-XML: a határ területe ~4,6 ha ({f['areaHa']:.2f})")
            se = f['seasons'].get('2026', {}); Y = se.get('ymap'); p0 = se.get('parts', [{}])[0]
            check(bool(Y) and 6.5 < Y['mean'] < 7.5, f"ISO-XML: hozamtérkép, átlag ~7 t/ha ({Y and Y['mean']})")
            check(p0.get('harvest') == '2026-09-20' and p0.get('crop') == 'Kukorica' and p0.get('moisture') == '18.5', f"ISO-XML: évadat kitöltve ({p0.get('harvest')}, {p0.get('crop')}, {p0.get('moisture')})")
            check(p0.get('yieldStd') is not None and abs(p0['yieldStd'] - Y['mean']) < 0.01, 'ISO-XML: 18,5% nedvességnél a száraz hozam a szabvány-hozamba kerül')
            check('ymap' in await pg.eval_on_selector('#viewSel', 'e=>[...e.options].map(o=>o.value).join()'), 'ISO-XML: a térképnézetek között ott a hozamtérkép')
        # újra: a meglévő táblához rendeli
        await pg.set_input_files('#fileIn', IX); await pg.wait_for_selector('#giOk', timeout=20000)
        sel = await pg.eval_on_selector('.hvT', 'e=>e.value')
        check(f is not None and sel == f['id'], 'ISO-XML újra: a meglévő táblát ajánlja')
        await pg.click('#giC'); await pg.wait_for_timeout(300)

        # 7) vetőgép ISO-XML (mesterséges): szakaszok, tőszám, cp1250 név
        VX = os.path.join(os.path.dirname(__file__), 'fixtures', 'isoxml', 'vetes.zip')
        await pg.set_input_files('#fileIn', VX); await pg.wait_for_selector('#giOk', timeout=20000)
        txt = await pg.text_content('#dlg')
        check('Szabó dűlő kukorica' in txt, 'Vetés: a régi kódlapos táblanév helyesen')
        check('Vetés' in txt and '2026-04-18' in txt, 'Vetés: típus és dátum')
        await pg.click('#giOk'); await pg.wait_for_timeout(1200)
        st = await pg.evaluate("JSON.parse(localStorage.getItem('tablatortenet.v3'))")
        f = next((x for x in st['fields'] if x['name'].startswith('Szabó_dűlő')), None)
        check(f is not None, 'Vetés: új tábla a nyomvonalból')
        if f:
            check(3.4 < f['areaHa'] < 4.2, f"Vetés: terület ~3,7 ha ({f['areaHa']:.2f})")
            se = f['seasons'].get('2026', {}); Y = se.get('smap'); p0 = se.get('parts', [{}])[0]
            check(bool(Y) and 72 < Y['mean'] < 74 and Y['unit'] == 'k/ha', f"Vetés: tőszámtérkép, átlag ~73 ezer mag/ha ({Y and Y['mean']})")
            check(p0.get('sowing') == '2026-04-18' and p0.get('densUnit') == 'mag/ha' and 72000 <= int(p0.get('density') or 0) <= 74000 and p0.get('crop') == 'Kukorica', f"Vetés: évadat ({p0.get('sowing')}, {p0.get('density')} {p0.get('densUnit')}, {p0.get('crop')})")
            check('smap' in await pg.eval_on_selector('#viewSel', 'e=>[...e.options].map(o=>o.value).join()'), 'Vetés: a térképnézetek között ott a vetési térkép')

        # 8) John Deere export mappaként: aratási CSV + vetési pont-shapefile ZIP-ben + egy .jdl napló (kihagyandó)
        import tempfile, shutil
        D = tempfile.mkdtemp(prefix='jd_')
        os.makedirs(os.path.join(D, 'Kukorica')); shutil.copy(os.path.join(FXI, 'jd_aratas.csv'), os.path.join(D, 'Kukorica', 'jd_aratas.csv'))
        shutil.copy(os.path.join(FXI, 'jd_vetes.zip'), os.path.join(D, 'jd_vetes.zip'))
        os.makedirs(os.path.join(D, 'JD-Data', 'log')); open(os.path.join(D, 'JD-Data', 'log', 'x.jdl'), 'wb').write(b'\0' * 100)
        await pg.set_input_files('#dirIn', D); await pg.wait_for_selector('#giOk', timeout=30000)
        txt = await pg.text_content('#dlg')
        check('Vada Próba' in txt and 'Aratás' in txt and 'Vetés' in txt, 'JD mappa: aratás és vetés is megjelenik, ékezetes névvel')
        check('.jdl' in txt, 'JD mappa: a .jdl naplót kihagyja és jelzi')
        await pg.click('#giOk'); await pg.wait_for_timeout(1500)
        st = await pg.evaluate("JSON.parse(localStorage.getItem('tablatortenet.v3'))")
        fs = [x for x in st['fields'] if x['name'].startswith('Vada_Próba')]
        check(len(fs) == 1, f'JD mappa: a vetés és az aratás ugyanarra az új táblára kerül ({len(fs)})')
        if fs:
            f = fs[0]; se = f['seasons'].get('2024', {}); p0 = se.get('parts', [{}])[0]
            check(2.6 < f['areaHa'] < 3.4, f"JD mappa: terület ~3 ha ({f['areaHa']:.2f})")
            check(se.get('ymap') and 6.5 < se['ymap']['mean'] < 7.5, f"JD mappa: hozamtérkép ~7 t/ha ({se.get('ymap',{}).get('mean')})")
            check(se.get('smap') and 71 < se['smap']['mean'] < 73, f"JD mappa: vetési térkép ~72 ezer mag/ha ({se.get('smap',{}).get('mean')})")
            check(p0.get('crop') == 'Kukorica' and p0.get('hybrid') == 'DKC_4933' and p0.get('sowing') == '2024-04-12' and p0.get('harvest') == '2024-09-25' and 71000 <= int(p0.get('density') or 0) <= 73000,
                  f"JD mappa: évadat ({p0.get('crop')}, {p0.get('hybrid')}, {p0.get('sowing')}, {p0.get('harvest')}, {p0.get('density')})")
        shutil.rmtree(D, ignore_errors=True)

        # 9) John Deere .jdl napló (kísérleti olvasó): JD-Data/log/<év_ügyfél._gazdaság._tábla>/ mappában, mellette egy üres napló
        D = tempfile.mkdtemp(prefix='jdl_'); L = os.path.join(D, 'JD-Data', 'log', '2025_Teszt Kft._Teszt Kft._Jdl pr-ba'); os.makedirs(L)
        shutil.copy(os.path.join(FXI, 'jd_naplo.jdl'), os.path.join(L, '2025_09_20_[10_00]_{a1}.jdl'))
        open(os.path.join(L, '2025_09_20_[10_00]_{a2}.jdl'), 'wb').write(b'\x01\x00\x00\x00\x00' * 10)
        await pg.set_input_files('#dirIn', D); await pg.wait_for_selector('#giOk', timeout=30000)
        txt = await pg.text_content('#dlg')
        check('Jdl próba' in txt and 'Aratás' in txt, 'JDL: a naplóból aratás lesz, a tábla neve ékezetesen a naplóból')
        check('kísérleti' in txt, 'JDL: jelzi, hogy kísérleti olvasó')
        check('száraz hozam' in txt and '(nedves)' not in txt, 'JDL: száraz hozam (kultúra + nedvesség a naplóból)')
        await pg.click('#giOk'); await pg.wait_for_timeout(1500)
        st = await pg.evaluate("JSON.parse(localStorage.getItem('tablatortenet.v3'))")
        fs = [x for x in st['fields'] if x['name'].replace('_', ' ').startswith('Jdl próba')]
        check(len(fs) == 1, f'JDL: új tábla jött létre ({len(fs)})')
        if fs:
            f = fs[0]; ym = [se['ymap'] for se in f['seasons'].values() if se.get('ymap')]
            check(2.6 < f['areaHa'] < 3.4, f"JDL: terület ~3 ha ({f['areaHa']:.2f})")
            check(ym and 7.8 < ym[0]['mean'] < 8.8, f"JDL: hozamtérkép ~8,5 t/ha ({ym[0]['mean'] if ym else None})")
            p0 = [se for se in f['seasons'].values() if se.get('ymap')][0]['parts'][0]
            check(p0.get('crop') == 'Kukorica' and p0.get('hybrid') == 'DKC_4933', f"JDL: kultúra és hibrid a naplóból ({p0.get('crop')}, {p0.get('hybrid')})")
        shutil.rmtree(D, ignore_errors=True)

        st = await pg.evaluate("JSON.parse(localStorage.getItem('tablatortenet.v3'))")
        check(len(st['fields']) == 10, f"Összesen 10 tábla ({len(st['fields'])})")

        # 10) több tábla kijelölése és törlése
        await pg.evaluate("document.getElementById('hdrHome').click()"); await pg.wait_for_timeout(400)
        await pg.click('#selOn'); await pg.wait_for_timeout(200)
        cards = await pg.query_selector_all('#fieldList .fcard')
        await cards[0].click(); await pg.wait_for_timeout(150); await cards2_click(pg, 1)
        bar = await pg.inner_text('#selBar')
        check('2 kijelölve' in bar, f'Kijelölés: 2 tábla kijelölve ({bar!r})')
        await pg.click('#selDel'); await pg.wait_for_selector('#cOk'); dtxt = await pg.text_content('#dlg')
        check('2 táblát' in dtxt, 'Kijelölés: a megerősítés a darabszámot mutatja')
        await pg.click('#cOk'); await pg.wait_for_timeout(500)
        st = await pg.evaluate("JSON.parse(localStorage.getItem('tablatortenet.v3'))")
        check(len(st['fields']) == 8, f"Kijelölés: 2 tábla törölve, 8 maradt ({len(st['fields'])})")
        dl = await pg.evaluate("JSON.parse(localStorage.getItem('tt.cloud.deleted')||'[]').length")
        check(dl >= 2, f'Kijelölés: a felhős törlési listára is felkerültek ({dl})')
        check(await pg.query_selector('#selOn') is not None, 'Kijelölés: törlés után kilép a kijelölő módból')

        # 11) letölthető adatok: ékezet nélkül, szóköz helyett alsó vonal (QGIS, ArcGIS, Python)
        import json as _j, re as _re
        async def dl(bid):
            async with pg.expect_download() as d: await pg.evaluate(f"document.getElementById('{bid}').click()")
            v = await d.value; return open(await v.path(), encoding='utf-8-sig').read(), v.suggested_filename
        gj, gn = await dl('btnGeojson'); G = _j.loads(gj)
        vals = [v for ft in G['features'] for v in ft['properties'].values() if isinstance(v, str)]
        check(vals and all(_re.fullmatch(r'[A-Za-z0-9_.,/:+%-]*', v) for v in vals), f"Export GeoJSON: csak ASCII, szóköz nélkül ({[v for v in vals if not _re.fullmatch(r'[A-Za-z0-9_.,/:+%-]*', v)][:3]})")
        check(any(v.startswith('Jdl_proba') for v in vals), 'Export GeoJSON: „Jdl próba” → Jdl_proba')
        cs, cn = await dl('btnCsvSeasons')
        check(not _re.search(r'[^\x00-\x7f]', cs), 'Export CSV: csak ASCII')

        # 12) egyszerű / szakértői nézet és gépi adat útmutató
        await pg.evaluate("localStorage.removeItem('tt.view')"); await pg.reload(); await pg.wait_for_timeout(1500)
        simple = await pg.evaluate("document.body.classList.contains('simple')")
        check(simple, 'Nézet: alapból egyszerű (nem admin)')
        await pg.click('#fieldList .fcard'); await pg.wait_for_timeout(400)
        await pg.click('#tabs .tab[data-t=analysis]'); await pg.wait_for_timeout(300)
        check(not await pg.is_visible('#subtabs [data-s=sat]'), 'Nézet: egyszerűben a Műhold fül rejtve')
        check(await pg.is_visible('#subMore'), 'Nézet: egyszerűben látszik a „＋ Több” gomb')
        await pg.click('#subMore'); await pg.wait_for_timeout(500)
        check(not await pg.evaluate("document.body.classList.contains('simple')") and await pg.is_visible('#subtabs [data-s=sat]'), 'Nézet: „＋ Több” → szakértői nézet, Műhold fül látszik')
        check(await pg.evaluate("localStorage.getItem('tt.view')") == 'expert', 'Nézet: a választás megmarad')
        await pg.evaluate("document.getElementById('hdrHome').click()"); await pg.wait_for_timeout(400)
        await pg.click('details.more summary'); await pg.click('#btnView'); await pg.wait_for_timeout(400)
        check(await pg.evaluate("document.body.classList.contains('simple')") and 'Szakértői' in await pg.inner_text('#btnView'), 'Nézet: Továbbiak → vissza egyszerűre')
        await pg.click('#viewSw [data-view=expert]'); await pg.wait_for_timeout(300)
        check(not await pg.evaluate("document.body.classList.contains('simple')") and 'on' in (await pg.get_attribute('#viewSw [data-view=expert]','class') or ''), 'Nézet: fejléc-kapcsoló → Szakértő')
        await pg.click('#viewSw [data-view=simple]'); await pg.wait_for_timeout(300)
        check(await pg.evaluate("document.body.classList.contains('simple')"), 'Nézet: fejléc-kapcsoló → Egyszerű')
        await pg.click('#btnNew'); await pg.wait_for_selector('#nwMach'); await pg.click('#nwMach'); await pg.wait_for_selector('[data-mg=cnh]')
        check(len(await pg.query_selector_all('[data-mg]')) == 4, 'Útmutató: négy gépcsoport')
        await pg.click('[data-mg=cnh]'); await pg.wait_for_selector('#mgFile')
        gt = await pg.text_content('#dlg')
        check('TASKDATA' in gt and await pg.is_visible('#mgDir'), 'Útmutató: Case IH lépések, mappa- és fájlgomb')
        async with pg.expect_file_chooser() as fc: await pg.click('#mgDir')
        ch = await fc.value; check(ch is not None, 'Útmutató: a gomb megnyitja a mappaválasztót')
        check(not errs, f'nincs JavaScript-hiba {errs}')
        await b.close()
    print('\nSIKERES' if not FAIL else f'\n{len(FAIL)} HIBA'); sys.exit(1 if FAIL else 0)

asyncio.run(main())
