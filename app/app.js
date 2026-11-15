'use strict';
// Pio Pio Pizza — express ordering prototype. Dependency-free; state → render().

const {PIZZAS:MENU,SIZES,TOPPINGS,TOP_PRICE,MAX_TOPS,SIDES,DIPS,DESSERTS,BRANDS,BOTTLES,DRINKS,EXTRAS}=PIOPIO_MENU;
const FILTERS=[['all','All'],['veggie','🌱 Veggie'],['spicy','🌶️ Spicy'],['meat','🥩 Meat']];
const bottle=(b,z)=>`<span class="bottle${z==='15'?' big':''}" style="--c:${b.c}${b.l?`;--l:${b.l}`:''}"></span>`;
DRINKS.forEach(d=>{d.icon=bottle(BRANDS.find(b=>b.id===d.brand),d.size)});
const ADDRESSES=[{id:'home',icon:'🏠',name:'Home',line:'Thorvald Meyers gate 12',eta:17},
 {id:'work',icon:'💼',name:'Work',line:'Karl Johans gate 25',eta:21},
 {id:'gym',icon:'🏋️',name:'Gym',line:'Markveien 35',eta:14}];
const TOTAL=1200;
// Live values: replaced by the server's when the app is served by it (see syncMenu); defaults keep the standalone demo working
let FEE=PIOPIO_MENU.DELIVERY_FEE,LIVE=false,STORE={open:true,pauseMessage:'',pickupMin:12};
const STEPS=[
 {label:'Received',sub:'Kitchen has your order',color:'#3B82F6',tint:'rgba(59,130,246,.14)',fg:'#93C5FD',at:0},
 {label:'In Oven',sub:'Stone oven · 90 seconds at 450°C',color:'#F59E0B',tint:'rgba(245,158,11,.14)',fg:'#FCD34D',at:90},
 {label:'Out for Delivery',sub:'Jonas is on the way',color:'#8B5CF6',tint:'rgba(139,92,246,.16)',fg:'#C4B5FD',at:600},
 {label:'Arrived',sub:'Enjoy it hot',color:'#10B981',tint:'rgba(16,185,129,.14)',fg:'#6EE7B7',at:1200}];
const ROUTE=[[40,96],[150,96],[150,30],[250,30],[250,70],[318,70]];
const KEY='piopio-app-v2';
const SPEED=Number(new URLSearchParams(location.search).get('speed'))||60; // demo: ?speed=1 for real time

const $=id=>document.getElementById(id);
// A host page may provide its own backend (PP_BACKEND: menu/placeOrder/order) and image URLs (PP_IMAGES); the default is this site's /api.
const B=window.PP_BACKEND||null;
const img=id=>window.PP_IMAGES?.[id]||`images/${id}.png`;
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
 order:saved.order||null, // the order being tracked; has id/number/status when placed through the server
 last:saved.last||{lines:[{id:'pepperoni',size:'L',tops:[],qty:2}],extras:{'coke-15':1,garlic:2}}, // seeded "last order"
 filter:'all',
 drinkSize:'05',
 sheet:null, // {type:'pizza',id,size,tops,qty} | {type:'cart'} | {type:'address'} | {type:'pay'}
 toast:null};
