'use strict';
// Pio Pio Pizza — express ordering prototype. Dependency-free; state → render().

const MENU=[
 {id:'margherita',name:'Margherita',ing:'San Marzano, fior di latte, basil',price:149,cats:['veggie']},
 {id:'piopio',name:'Pio Pio',ing:'Peri-peri chicken, red onion, chili honey',price:189,tag:'Hot',cats:['spicy','meat']},
 {id:'pepperoni',name:'Pepperoni',ing:'Double pepperoni, mozzarella, oregano',price:179,cats:['meat']},
 {id:'funghi',name:'Funghi',ing:'Mushrooms, garlic cream, thyme, parmesan',price:179,cats:['veggie']},
 {id:'diavola',name:'Diavola',ing:'Spicy salami, nduja, jalapeño',price:189,cats:['spicy','meat']}];
const FILTERS=[['all','All'],['veggie','🌱 Veggie'],['spicy','🌶️ Spicy'],['meat','🥩 Meat']];
const SIZES=[{id:'S',label:'Small',cm:30,add:-20},{id:'M',label:'Medium',cm:33,add:0},{id:'L',label:'Large',cm:40,add:60}];
const TOPPINGS=[{id:'cheese',name:'Extra cheese'},{id:'jalapeno',name:'Jalapeño'},{id:'nduja',name:'Nduja'},
 {id:'mushroom',name:'Mushrooms'},{id:'onion',name:'Red onion'},{id:'honey',name:'Chili honey'}];
const TOP_PRICE=25,MAX_TOPS=3;
const EXTRAS=[{id:'coke',name:'Coca-Cola 0.5L',em:'🥤',price:39},{id:'garlic',name:'Garlic dip',em:'🧄',price:25},
 {id:'chili',name:'Chili honey',em:'🍯',price:25},{id:'tiramisu',name:'Tiramisu',em:'🍰',price:69}];
const ADDRESSES=[{id:'home',icon:'🏠',name:'Home',line:'Thorvald Meyers gate 12',eta:17},
 {id:'work',icon:'💼',name:'Work',line:'Karl Johans gate 25',eta:21},
 {id:'gym',icon:'🏋️',name:'Gym',line:'Markveien 35',eta:14}];
const FEE=49,TOTAL=1200;
const STEPS=[
 {label:'Received',sub:'Kitchen has your order',color:'#3B82F6',tint:'rgba(59,130,246,.14)',fg:'#93C5FD',at:0},
 {label:'In Oven',sub:'Stone oven · 90 seconds at 450°C',color:'#F59E0B',tint:'rgba(245,158,11,.14)',fg:'#FCD34D',at:90},
 {label:'Out for Delivery',sub:'Jonas is on the way',color:'#8B5CF6',tint:'rgba(139,92,246,.16)',fg:'#C4B5FD',at:600},
 {label:'Arrived',sub:'Enjoy it hot',color:'#10B981',tint:'rgba(16,185,129,.14)',fg:'#6EE7B7',at:1200}];
const ROUTE=[[40,96],[150,96],[150,30],[250,30],[250,70],[318,70]];
const KEY='piopio-app-v1';
const SPEED=Number(new URLSearchParams(location.search).get('speed'))||60; // demo: ?speed=1 for real time

const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const byId=(arr,id)=>arr.find(x=>x.id===id);

// ---------- state ----------
let saved={};try{saved=JSON.parse(localStorage.getItem(KEY))||{}}catch(e){}
const S={
 lines:saved.lines||[{id:'piopio',size:'M',tops:[],qty:1}], // pizza lines (same pizza can have several configs)
 extras:saved.extras||{},
 mode:saved.mode||'delivery',
 addr:saved.addr||'home',
 screen:saved.screen||'menu',
 virt:saved.virt||0,
 last:saved.last||{lines:[{id:'pepperoni',size:'L',tops:[],qty:2}],extras:{coke:2}}, // seeded "last order"
 filter:'all',
 sheet:null, // {type:'pizza',id,size,tops,qty} | {type:'cart'} | {type:'address'} | {type:'pay'}
 toast:null};
