'use strict';
// Pio Pio Pizzeria — landing page and ordering. Dependency-free; state → render().
// The order flow: 1) pick pizza and extras on the landing page, 2) contact details and delivery address, 3) payment.

const {PIZZAS:MENU,SIZES,TOPPINGS,TOP_PRICE,MAX_TOPS,SIDES,DIPS,DESSERTS,BRANDS,BOTTLES,DRINKS,EXTRAS}=window.PIOPIO_MENU;
const FILTERS=[['all','Alle'],['veggie','🌱 Vegetar'],['spicy','🌶️ Sterk'],['meat','🥩 Kjøtt']];
const bottle=(b,z)=>`<span class="bottle${z==='15'?' big':''}" style="--c:${b.c}${b.l?`;--l:${b.l}`:''}"></span>`;
DRINKS.forEach(d=>{d.icon=bottle(BRANDS.find(b=>b.id===d.brand),d.size)});
const C=window.PP_CORE; // shared order rules: phone format, distances, the shop
const SHOP=C.SHOP;
const TOTAL=1200;
// Live values: replaced by the server's when the app is served by it (see syncMenu); defaults keep the standalone demo working
let FEE=window.PIOPIO_MENU.DELIVERY_FEE,LIVE=false,STORE={...C.DEFAULT_SETTINGS};
const STEPS=[
 {label:'Mottatt',sub:'Kjøkkenet har bestillingen din',color:'#2563EB',tint:'rgba(37,99,235,.10)',fg:'#1D4ED8',at:0},
 {label:'I ovnen',sub:'Steinovn · 90 sekunder på 450 °C',color:'#F59E0B',tint:'rgba(245,158,11,.16)',fg:'#B45309',at:90},
 {label:'Ute for levering',sub:'Budet er på vei',color:'#7C3AED',tint:'rgba(124,58,237,.10)',fg:'#6D28D9',at:600},
 {label:'Levert',sub:'Nyt den mens den er varm',color:'#10B981',tint:'rgba(16,185,129,.12)',fg:'#047857',at:1200}];
// The driver in the stand-alone demo, when there is no kitchen to assign a real one
const DEMO_DRIVER={name:'Jonas Berg',vehicle:'Elsparkesykkel · EL 4821',phone:''};
const KEY='piopio-web-v3',OLD_KEY='piopio-app-v2';
const SPEED=Number(new URLSearchParams(location.search).get('speed'))||60; // demo: ?speed=1 for real time

const $=id=>document.getElementById(id);
const $$=sel=>document.querySelectorAll(sel);
// A host page may provide its own backend (PP_BACKEND: menu/placeOrder/order) and image URLs (PP_IMAGES); the default is this site's /api.
const B=window.PP_BACKEND||null;
const img=id=>window.PP_IMAGES?.[id]||`images/${id}.png`;
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const byId=(arr,id)=>arr.find(x=>x.id===id);
const kr=n=>`${n} kr`;

// ---------- state ----------
let saved={};try{saved=JSON.parse(localStorage.getItem(KEY))||null;
 if(!saved){const o=JSON.parse(localStorage.getItem(OLD_KEY))||{}; // keep what a returning customer told us before
  saved={address:o.address,recent:o.recent,customer:o.customer,note:o.note,order:o.order}}}catch(e){saved={}}
const S={
 lines:saved.lines||[],        // pizza lines (same pizza can have several configs)
 extras:saved.extras||{},
 mode:saved.mode||'delivery',
 address:saved.address||null, // {line, post, lat, lng} picked from the address register
 recent:saved.recent||[],      // the last few addresses used, newest first
 customer:saved.customer||{name:'',phone:''},
 note:saved.note||'',          // message for the driver: floor, door code …
 screen:saved.screen||'menu',  // menu | checkout | tracker
 step:saved.step||2,           // checkout step: 2 details & address, 3 payment
 pay:saved.pay||'vipps',       // vipps | card
 virt:saved.virt||0,
 order:saved.order||null,      // the order being tracked; has id/number/status when placed through the server
 last:saved.last||null,        // the previous order, for "Bestill igjen"
 filter:'all',
 drinkSize:'05',
 sheet:null, // {type:'pizza',id,size,tops,qty} | {type:'cart'} | {type:'pay'}
 toast:null};
for(const o of[S,S.last].filter(Boolean))for(const id of Object.keys(o.extras||{}))if(!byId(EXTRAS,id))delete o.extras[id];
// drop basket lines from an older menu (sizes and toppings that no longer exist)
const validLine=l=>byId(MENU,l.id)&&byId(SIZES,l.size)&&(l.tops||[]).every(t=>byId(TOPPINGS,t));
S.lines=S.lines.filter(validLine);if(S.last){S.last.lines=S.last.lines.filter(validLine);if(!S.last.lines.length&&!Object.keys(S.last.extras).length)S.last=null}
const save=()=>{const{lines,extras,mode,address,recent,customer,note,screen,step,pay,virt,last,order}=S;
 try{localStorage.setItem(KEY,JSON.stringify({lines,extras,mode,address,recent,customer,note,screen,step,pay,virt,last,order}))}catch(e){}};
// address search and card form: live only while the checkout is open, never stored
const AS={q:'',hits:null,state:'',edit:false};
const CARD={num:'',exp:'',cvc:''};

// ---------- delivery address & contact details ----------
const kmTo=a=>C.distKm(SHOP,a);
const inRange=a=>!!a&&kmTo(a)<=STORE.deliveryRadiusKm;
const kmText=k=>k<1?Math.round(k*1000)+' m':k.toFixed(1).replace('.',',')+' km';
const radius=()=>String(STORE.deliveryRadiusKm).replace('.',',');
const etaFor=a=>STORE.etaMin+Math.max(0,Math.round((kmTo(a)-1.5)*3)); // a few minutes more per km beyond the neighbourhood
const nameOk=()=>S.customer.name.trim().length>=2,phoneOk=()=>!!C.normPhone(S.customer.phone);

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
const lineDesc=l=>{const z=byId(SIZES,l.size);return[SIZES.length>1&&z?z.label+' '+z.cm+' cm':'',...l.tops.map(t=>'+'+byId(TOPPINGS,t).name)].filter(Boolean).join(' · ')||'Vanlig bunn'};
const pic=id=>img(byId(MENU,id)?.photo||id);
const summary=o=>[...o.lines.map(l=>`${l.qty}× ${byId(MENU,l.id)?.name||l.name}`),
 ...Object.entries(o.extras).filter(([,q])=>q).map(([id,q])=>`${q}× ${byId(EXTRAS,id)?.name||id}`)].join(', ');

