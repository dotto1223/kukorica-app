/* ================= Kis súgó: szakkifejezések gazdanyelven, egy „?” gomb mögött ================= */
const HELP={
  region:['Térségi gyakorlat','Mit csinálnak a térség gazdálkodói: a leggyakoribb tőszám, a szokásos vetésidő-ablak és az érési csoportok aránya. Csak összesített szám, legalább 5 tábla és 3 termelő adatából.'],
  yearcls:['Gyenge / átlagos / jó év','Az adott kultúra éveit a térségi átlaghozam szerint három csoportra osztjuk: a leggyengébb harmad (jellemzően aszályos évek), a középső és a legjobb harmad. Így látszik, mi vált be rossz és mi jó évben.'],
  hybcode:['Hibrid-kódnév','A közös statisztikában a hibridek és fajták nem a kereskedelmi nevükkel, hanem állandó kódnévvel szerepelnek (pl. K-417), mellettük az érési csoport (kukoricánál FAO-sáv, más kultúránál a kultúrán belüli korai / közepes / kései harmad) és a reakciótípus. A kód nem a névből készül, a névhez rendelés csak a szerveren van. A saját hibridjeit mindenki a nevével is látja, így össze tudja vetni a hasonló típusú hibridekkel. Pontos FAO-szám nem jelenik meg.'],
  fao:['FAO-szám, érési csoport','A kukoricahibridek tenyészidejét jelző szám: minél nagyobb, annál később érik. Szuperkorai: 300 alatt, korai: 300–399, középérésű: 400–499, kései: 500 felett. Aszályos évben gyakran a korábbi, jó évben a későbbi érésű hibrid hozza többet.'],
  ndvi:['Növényzeti index (NDVI)','Műholdról mért „zöldség”: minél sűrűbb és egészségesebb a növényállomány, annál nagyobb. 0 körül csupasz talaj, 0,8–0,9 zárt, egészséges állomány. A tábla foltjainak összevetésére jó, a hozamot nem méri közvetlenül.'],
  zone:['Zónák','A tábla azon részei, amelyek több év műholdképei alapján rendre gyengébbek vagy erősebbek a tábla átlagánál (5%-nál nagyobb eltéréssel). A változó adagolású vetés és trágyázás alapja lehet.'],
  rel:['A környék átlagához képest','A hozamot az adott év és térség átlagával vetjük össze: +6% azt jelenti, hogy 6%-kal több termett, mint a környék átlaga abban az évben. Így egy aszályos és egy jó év is összevethető.'],
  env:['Környezet: gyenge, közepes, jó','A táblákat három egyforma csoportba soroljuk aszerint, hogy mennyit szoktak teremni a környék és az évjárat átlagához képest. Így a hibrideket hasonló adottságú táblák között hasonlítjuk össze.'],
  type:['Hibridtípus','Intenzív: jó körülmények között az átlagnál jobban emelkedik, gyengében jobban visszaesik. Stabil: gyenge körülmények között is tart, jóban kevésbé emelkedik. Univerzális: az átlaggal együtt mozog.'],
  best10:['Legjobb 10%','Az adott környezetben a táblák legjobb tizedének hozama: ennyit tud a hibrid, ha minden összejön.'],
  fao:['FAO-szám','A kukoricahibrid tenyészidejét jelző szám: minél nagyobb, annál hosszabb tenyészidejű és később érik (pl. 300 körül korai, 500 körül késői).'],
  stdm:['Szabvány-nedvesség','Az a nedvességtartalom, amelyre a hozamot átszámoljuk, hogy a táblák összevethetők legyenek (pl. kukoricánál 14%).'],
  stand:['Kelt tőszám','A kikelt növények száma. Kelés után számolja meg több helyen (pl. 3 × 10 m sorban), és számolja át hektárra. A vetett és a kelt tőszám aránya a kelési arány.']};
function hq(k){return HELP[k]?`<button type="button" class="hq" data-help="${k}" aria-label="Mit jelent?" title="Mit jelent?">?</button>`:'';}
document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('[data-help]');if(!b)return;e.preventDefault();e.stopPropagation();
  const h=HELP[b.dataset.help];if(!h)return;
  if($('#modal').classList.contains('on')){toast(h[0]+': '+h[1]);return;}
  modal(`<h2>${h[0]}</h2><p style="line-height:1.55">${h[1]}</p><div class="row" style="justify-content:flex-end"><button class="btn primary" id="hqOk">Értem</button></div>`);$('#hqOk').onclick=closeModal;},true);