const save=()=>{const{lines,extras,mode,addr,screen,virt,last}=S;try{localStorage.setItem(KEY,JSON.stringify({lines,extras,mode,addr,screen,virt,last}))}catch(e){}};

const unitPrice=l=>byId(MENU,l.id).price+byId(SIZES,l.size).add+l.tops.length*TOP_PRICE;
const sameCfg=(a,b)=>a.id===b.id&&a.size===b.size&&a.tops.join()===b.tops.join();
const pizzaQty=id=>S.lines.filter(l=>l.id===id).reduce((a,l)=>a+l.qty,0);
function totals(){
 const pizzas=S.lines.reduce((a,l)=>a+l.qty,0);
 const items=pizzas+Object.values(S.extras).reduce((a,b)=>a+b,0);
 const sub=S.lines.reduce((a,l)=>a+l.qty*unitPrice(l),0)+EXTRAS.reduce((a,e)=>a+(S.extras[e.id]||0)*e.price,0);
 const fee=S.mode==='delivery'&&items?FEE:0;
 return{pizzas,items,sub,fee,total:sub+fee};
}
const lineDesc=l=>{const z=byId(SIZES,l.size);return[z.label+' '+z.cm+'cm',...l.tops.map(t=>'+'+byId(TOPPINGS,t).name)].join(' · ')};
const summary=o=>[...o.lines.map(l=>`${l.qty}× ${byId(MENU,l.id).name}`),
 ...Object.entries(o.extras).filter(([,q])=>q).map(([id,q])=>`${q}× ${byId(EXTRAS,id).name}`)].join(', ');

// ---------- mutations ----------
function addLine(cfg,qty=1,{toast=true}={}){
 const hit=S.lines.find(l=>sameCfg(l,cfg));
 if(hit)hit.qty+=qty;else S.lines.push({id:cfg.id,size:cfg.size,tops:[...cfg.tops],qty});
 if(toast)showToast(`Added ${qty>1?qty+'× ':''}${byId(MENU,cfg.id).name}`,()=>{
  // undo = remove exactly what was added
  const l=S.lines.find(x=>sameCfg(x,cfg));if(l){l.qty-=qty;if(l.qty<=0)S.lines.splice(S.lines.indexOf(l),1)}
 });
 bumpBag();
}
function removeOne(id){ // newest config of this pizza goes first
 for(let i=S.lines.length-1;i>=0;i--)if(S.lines[i].id===id){if(--S.lines[i].qty<=0)S.lines.splice(i,1);return}
}
function bumpExtra(id,d){const q=Math.max(0,(S.extras[id]||0)+d);if(q)S.extras[id]=q;else delete S.extras[id];if(d>0)bumpBag()}

let toastTimer;
function showToast(text,undo){clearTimeout(toastTimer);S.toast={text,undo};toastTimer=setTimeout(()=>{S.toast=null;renderToast()},2600)}
let bagBump=false;const bumpBag=()=>{bagBump=true};

