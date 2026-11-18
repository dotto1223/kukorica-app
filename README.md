# kukorica.app

A Táblatörténet kukoricára szabott változata. **Közös Supabase-adatbázist és fiókot használ**
a Táblatörténettel: ugyanazok a táblák látszanak mindkettőben, de itt
- a növényválasztóban elöl a kukorica (szem-, siló-, csemege), a többi növény csak elővetemény,
- a vetésdátum és a tőszám csak kukoricánál kötelező,
- a statisztika, a régiós összevetés és a „Hasonló táblák alapján” ajánló csak kukoricát mutat,
- a Tábláim listán „🌽 Volt rajta kukorica” gyorsszűrő van.

A változat beállításai: `src/app/012-variant.js`. A más növényű évek adatai nem törlődnek.

Telepítés után a Supabase-ben (Authentication → URL Configuration → Redirect URLs) fel kell venni
az új címet (pl. `https://kukorica-app.pages.dev/**`), különben a regisztráció/jelszó-visszaállító
levél a Táblatörténetre visz vissza.

---

# Táblatörténet (alap)

Tábla-előzmények rögzítése termelőknek és partnerlátogatáshoz: táblahatár, évenkénti
vetés–tápanyag–aratás adatok, automatikus műholdas, időjárási és talajelemzés, termőzónák,
export. Adatbázis és bejelentkezés: Supabase (EU, Frankfurt).

## Felépítés

```
index.html            oldalváz: Tábláim lista + egy tábla (Határ · Évek · Elemzés · Export)
src/main.js           belépési pont, külső könyvtárak (Leaflet, proj4, GeoTIFF, PMTiles)
src/styles.css        megjelenés
src/config.json       Supabase cím és publishable kulcs (nyilvános, nem titok)
src/app/*.js          az alkalmazás logikája, témánként – a build sorrendben összefűzi
  015-util …035-model   segédfüggvények, tárolás, törzsadatok, geometria, számítások
  040-map               térkép, rajzolás, felosztás
  050-navigation        oldalak, fülek, fejléc, Új tábla, Határ fül, fiók menü
  055-fields-pane       Tábláim kártyák, határ módosítása
  060-season-pane       Évek: részek, növény, vetés, műveletek, aratás, hozam
  065-weather           Open-Meteo időjárás, GDD, vízmérleg
  070-satellite         Sentinel-2 indexek, termőzónák
  075-soil              SoilGrids + saját talajminták
  080-report            nyomtatható táblajelentés
  095-boundary-suggest  határjavaslat (Sentinel-2 élkeresés + Fields of the World)
  100-account-supabase  bejelentkezés, hozzájárulás, szinkron, GDPR
  110…120               szöveges összefoglaló, ZIP/shapefile export, kijuttatási térkép
supabase/schema.sql   adatbázis, jogosultságok (RLS), függvények
public/               ikonok, manifest, service worker, adatkezelési tájékoztató
tests/                böngészős végponttól-végpontig teszt (Supabase-utánzattal)
```

## Fejlesztés

```
npm install
npm run dev        # http://localhost:5173
npm run build      # → dist/
```

Teszt (Python + Playwright): `npm run build && npx vite preview --port 4173 & python3 tests/e2e_basic.py`

## Élesítés

Cloudflare Pages a GitHub-tárolóból: build parancs `npm run build`, kimeneti mappa `dist`.
Minden `main` ágra küldött változás automatikusan élesedik.

## Fordítások (i18n)
- Nyelvek: hu (forrás), en, de, sr (latin), hr, sl, sk, cs, pl, ro, uk.
- Szótár: `i18n-src/*.txt`, soronként `magyar|en|de|sr|hr|sl|sk|cs|pl|ro|uk`. A számok helyén `{#}` állhat.
- `npm run build` előtt a `scripts/i18n.mjs` készíti a `public/i18n/<nyelv>.json` fájlokat.
- A felület magyar szövegeit a `src/i18n.js` megjelenítéskor cseréli; az adatok (növény, hibrid) egységes, magyar kulccsal tárolódnak.
- Ami nincs a szótárban, magyarul marad – új szöveg esetén elég egy sort hozzáadni.
