'use strict';
// Pio Pio staff dashboard, made for a phone: drivers take deliveries, mark them picked up and delivered, and share
// their position with the customer while driving; kitchen staff move orders through the oven. Dependency-free.

const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const SHOP=window.PP_CORE.SHOP;
const COLOR={received:'var(--st-received)',oven:'var(--st-oven)',ready:'var(--st-done)',out:'var(--st-out)'};
const SIZE={S:'Small',M:'',L:'Large'}; // the current menu has one size (M), so it is not shown
const TARGET_MIN=window.PP_CORE?.TARGET_MIN||20;

// A host page may provide its own backend (PP_BACKEND.staff/login/logout); the default is this site's /api/staff.
const B=window.PP_BACKEND||null;
const S={me:null,admin:false,staff:[],orders:[],skew:0,loaded:false,screen:'loading',
 as:(()=>{try{return localStorage.getItem('pp-staff-as')||''}catch(e){return''}})(),
 geo:{state:'off',watch:null,last:null,sentAt:0,sentPos:null,error:''},sim:false,busy:false};

async function call(op,body={}){
 if(S.as)body={...body,as:S.as}; // only honoured for admins
 if(B)return B.staff(op,body);
 const r=await fetch('/api/staff/'+op,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const data=await r.json().catch(()=>({}));
 if(!r.ok)throw Object.assign(new Error(data.error||'Something went wrong'),{status:r.status});
 return data;
}
function toast(text,err){const t=document.createElement('div');t.className='toast'+(err?' err':'');t.textContent=text;$('toasts').append(t);setTimeout(()=>t.remove(),err?5000:2600)}
const fail=e=>{if(e.status===401){S.me=null;S.screen='login';render()}else toast(e.message,true)};

// ---------- time & distance ----------
const now=()=>Date.now()+S.skew;
const elapsed=ms=>{const s=Math.max(0,Math.floor(ms/1000));return`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`};
const km=(a,b)=>{const r=Math.PI/180,x=(b.lng-a.lng)*r*Math.cos((a.lat+b.lat)/2*r),y=(b.lat-a.lat)*r;return Math.hypot(x,y)*6371};
function tickTimers(){
 document.querySelectorAll('.timer[data-since]').forEach(el=>{const ms=now()-+el.dataset.since,min=ms/60000;
  el.textContent=elapsed(ms);el.classList.toggle('warn',min>=12&&min<TARGET_MIN);el.classList.toggle('late',min>=TARGET_MIN)});
}

// ---------- screens ----------
function renderLogin(){
 return`<div class="center"><div class="logo">pio pio<span>.</span> <small>staff</small></div><h1>Sign in to start your shift</h1>
  ${B?`<p class="muted">Use the account your manager added you with.</p><div class="err" id="err">${esc(S.loginError||'')}</div>
   <button class="btn primary big" data-act="login">Sign in</button>${S.loginError?'<button class="btn ghost" data-act="logout">Use another account</button>':''}`
  :`<form class="pin" id="pin-form"><label class="muted" for="pin">Your PIN</label>
   <input id="pin" type="password" inputmode="numeric" pattern="[0-9]{4,6}" maxlength="6" autocomplete="one-time-code" required>
   <div class="err" id="err"></div><button class="btn primary big" type="submit">Start shift</button></form>`}</div>`;
}
function renderPicker(){
 return`<div class="center"><div class="logo">pio pio<span>.</span> <small>staff</small></div><h1>Who are you working as?</h1>
  <p class="muted">You are signed in as an admin. Pick a staff member to see their screen, for example to test a delivery on your own phone.</p>
  <div class="pick">${S.staff.length?S.staff.map(s=>`<button data-act="as" data-id="${s.id}"><span class="role">${s.role==='driver'?'🛵 Driver':'🍕 Kitchen'}</span><span><b>${esc(s.name)}</b><small>${esc(s.vehicle||'')}</small></span></button>`).join('')
   :'<div class="empty">No active staff yet. Add them in the admin dashboard under Staff.</div>'}</div></div>`;
}
function header(){
 const m=S.me;
 return`<header class="head"><div class="logo">pio pio<span>.</span></div>
  <div class="who"><b>${esc(m.name)}<span class="role">${m.role==='driver'?'Driver':'Kitchen'}</span></b>
   <small>${window.PP_BACKEND?'<a href="/vaktliste">Vaktliste</a> · ':''}${S.admin?'<a href="#" data-act="switch">Switch person</a>':'<a href="#" data-act="logout">End shift</a>'}</small></div></header>`;
}
const lineSub=l=>l.size?[SIZE[l.size]??l.size,...(l.tops||[]).map(t=>'+ '+(window.PIOPIO_MENU?.TOPPINGS.find(x=>x.id===t)?.name||t))].filter(Boolean).join(' · '):'';
const items=o=>`<ul class="items">${[...o.lines,...o.extras].map(l=>`<li>${l.qty}× ${esc(l.name)}${lineSub(l)?`<small>${esc(lineSub(l))}</small>`:''}</li>`).join('')}</ul>`;
const tel=p=>p.replace(/\s/g,'');
// who ordered, with a call button, and the customer's note for the driver
const customer=o=>o.customer?.name||o.customer?.phone?`<div class="cust"><span>👤 <b>${esc(o.customer.name||'Kunde')}</b>${o.customer.phone?` · ${esc(o.customer.phone)}`:''}</span>
 ${o.customer.phone?`<a class="btn" href="tel:${esc(tel(o.customer.phone))}">📞 Ring</a>`:''}</div>`:'';
const note=o=>o.note?`<div class="note-box">💬 ${esc(o.note)}</div>`:'';
const chip=(o,text)=>`<span class="chip" style="--c:${COLOR[o.status]}"><i></i>${text}</span>`;
const mapsLink=o=>o.dest?`https://www.google.com/maps/dir/?api=1&destination=${o.dest.lat},${o.dest.lng}`
 :`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(o.address)}`;
function card(o,body){
 return`<article class="card" style="--c:${COLOR[o.status]}">
  <div class="top"><span class="no">${esc(o.number.replace('PP-','#'))}</span><span class="timer" data-since="${o.createdAt}"></span></div>
  ${body}</article>`;
}

// Drivers: their own deliveries first, then the ones nobody has taken yet
function driverCard(o){
 const mine=o.driver?.id===S.me.id,dist=o.dest?km(SHOP,o.dest):null;
 const statusText={received:'Not started',oven:'In the oven',ready:'Ready to collect',out:'On the way'}[o.status];
 const btns=!mine?`<button class="btn primary big" data-act="claim" data-id="${o.id}">Take this delivery</button>`
  :o.status==='ready'?`<button class="btn primary big" data-act="advance" data-id="${o.id}">Picked up — start driving</button><div class="row" style="margin-top:8px"><button class="btn ghost" data-act="release" data-id="${o.id}">Give it back</button></div>`
  :o.status==='out'?`<button class="btn primary big" data-act="deliver" data-id="${o.id}" data-no="${esc(o.number)}">Delivered ✓</button>`
  :`<div class="note">The kitchen is on it — you'll see “Picked up” here when it's ready.</div><div class="row"><button class="btn ghost" data-act="release" data-id="${o.id}">Give it back</button></div>`;
 return card(o,`<div class="meta">${chip(o,statusText)}${o.demo?'<span class="tag">Demo</span>':''}${dist!==null?`<span>${dist.toFixed(1)} km from the shop</span>`:''}</div>
  <div class="addr"><span>📍 ${esc(o.address)}</span><a href="${mapsLink(o)}" target="_blank" rel="noopener">Navigate ↗</a></div>
  ${note(o)}${mine?customer(o):''}${items(o)}${btns}`);
}
function locationPanel(outCount){
 const g=S.geo;
 if(!outCount&&g.state==='off')return'';
 let cls='',tx;
 if(S.sim)cls='on',tx=`<b>Simulated driving</b><small>A test position moves towards each customer</small>`;
 else if(g.state==='on')cls='on',tx=`<b>Sharing your location${outCount?` with ${outCount} customer${outCount>1?'s':''}`:''}</b><small>${g.last?`Updated ${Math.max(0,Math.round((Date.now()-g.last.at)/1000))} s ago`:'Waiting for GPS…'}</small>`;
 else if(g.state==='denied')cls='bad',tx=`<b>Location is blocked</b><small>Allow location for this site in your browser settings so customers can follow you.</small>`;
 else if(g.state==='unsupported')cls='bad',tx=`<b>This browser cannot share location</b><small>${esc(g.error)}</small>`;
 else tx=`<b>Location is off</b><small>Customers see you on their map while you are driving.</small>`;
 return`<div class="loc ${cls}"><span class="dot"></span><div class="tx">${tx}</div>
  ${!S.sim&&g.state!=='on'&&g.state!=='unsupported'?'<button class="btn" data-act="share">Share</button>':''}</div>
  ${S.admin?`<label class="sim"><input type="checkbox" data-sim ${S.sim?'checked':''}> Simulate driving (for testing without going outside)</label>`:''}`;
}
function renderDriver(){
 const mine=S.orders.filter(o=>o.driver?.id===S.me.id),free=S.orders.filter(o=>!o.driver);
 const out=mine.filter(o=>o.status==='out').length;
 return header()+locationPanel(out)+
  `<h2><span>My deliveries</span><span>${mine.length}</span></h2>${mine.map(driverCard).join('')||'<div class="empty">Nothing yet — take one below.</div>'}
   <h2><span>Waiting for a driver</span><span>${free.length}</span></h2>${free.map(driverCard).join('')||'<div class="empty">All deliveries have a driver.</div>'}`;
}

// Kitchen: what to start, what is baking, what is waiting to leave
function kitchenCard(o){
 const pick=o.mode==='pickup';
 const btn=o.status==='received'?`<button class="btn primary big" data-act="advance" data-id="${o.id}">Start baking →</button>`
  :o.status==='oven'?`<button class="btn primary big" data-act="advance" data-id="${o.id}">${pick?'Ready for pickup →':'Ready for the driver →'}</button>`
  :o.status==='ready'&&pick?`<button class="btn primary big" data-act="advance" data-id="${o.id}">Picked up ✓</button>`
  :`<div class="note">${o.driver?`${esc(o.driver.name)} is collecting it`:'Waiting for a driver to take it'}</div>`;
 return card(o,`<div class="meta">${chip(o,pick?'🛍️ Pickup':'🛵 Delivery')}${o.demo?'<span class="tag">Demo</span>':''}${o.driver?`<span>Driver: ${esc(o.driver.name)}</span>`:''}</div>${pick?customer(o):''}${items(o)}${btn}`);
}
function renderKitchen(){
 const by=f=>S.orders.filter(f),sec=(title,list)=>`<h2><span>${title}</span><span>${list.length}</span></h2>${list.map(kitchenCard).join('')||'<div class="empty">Nothing here</div>'}`;
 return header()+sec('New orders',by(o=>o.status==='received'))+sec('In the oven',by(o=>o.status==='oven'))
  +sec('Ready',by(o=>o.status==='ready'))+sec('Out for delivery',by(o=>o.status==='out'));
}

function render(){
 const app=$('app');
 if(S.screen==='loading')app.innerHTML='<div class="center"><p class="muted">Loading…</p></div>';
 else if(S.screen==='login')app.innerHTML=renderLogin();
 else if(S.screen==='picker')app.innerHTML=renderPicker();
 else app.innerHTML=S.me.role==='driver'?renderDriver():renderKitchen();
 tickTimers();
}

// ---------- data ----------
async function refresh(){
 if(S.screen!=='main'||S.busy)return;
 try{const r=await call('board');S.orders=r.orders;S.skew=r.now?r.now-Date.now():0;S.loaded=true;syncGeo();render()}
 catch(e){fail(e)}
}
async function start(){
 S.screen='loading';render();
 let r;try{r=await call('me')}catch(e){
  if(e.status===401){S.screen='login';S.loginError='';return render()}
  if(e.status===403){S.screen='login';S.loginError=e.message;return render()}
  S.screen='login';S.loginError=e.message;return render()}
 S.admin=!!r.admin;S.staff=r.staff||[];S.me=r.me;
 if(!S.me){S.screen=S.admin?'picker':'login';return render()}
 S.screen='main';render();refresh();
}

// ---------- location ----------
// The phone's GPS runs while the driver has a delivery on the way. A new position is sent at most every 8 seconds,
// and the last one is re-sent every 15 seconds, so customers stay current while the driver stands still.
function syncGeo(){
 const out=S.me?.role==='driver'?S.orders.filter(o=>o.driver?.id===S.me.id&&o.status==='out'):[];
 if(S.sim){stopWatch();return}
 if(out.length&&S.geo.state==='off')startWatch();
 else if(!out.length&&S.geo.watch!==null)stopWatch();
}
function startWatch(){
 const g=S.geo;
 if(!('geolocation' in navigator)){g.state='unsupported';g.error='No GPS access in this browser.';return render()}
 if(!window.isSecureContext){g.state='unsupported';g.error='Location needs a secure (https) connection.';return render()}
 g.state='on';
 g.watch=navigator.geolocation.watchPosition(p=>{g.last={lat:p.coords.latitude,lng:p.coords.longitude,at:Date.now()};send(g.last)},
  err=>{g.state=err.code===1?'denied':'off';stopWatch(true);render()},{enableHighAccuracy:true,maximumAge:5000,timeout:30000});
 render();
}
function stopWatch(keepState){
 const g=S.geo;if(g.watch!==null){navigator.geolocation.clearWatch(g.watch);g.watch=null}
 if(!keepState&&g.state==='on')g.state='off';
}
async function send(pos,force){
 const g=S.geo,moved=g.sentPos?km(g.sentPos,pos)*1000:Infinity;
 if(!force&&Date.now()-g.sentAt<8000&&moved<40)return;
 g.sentAt=Date.now();g.sentPos=pos;
 try{await call('location',{lat:pos.lat,lng:pos.lng})}catch(e){if(e.status===401)fail(e)}
}
setInterval(()=>{const g=S.geo;if(!S.sim&&g.state==='on'&&g.last&&Date.now()-g.sentAt>=15000)send(g.last,true)},5000);
// Test mode for admins: a position that moves from the shop to the first customer over three minutes.
setInterval(()=>{
 if(!S.sim||S.screen!=='main')return;
 const o=S.orders.find(x=>x.driver?.id===S.me.id&&x.status==='out'&&x.dest);if(!o)return;
 const f=Math.min(1,(now()-(o.times.out||now()))/180000);
 send({lat:SHOP.lat+(o.dest.lat-SHOP.lat)*f,lng:SHOP.lng+(o.dest.lng-SHOP.lng)*f},true);
},3000);

// ---------- events ----------
const actions={
 login:()=>{if(B)B.login()},
 logout:async()=>{stopWatch();try{if(B)await B.logout();else await call('logout')}catch(e){}S.me=null;S.screen='login';S.loginError='';render()},
 as:d=>{S.as=d.id;try{localStorage.setItem('pp-staff-as',d.id)}catch(e){}start()},
 switch:()=>{stopWatch();S.sim=false;S.as='';try{localStorage.removeItem('pp-staff-as')}catch(e){}S.me=null;start()},
 share:()=>{S.geo.state='off';startWatch()},
 claim:d=>act(d.id,'claim','Delivery taken'),
 release:d=>act(d.id,'release','Given back'),
 advance:d=>act(d.id,'advance'),
 deliver:d=>{if(confirm(`Mark ${d.no} as delivered?`))act(d.id,'advance','Delivered — nice work!')}};
async function act(id,action,msg){
 if(S.busy)return;S.busy=true;
 document.querySelectorAll(`[data-id="${id}"]`).forEach(b=>{b.disabled=true});
 try{const r=await call('act',{id,action});
  if(r.status==='out'&&!S.sim){
   if(S.geo.state==='on'&&S.geo.last)setTimeout(()=>send(S.geo.last,true),1500); // already sharing: put the new order on the map now
   else if(S.geo.state!=='denied')S.geo.state='off'; // the driver just set off: ask for GPS now
  }
  if(msg)toast(msg)}
 catch(e){fail(e)}
 finally{S.busy=false;refresh()}
}
document.addEventListener('click',e=>{
 const el=e.target.closest('[data-act]');if(!el||el.disabled)return;
 if(el.tagName==='A')e.preventDefault();
 actions[el.dataset.act]?.(el.dataset);
});
document.addEventListener('change',e=>{
 if(e.target.matches('[data-sim]')){S.sim=e.target.checked;if(S.sim)stopWatch();syncGeo();render()}
});
document.addEventListener('submit',async e=>{
 e.preventDefault();if(e.target.id!=='pin-form')return;
 const pin=$('pin').value;$('err').textContent='';
 try{const r=await fetch('/api/staff/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pin})});
  if(!r.ok){$('err').textContent=(await r.json().catch(()=>({}))).error||'Could not sign in';$('pin').value='';$('pin').focus();return}
  start()}catch(err){$('err').textContent='No connection — try again'}
});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
setInterval(tickTimers,1000);
setInterval(refresh,5000);
setInterval(()=>{if(S.screen==='main'&&S.geo.state==='on'&&!S.busy){const el=document.querySelector('.loc small');if(el&&S.geo.last)el.textContent=`Updated ${Math.round((Date.now()-S.geo.last.at)/1000)} s ago`}},1000);
start();