// ---------- render: menu ----------
let lastFilter=null;
function renderMenu(){
 const t=totals(),a=byId(ADDRESSES,S.addr);
 $('eta-text').textContent=S.mode==='delivery'?`⚡ ${a.eta} min`:'⚡ Ready in 12 min';
 $('address-btn').innerHTML=S.mode==='delivery'
  ?`📍 Deliver to <b>${esc(a.line)}</b> <span class="chev">▼</span>`
  :`🛍️ Pick up at <b>Pio Pio Grünerløkka</b>`;
 $('address-btn').disabled=S.mode!=='delivery';

 $('reorder').innerHTML=S.last?`<button class="reorder" data-act="reorder">
   <span class="ic">↻</span><span style="min-width:0"><div class="t">Order again</div><div class="s">${esc(summary(S.last))}</div></span>
   <span class="go">Add all</span></button>`:'';

 $('chips').innerHTML=FILTERS.map(([id,l])=>`<button class="chip" role="tab" aria-selected="${S.filter===id}" data-act="filter" data-id="${id}">${l}</button>`).join('');

 const shown=MENU.filter(m=>S.filter==='all'||m.cats.includes(S.filter));
 const enter=lastFilter!==S.filter;lastFilter=S.filter;
 $('list').innerHTML=shown.length?shown.map((m,i)=>{
  const q=pizzaQty(m.id);
  return `<article class="card${q?' has':''}" style="${enter?`animation-delay:${i*40}ms`:'animation:none'}">
   <button class="pic" data-act="open-pizza" data-id="${m.id}" aria-label="Customize ${m.name}">
    <img src="images/${m.id}.png" alt="${m.name} pizza" loading="lazy">${q?`<span class="qtyb">${q}</span>`:''}</button>
   <div class="body">
    <button class="name-row" data-act="open-pizza" data-id="${m.id}"><span class="name">${m.name}</span>${m.tag?`<span class="tag">${m.tag}</span>`:''}</button>
    <div class="ing">${m.ing}</div>
    <button class="custom" data-act="open-pizza" data-id="${m.id}">Size &amp; toppings ›</button>
    <div class="foot">
     <div class="price">${m.price} <small>kr</small></div>
     ${q?`<div class="stepper"><button data-act="dec" data-id="${m.id}" aria-label="Remove one ${m.name}">−</button><span>${q}</span><button class="plus" data-act="inc" data-id="${m.id}" aria-label="Add one ${m.name}">+</button></div>`
       :`<button class="add" data-act="inc" data-id="${m.id}" aria-label="Add ${m.name}">Add <span>+</span></button>`}
    </div></div></article>`}).join(''):`<div class="empty-filter">Nothing here yet.</div>`;

 $('extras').innerHTML=EXTRAS.map(e=>{const q=S.extras[e.id]||0;
  return `<button class="extra${q?' has':''}" data-act="extra" data-id="${e.id}" aria-label="Add ${e.name}">
   <span class="em">${e.em}</span><span class="n">${e.name}</span><span class="p">${e.price} kr</span>
   <span class="pill">${q?`${q} in bag · +`:'Add +'}</span></button>`}).join('');

 const empty=!t.items;
 $('cart-line').innerHTML=empty?`<span>Your bag is empty</span><span>${S.mode==='delivery'?'Delivery 49 kr':'Ready in ~12 min'}</span>`
  :`<span class="l"><span class="bag${bagBump?' bump':''}">${t.items}</span>${t.sub} kr · <span class="view-link">View bag</span></span><span>${S.mode==='delivery'?'+ 49 kr delivery':'Ready in ~12 min'}</span>`;
 $('cart-line').disabled=empty;bagBump=false;
 const seg=document.querySelector('.seg');seg.classList.toggle('pickup',S.mode==='pickup');
 seg.querySelectorAll('button').forEach(b=>b.setAttribute('aria-selected',b.dataset.mode===S.mode));
 $('cta').disabled=empty;
 $('cta').textContent=empty?'Add a pizza to order':`⚡ Pay with Vipps • ${t.total} NOK`;
 renderToast();
}
function renderToast(){
 const el=$('toast');el.classList.toggle('on',!!S.toast);
 if(S.toast)el.innerHTML=`<span>✓ ${esc(S.toast.text)}</span>${S.toast.undo?'<button data-act="undo">Undo</button>':''}`;
}

