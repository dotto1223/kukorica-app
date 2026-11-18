/* ================= util ================= */
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>Math.random().toString(36).slice(2,10);
const num=v=>{if(v===''||v==null)return null;const n=parseFloat(String(v).replace(',','.'));return isNaN(n)?null:n;};
const fmt=(n,d=1)=>n==null||isNaN(n)?'–':Number(n).toLocaleString('hu-HU',{minimumFractionDigits:d,maximumFractionDigits:d});
const fmt0=n=>fmt(n,0);
function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('on');clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove('on'),2800);}
const THIS_YEAR=new Date().getFullYear();
const YEARS=[];for(let y=THIS_YEAR;y>=2015;y--)YEARS.push(y);
const isoToday=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
function addDays(iso,d){const t=new Date(iso+'T12:00:00Z');t.setUTCDate(t.getUTCDate()+d);return t.toISOString().slice(0,10);}
const MONTHS=['jan','feb','márc','ápr','máj','jún','júl','aug','szept','okt','nov','dec'];
