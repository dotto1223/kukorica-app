/* ================= modal helpers ================= */
function modal(html){$('#dlg').innerHTML=html;$('#modal').classList.add('on');}
function closeModal(){$('#modal').classList.remove('on');}
$('#modal').addEventListener('click',e=>{if(e.target.id==='modal')closeModal();});
function ask(title,ph,val,cb){modal(`<h2>${esc(title)}</h2><input class="input" id="askIn" placeholder="${esc(ph)}" value="${esc(val)}"><div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn" id="askC">Mégse</button><button class="btn primary" id="askOk">Mentés</button></div>`);
  const i=$('#askIn');setTimeout(()=>i.focus(),50);const ok=()=>{const v=i.value.trim();closeModal();cb(v);};$('#askOk').onclick=ok;$('#askC').onclick=closeModal;i.onkeydown=e=>{if(e.key==='Enter')ok();};}
function confirmBox(title,text,okLabel,cb){modal(`<h2>${esc(title)}</h2><p class="help">${text}</p><div class="row" style="justify-content:flex-end"><button class="btn" id="cC">Mégse</button><button class="btn primary" id="cOk" style="background:var(--red);border-color:var(--red)">${esc(okLabel)}</button></div>`);$('#cC').onclick=closeModal;$('#cOk').onclick=()=>{closeModal();cb();};}