// ---------- render: sheets ----------
function renderSheet(){
 const sh=S.sheet;$('overlay').classList.toggle('on',!!sh);$('sheet').classList.toggle('on',!!sh);
 if(!sh)return;
 const body=$('sheet-body');
 if(sh.type==='pizza'){
  const m=byId(MENU,sh.id),unit=unitPrice(sh);
  body.innerHTML=`<div class="detail-img"><img src="images/${m.id}.png" alt=""></div>
   <h2 class="sh-title">${m.name} ${m.tag?`<span class="tag">${m.tag}</span>`:''}</h2><div class="sh-sub">${m.ing}</div>
   <div class="sh-label"><span>Size</span></div>
   <div class="sizes">${SIZES.map(z=>`<button class="opt" aria-pressed="${sh.size===z.id}" data-act="size" data-id="${z.id}">${z.label}<small>${z.cm} cm · ${m.price+z.add} kr</small></button>`).join('')}</div>
   <div class="sh-label"><span>Extra toppings · +${TOP_PRICE} kr</span><span>${sh.tops.length}/${MAX_TOPS}</span></div>
   <div class="tops">${TOPPINGS.map(tp=>{const on=sh.tops.includes(tp.id);
    return `<button class="opt" aria-pressed="${on}" data-act="top" data-id="${tp.id}" ${!on&&sh.tops.length>=MAX_TOPS?'disabled':''}>${tp.name}<small>${on?'✓':'+'}</small></button>`}).join('')}</div>
   <div class="sheet-foot">
    <div class="stepper"><button data-act="sh-qty" data-d="-1" aria-label="Fewer">−</button><span>${sh.qty}</span><button class="plus" data-act="sh-qty" data-d="1" aria-label="More">+</button></div>
    <button class="cta" data-act="sh-add">Add · ${unit*sh.qty} kr</button></div>`;
 }else if(sh.type==='cart'){
  const t=totals();
  if(!t.items){S.sheet=null;return renderSheet()}
  body.innerHTML=`<h2 class="sh-title">Your bag</h2><div class="sh-sub">${S.mode==='delivery'?'Delivery to '+esc(byId(ADDRESSES,S.addr).line):'Pickup at Grünerløkka'}</div>
   <div style="margin-top:8px">${S.lines.map((l,i)=>`<div class="row"><div class="thumb"><img src="images/${l.id}.png" alt=""></div>
     <div class="info"><b>${byId(MENU,l.id).name}</b><span>${esc(lineDesc(l))} · ${unitPrice(l)} kr</span></div>
     <div class="stepper"><button data-act="line" data-i="${i}" data-d="-1" aria-label="Fewer">−</button><span>${l.qty}</span><button class="plus" data-act="line" data-i="${i}" data-d="1" aria-label="More">+</button></div></div>`).join('')}
    ${EXTRAS.filter(e=>S.extras[e.id]).map(e=>`<div class="row"><div class="thumb">${e.em}</div><div class="info"><b>${e.name}</b><span>${e.price} kr</span></div>
     <div class="stepper"><button data-act="cart-extra" data-id="${e.id}" data-d="-1" aria-label="Fewer">−</button><span>${S.extras[e.id]}</span><button class="plus" data-act="cart-extra" data-id="${e.id}" data-d="1" aria-label="More">+</button></div></div>`).join('')}</div>
   <div class="totals"><span>Subtotal</span><b>${t.sub} kr</b>${t.fee?`<span>Delivery</span><b>${t.fee} kr</b>`:''}<span>Total</span><b>${t.total} kr</b></div>
   <div class="sheet-foot"><button class="cta" data-act="pay">⚡ Pay with Vipps • ${t.total} NOK</button></div>`;
 }else if(sh.type==='address'){
  body.innerHTML=`<h2 class="sh-title">Deliver to</h2><div class="sh-sub">ETA updates with distance from the oven.</div><div style="margin-top:16px">
   ${ADDRESSES.map(a=>`<button class="addr" aria-pressed="${S.addr===a.id}" data-act="pick-addr" data-id="${a.id}"><span style="font-size:22px">${a.icon}</span>
    <span class="info"><b>${a.name}</b><span>${esc(a.line)}</span></span><span class="eta">${a.eta} min</span></button>`).join('')}</div>`;
 }else if(sh.type==='pay'){
  body.innerHTML=`<div class="vipps"><div class="spinner"></div><div class="sh-title" style="font-size:20px">Confirm in Vipps</div>
   <div class="sh-sub">${totals().total} NOK · ${S.mode==='delivery'?'Delivery':'Pickup'}</div></div>`;
 }
}

// ---------- render: tracker ----------
function along(f){let segs=[],L=0;for(let i=1;i<ROUTE.length;i++){const a=ROUTE[i-1],b=ROUTE[i],l=Math.hypot(b[0]-a[0],b[1]-a[1]);segs.push([a,b,l]);L+=l}
 let d=f*L;for(const[a,b,l]of segs){if(d<=l){const t=l?d/l:0;return[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]}d-=l}return ROUTE[ROUTE.length-1]}
