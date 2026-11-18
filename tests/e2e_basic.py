"""Alapteszt: regisztráció (mock szerver), tábla rajzolása, évadat, fülek, lista, újratöltés, Éles ⇄ Demó váltás.
Asztali és telefonos méretben fut. Hiba esetén nem nulla kilépési kóddal áll le.
Futtatás: npx vite preview --port 4173 (külön), majd: python3 tests/e2e_basic.py"""
import asyncio, json, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from sbmock import Mock
from playwright.async_api import async_playwright

M = Mock()
FAIL = []
def check(cond, msg):
    print(('OK   ' if cond else 'HIBA ') + msg)
    if not cond: FAIL.append(msg)

async def route(r):
    st, body = M.handle(r.request.method, r.request.url.replace('https://rmbfykiroxpjuoawhtoo.supabase.co', 'https://mock.supabase.co'),
                        {k.lower(): v for k, v in r.request.headers.items()}, r.request.post_data)
    await r.fulfill(status=st, body='' if body is None else json.dumps(body), headers={'Content-Type': 'application/json'})
async def nomi(r): await r.fulfill(json={'address': {'town': 'Solt', 'county': 'Bács-Kiskun vármegye'}})
async def blank(r): await r.fulfill(status=204, body='')

async def run(b, vw, vh, tag, errs):
    mob = vw < 700
    ctx = await b.new_context(viewport={'width': vw, 'height': vh}, locale='hu-HU', is_mobile=mob, has_touch=mob)
    await ctx.route('https://rmbfykiroxpjuoawhtoo.supabase.co/**', route)
    await ctx.route('https://nominatim.openstreetmap.org/**', nomi)
    for host in ('https://server.arcgisonline.com/**', 'https://tiles.openfreemap.org/**', 'https://tile.openstreetmap.org/**'):
        await ctx.route(host, blank)
    # az első lépések kártyája ne takarja a gombokat
    await ctx.add_init_script("try{localStorage.setItem('tt.onb','done')}catch(e){}")
    pg = await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(f'{tag}: {e}'))
    await pg.goto('http://localhost:4173/'); await pg.wait_for_timeout(1200)
    check(await pg.is_visible('#lgTabUp'), f'{tag}: belépőképernyő látszik')
    # regisztráció + hozzájárulás
    await pg.click('#lgTabUp'); await pg.fill('#lgName', 'Teszt ' + tag); await pg.fill('#lgEmail', tag + '@x.hu'); await pg.fill('#lgPw', '12345678')
    await pg.click('#lgGo'); await pg.wait_for_timeout(600)
    await pg.click('#cnA'); await pg.click('#cnOk'); await pg.wait_for_timeout(900)
    check(not await pg.is_visible('#loginGate'), f'{tag}: regisztráció után a belépőképernyő eltűnik')
    # új tábla rajzolással
    if mob:
        # a Tábláim listából indítva is a térképre kell váltania (korábban a lista maradt, és nem lehetett koppintani)
        await pg.click('#bnav [data-b=list]'); await pg.wait_for_timeout(300); await pg.click('#btnNew'); await pg.wait_for_timeout(250)
        await pg.click('#nwAuto'); await pg.wait_for_timeout(500)
        check(await pg.is_visible('#map') and await pg.is_visible('#hintCancel'), f'{tag}: listából „Koppintás a térképen” → a térkép látszik')
        await pg.click('#hintCancel'); await pg.wait_for_timeout(200)
        await pg.click('#bnav [data-b=list]'); await pg.wait_for_timeout(300); await pg.click('#btnNew')
    else: await pg.click('#btnNew')
    await pg.wait_for_timeout(250); await pg.click('#nwDraw'); await pg.wait_for_timeout(300)
    mb = await pg.locator('#map').bounding_box(); cx, cy = mb['x'] + mb['width'] / 2, mb['y'] + mb['height'] / 2
    for dx, dy in [(-80, -50), (80, -50), (80, 50), (-80, 50)]:
        await pg.mouse.click(cx + dx, cy + dy); await pg.wait_for_timeout(120)
    await pg.click('#hintOk'); await pg.wait_for_timeout(300)
    await pg.fill('#askIn', 'Trafó'); await pg.click('#askOk'); await pg.wait_for_timeout(1000)
    title = await pg.inner_text('#hdrTitle')
    check('Trafó' in title, f'{tag}: az új tábla megnyílik ({title.splitlines()[0] if title else "–"})')
    # évadat
    await pg.click('#tabs [data-t="season"]'); await pg.wait_for_timeout(400)
    await pg.select_option('#seasonBox [data-k="crop"]', 'Kukorica'); await pg.wait_for_timeout(300)
    await pg.fill('#seasonBox [data-k="yieldWet"]', '9,5'); await pg.press('#seasonBox [data-k="yieldWet"]', 'Tab'); await pg.wait_for_timeout(500)
    saved = await pg.evaluate("JSON.parse(localStorage['tablatortenet.v3']).fields.map(f=>Object.values(f.seasons).map(s=>s.parts[0].crop+'|'+s.parts[0].yieldWet).join())")
    check(any('Kukorica|9.5' in s for s in saved), f'{tag}: évadat mentve ({saved})')
    # fülek
    await pg.click('#tabs [data-t="analysis"]'); await pg.wait_for_timeout(400)
    check(await pg.evaluate("!!document.querySelector('#subtabs button.on')"), f'{tag}: Elemzés fül nyílik')
    if mob:
        await pg.click('#tabMore'); await pg.wait_for_timeout(250); await pg.click('.moreList [data-g="export"]')
    else:
        await pg.click('#tabs [data-t="export"]')
    await pg.wait_for_timeout(300)
    check(await pg.evaluate("document.querySelector('#p-export')?.classList.contains('on')"), f'{tag}: Export nyílik')
    # lista
    await pg.click('#hdrBack'); await pg.wait_for_timeout(500)
    if mob: await pg.click('#bnav [data-b="list"]'); await pg.wait_for_timeout(300)
    lst = await pg.inner_text('#fieldList')
    check('Trafó' in lst, f'{tag}: a tábla a listában')
    # újratöltés megtartja a nézetet
    await pg.click('#fieldList .card'); await pg.wait_for_timeout(500); await pg.reload(); await pg.wait_for_timeout(1500)
    check(await pg.evaluate("location.hash.startsWith('#/tabla/')") and not await pg.is_visible('#loginGate'), f'{tag}: újratöltés után ugyanott marad, bejelentkezve')
    # szerverre került
    await pg.wait_for_timeout(1500)
    check(any(v.get('nickname') == 'Trafó' for v in M.fields.values()), f'{tag}: a tábla felkerült a szerverre')
    # Éles ⇄ Demó
    check(not await pg.is_visible('#modeSw'), f'{tag}: élesben a Demó kapcsoló nincs a fejlécben')
    await pg.evaluate("document.getElementById('btnDemo').click()"); await pg.wait_for_selector('#dmGo'); await pg.click('#dmGo'); await pg.wait_for_timeout(2500)
    check(await pg.is_visible('#modeSw'), f'{tag}: demóban a kapcsoló látszik (kilépéshez)')
    n = await pg.evaluate("JSON.parse(localStorage['tablatortenet.demo']||'{}').fields?.length||0")
    check(await pg.evaluate("document.documentElement.classList.contains('demo')") and n == 6, f'{tag}: Demó nézet 6 minta táblával')
    if await pg.is_visible('#tourX'): await pg.click('#tourX')
    await pg.click('#modeSw [data-mode="live"]'); await pg.wait_for_timeout(2500)
    live = await pg.evaluate("JSON.parse(localStorage['tablatortenet.v3']).fields.map(f=>f.name)")
    check(not await pg.evaluate("document.documentElement.classList.contains('demo')") and any('Traf' in x for x in live), f'{tag}: vissza élesre, a saját tábla megvan')
    await ctx.close()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox']); errs = []
        for vw, vh, tag in [(1600, 900, 'asztal'), (390, 844, 'telefon')]:
            try: await run(b, vw, vh, tag, errs)
            except Exception as e: check(False, f'{tag}: kivétel: {str(e).splitlines()[0]}')
        check(not errs, f'nincs JavaScript-hiba {errs[:3]}')
        await b.close()
    print(f"\n{'SIKERES' if not FAIL else 'SIKERTELEN: ' + str(len(FAIL)) + ' hiba'}")
    sys.exit(1 if FAIL else 0)
asyncio.run(main())
