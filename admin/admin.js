'use strict';
// Pio Pio admin dashboard. Dependency-free; talks to /api/admin/* and listens to the live stream.

const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const kr=n=>Math.round(n).toLocaleString('en-US').replace(/,/g,' ')+' kr';
const compact=n=>n>=10000?(n/1000).toFixed(n>=100000?0:1).replace(/\.0$/,'')+'K':String(Math.round(n));

const VIEWS=['overview','kitchen','orders','menu','staff','settings'];
const STATUS={received:'Received',oven:'In oven',out:'Out for delivery',ready:'Ready',done:'Done',cancelled:'Cancelled'};
const statusText=o=>o.status==='ready'?(o.mode==='delivery'?'Waiting for driver':'Ready for pickup'):STATUS[o.status];
const NEXT={received:'MOVE TO OVEN →',oven:{delivery:'READY FOR DRIVER →',pickup:'READY FOR PICKUP →'},ready:{delivery:'OUT FOR DELIVERY →',pickup:'PICKED UP ✓'},out:'DELIVERED ✓'};
const LANES=[{key:'received',title:'Received',color:'var(--st-received)',has:['received']},
 {key:'oven',title:'In oven',color:'var(--st-oven)',has:['oven']},
 {key:'ready',title:'Ready',color:'var(--st-done)',has:['ready']},
 {key:'out',title:'Out for delivery',color:'var(--st-out)',has:['out']}];
const ROLE={driver:'Driver',kitchen:'Kitchen'};
const GROUPS=[['pizzas','Pizzas'],['sides','Sides'],['dips','Dips'],['drinks','Drinks'],['desserts','Desserts']];
const SIZE={S:'Small',M:'',L:'Large'}; // the current menu has one size (M), so it is not shown

const S={view:VIEWS.includes(location.hash.slice(1))?location.hash.slice(1):'overview',
 days:7,stats:null,active:new Map(),orders:null,orderFilter:'all',orderQuery:'',catalog:null,settings:null,staff:null,staffEdit:null,staffAuth:'pin',
 tz:'Europe/Oslo',targetMin:20,sound:false,tables:{},checks:{}};
try{S.checks=JSON.parse(sessionStorage.getItem('pp-checks'))||{}}catch(e){}