function renderTracker(){
 const v=S.virt,pick=S.mode==='pickup',order=S.order||{lines:S.lines,extras:S.extras,total:totals().total};
 const stage=STEPS.reduce((a,s,i)=>v>=s.at?i:a,0),st=STEPS[stage],left=Math.max(0,TOTAL-v),done=stage===3;
 const outF=stage<2?0:Math.min(1,(v-600)/600),[dx,dy]=along(outF);
 const time=`${Math.floor(left/60)}:${String(Math.floor(left%60)).padStart(2,'0')}`;
 const label=i=>pick?['Received','In Oven','Ready for Pickup','Picked Up'][i]:STEPS[i].label;
 const sub=i=>pick&&i===2?'Head to the counter':pick&&i===3?'See you next time':STEPS[i].sub;
 $('tracker-body').innerHTML=`
  <header class="trk-head"><button class="round" data-act="back" aria-label="Back to menu">←</button>
   <div class="trk-id"><small>Order</small><b>#PP-4821</b></div>
   <span class="badge" style="background:${st.tint};color:${st.fg}"><i style="background:${st.color}"></i>${pick&&stage===2?'Ready':st.label}</span></header>
  <div class="ring"><svg width="248" height="248" viewBox="0 0 248 248">
    <circle cx="124" cy="124" r="110" fill="none" stroke="#1F1F23" stroke-width="14"/>
    <circle cx="124" cy="124" r="110" fill="none" stroke="${done?'#10B981':'#FF5500'}" stroke-width="14" stroke-linecap="round" stroke-dasharray="691.15" stroke-dashoffset="${(691.15*(1-left/TOTAL)).toFixed(2)}"/></svg>
   <div class="c"><div class="cap">${done?'Arrived':pick?'Ready in':'Arriving in'}</div><div class="t">${time}</div><div class="e">${done?'Enjoy!':`Speed: ${SPEED===1?'live':SPEED+'× demo'}`}</div></div></div>
  <div class="box steps">${STEPS.map((s,i)=>{const past=i<stage,cur=i===stage,on=past||cur;
   return `<div class="step"><div class="rail"><div class="dot" style="background:${on?s.color:'transparent'};border-color:${on?s.color:'#3F3F46'};box-shadow:${cur&&!done?`0 0 0 5px ${s.tint}`:'none'}">${past||(cur&&done)?'✓':''}</div>
    ${i<3?`<div class="ln" style="background:${past?STEPS[i+1].color:'#27272A'}"></div>`:''}</div>
    <div class="tx"><b style="color:${on?'#fff':'#71717A'}">${label(i)}</b><span>${sub(i)}</span></div></div>`}).join('')}</div>
  ${pick?`<div class="box" style="padding:16px"><b style="font-size:16px">Pick up at Pio Pio Grünerløkka</b><div class="sh-sub">Thorvald Meyers gate 12 · Show order #PP-4821 at the counter</div></div>`
  :`<div class="box"><div class="map"><svg width="100%" height="128" viewBox="0 0 358 128" preserveAspectRatio="xMidYMid slice">
     <g stroke="#1E1E22" stroke-width="10" fill="none"><path d="M0 30H358M0 96H358M60 0V128M150 0V128M250 0V128M320 0V128"/></g>
     <path d="M40 96H150V30H250V70H318" fill="none" stroke="#3F3F46" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="2 8"/>
     <circle cx="40" cy="96" r="7" fill="#18181B" stroke="#FF5500" stroke-width="3"/><circle cx="318" cy="70" r="8" fill="#10B981"/>
     <circle cx="${dx.toFixed(1)}" cy="${dy.toFixed(1)}" r="14" fill="#8B5CF6" opacity=".25"/><circle cx="${dx.toFixed(1)}" cy="${dy.toFixed(1)}" r="7" fill="#8B5CF6" stroke="#fff" stroke-width="2"/></svg>
    <div class="dist">${stage<2?'Waiting at the kitchen':done?'Delivered':`${(2.4*(1-outF)).toFixed(1)} km away`}</div></div>
   <div class="driver"><div class="avatar">J</div><div style="flex:1;min-width:0"><b style="font-size:16px">Jonas</b><div class="sh-sub" style="margin:0">Electric scooter · EL 4821</div></div>
    <a class="call${stage===2?' live':''}" href="tel:+4700000000">📞 Call</a></div></div>`}
  <div class="summary"><span>${esc(summary(order))||'—'}</span><b>${order.total} kr</b></div>
  <button class="ghost" data-act="restart">↺ Restart timer</button>`;
}

// ---------- render root ----------
function render(){
 $('menu').hidden=S.screen!=='menu';$('tracker').hidden=S.screen!=='tracker';
 if(S.screen==='menu')renderMenu();else renderTracker();
 renderSheet();save();
}

// ---------- events ----------
const actions={
 inc:d=>addLine({id:d.id,size:'M',tops:[]}),
 dec:d=>removeOne(d.id),
 filter:d=>{S.filter=d.id},
 extra:d=>{bumpExtra(d.id,1);showToast('Added '+byId(EXTRAS,d.id).name,()=>bumpExtra(d.id,-1))},
 mode:(d,el)=>{S.mode=el.dataset.mode},
 reorder:()=>{S.last.lines.forEach(l=>addLine(l,l.qty,{toast:false}));Object.entries(S.last.extras).forEach(([id,q])=>{S.extras[id]=(S.extras[id]||0)+q});
  showToast('Last order added',null);bumpBag()},
 undo:()=>{S.toast?.undo?.();S.toast=null},
 'open-pizza':d=>{S.sheet={type:'pizza',id:d.id,size:'M',tops:[],qty:1}},
 'open-cart':()=>{S.sheet={type:'cart'}},
 'open-address':()=>{S.sheet={type:'address'}},
 'close-sheet':()=>{if(S.sheet?.type!=='pay')S.sheet=null},
 size:d=>{S.sheet.size=d.id},
 top:d=>{const t=S.sheet.tops,i=t.indexOf(d.id);if(i>=0)t.splice(i,1);else if(t.length<MAX_TOPS)t.push(d.id);
  t.sort((a,b)=>TOPPINGS.findIndex(x=>x.id===a)-TOPPINGS.findIndex(x=>x.id===b))},
 'sh-qty':d=>{S.sheet.qty=Math.max(1,S.sheet.qty+Number(d.d))},
 'sh-add':()=>{const sh=S.sheet;S.sheet=null;addLine(sh,sh.qty)},
 line:d=>{const l=S.lines[d.i];l.qty+=Number(d.d);if(l.qty<=0)S.lines.splice(d.i,1)},
 'cart-extra':d=>bumpExtra(d.id,Number(d.d)),
 'pick-addr':d=>{S.addr=d.id;S.sheet=null;heroTick()},
 pay:()=>{if(!totals().items)return;S.sheet={type:'pay'};
  setTimeout(()=>{const t=totals();S.order={lines:S.lines.map(l=>({...l})),extras:{...S.extras},total:t.total};
   S.last={lines:S.order.lines,extras:S.order.extras};S.sheet=null;S.screen='tracker';S.virt=0;lastTick=Date.now();render()},1400)},
 back:()=>{S.screen='menu'},
 restart:()=>{S.virt=0;lastTick=Date.now()}};

document.addEventListener('click',e=>{
 const el=e.target.closest('[data-act]');if(!el||el.disabled)return;
 const fn=actions[el.dataset.act];if(!fn)return;
 fn(el.dataset,el);render();
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&S.sheet&&S.sheet.type!=='pay'){S.sheet=null;render()}});

function heroTick(){const n=$('hero-num');n.classList.remove('tick');void n.offsetWidth;n.classList.add('tick')}

// Tracker clock
let lastTick=Date.now();
setInterval(()=>{const n=Date.now(),dt=(n-lastTick)/1000;lastTick=n;
 if(S.screen==='tracker'&&S.virt<TOTAL){S.virt=Math.min(TOTAL,S.virt+dt*SPEED);renderTracker();save()}},1000);

render();