for(const o of[S,S.last])for(const id of Object.keys(o.extras))if(!byId(EXTRAS,id))delete o.extras[id];
const save=()=>{const{lines,extras,mode,addr,screen,virt,last,order}=S;try{localStorage.setItem(KEY,JSON.stringify({lines,extras,mode,addr,screen,virt,last,order}))}catch(e){}};

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
 $('eta-text').textContent=S.mode==='delivery'?`⚡ ${a.eta} min`:`⚡ Ready in ${STORE.pickupMin} min`;
 $('fee-label').textContent=`(${FEE}kr)`;
 $('address-btn').innerHTML=S.mode==='delivery'
  ?`📍 Deliver to <b>${esc(a.line)}</b> <span class="chev">▼</span>`
  :`🛍️ Pick up at <b>Pio Pio Grünerløkka</b>`;
 $('address-btn').disabled=S.mode!=='delivery';

 const inProgress=S.order&&(S.order.id?!['done','cancelled'].includes(S.order.status):S.virt<TOTAL);
 $('reorder').innerHTML=(inProgress?`<button class="reorder track" data-act="track"><span class="ic">🛵</span>
   <span style="min-width:0"><div class="t">Order ${esc(S.order.number||'#PP-4821')} is on its way</div><div class="s">${esc(summary(S.order))}</div></span><span class="go">Track</span></button>`:'')
  +(S.last?`<button class="reorder" data-act="reorder">
   <span class="ic">↻</span><span style="min-width:0"><div class="t">Order again</div><div class="s">${esc(summary(S.last))}</div></span>
   <span class="go">Add all</span></button>`:'');

 $('chips').innerHTML=FILTERS.map(([id,l])=>`<button class="chip" role="tab" aria-selected="${S.filter===id}" data-act="filter" data-id="${id}">${l}</button>`).join('');

 const shown=MENU.filter(m=>S.filter==='all'||m.cats.includes(S.filter));
 const enter=lastFilter!==S.filter;lastFilter=S.filter;
 $('list').innerHTML=shown.length?shown.map((m,i)=>{
  const q=pizzaQty(m.id);
  return `<article class="card${q?' has':''}${m.soldOut?' sold':''}" style="${enter?`animation-delay:${i*40}ms`:'animation:none'}">
   <button class="pic" data-act="open-pizza" data-id="${m.id}" aria-label="Customize ${m.name}">
    <img src="${img(m.id)}" alt="${m.name} pizza" loading="lazy">${q?`<span class="qtyb">${q}</span>`:''}</button>
   <div class="body">
    <button class="name-row" data-act="open-pizza" data-id="${m.id}"><span class="name">${m.name}</span>${m.tag?`<span class="tag">${m.tag}</span>`:''}</button>
    <div class="ing">${m.ing}</div>
    <button class="custom" data-act="open-pizza" data-id="${m.id}">Size &amp; toppings ›</button>
    <div class="foot">
     <div class="price">${m.price} <small>kr</small></div>
     ${q?`<div class="stepper"><button data-act="dec" data-id="${m.id}" aria-label="Remove one ${m.name}">−</button><span>${q}</span><button class="plus" data-act="inc" data-id="${m.id}" aria-label="Add one ${m.name}">+</button></div>`
       :m.soldOut?`<button class="add" disabled>Sold out</button>`:`<button class="add" data-act="inc" data-id="${m.id}" aria-label="Add ${m.name}">Add <span>+</span></button>`}
    </div></div></article>`}).join(''):`<div class="empty-filter">Nothing here yet.</div>`;

 const card=e=>{const q=S.extras[e.id]||0;
  return `<button class="extra${q?' has':''}" data-act="extra" data-id="${e.id}" aria-label="Add ${e.name}" ${e.soldOut?'disabled':''}>
   <span class="em">${e.icon||e.em}</span><span class="n">${e.short||e.name}</span><span class="p">${e.size?byId(BOTTLES,e.size).label+' · ':''}${e.price} kr</span>
   <span class="pill">${e.soldOut?'Sold out':q?`${q} in bag · +`:'Add +'}</span></button>`};
 const row=(key,title,items,right='',two=false)=>`<div class="section-title"><span>${title}</span>${right}</div>
  <div class="extras${two?' two':''}" data-row="${key}">${items.map(card).join('')}</div>`;
 const sizeSeg=`<span class="size-seg" role="group" aria-label="Bottle size">${BOTTLES.map(z=>
  `<button data-act="drink-size" data-id="${z.id}" aria-pressed="${S.drinkSize===z.id}">${z.label}</button>`).join('')}</span>`;
 // keep each row's horizontal scroll position across re-renders
 const ex=$('extras'),pos={};ex.querySelectorAll('[data-row]').forEach(r=>{pos[r.dataset.row]=r.scrollLeft});
 ex.innerHTML=row('sides','Sides',SIDES)+row('dips','Dips',DIPS)
  +row('drinks','Drinks',DRINKS.filter(d=>d.size===S.drinkSize),sizeSeg,true)+row('desserts','Something sweet',DESSERTS);
 ex.querySelectorAll('[data-row]').forEach(r=>{r.scrollLeft=pos[r.dataset.row]||0});

 const empty=!t.items;
 $('cart-line').innerHTML=empty?`<span>Your bag is empty</span><span>${S.mode==='delivery'?`Delivery ${FEE} kr`:`Ready in ~${STORE.pickupMin} min`}</span>`
  :`<span class="l"><span class="bag${bagBump?' bump':''}">${t.items}</span>${t.sub} kr · <span class="view-link">View bag</span></span><span>${S.mode==='delivery'?`+ ${FEE} kr delivery`:`Ready in ~${STORE.pickupMin} min`}</span>`;
 $('cart-line').disabled=empty;bagBump=false;
 const seg=document.querySelector('.seg');seg.classList.toggle('pickup',S.mode==='pickup');
 seg.querySelectorAll('button').forEach(b=>b.setAttribute('aria-selected',b.dataset.mode===S.mode));
 $('cta').disabled=empty||!STORE.open;$('card-btn').disabled=empty||!STORE.open;
 $('cta').textContent=!STORE.open?(STORE.pauseMessage||'Kitchen paused — back soon'):empty?'Add a pizza to order':`⚡ Pay with Vipps • ${t.total} NOK`;
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
  body.innerHTML=`<div class="detail-img"><img src="${img(m.id)}" alt=""></div>
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
   <div style="margin-top:8px">${S.lines.map((l,i)=>`<div class="row"><div class="thumb"><img src="${img(l.id)}" alt=""></div>
     <div class="info"><b>${byId(MENU,l.id).name}</b><span>${esc(lineDesc(l))} · ${unitPrice(l)} kr</span></div>
     <div class="stepper"><button data-act="line" data-i="${i}" data-d="-1" aria-label="Fewer">−</button><span>${l.qty}</span><button class="plus" data-act="line" data-i="${i}" data-d="1" aria-label="More">+</button></div></div>`).join('')}
    ${EXTRAS.filter(e=>S.extras[e.id]).map(e=>`<div class="row"><div class="thumb">${e.icon||e.em}</div><div class="info"><b>${e.name}</b><span>${e.price} kr</span></div>
     <div class="stepper"><button data-act="cart-extra" data-id="${e.id}" data-d="-1" aria-label="Fewer">−</button><span>${S.extras[e.id]}</span><button class="plus" data-act="cart-extra" data-id="${e.id}" data-d="1" aria-label="More">+</button></div></div>`).join('')}</div>
   <div class="totals"><span>Subtotal</span><b>${t.sub} kr</b>${t.fee?`<span>Delivery</span><b>${t.fee} kr</b>`:''}<span>Total</span><b>${t.total} kr</b></div>
   <div class="sheet-foot"><button class="cta" data-act="pay">⚡ Pay with Vipps • ${t.total} NOK</button>
    <button class="card-btn" data-act="open-card" aria-label="Pay with debit or credit card"><span>💳</span>Card</button></div>`;
 }else if(sh.type==='address'){
  body.innerHTML=`<h2 class="sh-title">Deliver to</h2><div class="sh-sub">ETA updates with distance from the oven.</div><div style="margin-top:16px">
   ${ADDRESSES.map(a=>`<button class="addr" aria-pressed="${S.addr===a.id}" data-act="pick-addr" data-id="${a.id}"><span style="font-size:22px">${a.icon}</span>
    <span class="info"><b>${a.name}</b><span>${esc(a.line)}</span></span><span class="eta">${a.eta} min</span></button>`).join('')}</div>`;
 }else if(sh.type==='card'){
  // Inputs are not re-rendered while typing; values live in sh and are synced by the input handler
  if(!$('cc-num'))body.innerHTML=`<h2 class="sh-title">Pay with card</h2><div class="sh-sub">Debit or credit · Visa, Mastercard, Amex</div>
   <div class="field" id="f-num"><label for="cc-num">Card number</label>
    <input id="cc-num" inputmode="numeric" autocomplete="cc-number" placeholder="1234 5678 9012 3456" maxlength="23"><span class="brand" id="cc-brand"></span></div>
   <div class="field-row">
    <div class="field" id="f-exp"><label for="cc-exp">Expiry</label><input id="cc-exp" inputmode="numeric" autocomplete="cc-exp" placeholder="MM/YY" maxlength="5"></div>
    <div class="field" id="f-cvc"><label for="cc-cvc">CVC</label><input id="cc-cvc" inputmode="numeric" autocomplete="cc-csc" placeholder="123" maxlength="4"></div></div>
   <div class="cc-err" id="cc-err" role="alert"></div>
   <div class="sheet-foot"><button class="cta" id="cc-pay" data-act="pay-card"></button></div>
   <div class="cc-note">🔒 Demo only — no card is charged or stored.</div>`;
  $('cc-num').value=sh.num;$('cc-exp').value=sh.exp;$('cc-cvc').value=sh.cvc;syncCard();
 }else if(sh.type==='pay'){
  body.innerHTML=`<div class="vipps"><div class="spinner"></div><div class="sh-title" style="font-size:20px">${sh.method==='card'?'Processing payment…':'Confirm in Vipps'}</div>
   <div class="sh-sub">${sh.method==='card'?esc(sh.label)+' · ':''}${totals().total} NOK · ${S.mode==='delivery'?'Delivery':'Pickup'}</div></div>`;
 }
}