// ---------- api ----------
// A host page may provide its own backend (PP_BACKEND: api/connect/login); the default is this site's /api/admin.
const B=window.PP_BACKEND||null;
async function api(method,url,body){
 if(B){try{return await B.api(method,url,body)}catch(e){if(e.status===401&&url!=='login'){showLogin();throw new Error('Signed out')}throw e}}
 const r=await fetch('/api/admin/'+url,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
 const data=await r.json().catch(()=>({}));
 if(r.status===401&&url!=='login'){showLogin();throw new Error('Signed out')}
 if(!r.ok)throw new Error(data.error||'Request failed');
 return data;
}
function toast(text,err){const t=document.createElement('div');t.className='toast'+(err?' err':'');t.textContent=text;$('toasts').append(t);setTimeout(()=>t.remove(),err?5000:3000)}
const guard=fn=>(...a)=>Promise.resolve(fn(...a)).catch(e=>{if(e.message!=='Signed out')toast(e.message,true)});

// ---------- time ----------
const fmt=(opts)=>new Intl.DateTimeFormat('en-GB',{timeZone:S.tz,...opts});
const clock=ts=>fmt({hour:'2-digit',minute:'2-digit'}).format(ts);
const dayLabel=key=>{const d=new Date(key+'T12:00:00Z');return new Intl.DateTimeFormat('en-GB',{timeZone:'UTC',weekday:'short',day:'numeric',month:'short'}).format(d)};
const dayKey=ts=>new Intl.DateTimeFormat('en-CA',{timeZone:S.tz}).format(ts);
const elapsed=ms=>{const s=Math.max(0,Math.floor(ms/1000));return`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`};

// ---------- tooltip ----------
// Content is set with textContent: names and addresses are untrusted.
const tip=$('tip');
function showTip(e,value,label){
 tip.replaceChildren();const b=document.createElement('b');b.textContent=value;tip.append(b,document.createTextNode(label));tip.hidden=false;
 const r=e.currentTarget?.getBoundingClientRect?.()||e.target.getBoundingClientRect();
 const x=e.clientX||r.left+r.width/2,y=e.clientY||r.top;
 tip.style.left=Math.min(x+12,innerWidth-tip.offsetWidth-8)+'px';tip.style.top=Math.max(8,y-tip.offsetHeight-10)+'px';
}
document.addEventListener('pointermove',e=>{const el=e.target.closest?.('[data-tv]');if(el)showTip(e,el.dataset.tv,el.dataset.tl);else tip.hidden=true});
document.addEventListener('focusin',e=>{const el=e.target.closest?.('[data-tv]');if(el)showTip({target:el},el.dataset.tv,el.dataset.tl)});
document.addEventListener('focusout',()=>{tip.hidden=true});

// ---------- charts ----------
function niceMax(v){if(v<=0)return 1;const p=10**Math.floor(Math.log10(v)),n=v/p;return(n<=1?1:n<=2?2:n<=2.5?2.5:n<=5?5:10)*p}
// Column chart: one series, hairline grid, thin rounded columns, the peak labelled, hover/focus on every column.
function columns(data,{value,label,tipValue,tipLabel,tick=compact,every=1,dim,W=720}){
 const H=220,L=40,R=8,T=18,B=24,pw=W-L-R,ph=H-T-B;
 const max=niceMax(Math.max(...data.map(value),1)),slot=pw/data.length,bw=Math.min(24,Math.max(3,slot-6));
 const peak=data.reduce((a,d,i)=>value(d)>value(data[a])?i:a,0);
 const y=v=>T+ph-ph*v/max;
 let s=`<svg viewBox="0 0 ${W} ${H}" role="img">`;
 for(let i=0;i<=4;i++){const v=max*i/4;s+=`<line class="gridline" x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L-8}" y="${y(v)+4}" text-anchor="end">${tick(v)}</text>`}
 data.forEach((d,i)=>{
  const v=value(d),x=L+slot*i+(slot-bw)/2,h=ph*v/max,r=Math.min(4,h,bw/2),top=y(v),base=T+ph;
  s+=`<g class="${dim&&dim(d)?'dim':''}">`;
  if(v>0)s+=`<path class="col" d="M${x} ${base}V${top+r}a${r} ${r} 0 0 1 ${r} ${-r}h${bw-2*r}a${r} ${r} 0 0 1 ${r} ${r}V${base}z"/>`;
  if(i===peak&&v>0)s+=`<text class="lbl" x="${x+bw/2}" y="${top-6}" text-anchor="middle">${esc(tick(v))}</text>`;
  if(i%every===0)s+=`<text x="${x+bw/2}" y="${H-6}" text-anchor="middle">${esc(label(d))}</text>`;
  s+=`<rect class="hit" tabindex="0" x="${L+slot*i}" y="${T}" width="${slot}" height="${ph}" data-tv="${esc(tipValue(d))}" data-tl="${esc(tipLabel(d))}"/></g>`;
 });
 return s+'</svg>';
}
const hbars=(rows,unit,detail=r=>kr(r.revenue),empty='No sales in this period')=>{const max=Math.max(...rows.map(r=>r.qty),1);
 return rows.length?`<div class="hbars">${rows.map(r=>`<span class="name" title="${esc(r.name)}">${esc(r.name)}</span>
  <span><div class="bar" tabindex="0" style="width:${(100*r.qty/max).toFixed(1)}%" data-tv="${r.qty} ${unit}" data-tl="${esc(r.name)} · ${esc(detail(r))}"></div></span>
  <span class="val">${r.qty}</span>`).join('')}</div>`:`<div class="empty">${empty}</div>`};
// Tall segmented bar for a two-way split; a share is printed inside only when it fits.
function split(parts,format){
 const total=parts.reduce((a,p)=>a+p.value,0);if(!total)return'<div class="empty">No sales in this period</div>';
 return`<div class="split">${parts.filter(p=>p.value>0).map((p,i)=>{const pct=100*p.value/total;
  return`<div tabindex="0" style="flex:${p.value} 0 0;background:var(--series-${p.slot})" data-tv="${esc(format(p.value))}" data-tl="${esc(p.name)} · ${pct.toFixed(0)}%">${pct>=14?pct.toFixed(0)+'%':''}</div>`}).join('')}</div>
  <div class="legend">${parts.map(p=>`<span><i style="background:var(--series-${p.slot})"></i>${esc(p.name)} · ${esc(format(p.value))}</span>`).join('')}</div>`;
}
const table=(heads,rows)=>`<div class="table-wrap"><table><thead><tr>${heads.map((h,i)=>`<th class="${i?'num':''}">${esc(h)}</th>`).join('')}</tr></thead>
 <tbody>${rows.map(r=>`<tr>${r.map((c,i)=>`<td class="${i?'num':''}">${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
// A chart card with a "Table" twin so every value is reachable without hovering.
function chartCard(id,cls,title,sub,chart,tbl){
 const t=S.tables[id];
 return`<section class="card ${cls}"><div class="card-head"><div><h2>${esc(title)}</h2><p>${esc(sub)}</p></div>
  <button class="link" data-act="table" data-id="${id}">${t?'Chart':'Table'}</button></div><div class="chart">${t?tbl:chart}</div></section>`;
}

// ---------- overview ----------
function delta(cur,prev,{unit='',goodUp=true,abs=false}={}){
 if(prev==null||cur==null||(!abs&&!prev))return`<div class="delta">No earlier period to compare</div>`;
 const d=abs?cur-prev:100*(cur-prev)/prev;if(Math.abs(d)<.05)return`<div class="delta">Same as previous ${S.days===1?'day':S.days+' days'}</div>`;
 const up=d>0;
 return`<div class="delta"><b class="${up===goodUp?'up':'down'}">${up?'▲':'▼'} ${Math.abs(d).toFixed(abs?1:0)}${abs?unit:'%'}</b> vs previous ${S.days===1?'day':S.days+' days'}</div>`;
}
function renderOverview(){
 const st=S.stats;
 const head=`<div class="page-head"><div><h1>Overview</h1><p>${st?`${st.active} order${st.active===1?'':'s'} in progress right now`:'Loading…'}</p></div>
  <div class="seg" role="group" aria-label="Period">${[[1,'Today'],[7,'7 days'],[14,'14 days'],[30,'30 days']].map(([d,l])=>
   `<button data-act="days" data-d="${d}" aria-pressed="${S.days===d}">${l}</button>`).join('')}</div></div>`;
 if(!st)return head;
 const c=st.current,p=st.previous,today=dayKey(Date.now());
 const period=S.days===1?'Today':`Last ${S.days} days`;
 const openHours=st.byHour.filter(h=>h.orders>0||(h.hour>=11&&h.hour<=22));
 return head+`<div class="grid">
  <section class="card span-4 stat hero"><div class="label">Delivered within ${st.targetMin} minutes</div>
   <div class="value">${c.onTimePct==null?'–':c.onTimePct}<small>%</small></div>
   <div class="meter" role="img" aria-label="${c.onTimePct??0}% on time"><i style="width:${c.onTimePct??0}%"></i></div>
   <div class="meter-legend"><span>${c.timed} completed orders timed</span><span>Promise: door in ${st.targetMin}</span></div>
   ${delta(c.onTimePct,p.onTimePct,{abs:true,unit:' pts'})}</section>
  <section class="card span-4 stat"><div class="label">Revenue</div><div class="value">${kr(c.revenue)}</div>${delta(c.revenue,p.revenue)}
   <div class="label" style="margin-top:14px">Average order</div><div class="value">${kr(c.avgOrder)}</div>${delta(c.avgOrder,p.avgOrder)}</section>
  <section class="card span-4 stat"><div class="label">Orders</div><div class="value">${c.orders}${c.cancelled?` <small>+ ${c.cancelled} cancelled</small>`:''}</div>${delta(c.orders,p.orders)}
   <div class="label" style="margin-top:14px">Average time to door</div><div class="value">${c.avgDoorMin==null?'–':c.avgDoorMin.toFixed(1)} <small>min</small></div>${delta(c.avgDoorMin,p.avgDoorMin,{abs:true,unit:' min',goodUp:false})}</section>
  ${S.days>1?chartCard('rev','span-7','Revenue per day',`${period} · kr, including delivery fees`,
    columns(st.byDay,{value:d=>d.revenue,label:d=>dayLabel(d.day).split(' ').slice(1).join(' '),every:Math.ceil(st.byDay.length/8),
     tipValue:d=>kr(d.revenue),tipLabel:d=>`${dayLabel(d.day)}${d.day===today?' (so far)':''} · ${d.orders} orders`,dim:d=>d.day===today}),
    table(['Day','Revenue','Orders'],st.byDay.map(d=>[dayLabel(d.day),kr(d.revenue),d.orders]))):''}
  ${chartCard('hour',S.days>1?'span-5':'span-12','Orders by hour',`${period} · when the kitchen is busiest`,
    columns(openHours,{W:S.days>1?500:1100,value:h=>h.orders,label:h=>String(h.hour).padStart(2,'0'),every:S.days>1?2:1,
     tipValue:h=>`${h.orders} orders`,tipLabel:h=>`${String(h.hour).padStart(2,'0')}:00–${String(h.hour+1).padStart(2,'0')}:00`}),
    table(['Hour','Orders'],openHours.map(h=>[`${String(h.hour).padStart(2,'0')}:00`,h.orders])))}
  ${chartCard('pz','span-6','Best-selling pizzas',`${period} · pizzas sold`,hbars(st.topPizzas,'sold'),
    table(['Pizza','Sold','Revenue'],st.topPizzas.map(r=>[r.name,r.qty,kr(r.revenue)])))}
  ${chartCard('ex','span-6','Best-selling sides & drinks',`${period} · units sold`,hbars(st.topExtras,'sold'),
    table(['Item','Sold','Revenue'],st.topExtras.map(r=>[r.name,r.qty,kr(r.revenue)])))}
  ${chartCard('pay','span-6','How customers pay',`${period} · share of revenue`,
    split([{name:'Vipps',value:st.payment.vipps,slot:1},{name:'Card',value:st.payment.card,slot:2}],kr),
    table(['Method','Revenue'],[['Vipps',kr(st.payment.vipps)],['Card',kr(st.payment.card)]]))}
  ${chartCard('mode','span-6','Delivery or pickup',`${period} · share of orders`,
    split([{name:'Delivery',value:st.mode.delivery,slot:1},{name:'Pickup',value:st.mode.pickup,slot:2}],n=>n+' orders'),
    table(['Type','Orders'],[['Delivery',st.mode.delivery],['Pickup',st.mode.pickup]]))}
  ${chartCard('drv','span-12','Deliveries by driver',`${period} · completed deliveries; hover for average time on the road`,
    hbars(st.byDriver.map(d=>({...d,qty:d.deliveries})),'deliveries',d=>`${d.avgMin} min on the road on average`,'No completed deliveries with a driver in this period'),
    table(['Driver','Deliveries','Avg. minutes on the road'],st.byDriver.map(d=>[d.name,d.deliveries,d.avgMin])))}
 </div>`;
}

// ---------- kitchen ----------
const lineText=l=>`${l.qty}× ${l.name}`;
const topName=t=>window.PIOPIO_MENU?.TOPPINGS.find(x=>x.id===t)?.name||t;
const lineSub=l=>l.size?[SIZE[l.size],...(l.tops||[]).map(t=>'+ '+topName(t))].filter(Boolean).join(' · '):'';
const drivers=()=>(S.staff||[]).filter(s=>s.role==='driver'&&s.active);
function driverRow(o){
 if(o.mode!=='delivery')return'';
 if(o.status==='out')return`<div class="driver-row"><span>🛵</span><b>${esc(o.driver?.name||'No driver')}</b>${o.pos?'<span class="gps">● GPS</span>':''}</div>`;
 const list=drivers(),cur=o.driver?.id||'';
 // a driver who has left the list still shows on orders they already hold
 const opts=[...list.map(d=>[d.id,d.name]),...(cur&&!list.some(d=>d.id===cur)?[[cur,o.driver.name]]:[])];
 return`<label class="driver-row"><span>🛵</span><select data-assign="${o.id}" aria-label="Driver for ${esc(o.number)}">
  <option value="">${list.length?'No driver yet':'Add drivers under Staff'}</option>${opts.map(([id,n])=>`<option value="${id}" ${id===cur?'selected':''}>${esc(n)}</option>`).join('')}</select></label>`;
}
function ticket(o,color){
 const items=[...o.lines,...o.extras],checks=S.checks[o.id]||{};
 const needsDriver=o.mode==='delivery'&&o.status==='ready'&&!o.driver;
 const next=needsDriver?'CHOOSE A DRIVER ↑':typeof NEXT[o.status]==='string'?NEXT[o.status]:NEXT[o.status][o.mode];
 return`<article class="ticket" style="--c:${color}">
  <div class="ticket-top"><span class="no">${esc(o.number.replace('PP-','#'))}</span><span class="timer" data-since="${o.createdAt}"></span></div>
  <div class="meta"><span class="tag">${o.mode==='delivery'?'🛵 Delivery':'🛍️ Pickup'}</span>${o.demo?'<span class="tag">Demo</span>':''}
   <span>${esc(clock(o.createdAt))}${o.address?' · '+esc(o.address):''}</span></div>
  ${o.customer?.name||o.customer?.phone?`<div class="cust-row">👤 <b>${esc(o.customer.name)}</b>${o.customer.phone?` · <a href="tel:${esc(o.customer.phone.replace(/\s/g,''))}">${esc(o.customer.phone)}</a>`:''}</div>`:''}
  ${o.note?`<div class="note-row">💬 ${esc(o.note)}</div>`:''}
  ${driverRow(o)}
  <ul>${items.map((l,i)=>`<li><label><input type="checkbox" data-check="${o.id}" data-i="${i}" ${checks[i]?'checked':''}>
   <span>${esc(lineText(l))}${lineSub(l)?`<small>${esc(lineSub(l))}</small>`:''}</span></label></li>`).join('')}</ul>
  <button class="go" data-act="advance" data-id="${o.id}" ${needsDriver?'disabled':''}>${next}</button>
  <div class="sub-actions">${o.status!=='received'?`<button class="link" data-act="back" data-id="${o.id}">← Move back</button>`:'<span></span>'}
   <button class="link" data-act="cancel" data-id="${o.id}" data-no="${esc(o.number)}">Cancel order</button></div></article>`;
}
function renderKitchen(){
 const all=[...S.active.values()].sort((a,b)=>a.createdAt-b.createdAt);
 return`<div class="page-head"><div><h1>Kitchen</h1><p>Oldest first. Timers turn amber at 12 minutes and red at ${S.targetMin}.</p></div>
  <div class="actions"><a class="btn" href="/staff" target="_blank" rel="noopener">Staff dashboard ↗</a><button class="btn" data-act="simulate">+ Simulate an order</button></div></div>
  <div class="board">${LANES.map(l=>{const list=all.filter(o=>l.has.includes(o.status));
   return`<section class="lane"><div class="lane-head"><i style="background:${l.color}"></i>${l.title}<span>${list.length}</span></div>
    ${list.map(o=>ticket(o,l.color)).join('')||'<div class="empty">Nothing here</div>'}</section>`}).join('')}</div>`;
}
function tickTimers(){
 const now=Date.now();
 document.querySelectorAll('.timer[data-since]').forEach(el=>{const ms=now-+el.dataset.since,min=ms/60000;
  el.textContent='+'+elapsed(ms);el.classList.toggle('warn',min>=12&&min<S.targetMin);el.classList.toggle('late',min>=S.targetMin)});
}

// ---------- orders ----------
const itemsText=o=>[...o.lines,...o.extras].map(lineText).join(', ');
function renderOrders(){
 const list=S.orders;
 return`<div class="page-head"><div><h1>Orders</h1><p>${list?`${list.total} order${list.total===1?'':'s'}${list.total>list.orders.length?`, newest ${list.orders.length} shown`:''}`:'Loading…'}</p></div></div>
  <section class="card"><div class="toolbar">
   <div class="seg" role="group" aria-label="Status">${[['all','All'],['active','In progress'],['done','Done'],['cancelled','Cancelled']].map(([k,l])=>
    `<button data-act="order-filter" data-f="${k}" aria-pressed="${S.orderFilter===k}">${l}</button>`).join('')}</div>
   <input type="search" id="order-q" placeholder="Search order, name, phone or address" value="${esc(S.orderQuery)}" aria-label="Search orders"></div>
  ${!list?'':!list.orders.length?'<div class="empty">No orders match</div>':`<div class="table-wrap"><table>
   <thead><tr><th>Order</th><th>Placed</th><th>Customer</th><th>Type</th><th>Items</th><th>Paid with</th><th>Driver</th><th class="num">Total</th><th class="num">To door</th><th>Status</th></tr></thead>
   <tbody>${list.orders.map(o=>{const door=o.status==='done'?(o.times.done-o.createdAt)/60000:null;
    return`<tr><td><b>${esc(o.number)}</b>${o.demo?' <span class="tag">Demo</span>':''}</td>
     <td>${esc(dayLabel(dayKey(o.createdAt)))} ${esc(clock(o.createdAt))}</td>
     <td>${esc(o.customer?.name||'–')}${o.customer?.phone?`<br><span style="color:var(--muted)">${esc(o.customer.phone)}</span>`:''}</td>
     <td>${o.mode==='delivery'?'Delivery':'Pickup'}${o.address?`<br><span style="color:var(--muted)">${esc(o.address)}</span>`:''}</td>
     <td class="items">${esc(itemsText(o))}</td><td>${o.payment.method==='vipps'?'Vipps':'Card'}</td><td>${o.driver?esc(o.driver.name):'–'}</td>
     <td class="num"><b>${esc(kr(o.total))}</b></td><td class="num">${door==null?'–':door.toFixed(0)+' min'}</td>
     <td><span class="chip ${o.status}"><i></i>${statusText(o)}</span></td></tr>`}).join('')}</tbody></table></div>`}</section>`;
}

// ---------- menu ----------
function renderMenu(){
 if(!S.catalog)return'<div class="page-head"><h1>Menu</h1></div>';
 const off=S.catalog.filter(c=>!c.available).length;
 return`<div class="page-head"><div><h1>Menu</h1><p>${off?`${off} item${off===1?'':'s'} marked sold out`:'Everything is available'}. Changes reach the customer app within seconds.</p></div></div>
  ${GROUPS.map(([g,title])=>{const rows=S.catalog.filter(c=>c.group===g);
   return`<section class="card menu-group"><div class="card-head"><h2>${title}</h2><p>${rows.length} items</p></div>
    ${rows.map(c=>`<div class="menu-row${c.available?'':' off'}"><div class="n">${esc(c.name)}${c.price!==c.basePrice?`<small>Standard price ${c.basePrice} kr · <button class="link" data-act="price-reset" data-id="${c.id}">reset</button></small>`:''}</div>
     <div class="price-in"><input type="number" min="0" step="1" value="${c.price}" data-price="${c.id}" aria-label="Price of ${esc(c.name)} in kroner"><span>kr</span></div>
     <label class="switch"><input type="checkbox" data-avail="${c.id}" ${c.available?'checked':''} aria-label="${esc(c.name)} available"><span>${c.available?'Available':'Sold out'}</span></label></div>`).join('')}</section>`}).join('')}`;
}

// ---------- staff ----------
function staffForm(){
 const e=S.staffEdit,s=e.id?S.staff.find(x=>x.id===e.id):{role:'driver',active:true},pin=S.staffAuth==='pin';
 return`<section class="card"><div class="card-head"><div><h2>${e.id?'Edit '+esc(s.name):'Add a staff member'}</h2>
  <p>${pin?'Staff sign in to the staff dashboard with their PIN.':'Staff sign in to the staff dashboard with the e-mail you enter here. They get an invitation to the app.'}</p></div></div>
  <form class="form staff-form" id="staff-form">
   <label>Name<input type="text" name="name" maxlength="40" required value="${esc(s.name||'')}"></label>
   <label>Role<select name="role">${Object.entries(ROLE).map(([k,v])=>`<option value="${k}" ${s.role===k?'selected':''}>${v}</option>`).join('')}</select></label>
   <label>Phone <span class="hint">shown to customers on their delivery, so they can call</span><input type="tel" name="phone" maxlength="20" value="${esc(s.phone||'')}" placeholder="+47 …"></label>
   <label>Vehicle <span class="hint">drivers only, e.g. “E-bike” or “Car · EV 1290”</span><input type="text" name="vehicle" maxlength="40" value="${esc(s.vehicle||'')}"></label>
   ${pin?`<label>PIN <span class="hint">4–6 digits${e.id&&s.hasPin?', leave empty to keep the current one':''}</span><input type="password" name="pin" inputmode="numeric" pattern="[0-9]{4,6}" maxlength="6" autocomplete="new-password" ${e.id?'':'required'}></label>`
    :`<label>E-mail <span class="hint">the address they sign in with</span><input type="email" name="email" maxlength="120" value="${esc(s.email||'')}" ${e.id?'':'required'}></label>`}
   <div class="actions"><button class="btn primary" type="submit">${e.id?'Save':'Add'}</button><button class="btn ghost" type="button" data-act="staff-cancel">Cancel</button></div>
  </form></section>`;
}
function renderStaff(){
 const list=S.staff;
 if(!list)return'<div class="page-head"><h1>Staff</h1></div>';
 const group=(role,title)=>{const rows=list.filter(s=>s.role===role);
  return`<section class="card"><div class="card-head"><div><h2>${title}</h2><p>${rows.filter(s=>s.active).length} active</p></div></div>
   ${rows.length?rows.map(s=>`<div class="staff-row${s.active?'':' off'}">
    <div class="avatar-s">${esc(s.name[0]||'?')}</div>
    <div class="n"><b>${esc(s.name)}</b>${s.demo?' <span class="tag">Demo</span>':''}<small>${esc([s.vehicle,s.phone,S.staffAuth==='pin'?(s.hasPin?'PIN set':'No PIN'):s.email].filter(Boolean).join(' · '))}</small></div>
    <label class="switch"><input type="checkbox" data-staff-active="${s.id}" ${s.active?'checked':''} aria-label="${esc(s.name)} active"><span>${s.active?'Active':'Off'}</span></label>
    <div class="actions"><button class="btn" data-act="staff-edit" data-id="${s.id}">Edit</button><button class="btn ghost danger" data-act="staff-del" data-id="${s.id}" data-name="${esc(s.name)}">Remove</button></div>
   </div>`).join(''):'<div class="empty">Nobody yet</div>'}</section>`};
 return`<div class="page-head"><div><h1>Staff</h1><p>Drivers take deliveries and share their position with the customer; kitchen staff move orders through the oven.</p></div>
  <div class="actions"><a class="btn" href="/staff" target="_blank" rel="noopener">Open staff dashboard ↗</a>${S.staffEdit?'':'<button class="btn primary" data-act="staff-new">+ Add staff</button>'}</div></div>
  ${S.staffEdit?staffForm():''}${group('driver','Drivers')}${group('kitchen','Kitchen')}`;
}

// ---------- settings ----------
function renderSettings(){
 const s=S.settings;if(!s)return'<div class="page-head"><h1>Settings</h1></div>';
 return`<div class="page-head"><div><h1>Settings</h1><p>Opening status, fees and promised times.</p></div></div>
  <div class="grid">
  <section class="card span-6"><div class="card-head"><div><h2>Store</h2><p>What customers see in the app</p></div></div>
   <form class="form" id="settings-form">
    <label class="switch" style="justify-self:start"><input type="checkbox" name="open" ${s.open?'checked':''}><span>${s.open?'Taking orders':'Paused — customers cannot order'}</span></label>
    <label>Message shown while paused<input type="text" name="pauseMessage" maxlength="120" value="${esc(s.pauseMessage)}" placeholder="e.g. Back at 17:00"></label>
    <label>Delivery fee (kr) <span class="hint">charged on every delivery order, no minimum order</span><input type="number" name="deliveryFee" min="0" max="1000" step="1" value="${s.deliveryFee}"></label>
    <label>Delivery area (km from the shop) <span class="hint">addresses further away are refused</span><input type="number" name="deliveryRadiusKm" min="0.5" max="50" step="0.5" value="${s.deliveryRadiusKm??5}"></label>
    <label>Promised delivery time (minutes)<input type="number" name="etaMin" min="0" max="180" step="1" value="${s.etaMin}"></label>
    <label>Promised pickup time (minutes)<input type="number" name="pickupMin" min="0" max="180" step="1" value="${s.pickupMin}"></label>
    <div class="actions"><button class="btn primary" type="submit">Save</button></div></form></section>
  <section class="card span-6"><div class="card-head"><div><h2>Demo data</h2><p>Explore the dashboard before real orders arrive</p></div></div>
   <p style="color:var(--text2);margin-top:0">Demo orders are labelled and never mix with real ones: removing them leaves real orders untouched.
    Loading the history also adds a sample team of three drivers and two kitchen staff${S.staffAuth==='pin'?' (staff dashboard PINs 1111–5555)':''}, removed together with the demo orders.</p>
   <div class="actions"><button class="btn" data-act="simulate">+ Simulate one order</button>
    <button class="btn" data-act="seed">Load 3 weeks of demo history</button>
    <button class="btn danger" data-act="clear-demo">Remove all demo orders and staff</button></div></section></div>`;
}

// ---------- render ----------
function renderChrome(){
 document.querySelectorAll('#tabs button').forEach(b=>b.setAttribute('aria-selected',b.dataset.view===S.view));
 const n=S.active.size;$('active-count').hidden=!n;$('active-count').textContent=n;
 const open=S.settings?.open!==false;$('store-btn').setAttribute('aria-pressed',open);$('store-btn').textContent=open?'Taking orders':'⏸ Paused';
 $('sound-btn').setAttribute('aria-pressed',S.sound);$('sound-btn').textContent=S.sound?'🔔':'🔕';
}
function render(){
 renderChrome();
 // keep focus and caret in inputs that survive the re-render
 const a=document.activeElement,keep=a&&(a.id||a.dataset.price)?{id:a.id,price:a.dataset.price,pos:a.selectionStart}:null;
 $('view').innerHTML={overview:renderOverview,kitchen:renderKitchen,orders:renderOrders,menu:renderMenu,staff:renderStaff,settings:renderSettings}[S.view]();
 if(keep){const el=keep.id?$(keep.id):document.querySelector(`[data-price="${keep.price}"]`);
  if(el&&el!==document.activeElement){el.focus();try{el.setSelectionRange(keep.pos,keep.pos)}catch(e){}}}
 tickTimers();
}

// ---------- data ----------
const loadStats=guard(async()=>{S.stats=await api('GET','stats?days='+S.days);if(S.view==='overview')render()});
const loadActive=guard(async()=>{const r=await api('GET','orders?filter=active&limit=500');S.active=new Map(r.orders.map(o=>[o.id,o]));render()});
const loadOrders=guard(async()=>{S.orders=await api('GET',`orders?filter=${S.orderFilter}&limit=200&q=${encodeURIComponent(S.orderQuery)}`);if(S.view==='orders')render()});
const loadCatalog=guard(async()=>{S.catalog=await api('GET','catalog');if(S.view==='menu')render()});
const loadSettings=guard(async()=>{S.settings=await api('GET','settings');render()});
const loadStaff=guard(async()=>{S.staff=await api('GET','staff');if(S.view==='staff'||S.view==='kitchen')render()});
function loadView(){({overview:loadStats,kitchen:loadActive,orders:loadOrders,menu:loadCatalog,staff:loadStaff,settings:loadSettings})[S.view]()}
let statsTimer;const statsSoon=()=>{clearTimeout(statsTimer);statsTimer=setTimeout(()=>{loadStats();if(S.view==='orders')loadOrders()},400)};

function beep(){
 if(!S.sound)return;
 try{const ctx=beep.ctx||(beep.ctx=new AudioContext());[880,1175].forEach((f,i)=>{const o=ctx.createOscillator(),g=ctx.createGain();
  o.frequency.value=f;o.connect(g);g.connect(ctx.destination);const t=ctx.currentTime+i*.16;
  g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.2,t+.02);g.gain.exponentialRampToValueAtTime(.0001,t+.3);o.start(t);o.stop(t+.32)})}catch(e){}
}
// Live updates, whichever backend delivers them
const live={
 open:()=>$('live').classList.add('on'),
 error:()=>$('live').classList.remove('on'),
 order:({type,order:o})=>{
  if(['received','oven','out','ready'].includes(o.status))S.active.set(o.id,o);else{S.active.delete(o.id);delete S.checks[o.id]}
  if(type==='new'){beep();toast(`New order ${o.number} · ${kr(o.total)}`)}
  if(S.view==='kitchen')render();else renderChrome(); // other views refresh with their own data
  statsSoon()},
 catalog:c=>{if(S.catalog){const i=S.catalog.findIndex(x=>x.id===c.id);if(i>=0)S.catalog[i]=c;if(S.view==='menu')render()}},
 settings:s=>{S.settings=s;render()},
 reload:()=>{loadActive();loadStats();loadStaff();if(S.view==='orders')loadOrders()}};
let es;
function connect(){
 es?.close();
 if(B){es={close:B.connect(live)};return}
 es=new EventSource('/api/admin/stream');
 es.onopen=live.open;es.onerror=live.error;
 for(const k of['order','catalog','settings','reload'])es.addEventListener(k,e=>live[k](JSON.parse(e.data)));
}

// ---------- events ----------
const actions={
 days:d=>{S.days=+d.d;render();loadStats()},
 table:d=>{S.tables[d.id]=!S.tables[d.id];render()},
 advance:async d=>{await api('PATCH','orders/'+d.id,{action:'advance'})},
 back:async d=>{await api('PATCH','orders/'+d.id,{action:'back'})},
 cancel:async d=>{if(confirm(`Cancel order ${d.no}? This cannot be undone.`))await api('PATCH','orders/'+d.id,{action:'cancel'})},
 simulate:async()=>{await api('POST','demo',{action:'order'})},
 seed:async()=>{const r=await api('POST','demo',{action:'seed'});toast(`Loaded ${r.created} demo orders`);loadStaff()},
 'clear-demo':async()=>{if(!confirm('Remove every demo order and the sample staff? Real orders and staff are kept.'))return;const r=await api('POST','demo',{action:'clear'});toast(`Removed ${r.removed} demo orders`);loadStaff()},
 'staff-new':()=>{S.staffEdit={};render();document.querySelector('#staff-form input')?.focus()},
 'staff-edit':d=>{S.staffEdit={id:d.id};render();document.querySelector('#staff-form input')?.focus()},
 'staff-cancel':()=>{S.staffEdit=null;render()},
 'staff-del':async d=>{if(!confirm(`Remove ${d.name}? Orders they handled keep their name.`))return;await api('DELETE','staff/'+d.id);S.staffEdit=null;await loadStaff();toast(`${d.name} removed`)},
 'order-filter':d=>{S.orderFilter=d.f;render();loadOrders()},
 'price-reset':async d=>{await api('PATCH','catalog/'+d.id,{price:null})}};
document.addEventListener('click',guard(async e=>{
 const tab=e.target.closest('#tabs button');
 if(tab){S.view=tab.dataset.view;history.replaceState(null,'','#'+S.view);render();loadView();return}
 const el=e.target.closest('[data-act]');if(el&&actions[el.dataset.act])await actions[el.dataset.act](el.dataset)}));
document.addEventListener('change',guard(async e=>{
 const t=e.target;
 if(t.dataset.check){(S.checks[t.dataset.check]||(S.checks[t.dataset.check]={}))[t.dataset.i]=t.checked;
  try{sessionStorage.setItem('pp-checks',JSON.stringify(S.checks))}catch(err){}}
 else if(t.dataset.assign){const id=t.dataset.assign,v=t.value;
  try{const o=await api('PATCH','orders/'+id,v?{action:'assign',driverId:v}:{action:'unassign'});if(S.active.has(id))S.active.set(id,o);render()}
  catch(err){render();throw err}}
 else if(t.dataset.staffActive){const id=t.dataset.staffActive;
  try{await api('PATCH','staff/'+id,{active:t.checked})}finally{await loadStaff()}}
 else if(t.dataset.avail){try{await api('PATCH','catalog/'+t.dataset.avail,{available:t.checked})}catch(err){t.checked=!t.checked;throw err}}
 else if(t.dataset.price){const v=Number(t.value);
  if(!Number.isInteger(v)||v<0){toast('Enter the price as a whole number of kroner',true);render();return}
  await api('PATCH','catalog/'+t.dataset.price,{price:v});toast('Price updated')}}));
let qTimer;
document.addEventListener('input',e=>{if(e.target.id==='order-q'){S.orderQuery=e.target.value;clearTimeout(qTimer);qTimer=setTimeout(loadOrders,250)}});
document.addEventListener('submit',guard(async e=>{
 e.preventDefault();
 if(e.target.id==='login'){
  $('login-err').textContent='';
  if(B)return B.login(); // the host signs the user in and comes back
  try{await api('POST','login',{password:$('pw').value})}catch(err){$('login-err').textContent=err.message;return}
  $('pw').value='';start()}
 else if(e.target.id==='staff-form'){const f=new FormData(e.target),b={};
  for(const k of['name','role','phone','vehicle','email','pin'])if(f.has(k))b[k]=f.get(k);
  if(b.pin==='')delete b.pin;
  const id=S.staffEdit?.id,r=id?await api('PATCH','staff/'+id,b):await api('POST','staff',b);
  S.staffEdit=null;await loadStaff();toast(id?'Saved':r.invited?`${r.name} added and invited`:`${r.name} added`)}
 else if(e.target.id==='settings-form'){const f=new FormData(e.target);
  S.settings=await api('PATCH','settings',{open:f.get('open')==='on',pauseMessage:f.get('pauseMessage'),
   deliveryFee:Number(f.get('deliveryFee')),deliveryRadiusKm:Number(f.get('deliveryRadiusKm')),etaMin:Number(f.get('etaMin')),pickupMin:Number(f.get('pickupMin'))});
  toast('Settings saved');render()}}));
$('store-btn').addEventListener('click',guard(async()=>{
 const open=S.settings?.open!==false;
 if(open&&!confirm('Pause ordering? Customers will not be able to place orders until you resume.'))return;
 S.settings=await api('PATCH','settings',{open:!open});render()}));
$('sound-btn').addEventListener('click',()=>{S.sound=!S.sound;render();beep()});
$('logout-btn').addEventListener('click',guard(async()=>{await api('POST','logout',{});showLogin()}));

// ---------- boot ----------
function showLogin(){es?.close();$('shell').hidden=true;$('login').hidden=false;
 if(B){$('pw').hidden=true;$('pw').required=false;$('pw').labels[0].hidden=true}else $('pw').focus()}
async function start(){
 let me;try{me=await api('GET','me')}catch(e){if(e.status===403){showLogin();$('login-err').textContent=e.message}return}
 S.tz=me.tz;S.targetMin=me.targetMin;S.staffAuth=me.staffAuth||'pin';
 $('login').hidden=true;$('shell').hidden=false;render();
 loadSettings();loadActive();loadStats();loadStaff();if(S.view==='orders')loadOrders();if(S.view==='menu')loadCatalog();
 connect();
}
setInterval(tickTimers,1000);
start();
