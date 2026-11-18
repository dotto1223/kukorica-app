/* ================= kukorica.app változat ================= */
/* Ugyanazt az adatbázist használja, mint a Táblatörténet, de csak a kukoricára fókuszál:
   a növénylista, a statisztika és a hibrid-összehasonlítás kukoricára szűkül.
   A más növényű évek (elővetemény) megmaradnak és láthatók, az adatok nem törlődnek. */
const APP_NAME='kukorica.app';
const CORN_ONLY=true;
const CORN_CROPS=['Kukorica','Silókukorica','Csemegekukorica'];
const isCorn=c=>CORN_CROPS.includes(c);