// ---------- card form ----------
const digits=s=>s.replace(/\D/g,'');
const cardBrand=n=>/^4/.test(n)?'Visa':/^(5[1-5]|2[2-7])/.test(n)?'Mastercard':/^3[47]/.test(n)?'Amex':'';
const luhn=n=>{let s=0;for(let i=n.length-1,d=false;i>=0;i--,d=!d){let x=+n[i];if(d&&(x*=2)>9)x-=9;s+=x}return n.length>0&&s%10===0};
function cardCheck(sh){
 const n=digits(sh.num),amex=cardBrand(n)==='Amex',len=amex?15:16,cv=amex?4:3;
 const numDone=n.length>=len,numOk=numDone&&luhn(n);
 const m=/^(\d\d)\/(\d\d)$/.exec(sh.exp),now=new Date();
 const expOk=!!m&&+m[1]>=1&&+m[1]<=12&&(2000+ +m[2])*12+ +m[1]>now.getFullYear()*12+now.getMonth();
 const cvcOk=sh.cvc.length===cv;
 const err=numDone&&!numOk?'Check the card number.':m&&!expOk?'This card has expired or the date is wrong.':'';
 return{ok:numOk&&expOk&&cvcOk,err,badNum:numDone&&!numOk,badExp:!!m&&!expOk,brand:cardBrand(n),last4:n.slice(-4)};
}
function syncCard(){
 const sh=S.sheet,c=cardCheck(sh);
 $('cc-brand').textContent=c.brand;$('cc-err').textContent=c.err;
 $('f-num').classList.toggle('bad',c.badNum);$('f-exp').classList.toggle('bad',c.badExp);
 $('cc-pay').disabled=!c.ok;$('cc-pay').textContent=`Pay ${totals().total} NOK`;
}
document.addEventListener('input',e=>{
 const sh=S.sheet,el=e.target;if(!sh||sh.type!=='card')return;
 if(el.id==='cc-num'){const n=digits(el.value).slice(0,cardBrand(digits(el.value))==='Amex'?15:16);
  el.value=sh.num=cardBrand(n)==='Amex'?[n.slice(0,4),n.slice(4,10),n.slice(10)].filter(Boolean).join(' '):n.replace(/(.{4})(?=.)/g,'$1 ')}
 else if(el.id==='cc-exp'){let d=digits(el.value).slice(0,4);if(d.length===1&&d>'1')d='0'+d;
  // keep the slash while typing forward, let it go when deleting
  el.value=sh.exp=d.length>2||(d.length===2&&e.inputType!=='deleteContentBackward')?d.slice(0,2)+'/'+d.slice(2):d}
 else if(el.id==='cc-cvc')el.value=sh.cvc=digits(el.value).slice(0,4);
 else return;
 syncCard();
});
function startPay(method,label){
 if(!totals().items||!STORE.open)return;S.sheet={type:'pay',method,label};
 const pause=new Promise(r=>setTimeout(r,1400)); // stands in for the payment provider's confirmation
 const local={lines:S.lines.map(l=>({...l})),extras:{...S.extras},total:totals().total};
 // Only the payment method goes to the server — never card details.
 const body={lines:local.lines,extras:local.extras,mode:S.mode,address:S.mode==='delivery'?byId(ADDRESSES,S.addr).line:'',payment:{method}};
 const placed=!LIVE?Promise.resolve(null):B?B.placeOrder(body):fetch('api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
  .then(async r=>{const b=await r.json().catch(()=>({}));if(!r.ok)throw new Error(b.error||'Could not place the order');return b});
 Promise.all([placed,pause]).then(([o])=>{
  S.order=o?{...local,id:o.id,number:o.number,total:o.total,status:o.status,createdAt:o.createdAt,times:o.times,skew:o.now-Date.now()}:local;
  S.last={lines:local.lines,extras:local.extras};S.lines=[];S.extras={};
  S.sheet=null;S.screen='tracker';S.virt=0;lastTick=Date.now();render();
 }).catch(e=>{S.sheet=null;showToast(e.message,null);render();syncMenu()});
}

// ---------- server sync ----------
// Prices, sold-out items and opening status come from the server when there is one.
async function syncMenu(){
 let m;try{if(B)m=await B.menu();else{const r=await fetch('api/menu',{cache:'no-store'});if(!r.ok)return;m=await r.json()}}catch(e){return}
 LIVE=true;STORE=m.settings;FEE=m.settings.deliveryFee;
 for(const it of[...MENU,...EXTRAS]){const s=m.items[it.id];if(s){it.price=s.price;it.soldOut=!s.available}}
 const gone=[...new Set([...S.lines.filter(l=>byId(MENU,l.id).soldOut).map(l=>byId(MENU,l.id).name),
  ...Object.keys(S.extras).filter(id=>byId(EXTRAS,id).soldOut).map(id=>byId(EXTRAS,id).name)])];
 if(gone.length){S.lines=S.lines.filter(l=>!byId(MENU,l.id).soldOut);for(const id of Object.keys(S.extras))if(byId(EXTRAS,id).soldOut)delete S.extras[id];
  showToast(`${gone.join(', ')} sold out — removed from your bag`,null)}
 if(S.sheet?.type==='pizza'&&byId(MENU,S.sheet.id).soldOut)S.sheet=null;
 if(S.sheet?.type!=='card')render();
}
async function syncOrder(){
 const o=S.order;if(!o?.id||['done','cancelled'].includes(o.status))return;
 try{let b;if(B)b=await B.order(o.id);else{const r=await fetch('api/orders/'+o.id,{cache:'no-store'});if(!r.ok)return;b=await r.json()}
  if(S.order!==o)return;o.status=b.status;o.times=b.times;o.skew=b.now-Date.now();save();if(S.screen==='tracker')renderTracker();else renderMenu()}catch(e){}
}

// ---------- render: tracker ----------
function along(f){let segs=[],L=0;for(let i=1;i<ROUTE.length;i++){const a=ROUTE[i-1],b=ROUTE[i],l=Math.hypot(b[0]-a[0],b[1]-a[1]);segs.push([a,b,l]);L+=l}
 let d=f*L;for(const[a,b,l]of segs){if(d<=l){const t=l?d/l:0;return[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]}d-=l}return ROUTE[ROUTE.length-1]}
function renderTracker(){
 const pick=S.mode==='pickup',order=S.order||{lines:S.lines,extras:S.extras,total:totals().total};
 // A server order follows the kitchen's real status and the real clock; the standalone demo follows a sped-up timer.
 const live=!!order.id,now=Date.now()+(order.skew||0),cancelled=live&&order.status==='cancelled';
 const v=live?Math.min(TOTAL,(now-order.createdAt)/1000):S.virt;
 const stage=live?({received:0,oven:1,out:2,ready:2,done:3}[order.status]??0):STEPS.reduce((a,s,i)=>v>=s.at?i:a,0);
 const done=stage===3,st=cancelled?{label:'Cancelled',color:'#EF4444',tint:'rgba(239,68,68,.14)',fg:'#FCA5A5'}:STEPS[stage],left=done||cancelled?0:Math.max(0,TOTAL-v);
 const outF=stage<2?0:done?1:live?Math.min(.95,(now-(order.times?.out||now))/480000):Math.min(1,(v-600)/600),[dx,dy]=along(outF);
 const number=esc(order.number?order.number.replace('PP-','#PP-'):'#PP-4821');
 const time=`${Math.floor(left/60)}:${String(Math.floor(left%60)).padStart(2,'0')}`;
 const label=i=>pick?['Received','In Oven','Ready for Pickup','Picked Up'][i]:STEPS[i].label;
 const sub=i=>pick&&i===2?'Head to the counter':pick&&i===3?'See you next time':STEPS[i].sub;
 $('tracker-body').innerHTML=`
  <header class="trk-head"><button class="round" data-act="back" aria-label="Back to menu">←</button>
   <div class="trk-id"><small>Order</small><b>${number}</b></div>
   <span class="badge" style="background:${st.tint};color:${st.fg}"><i style="background:${st.color}"></i>${pick&&stage===2?'Ready':st.label}</span></header>
  <div class="ring"><svg width="248" height="248" viewBox="0 0 248 248">
    <circle cx="124" cy="124" r="110" fill="none" stroke="#1F1F23" stroke-width="14"/>
    <circle cx="124" cy="124" r="110" fill="none" stroke="${done?'#10B981':'#FF5500'}" stroke-width="14" stroke-linecap="round" stroke-dasharray="691.15" stroke-dashoffset="${(691.15*(1-left/TOTAL)).toFixed(2)}"/></svg>
   <div class="c"><div class="cap">${cancelled?'Cancelled':done?(pick?'Picked up':'Arrived'):!left?'Any moment now':pick?'Ready in':'Arriving in'}</div><div class="t">${cancelled?'–':time}</div><div class="e">${cancelled?'Contact us if this is a mistake':done?'Enjoy!':live?'Live from the kitchen':`Speed: ${SPEED===1?'live':SPEED+'× demo'}`}</div></div></div>
  <div class="box steps">${STEPS.map((s,i)=>{const past=!cancelled&&i<stage,cur=!cancelled&&i===stage,on=past||cur;
   return `<div class="step"><div class="rail"><div class="dot" style="background:${on?s.color:'transparent'};border-color:${on?s.color:'#3F3F46'};box-shadow:${cur&&!done?`0 0 0 5px ${s.tint}`:'none'}">${past||(cur&&done)?'✓':''}</div>
    ${i<3?`<div class="ln" style="background:${past?STEPS[i+1].color:'#27272A'}"></div>`:''}</div>
    <div class="tx"><b style="color:${on?'#fff':'#71717A'}">${label(i)}</b><span>${sub(i)}</span></div></div>`}).join('')}</div>
  ${pick?`<div class="box" style="padding:16px"><b style="font-size:16px">Pick up at Pio Pio Grünerløkka</b><div class="sh-sub">Thorvald Meyers gate 12 · Show order ${number} at the counter</div></div>`
  :`<div class="box"><div class="map"><svg width="100%" height="128" viewBox="0 0 358 128" preserveAspectRatio="xMidYMid slice">
     <g stroke="#1E1E22" stroke-width="10" fill="none"><path d="M0 30H358M0 96H358M60 0V128M150 0V128M250 0V128M320 0V128"/></g>
     <path d="M40 96H150V30H250V70H318" fill="none" stroke="#3F3F46" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="2 8"/>
     <circle cx="40" cy="96" r="7" fill="#18181B" stroke="#FF5500" stroke-width="3"/><circle cx="318" cy="70" r="8" fill="#10B981"/>
     <circle cx="${dx.toFixed(1)}" cy="${dy.toFixed(1)}" r="14" fill="#8B5CF6" opacity=".25"/><circle cx="${dx.toFixed(1)}" cy="${dy.toFixed(1)}" r="7" fill="#8B5CF6" stroke="#fff" stroke-width="2"/></svg>
    <div class="dist">${stage<2?'Waiting at the kitchen':done?'Delivered':`${(2.4*(1-outF)).toFixed(1)} km away`}</div></div>
   <div class="driver"><div class="avatar">J</div><div style="flex:1;min-width:0"><b style="font-size:16px">Jonas</b><div class="sh-sub" style="margin:0">Electric scooter · EL 4821</div></div>
    <a class="call${stage===2?' live':''}" href="tel:+4700000000">📞 Call</a></div></div>`}
  <div class="summary"><span>${esc(summary(order))||'—'}</span><b>${order.total} kr</b></div>
  ${live?'':'<button class="ghost" data-act="restart">↺ Restart timer</button>'}`;
}

// ---------- render root ----------
function render(){
 $('menu').hidden=S.screen!=='menu';$('tracker').hidden=S.screen!=='tracker';
 if(S.screen==='menu')renderMenu();else renderTracker();
 renderSheet();save();
}

// ---------- events ----------
const actions={
 inc:d=>{if(!byId(MENU,d.id).soldOut)addLine({id:d.id,size:'M',tops:[]})},
 dec:d=>removeOne(d.id),
 filter:d=>{S.filter=d.id},
 'drink-size':d=>{S.drinkSize=d.id},
 extra:d=>{bumpExtra(d.id,1);showToast('Added '+byId(EXTRAS,d.id).name,()=>bumpExtra(d.id,-1))},
 mode:(d,el)=>{S.mode=el.dataset.mode},
 reorder:()=>{S.last.lines.filter(l=>!byId(MENU,l.id).soldOut).forEach(l=>addLine(l,l.qty,{toast:false}));
  Object.entries(S.last.extras).filter(([id])=>!byId(EXTRAS,id).soldOut).forEach(([id,q])=>{S.extras[id]=(S.extras[id]||0)+q});
  showToast('Last order added',null);bumpBag()},
 undo:()=>{S.toast?.undo?.();S.toast=null},
 'open-pizza':d=>{if(!byId(MENU,d.id).soldOut)S.sheet={type:'pizza',id:d.id,size:'M',tops:[],qty:1}},
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
 pay:()=>startPay('vipps'),
 'open-card':()=>{if(totals().items)S.sheet={type:'card',num:'',exp:'',cvc:''}},
 'pay-card':()=>{const c=cardCheck(S.sheet);if(c.ok)startPay('card',`${c.brand||'Card'} •••• ${c.last4}`)},
 back:()=>{S.screen='menu'},
 track:()=>{S.screen='tracker'},
 restart:()=>{S.virt=0;lastTick=Date.now()}};

document.addEventListener('click',e=>{
 const el=e.target.closest('[data-act]');if(!el||el.disabled)return;
 const fn=actions[el.dataset.act];if(!fn)return;
 fn(el.dataset,el);render();
});
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&S.sheet?.type==='card'&&e.target.tagName==='INPUT'){actions['pay-card']();render();return}
 if(e.key==='Escape'&&S.sheet&&S.sheet.type!=='pay'){S.sheet=null;render()}});

function heroTick(){const n=$('hero-num');n.classList.remove('tick');void n.offsetWidth;n.classList.add('tick')}

// Tracker clock
let lastTick=Date.now();
let ticks=0;
setInterval(()=>{const n=Date.now(),dt=(n-lastTick)/1000;lastTick=n;ticks++;
 if(S.order?.id){if(ticks%3===0)syncOrder();if(S.screen==='tracker')renderTracker()}
 else if(S.screen==='tracker'&&S.virt<TOTAL){S.virt=Math.min(TOTAL,S.virt+dt*SPEED);renderTracker();save()}
 if(ticks%20===0)syncMenu()},1000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){syncMenu();syncOrder()}});

render();
syncMenu();