// ---------- mutations ----------
function addLine(cfg,qty=1,{toast=true}={}){
 const hit=S.lines.find(l=>sameCfg(l,cfg));
 if(hit)hit.qty+=qty;else S.lines.push({id:cfg.id,size:cfg.size,tops:[...cfg.tops],qty});
 if(toast)showToast(`La til ${qty>1?qty+'× ':''}${byId(MENU,cfg.id).name}`,()=>{
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
function showToast(text,undo,warn){clearTimeout(toastTimer);S.toast={text,undo,warn};toastTimer=setTimeout(()=>{S.toast=null;renderToast()},2800)}
let bagBump=false;const bumpBag=()=>{bagBump=true};
const stepper=(act,attrs,q,label)=>`<div class="stepper"><button data-act="${act}" ${attrs} data-d="-1" aria-label="Fjern én ${label}">−</button><span>${q}</span><button data-act="${act}" ${attrs} data-d="1" aria-label="Legg til én ${label}">+</button></div>`;

// ---------- render: header, bar, shared bits ----------
function renderChrome(){
 const t=totals();
 $('cart-btn').innerHTML=`<span class="bag-ic${bagBump?' bump':''}" aria-hidden="true">🛒</span><span class="cart-txt">${t.items?kr(t.sub):'Handlekurv'}</span>${t.items?`<span class="count">${t.items}</span>`:''}`;
 $('cart-btn').setAttribute('aria-label',t.items?`Handlekurv, ${t.items} varer, ${t.sub} kr`:'Handlekurv, tom');
 // the sticky order bar: always one tap from the checkout once something is in the basket
 const show=S.screen==='menu'&&t.items>0&&!S.sheet;
 $('mbar').classList.toggle('on',show);
 if(show)$('mbar').innerHTML=`<button class="mbar-cart" data-act="open-cart"><span class="count">${t.items}</span><span class="mbar-lbl">Se handlekurven</span><span aria-hidden="true" class="mbar-ic">🛒</span></button>
  <button class="btn primary" data-act="go-checkout" ${STORE.open?'':'disabled'}>${STORE.open?`Til kassen · ${kr(t.sub)} <span aria-hidden="true">→</span>`:'Stengt akkurat nå'}</button>`;
 bagBump=false;
 renderToast();
}
function renderToast(){
 const el=$('toast');el.classList.toggle('on',!!S.toast);el.classList.toggle('raised',$('mbar').classList.contains('on'));
 if(S.toast)el.innerHTML=`<span>${S.toast.warn?'':'✓ '}${esc(S.toast.text)}</span>${S.toast.undo?'<button data-act="undo">Angre</button>':''}`;
}
const stepNav=cur=>`<ol class="stepnav" aria-label="Bestillingssteg">${['Velg pizza','Levering og opplysninger','Betaling'].map((l,i)=>{const n=i+1;
 return`<li class="${n<cur?'done':n===cur?'cur':''}"${n===cur?' aria-current="step"':''}>${n<cur?`<button data-act="${n===1?'open-cart':'edit-details'}"><span class="n">✓</span>${l}</button>`:`<span class="n">${n}</span>${l}`}</li>`}).join('')}</ol>`;

// ---------- render: landing page & menu ----------
let lastFilter=null;
function renderMenu(){
 const a=S.address;
 // live store numbers in the page copy
 const set=(cls,v)=>$$(cls).forEach(e=>{e.textContent=v});
 set('.js-fee',FEE);set('.js-km',radius());set('.js-pickup',STORE.pickupMin);
 set('.js-eta',a&&inRange(a)?etaFor(a):STORE.etaMin+2);
 set('.js-shop-name',SHOP.name);set('.js-shop-addr',SHOP.address);set('.js-shop-street',SHOP.address.split(',')[0]);
 $('banner').innerHTML=STORE.open?'':`<div class="closed">⏸ ${esc(STORE.pauseMessage||'Kjøkkenet tar en kort pause – du kan se menyen og bestille straks vi er tilbake.')}</div>`;

 const inProgress=S.order&&(S.order.id?!['done','cancelled'].includes(S.order.status):S.virt<TOTAL);
 $('reorder').innerHTML=(inProgress?`<button class="reorder track" data-act="track"><span class="ic">🛵</span>
   <span class="tx"><b>Bestilling ${esc(S.order.number||'#PP-4821')} er underveis</b><span>${esc(summary(S.order))}</span></span><span class="go">Følg bestillingen →</span></button>`:'')
  +(S.last&&!inProgress?`<button class="reorder" data-act="reorder">
   <span class="ic">↻</span><span class="tx"><b>Bestill det samme igjen</b><span>${esc(summary(S.last))}</span></span>
   <span class="go">Legg i kurven</span></button>`:'');

 $('chips').innerHTML=FILTERS.map(([id,l])=>`<button class="chip" role="tab" aria-selected="${S.filter===id}" data-act="filter" data-id="${id}">${l}</button>`).join('');
 const shown=MENU.filter(m=>S.filter==='all'||m.cats.includes(S.filter));
 const enter=lastFilter!==S.filter;lastFilter=S.filter;
 $('pizzas').innerHTML=shown.length?shown.map((m,i)=>{
  const q=pizzaQty(m.id);
  return `<article class="pz${q?' has':''}${m.soldOut?' sold':''}" style="${enter?`animation-delay:${i*50}ms`:'animation:none'}">
   <button class="pz-pic" data-act="open-pizza" data-id="${m.id}" aria-label="Tilpass ${m.name}">
    <img src="${pic(m.id)}" alt="" loading="lazy">${q?`<span class="qtyb">${q} i kurven</span>`:''}${m.tag?`<span class="tag">${m.tag}</span>`:''}</button>
   <div class="pz-body">
    <h4>${m.name}</h4><p>${m.ing}</p><span class="allergens">Allergener: ${m.allergens}</span>
    <div class="pz-foot"><span class="price">${kr(m.price)}</span>
     ${m.soldOut?`<button class="btn small" disabled>Utsolgt</button>`
      :q?stepper('pz','data-id="'+m.id+'"',q,m.name)
      :`<button class="btn primary small" data-act="inc" data-id="${m.id}" aria-label="Legg til ${m.name}, ${m.price} kr">Legg til <span aria-hidden="true">+</span></button>`}</div>
    ${m.soldOut?'':`<button class="link" data-act="open-pizza" data-id="${m.id}">Glutenfri bunn eller vegansk ost?</button>`}
   </div></article>`}).join(''):`<div class="empty">Ingen pizza i denne kategorien.</div>`;

 const card=e=>{const q=S.extras[e.id]||0;
  return `<div class="ex${q?' has':''}${e.soldOut?' sold':''}"><span class="em">${e.icon||e.em}</span>
   <span class="ex-tx"><b>${e.short||e.name}</b><span>${e.size?byId(BOTTLES,e.size).label+' · ':''}${kr(e.price)}</span></span>
   ${e.soldOut?'<span class="soft">Utsolgt</span>':q?stepper('ex','data-id="'+e.id+'"',q,e.name)
    :`<button class="add" data-act="extra" data-id="${e.id}" aria-label="Legg til ${e.name}">+</button>`}</div>`};
 const sizeSeg=`<span class="size-seg" role="group" aria-label="Flaskestørrelse">${BOTTLES.map(z=>
  `<button data-act="drink-size" data-id="${z.id}" aria-pressed="${S.drinkSize===z.id}">${z.label}</button>`).join('')}</span>`;
 const sec=(id,title,items,right='')=>`<div class="cat-head" id="cat-${id}"><h3>${title}</h3>${right}</div><div class="exs">${items.map(card).join('')}</div>`;
 $('extras').innerHTML=sec('sides','Tilbehør',SIDES)+sec('dips','Dipp',DIPS)
  +sec('drinks','Drikke',DRINKS.filter(d=>d.size===S.drinkSize),sizeSeg)+sec('desserts','Dessert',DESSERTS);
}

// ---------- render: checkout (steps 2 and 3) ----------
// Each step's form is drawn once when it opens, so typing is never interrupted; syncCheckout() updates the parts that change.
let coDrawn='';
function renderCheckout(){
 const t=totals();
 if(!t.items){S.screen='menu';return render()}
 const key=S.step+'';
 if(coDrawn!==key){coDrawn=key;drawCheckout();window.scrollTo(0,0)}
 syncCheckout();
}
function drawCheckout(){
 const el=$('co');
 if(S.step===2){el.innerHTML=`<div class="co-main">
   <button class="back-link" data-act="home">← Tilbake til menyen</button>
   ${stepNav(2)}
   <h1>Levering og opplysninger</h1>
   <div class="seg2" role="radiogroup" aria-label="Levering eller henting">
    <button role="radio" data-act="mode" data-mode="delivery"><b>🛵 Levering</b><span id="seg-del"></span></button>
    <button role="radio" data-act="mode" data-mode="pickup"><b>🛍️ Hent selv</b><span id="seg-pick"></span></button></div>
   <section class="panel"><h2>Dine opplysninger</h2>
    <div class="field-row">
     <div class="field" id="f-name"><label for="cu-name">Navn</label><input id="cu-name" autocomplete="name" maxlength="60" enterkeyhint="next" placeholder="Fornavn og etternavn"></div>
     <div class="field" id="f-phone"><label for="cu-phone">Mobilnummer</label><input id="cu-phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="412 34 567" maxlength="20" enterkeyhint="next"></div></div>
    <p class="hint-sm">Kjøkkenet og budet bruker nummeret bare om denne bestillingen.</p></section>
   <section class="panel" id="p-addr"><h2>Leveringsadresse</h2>
    <div id="co-picked"></div>
    <div id="co-search"><div class="field" id="f-addr"><label for="addr-q">Søk etter adressen din</label>
      <input id="addr-q" type="search" autocomplete="street-address" placeholder="Gate og nummer, f.eks. Toftes gate 20" enterkeyhint="search"></div>
     <div id="addr-hits" class="hits" aria-live="polite"></div></div>
    <div class="field"><label for="cu-note">Beskjed til budet <span class="soft">(valgfritt)</span></label><input id="cu-note" maxlength="200" placeholder="Etasje, dørkode, ringeklokke …" enterkeyhint="done"></div>
   </section>
   <section class="panel" id="p-pick"><h2>Hentested</h2>
    <div class="who"><span class="ic">🛍️</span><span><b>${esc(SHOP.name)}</b><br>${esc(SHOP.address)} · klar på ca. <span class="js-pickup">${STORE.pickupMin}</span> min</span></div></section>
   <div class="form-err" id="co-err" role="alert"></div>
   <button class="btn primary xl block" data-act="to-pay">Fortsett til betaling <span aria-hidden="true">→</span></button>
  </div><aside class="co-side" id="co-side"></aside>`;
  $('cu-name').value=S.customer.name;$('cu-phone').value=S.customer.phone;$('cu-note').value=S.note;$('addr-q').value=AS.q;
  if(!S.customer.name)setTimeout(()=>$('cu-name')?.focus({preventScroll:true}),50);
 }else{el.innerHTML=`<div class="co-main">
   <button class="back-link" data-act="edit-details">← Tilbake til opplysninger</button>
   ${stepNav(3)}
   <h1>Betaling</h1>
   <section class="panel" id="co-review"></section>
   <section class="panel"><h2>Velg betalingsmåte</h2>
    <div class="methods" role="radiogroup" aria-label="Betalingsmåte">
     <button role="radio" class="method" data-act="method" data-id="vipps"><span class="vipps-logo">vipps</span><span><b>Vipps</b><small>Bekreft i Vipps-appen</small></span></button>
     <button role="radio" class="method" data-act="method" data-id="card"><span class="card-logo">💳</span><span><b>Bank- eller kredittkort</b><small>Visa · Mastercard · Amex</small></span></button></div>
    <div id="card-form"><div class="field" id="f-num"><label for="cc-num">Kortnummer</label>
      <input id="cc-num" inputmode="numeric" autocomplete="cc-number" placeholder="1234 5678 9012 3456" maxlength="23"><span class="brand-tag" id="cc-brand"></span></div>
     <div class="field-row">
      <div class="field" id="f-exp"><label for="cc-exp">Utløpsdato</label><input id="cc-exp" inputmode="numeric" autocomplete="cc-exp" placeholder="MM/ÅÅ" maxlength="5"></div>
      <div class="field" id="f-cvc"><label for="cc-cvc">CVC</label><input id="cc-cvc" inputmode="numeric" autocomplete="cc-csc" placeholder="123" maxlength="4"></div></div>
     <div class="form-err" id="cc-err" role="alert"></div></div>
   </section>
   <button class="btn primary xl block" id="pay-btn" data-act="pay-now"></button>
   <p class="cc-note">🔒 Demo – ingen kort belastes, og kortnummeret sendes aldri til oss.</p>
  </div><aside class="co-side" id="co-side"></aside>`;
  $('cc-num').value=CARD.num;$('cc-exp').value=CARD.exp;$('cc-cvc').value=CARD.cvc;
 }
}
function syncCheckout(){
 const t=totals(),del=S.mode==='delivery',a=S.address;
 $('co-side').innerHTML=`<div class="panel side"><div class="side-h"><h2>Din bestilling</h2><button class="link" data-act="open-cart">Endre</button></div>
  ${S.lines.map(l=>`<div class="sum-row"><img src="${pic(l.id)}" alt=""><span><b>${l.qty}× ${byId(MENU,l.id).name}</b><small>${esc(lineDesc(l))}</small></span><b>${kr(l.qty*unitPrice(l))}</b></div>`).join('')}
  ${EXTRAS.filter(e=>S.extras[e.id]).map(e=>`<div class="sum-row"><span class="em">${e.icon||e.em}</span><span><b>${S.extras[e.id]}× ${e.name}</b></span><b>${kr(S.extras[e.id]*e.price)}</b></div>`).join('')}
  <div class="totals"><span>Delsum</span><b>${kr(t.sub)}</b><span>${del?'Levering':'Hent selv'}</span><b>${del?kr(t.fee):'0 kr'}</b><span class="tot">Totalt</span><b class="tot">${kr(t.total)}</b></div>
  <p class="hint-sm">${del?`⏱ Levert på ca. ${a&&inRange(a)?etaFor(a):STORE.etaMin} min`:`⏱ Klar til henting på ca. ${STORE.pickupMin} min`}</p></div>`;
 if(S.step===2){
  $$('.seg2 button').forEach(b=>b.setAttribute('aria-checked',b.dataset.mode===S.mode));
  $('seg-del').textContent=`${kr(FEE)} · innen ${radius()} km`;$('seg-pick').textContent=`Gratis · ${SHOP.address.split(',')[0]}`;
  $('p-addr').hidden=!del;$('p-pick').hidden=del;
  const picked=del&&a&&inRange(a)&&!AS.edit;
  $('co-picked').innerHTML=picked?`<div class="who picked"><span class="ic">📍</span><span><b>${esc(a.line)}</b><br>${esc(a.post)} · ${kmText(kmTo(a))} · ca. ${etaFor(a)} min</span><button class="link" data-act="edit-addr">Endre</button></div>`
   :a&&!inRange(a)&&!AS.q?`<div class="warn">${esc(a.line)} er utenfor leveringsområdet (${radius()} km). Velg en annen adresse eller Hent selv.</div>`:'';
  $('co-search').hidden=picked;
  renderHits();
 }else{
  $('co-review').innerHTML=`<div class="side-h"><h2>${del?'Levering':'Henting'}</h2><button class="link" data-act="edit-details">Endre</button></div>
   <div class="who"><span class="ic">👤</span><span><b>${esc(S.customer.name)}</b><br>${esc(C.normPhone(S.customer.phone)||S.customer.phone)}</span></div>
   ${del?`<div class="who"><span class="ic">📍</span><span><b>${esc(a?.line||'')}</b><br>${esc(a?.post||'')}${S.note.trim()?` · «${esc(S.note.trim())}»`:''}</span></div>`
    :`<div class="who"><span class="ic">🛍️</span><span><b>${esc(SHOP.name)}</b><br>${esc(SHOP.address)}</span></div>`}`;
  $$('.method').forEach(b=>b.setAttribute('aria-checked',b.dataset.id===S.pay));
  $('card-form').hidden=S.pay!=='card';
  syncCard();
 }
}

// ---------- render: sheets (pizza options, basket, payment) ----------
function renderSheet(){
 const sh=S.sheet;$('overlay').classList.toggle('on',!!sh);$('sheet').classList.toggle('on',!!sh);
 document.body.classList.toggle('locked',!!sh);
 if(!sh)return;
 $('sheet').className='sheet on '+sh.type;$('sheet-x').hidden=sh.type==='pay';
 const body=$('sheet-body');
 if(sh.type==='pizza'){
  const m=byId(MENU,sh.id),unit=unitPrice(sh);
  body.innerHTML=`<div class="detail-img"><img src="${pic(m.id)}" alt=""></div>
   <h2 class="sh-title">${m.name} ${m.tag?`<span class="tag">${m.tag}</span>`:''}</h2><p class="sh-sub">${m.ing}</p>
   ${m.allergens?`<p class="allergens">Allergener: ${m.allergens}</p>`:''}
   ${SIZES.length>1?`<div class="sh-label"><span>Størrelse</span></div>
   <div class="opts sizes">${SIZES.map(z=>`<button class="opt" aria-pressed="${sh.size===z.id}" data-act="size" data-id="${z.id}">${z.label}<small>${z.cm} cm · ${kr(m.price+z.add)}</small></button>`).join('')}</div>`:''}
   <div class="sh-label"><span>Tillegg · +${kr(TOP_PRICE)} per valg</span><span>${sh.tops.length}/${MAX_TOPS}</span></div>
   <div class="opts tops">${TOPPINGS.map(tp=>{const on=sh.tops.includes(tp.id);
    return `<button class="opt" aria-pressed="${on}" data-act="top" data-id="${tp.id}" ${!on&&sh.tops.length>=MAX_TOPS?'disabled':''}>${tp.name}<small>${on?'✓ valgt':'+ '+kr(TOP_PRICE)}</small></button>`}).join('')}</div>
   <div class="sheet-foot">${stepper('sh-qty','',sh.qty,m.name)}
    <button class="btn primary grow" data-act="sh-add">Legg i kurven · ${kr(unit*sh.qty)}</button></div>`;
 }else if(sh.type==='cart'){
  const t=totals();
  if(!t.items){body.innerHTML=`<h2 class="sh-title">Handlekurven</h2><div class="empty-cart"><img src="img/slice.png" alt="" width="120"><p>Handlekurven er tom.</p>
   <button class="btn primary" data-act="close-sheet" data-go="meny">Se menyen</button></div>`;return}
  // a few easy add-ons the basket does not have yet
  const ups=['garlicbread','fries','coke-15','tiramisu','garlic','pepsimax-05'].map(id=>byId(EXTRAS,id)).filter(e=>e&&!e.soldOut&&!S.extras[e.id]).slice(0,3);
  body.innerHTML=`<h2 class="sh-title">Handlekurven</h2><p class="sh-sub">Steg 1 av 3 · ${t.items} ${t.items===1?'vare':'varer'}</p>
   <div class="cart-rows">${S.lines.map((l,i)=>`<div class="row"><img class="thumb" src="${pic(l.id)}" alt="">
     <div class="info"><b>${byId(MENU,l.id).name}</b><span>${esc(lineDesc(l))} · ${kr(unitPrice(l))}</span></div>
     ${stepper('line','data-i="'+i+'"',l.qty,byId(MENU,l.id).name)}</div>`).join('')}
    ${EXTRAS.filter(e=>S.extras[e.id]).map(e=>`<div class="row"><span class="thumb em">${e.icon||e.em}</span><div class="info"><b>${e.name}</b><span>${kr(e.price)}</span></div>
     ${stepper('ex','data-id="'+e.id+'"',S.extras[e.id],e.name)}</div>`).join('')}</div>
   ${ups.length?`<div class="sh-label"><span>Noe attåt?</span></div><div class="ups">${ups.map(e=>`<button class="up" data-act="extra" data-id="${e.id}"><span class="em">${e.icon||e.em}</span><span>${e.short||e.name}<small>+ ${kr(e.price)}</small></span></button>`).join('')}</div>`:''}
   <div class="totals"><span>Delsum</span><b>${kr(t.sub)}</b><span>Levering</span><b>${S.mode==='delivery'?kr(FEE):'Hent selv – 0 kr'}</b><span class="tot">Totalt</span><b class="tot">${kr(t.total)}</b></div>
   <div class="sheet-foot col"><button class="btn primary xl block" data-act="go-checkout" ${STORE.open?'':'disabled'}>${STORE.open?'Gå til kassen <span aria-hidden="true">→</span>':'Kjøkkenet har pause'}</button>
    <button class="link center" data-act="close-sheet">Fortsett å handle</button></div>`;
 }else if(sh.type==='pay'){
  body.innerHTML=`<div class="paying"><div class="spinner"></div><h2 class="sh-title">${sh.method==='card'?'Behandler betalingen …':'Bekreft i Vipps'}</h2>
   <p class="sh-sub">${sh.method==='card'?esc(sh.label)+' · ':''}${kr(totals().total)} · ${S.mode==='delivery'?'Levering':'Hent selv'}</p></div>`;
 }
}

// ---------- address search ----------
// Kartverket's open address register covers every address in Norway and returns its position.
const GEO='https://ws.geonorge.no/adresser/v1/sok';
const town=s=>s.toLowerCase().replace(/(^|[\s-])\S/g,m=>m.toUpperCase());
let geoTimer,geoSeq=0;
function searchAddress(q){
 AS.q=q;clearTimeout(geoTimer);const seq=++geoSeq;
 if(q.trim().length<3){AS.hits=null;AS.state='';return renderHits()}
 AS.state='loading';
 geoTimer=setTimeout(async()=>{
  try{const r=await fetch(`${GEO}?sok=${encodeURIComponent(q.trim())}&fuzzy=true&treffPerSide=8&utkoordsys=4258`);
   if(!r.ok)throw new Error(r.status);const d=await r.json();
   if(seq!==geoSeq)return;
   AS.hits=(d.adresser||[]).filter(a=>a.representasjonspunkt&&a.adressetekst)
    .map(a=>({line:a.adressetekst,post:`${a.postnummer} ${town(a.poststed||'')}`.trim(),lat:a.representasjonspunkt.lat,lng:a.representasjonspunkt.lon}));
   AS.state=AS.hits.length?'':'none';
  }catch(e){if(seq===geoSeq){AS.hits=null;AS.state='error'}}
  renderHits();
 },250);
 renderHits();
}
function renderHits(){
 const el=$('addr-hits');if(!el)return;
 const list=AS.hits||(!AS.q?S.recent:[]);
 const row=(a,i,src)=>{const k=kmTo(a),ok=k<=STORE.deliveryRadiusKm;
  return`<button class="addr${ok?'':' far'}" data-act="pick-hit" data-src="${src}" data-i="${i}" ${ok?'':'aria-disabled="true"'}>
   <span class="ic">📍</span><span class="info"><b>${esc(a.line)}</b><span>${esc(a.post)}</span></span>
   <span class="eta">${ok?`${kmText(k)} · ${etaFor(a)} min`:`${kmText(k)} · utenfor`}</span></button>`};
 el.innerHTML=(AS.state==='loading'&&!AS.hits?'<div class="hint">Søker …</div>':'')
  +(AS.state==='none'?'<div class="hint">Fant ingen adresse. Prøv gatenavn og nummer.</div>':'')
  +(AS.state==='error'?'<div class="hint">Adressesøket svarer ikke akkurat nå. Prøv igjen om litt.</div>':'')
  +(!AS.hits&&!AS.q&&S.recent.length?'<div class="sh-label"><span>Tidligere adresser</span></div>':'')
  +list.map((a,i)=>row(a,i,AS.hits?'hits':'recent')).join('');
}

// ---------- checkout steps ----------
function goCheckout(){
 if(!totals().items||!STORE.open)return;
 S.sheet=null;S.screen='checkout';S.step=2;coDrawn='';AS.edit=false;
}
// Step 2 → 3: we need a name, a phone number and, for delivery, an address inside the area
function toPay(){
 const del=S.mode==='delivery';
 const err=!nameOk()?['f-name','Skriv inn navnet ditt.']:!phoneOk()?['f-phone','Skriv inn et gyldig norsk mobilnummer, f.eks. 412 34 567.']
  :del&&!S.address?['f-addr','Velg leveringsadressen din fra listen.']:del&&!inRange(S.address)?['f-addr',`Adressen er utenfor leveringsområdet (${radius()} km). Velg en annen, eller Hent selv.`]:null;
 $$('.field.bad').forEach(f=>f.classList.remove('bad'));
 if(err){$('co-err').textContent=err[1];const f=$(err[0]);if(f){f.classList.add('bad');f.querySelector('input')?.focus()}return false}
 S.customer.phone=C.normPhone(S.customer.phone);S.customer.name=S.customer.name.trim();
 S.step=3;return true;
}

// ---------- card form ----------
const digits=s=>s.replace(/\D/g,'');
const cardBrand=n=>/^4/.test(n)?'Visa':/^(5[1-5]|2[2-7])/.test(n)?'Mastercard':/^3[47]/.test(n)?'Amex':'';
const luhn=n=>{let s=0;for(let i=n.length-1,d=false;i>=0;i--,d=!d){let x=+n[i];if(d&&(x*=2)>9)x-=9;s+=x}return n.length>0&&s%10===0};
function cardCheck(c){
 const n=digits(c.num),amex=cardBrand(n)==='Amex',len=amex?15:16,cv=amex?4:3;
 const numDone=n.length>=len,numOk=numDone&&luhn(n);
 const m=/^(\d\d)\/(\d\d)$/.exec(c.exp),now=new Date();
 const expOk=!!m&&+m[1]>=1&&+m[1]<=12&&(2000+ +m[2])*12+ +m[1]>now.getFullYear()*12+now.getMonth();
 const cvcOk=c.cvc.length===cv;
 const err=numDone&&!numOk?'Sjekk kortnummeret.':m&&!expOk?'Kortet er utløpt, eller datoen er feil.':'';
 return{ok:numOk&&expOk&&cvcOk,err,badNum:numDone&&!numOk,badExp:!!m&&!expOk,brand:cardBrand(n),last4:n.slice(-4)};
}
function syncCard(){
 if(!$('pay-btn'))return;
 const c=cardCheck(CARD),total=kr(totals().total),card=S.pay==='card';
 $('cc-brand').textContent=c.brand;$('cc-err').textContent=card?c.err:'';
 $('f-num').classList.toggle('bad',c.badNum);$('f-exp').classList.toggle('bad',c.badExp);
 $('pay-btn').disabled=!STORE.open||(card&&!c.ok);
 $('pay-btn').innerHTML=!STORE.open?'Kjøkkenet har pause':card?`🔒 Betal ${total}`:`Betal ${total} med <span class="vipps-word">Vipps</span>`;
 $('pay-btn').classList.toggle('vipps',!card);
}
document.addEventListener('input',e=>{
 const el=e.target;
 if(el.id==='addr-q')return searchAddress(el.value);
 if(el.id==='cu-name'||el.id==='cu-phone'){S.customer[el.id==='cu-name'?'name':'phone']=el.value;$('co-err').textContent='';el.parentNode.classList.remove('bad');return save()}
 if(el.id==='cu-note'){S.note=el.value;return save()}
 if(el.id==='cc-num'){const n=digits(el.value).slice(0,cardBrand(digits(el.value))==='Amex'?15:16);
  el.value=CARD.num=cardBrand(n)==='Amex'?[n.slice(0,4),n.slice(4,10),n.slice(10)].filter(Boolean).join(' '):n.replace(/(.{4})(?=.)/g,'$1 ')}
 else if(el.id==='cc-exp'){let d=digits(el.value).slice(0,4);if(d.length===1&&d>'1')d='0'+d;
  // keep the slash while typing forward, let it go when deleting
  el.value=CARD.exp=d.length>2||(d.length===2&&e.inputType!=='deleteContentBackward')?d.slice(0,2)+'/'+d.slice(2):d}
 else if(el.id==='cc-cvc')el.value=CARD.cvc=digits(el.value).slice(0,4);
 else return;
 syncCard();
});
function payNow(){
 if(S.pay==='card'){const c=cardCheck(CARD);if(c.ok)startPay('card',`${c.brand||'Kort'} •••• ${c.last4}`)}
 else startPay('vipps');
}
function startPay(method,label){
 if(!totals().items||!STORE.open)return;S.sheet={type:'pay',method,label};
 const pause=new Promise(r=>setTimeout(r,1400)); // stands in for the payment provider's confirmation
 const local={lines:S.lines.map(l=>({...l})),extras:{...S.extras},total:totals().total};
 // Only the payment method goes to the server — never card details.
 const del=S.mode==='delivery',a=S.address,dest=del?{lat:a.lat,lng:a.lng}:null;local.dest=dest;
 const body={lines:local.lines,extras:local.extras,mode:S.mode,address:del?`${a.line}, ${a.post}`:'',dest,note:del?S.note.trim():'',
  customer:{name:S.customer.name.trim(),phone:S.customer.phone},payment:{method}};
 const placed=!LIVE?Promise.resolve(null):B?B.placeOrder(body):fetch('api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
  .then(async r=>{const b=await r.json().catch(()=>({}));if(!r.ok)throw new Error(b.error||'Kunne ikke sende bestillingen');return b});
 Promise.all([placed,pause]).then(([o])=>{
  S.order=o?{...local,id:o.id,number:o.number,total:o.total,status:o.status,createdAt:o.createdAt,times:o.times,driver:o.driver,pos:o.pos,skew:o.now-Date.now()}:local;
  S.last={lines:local.lines,extras:local.extras};S.lines=[];S.extras={};
  CARD.num=CARD.exp=CARD.cvc='';coDrawn='';
  S.sheet=null;S.screen='tracker';S.virt=0;lastTick=Date.now();render();window.scrollTo(0,0);
 }).catch(e=>{S.sheet=null;showToast(e.message,null,true);render();syncMenu()});
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
  showToast(`${gone.join(', ')} er utsolgt – fjernet fra kurven`,null,true)}
 if(S.sheet?.type==='pizza'&&byId(MENU,S.sheet.id).soldOut)S.sheet=null;
 render();
}
async function syncOrder(){
 const o=S.order;if(!o?.id||['done','cancelled'].includes(o.status))return;
 try{let b;if(B)b=await B.order(o.id);else{const r=await fetch('api/orders/'+o.id,{cache:'no-store'});if(!r.ok)return;b=await r.json()}
  if(S.order!==o)return;o.status=b.status;o.times=b.times;o.driver=b.driver;o.pos=b.pos;o.skew=b.now-Date.now();save();if(S.screen==='tracker')renderTracker();else if(S.screen==='menu')renderMenu()}catch(e){}
}

// ---------- render: tracker ----------
const km=(a,b)=>{const r=Math.PI/180,x=(b.lng-a.lng)*r*Math.cos((a.lat+b.lat)/2*r),y=(b.lat-a.lat)*r;return Math.hypot(x,y)*6371};
const lerp=(a,b,f)=>({lat:a.lat+(b.lat-a.lat)*f,lng:a.lng+(b.lng-a.lng)*f});
const ago=ms=>ms<90000?`${Math.max(1,Math.round(ms/1000))} s`:`${Math.round(ms/60000)} min`;

// The map: OpenStreetMap through Leaflet when the host page provides it (window.L), otherwise a simple drawing.
// The map element is kept between renders so the tiles and zoom survive the tracker's once-a-second refresh.
let mapEl=null,lmap=null,lmarks={},fitKey='';
function mapNode(){
 if(mapEl)return mapEl;
 mapEl=document.createElement('div');mapEl.className='map-canvas';
 if(window.L){
  lmap=window.L.map(mapEl,{zoomControl:false,attributionControl:true,scrollWheelZoom:false});
  window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',
   {maxZoom:19,className:'soft-tiles',attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(lmap);
  lmap.setView([SHOP.lat,SHOP.lng],15);
 }
 return mapEl;
}
const MARK={shop:{color:'#E3261C',fill:'#fff',r:7},dest:{color:'#fff',fill:'#10B981',r:7},driver:{color:'#fff',fill:'#7C3AED',r:8}};
function drawMap(pts){
 if(lmap){
  lmap.invalidateSize();
  for(const k of Object.keys(MARK)){
   const p=pts[k];
   if(!p){if(lmarks[k]){lmarks[k].remove();delete lmarks[k]}continue}
   if(!lmarks[k])lmarks[k]=window.L.circleMarker([p.lat,p.lng],{radius:MARK[k].r,color:MARK[k].color,weight:3,fillColor:MARK[k].fill,fillOpacity:1}).addTo(lmap);
   else lmarks[k].setLatLng([p.lat,p.lng]);
  }
  // re-frame when the set of points changes or the driver leaves the view
  const list=Object.values(pts).filter(Boolean),key=Object.keys(pts).filter(k=>pts[k]).join();
  if(list.length&&(key!==fitKey||(pts.driver&&!lmap.getBounds().pad(-.1).contains([pts.driver.lat,pts.driver.lng])))){
   fitKey=key;if(list.length===1)lmap.setView([list[0].lat,list[0].lng],15);else lmap.fitBounds(list.map(p=>[p.lat,p.lng]),{padding:[32,32],maxZoom:16});
  }
  return;
 }
 // drawn fallback: the points projected into the box, on a faint street grid
 const list=Object.values(pts).filter(Boolean),W=520,H=240,pad=34;
 const la=list.map(p=>p.lat),ln=list.map(p=>p.lng),k=Math.cos(SHOP.lat*Math.PI/180);
 const spanX=Math.max((Math.max(...ln)-Math.min(...ln))*k,.004),spanY=Math.max(Math.max(...la)-Math.min(...la),.002);
 const sc=Math.min((W-2*pad)/spanX,(H-2*pad)/spanY),cx=(Math.max(...ln)+Math.min(...ln))/2,cy=(Math.max(...la)+Math.min(...la))/2;
 const xy=p=>[W/2+(p.lng-cx)*k*sc,H/2-(p.lat-cy)*sc];
 const dot=(p,m)=>{if(!p)return'';const[x,y]=xy(p);return(m===MARK.driver?`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="16" fill="#7C3AED" opacity=".2"/>`:'')+
  `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${m.r}" fill="${m.fill}" stroke="${m.color}" stroke-width="3"/>`};
 const line=pts.dest?(()=>{const[a1,b1]=xy(pts.shop),[a2,b2]=xy(pts.dest);return`<path d="M${a1} ${b1}L${a2} ${b2}" stroke="#C9B99C" stroke-width="4" stroke-linecap="round" stroke-dasharray="2 9"/>`})():'';
 mapEl.innerHTML=`<svg width="100%" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">
  <rect width="${W}" height="${H}" fill="#F6EEDF"/><g stroke="#fff" stroke-width="12" fill="none"><path d="M0 50H${W}M0 170H${W}M80 0V${H}M210 0V${H}M350 0V${H}M460 0V${H}"/></g>
  ${line}${dot(pts.shop,MARK.shop)}${dot(pts.dest,MARK.dest)}${dot(pts.driver,MARK.driver)}</svg>`;
}

function renderTracker(){
 const pick=S.mode==='pickup',order=S.order;
 if(!order){S.screen='menu';return render()}
 // A server order follows the kitchen's real status and the real clock; the standalone demo follows a sped-up timer.
 const live=!!order.id,now=Date.now()+(order.skew||0),cancelled=live&&order.status==='cancelled';
 const v=live?Math.min(TOTAL,(now-order.createdAt)/1000):S.virt;
 const waiting=live&&!pick&&order.status==='ready'; // baked, waiting for the driver to collect it
 const stage=live?({received:0,oven:1,ready:pick?2:1,out:2,done:3}[order.status]??0):STEPS.reduce((a,s,i)=>v>=s.at?i:a,0);
 const done=stage===3,left=done||cancelled?0:Math.max(0,TOTAL-v);
 const st=cancelled?{label:'Kansellert',color:'#DC2626',tint:'rgba(220,38,38,.10)',fg:'#B91C1C'}:STEPS[stage];
 const number=esc(order.number?order.number.replace('PP-','#PP-'):'#PP-4821');
 const time=`${Math.floor(left/60)}:${String(Math.floor(left%60)).padStart(2,'0')}`;
 const driver=live?order.driver:DEMO_DRIVER,first=driver?esc(driver.name.split(' ')[0]):'';
 // where everything is: the shop, the customer, and the driver once they are on the way
 const dest=order.dest||(S.address?{lat:S.address.lat,lng:S.address.lng}:{lat:SHOP.lat-.004,lng:SHOP.lng-.006});
 const outF=live?null:stage<2?0:done?1:Math.min(1,(v-600)/600);
 const drv=live?(order.status==='out'?order.pos:null):(stage>=2?lerp(SHOP,dest,outF):null);
 const away=drv?km(drv,dest):null,etaMin=away===null?null:Math.max(1,Math.round(away/.33)); // about 20 km/h through town
 const label=i=>pick?['Mottatt','I ovnen','Klar til henting','Hentet'][i]:STEPS[i].label;
 const sub=i=>pick&&i===2?'Kom til disken':pick&&i===3?'Velkommen tilbake':
  i===1&&waiting?(driver?`Ferdig stekt · ${first} henter den nå`:'Ferdig stekt · venter på bud'):
  i===2&&driver?`${first} er på vei`:STEPS[i].sub;
 const badge=cancelled?st.label:pick&&stage===2?'Klar':waiting?'Venter på bud':st.label;
 const distLine=done?'Levert':drv?`${away<1?Math.round(away*1000)+' m':away.toFixed(1)+' km'} unna · ca. ${etaMin} min`
  :live&&order.status==='out'?'Venter på posisjon fra budet':stage<2?'Venter på kjøkkenet':'På vei';
 const stale=live&&drv&&order.pos?.at&&now-order.pos.at>60000?`<div class="stale">Sist oppdatert for ${ago(now-order.pos.at)} siden</div>`:'';
 $('tracker-body').innerHTML=`
  <div class="trk-main">
  <button class="back-link" data-act="back">← Til forsiden</button>
  <header class="trk-head"><div><p class="eyebrow">Takk for bestillingen${S.customer.name?', '+esc(S.customer.name.split(' ')[0]):''}!</p><h1>Bestilling ${number}</h1></div>
   <span class="badge" style="background:${st.tint};color:${st.fg}"><i style="background:${st.color}"></i>${badge}</span></header>
  <div class="panel trk-top">
   <div class="ring"><svg width="200" height="200" viewBox="0 0 248 248">
    <circle cx="124" cy="124" r="110" fill="none" stroke="#F3E8D4" stroke-width="16"/>
    <circle cx="124" cy="124" r="110" fill="none" stroke="${done?'#10B981':'#F7AE11'}" stroke-width="16" stroke-linecap="round" stroke-dasharray="691.15" stroke-dashoffset="${(691.15*(1-left/TOTAL)).toFixed(2)}" transform="rotate(-90 124 124)"/></svg>
    <div class="c"><div class="cap">${cancelled?'Kansellert':done?(pick?'Hentet':'Levert'):!left?'Når som helst':pick?'Klar om':'Fremme om'}</div><div class="t">${cancelled?'–':time}</div><div class="e">${cancelled?'Kontakt oss hvis dette er feil':done?'Velbekomme!':live?'Direkte fra kjøkkenet':`Demo · ${SPEED===1?'sanntid':SPEED+'× fart'}`}</div></div></div>
   <div class="steps">${STEPS.map((s,i)=>{const past=!cancelled&&i<stage,cur=!cancelled&&i===stage,on=past||cur;
    return `<div class="step${on?' on':''}"><div class="rail"><div class="dot" style="background:${on?s.color:'#fff'};border-color:${on?s.color:'#E2D5BE'};box-shadow:${cur&&!done?`0 0 0 6px ${s.tint}`:'none'}">${past||(cur&&done)?'✓':''}</div>
     ${i<3?`<div class="ln" style="background:${past?STEPS[i+1].color:'#EFE3CF'}"></div>`:''}</div>
     <div class="tx"><b>${label(i)}</b><span>${sub(i)}</span></div></div>`}).join('')}</div>
  </div></div>
  <div class="trk-side">
  ${pick?`<div class="panel"><h2>Hent hos ${esc(SHOP.name)}</h2><p class="sh-sub">${esc(SHOP.address)} · Vis bestilling ${number} i disken.</p></div>`
  :`<div class="panel map-panel"><div class="map"><div class="map-slot"></div><div class="dist">${distLine}</div>${stale}</div>
   ${driver?`<div class="driver"><div class="avatar">${esc(driver.name[0]||'?')}</div><div class="grow"><b>${esc(driver.name)}</b><div class="sh-sub">${esc(driver.vehicle||'Bud')}</div></div>
    ${driver.phone?`<a class="btn small${order.status==='out'||(!live&&stage===2)?' primary':''}" href="tel:${esc(driver.phone.replace(/\s/g,''))}">📞 Ring</a>`:''}</div>`
   :`<div class="driver"><div class="avatar">🛵</div><div class="grow"><b>Vi finner et bud til deg</b><div class="sh-sub">Du ser budet her så snart noen har tatt leveringen</div></div></div>`}</div>`}
  <div class="panel"><div class="side-h"><h2>Bestillingen</h2><b>${kr(order.total)}</b></div><p class="sh-sub">${esc(summary(order))||'—'}</p></div>
  ${live?'':'<button class="link" data-act="restart">↺ Start demo-tiden på nytt</button>'}</div>`;
 if(!pick){$('tracker-body').querySelector('.map-slot').replaceWith(mapNode());drawMap({shop:SHOP,dest,driver:drv})}
}

// ---------- render root ----------
function render(){
 if(S.screen==='checkout'&&!totals().items)S.screen='menu';
 if(S.screen==='tracker'&&!S.order)S.screen='menu';
 for(const v of['menu','checkout','tracker'])$(v).hidden=S.screen!==v;
 if(S.screen!=='checkout')coDrawn='';
 if(S.screen==='menu')renderMenu();else if(S.screen==='checkout')renderCheckout();else renderTracker();
 renderSheet();renderChrome();save();
}

// ---------- events ----------
const actions={
 inc:d=>{if(!byId(MENU,d.id).soldOut)addLine({id:d.id,size:'M',tops:[]})},
 pz:d=>{if(+d.d>0)actions.inc(d);else removeOne(d.id)},
 ex:d=>bumpExtra(d.id,+d.d),
 filter:d=>{S.filter=d.id},
 'drink-size':d=>{S.drinkSize=d.id},
 extra:d=>{bumpExtra(d.id,1);showToast('La til '+byId(EXTRAS,d.id).name,()=>bumpExtra(d.id,-1))},
 mode:(d,el)=>{S.mode=el.dataset.mode;$('co-err')&&($('co-err').textContent='')},
 home:()=>{S.sheet=null;S.screen='menu'},
 'start-order':()=>{S.sheet=null;S.screen='menu'},
 'start-pickup':()=>{S.sheet=null;S.screen='menu';S.mode='pickup';showToast('Hent selv valgt – 0 kr i levering',null)},
 reorder:()=>{S.last.lines.filter(l=>byId(MENU,l.id)&&!byId(MENU,l.id).soldOut).forEach(l=>addLine(l,l.qty,{toast:false}));
  Object.entries(S.last.extras).filter(([id])=>byId(EXTRAS,id)&&!byId(EXTRAS,id).soldOut).forEach(([id,q])=>{S.extras[id]=(S.extras[id]||0)+q});
  showToast('Forrige bestilling lagt i kurven',null);bumpBag()},
 undo:()=>{S.toast?.undo?.();S.toast=null},
 'open-pizza':d=>{if(!byId(MENU,d.id).soldOut)S.sheet={type:'pizza',id:d.id,size:'M',tops:[],qty:1}},
 'open-cart':()=>{S.sheet={type:'cart'}},
 'close-sheet':(d)=>{if(S.sheet?.type==='pay')return;S.sheet=null;if(d.go){S.screen='menu';setTimeout(()=>$(d.go)?.scrollIntoView({behavior:'smooth'}),0)}},
 size:d=>{S.sheet.size=d.id},
 top:d=>{const t=S.sheet.tops,i=t.indexOf(d.id);if(i>=0)t.splice(i,1);else if(t.length<MAX_TOPS)t.push(d.id);
  t.sort((a,b)=>TOPPINGS.findIndex(x=>x.id===a)-TOPPINGS.findIndex(x=>x.id===b))},
 'sh-qty':d=>{S.sheet.qty=Math.max(1,S.sheet.qty+Number(d.d))},
 'sh-add':()=>{const sh=S.sheet;S.sheet=null;addLine(sh,sh.qty)},
 line:d=>{const l=S.lines[d.i];l.qty+=Number(d.d);if(l.qty<=0)S.lines.splice(d.i,1)},
 'go-checkout':goCheckout,
 'edit-addr':()=>{AS.edit=true;AS.q='';AS.hits=null;AS.state='';setTimeout(()=>{const q=$('addr-q');if(q){q.value='';q.focus()}},0)},
 'pick-hit':(d,el)=>{if(el.getAttribute('aria-disabled')){showToast(`Vi leverer bare innen ${radius()} km – velg Hent selv`,null,true);return}
  const a={...(d.src==='hits'?AS.hits:S.recent)[+d.i]};
  S.address=a;S.recent=[a,...S.recent.filter(r=>r.line!==a.line||r.post!==a.post)].slice(0,3);
  AS.edit=false;AS.q='';AS.hits=null;AS.state='';$('addr-q').value='';$('co-err').textContent='';$('f-addr').classList.remove('bad')},
 'to-pay':()=>{if(toPay())window.scrollTo(0,0)},
 'edit-details':()=>{S.sheet=null;S.screen='checkout';S.step=2},
 method:d=>{S.pay=d.id;if(d.id==='card')setTimeout(()=>{if(!CARD.num)$('cc-num')?.focus()},0)},
 'pay-now':payNow,
 back:()=>{S.screen='menu'},
 track:()=>{S.screen='tracker';window.scrollTo(0,0)},
 restart:()=>{S.virt=0;lastTick=Date.now()}};

document.addEventListener('click',e=>{
 const el=e.target.closest('[data-act]');if(!el||el.disabled)return;
 const fn=actions[el.dataset.act];if(!fn)return;
 fn(el.dataset,el);render();
});
document.addEventListener('keydown',e=>{
 const id=e.target.id;
 if(e.key==='Enter'&&/^cc-/.test(id)){payNow();render();return}
 if(e.key==='Enter'&&id==='addr-q'){e.preventDefault();const b=document.querySelector('#addr-hits .addr:not(.far)');if(b)b.click();return}
 if(e.key==='Enter'&&/^cu-/.test(id)){e.preventDefault();
  const next={'cu-name':'cu-phone','cu-phone':S.mode==='delivery'?(S.address&&inRange(S.address)?'cu-note':'addr-q'):null}[id];
  if(next){$(next).focus();return}actions['to-pay']();render();return}
 if(e.key==='Escape'&&S.sheet&&S.sheet.type!=='pay'){S.sheet=null;render()}});

// Tracker clock
let lastTick=Date.now();
let ticks=0;
setInterval(()=>{const n=Date.now(),dt=(n-lastTick)/1000;lastTick=n;ticks++;
 if(S.order?.id){if(ticks%3===0)syncOrder();if(S.screen==='tracker')renderTracker()}
 else if(S.order&&S.virt<TOTAL){S.virt=Math.min(TOTAL,S.virt+dt*SPEED);if(S.screen==='tracker')renderTracker();save()}
 if(ticks%20===0)syncMenu()},1000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){syncMenu();syncOrder()}});

render();
syncMenu();
