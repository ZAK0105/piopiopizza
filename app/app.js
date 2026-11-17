'use strict';
// Pio Pio Pizza — express ordering prototype. Dependency-free; state → render().

const {PIZZAS:MENU,SIZES,TOPPINGS,TOP_PRICE,MAX_TOPS,SIDES,DIPS,DESSERTS,BRANDS,BOTTLES,DRINKS,EXTRAS}=PIOPIO_MENU;
const FILTERS=[['all','Alle'],['veggie','🌱 Vegetar'],['spicy','🌶️ Sterk'],['meat','🥩 Kjøtt']];
const bottle=(b,z)=>`<span class="bottle${z==='15'?' big':''}" style="--c:${b.c}${b.l?`;--l:${b.l}`:''}"></span>`;
DRINKS.forEach(d=>{d.icon=bottle(BRANDS.find(b=>b.id===d.brand),d.size)});
const C=window.PP_CORE; // shared order rules: phone format, distances, the shop
const SHOP=C.SHOP;
const TOTAL=1200;
// Live values: replaced by the server's when the app is served by it (see syncMenu); defaults keep the standalone demo working
let FEE=PIOPIO_MENU.DELIVERY_FEE,LIVE=false,STORE={...C.DEFAULT_SETTINGS};
const STEPS=[
 {label:'Mottatt',sub:'Kjøkkenet har bestillingen din',color:'#3B82F6',tint:'rgba(59,130,246,.14)',fg:'#93C5FD',at:0},
 {label:'I ovnen',sub:'Steinovn · 90 sekunder på 450 °C',color:'#F59E0B',tint:'rgba(245,158,11,.14)',fg:'#FCD34D',at:90},
 {label:'Ute for levering',sub:'Budet er på vei',color:'#8B5CF6',tint:'rgba(139,92,246,.16)',fg:'#C4B5FD',at:600},
 {label:'Levert',sub:'Nyt den mens den er varm',color:'#10B981',tint:'rgba(16,185,129,.14)',fg:'#6EE7B7',at:1200}];
// The driver in the stand-alone demo, when there is no kitchen to assign a real one
const DEMO_DRIVER={name:'Jonas Berg',vehicle:'Elsparkesykkel · EL 4821',phone:''};
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
 address:saved.address||null, // {line, post, lat, lng} picked from the address register
 recent:saved.recent||[],      // the last few addresses used, newest first
 customer:saved.customer||{name:'',phone:''},
 note:saved.note||'',          // message for the driver: floor, door code …
 screen:saved.screen||'menu',
 virt:saved.virt||0,
 order:saved.order||null, // the order being tracked; has id/number/status when placed through the server
 last:saved.last||{lines:[{id:'pepperoni',size:'L',tops:[],qty:2}],extras:{'coke-15':1,garlic:2}}, // seeded "last order"
 filter:'all',
 drinkSize:'05',
 sheet:null, // {type:'pizza',id,size,tops,qty} | {type:'cart'} | {type:'address'} | {type:'pay'}
 toast:null};
for(const o of[S,S.last])for(const id of Object.keys(o.extras))if(!byId(EXTRAS,id))delete o.extras[id];
const save=()=>{const{lines,extras,mode,address,recent,customer,note,screen,virt,last,order}=S;
 try{localStorage.setItem(KEY,JSON.stringify({lines,extras,mode,address,recent,customer,note,screen,virt,last,order}))}catch(e){}};
// ---------- delivery address & contact details ----------
const kmTo=a=>C.distKm(SHOP,a);
const inRange=a=>!!a&&kmTo(a)<=STORE.deliveryRadiusKm;
const kmText=k=>k<1?Math.round(k*1000)+' m':k.toFixed(1).replace('.',',')+' km';
const etaFor=a=>STORE.etaMin+Math.max(0,Math.round((kmTo(a)-1.5)*3)); // a few minutes more per km beyond the neighbourhood
const detailsOk=()=>S.customer.name.trim().length>=2&&!!C.normPhone(S.customer.phone);

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
const lineDesc=l=>{const z=byId(SIZES,l.size);return[z.label+' '+z.cm+' cm',...l.tops.map(t=>'+'+byId(TOPPINGS,t).name)].join(' · ')};
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
function showToast(text,undo,warn){clearTimeout(toastTimer);S.toast={text,undo,warn};toastTimer=setTimeout(()=>{S.toast=null;renderToast()},2600)}
let bagBump=false;const bumpBag=()=>{bagBump=true};

// ---------- render: menu ----------
let lastFilter=null;
function renderMenu(){
 const t=totals(),a=S.address;
 $('eta-text').textContent=S.mode==='delivery'?`⚡ ${a&&inRange(a)?etaFor(a):STORE.etaMin} min`:`⚡ Klar om ${STORE.pickupMin} min`;
 $('fee-label').textContent=`(${FEE}kr)`;
 $('address-btn').innerHTML=S.mode!=='delivery'?`🛍️ Hent hos <b>${esc(SHOP.name)}</b>`
  :!a?`📍 <b>Legg til leveringsadresse</b> <span class="chev">▼</span>`
  :`📍 Lever til <b>${esc(a.line)}</b>${inRange(a)?'':' <span class="out">· utenfor leveringsområdet</span>'} <span class="chev">▼</span>`;
 $('address-btn').disabled=S.mode!=='delivery';

 const inProgress=S.order&&(S.order.id?!['done','cancelled'].includes(S.order.status):S.virt<TOTAL);
 $('reorder').innerHTML=(inProgress?`<button class="reorder track" data-act="track"><span class="ic">🛵</span>
   <span style="min-width:0"><div class="t">Bestilling ${esc(S.order.number||'#PP-4821')} er underveis</div><div class="s">${esc(summary(S.order))}</div></span><span class="go">Følg</span></button>`:'')
  +(S.last?`<button class="reorder" data-act="reorder">
   <span class="ic">↻</span><span style="min-width:0"><div class="t">Bestill igjen</div><div class="s">${esc(summary(S.last))}</div></span>
   <span class="go">Legg til alt</span></button>`:'');

 $('chips').innerHTML=FILTERS.map(([id,l])=>`<button class="chip" role="tab" aria-selected="${S.filter===id}" data-act="filter" data-id="${id}">${l}</button>`).join('');

 const shown=MENU.filter(m=>S.filter==='all'||m.cats.includes(S.filter));
 const enter=lastFilter!==S.filter;lastFilter=S.filter;
 $('list').innerHTML=shown.length?shown.map((m,i)=>{
  const q=pizzaQty(m.id);
  return `<article class="card${q?' has':''}${m.soldOut?' sold':''}" style="${enter?`animation-delay:${i*40}ms`:'animation:none'}">
   <button class="pic" data-act="open-pizza" data-id="${m.id}" aria-label="Tilpass ${m.name}">
    <img src="${img(m.id)}" alt="${m.name} pizza" loading="lazy">${q?`<span class="qtyb">${q}</span>`:''}</button>
   <div class="body">
    <button class="name-row" data-act="open-pizza" data-id="${m.id}"><span class="name">${m.name}</span>${m.tag?`<span class="tag">${m.tag}</span>`:''}</button>
    <div class="ing">${m.ing}</div>
    <button class="custom" data-act="open-pizza" data-id="${m.id}">Størrelse og topping ›</button>
    <div class="foot">
     <div class="price">${m.price} <small>kr</small></div>
     ${q?`<div class="stepper"><button data-act="dec" data-id="${m.id}" aria-label="Fjern én ${m.name}">−</button><span>${q}</span><button class="plus" data-act="inc" data-id="${m.id}" aria-label="Legg til én ${m.name}">+</button></div>`
       :m.soldOut?`<button class="add" disabled>Utsolgt</button>`:`<button class="add" data-act="inc" data-id="${m.id}" aria-label="Legg til ${m.name}">Legg til <span>+</span></button>`}
    </div></div></article>`}).join(''):`<div class="empty-filter">Ingenting her ennå.</div>`;

 const card=e=>{const q=S.extras[e.id]||0;
  return `<button class="extra${q?' has':''}" data-act="extra" data-id="${e.id}" aria-label="Legg til ${e.name}" ${e.soldOut?'disabled':''}>
   <span class="em">${e.icon||e.em}</span><span class="n">${e.short||e.name}</span><span class="p">${e.size?byId(BOTTLES,e.size).label+' · ':''}${e.price} kr</span>
   <span class="pill">${e.soldOut?'Utsolgt':q?`${q} i kurven · +`:'Legg til +'}</span></button>`};
 const row=(key,title,items,right='',two=false)=>`<div class="section-title"><span>${title}</span>${right}</div>
  <div class="extras${two?' two':''}" data-row="${key}">${items.map(card).join('')}</div>`;
 const sizeSeg=`<span class="size-seg" role="group" aria-label="Flaskestørrelse">${BOTTLES.map(z=>
  `<button data-act="drink-size" data-id="${z.id}" aria-pressed="${S.drinkSize===z.id}">${z.label}</button>`).join('')}</span>`;
 // keep each row's horizontal scroll position across re-renders
 const ex=$('extras'),pos={};ex.querySelectorAll('[data-row]').forEach(r=>{pos[r.dataset.row]=r.scrollLeft});
 ex.innerHTML=row('sides','Tilbehør',SIDES)+row('dips','Dipp',DIPS)
  +row('drinks','Drikke',DRINKS.filter(d=>d.size===S.drinkSize),sizeSeg,true)+row('desserts','Noe søtt',DESSERTS);
 ex.querySelectorAll('[data-row]').forEach(r=>{r.scrollLeft=pos[r.dataset.row]||0});

 const empty=!t.items;
 $('cart-line').innerHTML=empty?`<span>Handlekurven er tom</span><span>${S.mode==='delivery'?`Levering ${FEE} kr`:`Klar om ca. ${STORE.pickupMin} min`}</span>`
  :`<span class="l"><span class="bag${bagBump?' bump':''}">${t.items}</span>${t.sub} kr · <span class="view-link">Se kurven</span></span><span>${S.mode==='delivery'?`+ ${FEE} kr levering`:`Klar om ca. ${STORE.pickupMin} min`}</span>`;
 $('cart-line').disabled=empty;bagBump=false;
 const seg=document.querySelector('.seg');seg.classList.toggle('pickup',S.mode==='pickup');
 seg.querySelectorAll('button').forEach(b=>b.setAttribute('aria-selected',b.dataset.mode===S.mode));
 $('cta').disabled=empty||!STORE.open;$('card-btn').disabled=empty||!STORE.open;
 $('cta').textContent=!STORE.open?(STORE.pauseMessage||'Kjøkkenet har pause — tilbake snart'):empty?'Legg til en pizza for å bestille'
  :S.mode==='delivery'&&a&&!inRange(a)?'Utenfor leveringsområdet — velg en annen adresse':`⚡ Betal med Vipps • ${t.total} kr`;
 renderToast();
}
function renderToast(){
 const el=$('toast');el.classList.toggle('on',!!S.toast);
 if(S.toast)el.innerHTML=`<span>${S.toast.warn?'':'✓ '}${esc(S.toast.text)}</span>${S.toast.undo?'<button data-act="undo">Angre</button>':''}`;
}

// ---------- render: sheets ----------
function renderSheet(){
 const sh=S.sheet;$('overlay').classList.toggle('on',!!sh);$('sheet').classList.toggle('on',!!sh);
 if(!sh)return;
 const body=$('sheet-body');
 // sheets with text inputs are drawn once per opening, so typing is never interrupted
 if(sh!==renderSheet.cur){body.innerHTML='';renderSheet.cur=sh}
 if(sh.type==='pizza'){
  const m=byId(MENU,sh.id),unit=unitPrice(sh);
  body.innerHTML=`<div class="detail-img"><img src="${img(m.id)}" alt=""></div>
   <h2 class="sh-title">${m.name} ${m.tag?`<span class="tag">${m.tag}</span>`:''}</h2><div class="sh-sub">${m.ing}</div>
   <div class="sh-label"><span>Størrelse</span></div>
   <div class="sizes">${SIZES.map(z=>`<button class="opt" aria-pressed="${sh.size===z.id}" data-act="size" data-id="${z.id}">${z.label}<small>${z.cm} cm · ${m.price+z.add} kr</small></button>`).join('')}</div>
   <div class="sh-label"><span>Ekstra topping · +${TOP_PRICE} kr</span><span>${sh.tops.length}/${MAX_TOPS}</span></div>
   <div class="tops">${TOPPINGS.map(tp=>{const on=sh.tops.includes(tp.id);
    return `<button class="opt" aria-pressed="${on}" data-act="top" data-id="${tp.id}" ${!on&&sh.tops.length>=MAX_TOPS?'disabled':''}>${tp.name}<small>${on?'✓':'+'}</small></button>`}).join('')}</div>
   <div class="sheet-foot">
    <div class="stepper"><button data-act="sh-qty" data-d="-1" aria-label="Færre">−</button><span>${sh.qty}</span><button class="plus" data-act="sh-qty" data-d="1" aria-label="Flere">+</button></div>
    <button class="cta" data-act="sh-add">Legg til · ${unit*sh.qty} kr</button></div>`;
 }else if(sh.type==='cart'){
  const t=totals();
  if(!t.items){S.sheet=null;return renderSheet()}
  body.innerHTML=`<h2 class="sh-title">Handlekurven din</h2><div class="sh-sub">${S.mode==='delivery'?(S.address?'Levering til '+esc(S.address.line):'Levering — adressen velger du før betaling'):'Hentes på Grünerløkka'}</div>
   <div style="margin-top:8px">${S.lines.map((l,i)=>`<div class="row"><div class="thumb"><img src="${img(l.id)}" alt=""></div>
     <div class="info"><b>${byId(MENU,l.id).name}</b><span>${esc(lineDesc(l))} · ${unitPrice(l)} kr</span></div>
     <div class="stepper"><button data-act="line" data-i="${i}" data-d="-1" aria-label="Færre">−</button><span>${l.qty}</span><button class="plus" data-act="line" data-i="${i}" data-d="1" aria-label="Flere">+</button></div></div>`).join('')}
    ${EXTRAS.filter(e=>S.extras[e.id]).map(e=>`<div class="row"><div class="thumb">${e.icon||e.em}</div><div class="info"><b>${e.name}</b><span>${e.price} kr</span></div>
     <div class="stepper"><button data-act="cart-extra" data-id="${e.id}" data-d="-1" aria-label="Færre">−</button><span>${S.extras[e.id]}</span><button class="plus" data-act="cart-extra" data-id="${e.id}" data-d="1" aria-label="Flere">+</button></div></div>`).join('')}</div>
   <div class="totals"><span>Delsum</span><b>${t.sub} kr</b>${t.fee?`<span>Levering</span><b>${t.fee} kr</b>`:''}<span>Totalt</span><b>${t.total} kr</b></div>
   ${detailsOk()?`<button class="who" data-act="open-details"><span>👤 ${esc(S.customer.name)} · ${esc(C.normPhone(S.customer.phone))}</span><span class="view-link">Endre</span></button>`:''}
   <div class="sheet-foot"><button class="cta" data-act="pay">⚡ Betal med Vipps • ${t.total} kr</button>
    <button class="card-btn" data-act="open-card" aria-label="Betal med bank- eller kredittkort"><span>💳</span>Kort</button></div>`;
 }else if(sh.type==='address'){
  // The search box is drawn once and keeps focus; only the list under it changes as the customer types
  if(!$('addr-q')){body.innerHTML=`<h2 class="sh-title">Hvor skal vi levere?</h2>
   <div class="sh-sub">Vi leverer innen ${String(STORE.deliveryRadiusKm).replace('.',',')} km fra ${esc(SHOP.name)}. Levering ${FEE} kr per bestilling.</div>
   <div class="field"><label for="addr-q">Adresse</label><input id="addr-q" type="search" autocomplete="street-address" placeholder="Gate og nummer, f.eks. Toftes gate 20" enterkeyhint="search"></div>
   <div id="addr-hits" class="hits" aria-live="polite"></div>`;
   $('addr-q').value=sh.q||'';setTimeout(()=>$('addr-q')?.focus(),300)}
  renderHits();
 }else if(sh.type==='details'){
  if(!$('cu-name')){body.innerHTML=`<h2 class="sh-title">Dine opplysninger</h2><div class="sh-sub">Så kjøkkenet og budet kan nå deg. Vi husker dem på denne telefonen.</div>
   <div class="field"><label for="cu-name">Navn</label><input id="cu-name" autocomplete="name" maxlength="60" enterkeyhint="next"></div>
   <div class="field"><label for="cu-phone">Mobilnummer</label><input id="cu-phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="412 34 567" maxlength="20" enterkeyhint="next"></div>
   <div id="cu-where"></div>
   <div class="field" id="f-note"><label for="cu-note">Beskjed til budet <span class="soft">(valgfritt)</span></label><input id="cu-note" maxlength="200" placeholder="Etasje, dørkode, ringeklokke …" enterkeyhint="done"></div>
   <div class="cc-err" id="cu-err" role="alert"></div>
   <div class="sheet-foot"><button class="cta" data-act="details-done">${sh.next?'Fortsett til betaling':'Lagre'}</button></div>`;
   $('cu-name').value=S.customer.name;$('cu-phone').value=S.customer.phone;$('cu-note').value=S.note;
   if(!S.customer.name)setTimeout(()=>$('cu-name')?.focus(),300)}
  const a=S.address,del=S.mode==='delivery';
  $('f-note').hidden=!del;
  $('cu-where').innerHTML=del?`<button class="who" data-act="open-address"><span>📍 ${a?esc(a.line+', '+a.post):'Velg leveringsadresse'}</span><span class="view-link">${a?'Endre':'Velg'}</span></button>`
   :`<div class="who"><span>🛍️ Hentes hos ${esc(SHOP.name)}, ${esc(SHOP.address)}</span></div>`;
 }else if(sh.type==='card'){
  // Inputs are not re-rendered while typing; values live in sh and are synced by the input handler
  if(!$('cc-num'))body.innerHTML=`<h2 class="sh-title">Betal med kort</h2><div class="sh-sub">Bank- eller kredittkort · Visa, Mastercard, Amex</div>
   <div class="field" id="f-num"><label for="cc-num">Kortnummer</label>
    <input id="cc-num" inputmode="numeric" autocomplete="cc-number" placeholder="1234 5678 9012 3456" maxlength="23"><span class="brand" id="cc-brand"></span></div>
   <div class="field-row">
    <div class="field" id="f-exp"><label for="cc-exp">Utløpsdato</label><input id="cc-exp" inputmode="numeric" autocomplete="cc-exp" placeholder="MM/ÅÅ" maxlength="5"></div>
    <div class="field" id="f-cvc"><label for="cc-cvc">CVC</label><input id="cc-cvc" inputmode="numeric" autocomplete="cc-csc" placeholder="123" maxlength="4"></div></div>
   <div class="cc-err" id="cc-err" role="alert"></div>
   <div class="sheet-foot"><button class="cta" id="cc-pay" data-act="pay-card"></button></div>
   <div class="cc-note">🔒 Kun demo — ingen kort belastes eller lagres.</div>`;
  $('cc-num').value=sh.num;$('cc-exp').value=sh.exp;$('cc-cvc').value=sh.cvc;syncCard();
 }else if(sh.type==='pay'){
  body.innerHTML=`<div class="vipps"><div class="spinner"></div><div class="sh-title" style="font-size:20px">${sh.method==='card'?'Behandler betalingen …':'Bekreft i Vipps'}</div>
   <div class="sh-sub">${sh.method==='card'?esc(sh.label)+' · ':''}${totals().total} kr · ${S.mode==='delivery'?'Levering':'Hent selv'}</div></div>`;
 }
}

// ---------- address search ----------
// Kartverket's open address register covers every address in Norway and returns its position.
const GEO='https://ws.geonorge.no/adresser/v1/sok';
const town=s=>s.toLowerCase().replace(/(^|[\s-])\S/g,m=>m.toUpperCase());
let geoTimer,geoSeq=0;
function searchAddress(q){
 const sh=S.sheet;sh.q=q;clearTimeout(geoTimer);const seq=++geoSeq;
 if(q.trim().length<3){sh.hits=null;sh.state='';return renderHits()}
 sh.state='loading';
 geoTimer=setTimeout(async()=>{
  try{const r=await fetch(`${GEO}?sok=${encodeURIComponent(q.trim())}&fuzzy=true&treffPerSide=8&utkoordsys=4258`);
   if(!r.ok)throw new Error(r.status);const d=await r.json();
   if(seq!==geoSeq||S.sheet!==sh)return;
   sh.hits=(d.adresser||[]).filter(a=>a.representasjonspunkt&&a.adressetekst)
    .map(a=>({line:a.adressetekst,post:`${a.postnummer} ${town(a.poststed||'')}`.trim(),lat:a.representasjonspunkt.lat,lng:a.representasjonspunkt.lon}));
   sh.state=sh.hits.length?'':'none';
  }catch(e){if(seq===geoSeq){sh.hits=null;sh.state='error'}}
  if(S.sheet===sh)renderHits();
 },250);
 renderHits();
}
function renderHits(){
 const sh=S.sheet,el=$('addr-hits');if(!el||sh?.type!=='address')return;
 const list=sh.hits||(!sh.q?S.recent:[]);
 const row=(a,i,src)=>{const k=kmTo(a),ok=k<=STORE.deliveryRadiusKm;
  return`<button class="addr${ok?'':' far'}" data-act="pick-hit" data-src="${src}" data-i="${i}" ${ok?'':'aria-disabled="true"'}>
   <span class="info"><b>${esc(a.line)}</b><span>${esc(a.post)}</span></span>
   <span class="eta">${ok?`${kmText(k)} · ${etaFor(a)} min`:`${kmText(k)} · utenfor`}</span></button>`};
 el.innerHTML=(sh.state==='loading'&&!sh.hits?'<div class="hint">Søker …</div>':'')
  +(sh.state==='none'?'<div class="hint">Fant ingen adresse. Prøv gatenavn og nummer.</div>':'')
  +(sh.state==='error'?'<div class="hint">Adressesøket svarer ikke akkurat nå. Prøv igjen om litt.</div>':'')
  +(!sh.hits&&!sh.q&&S.recent.length?'<div class="sh-label"><span>Tidligere adresser</span></div>':'')
  +list.map((a,i)=>row(a,i,sh.hits?'hits':'recent')).join('');
}

// ---------- checkout ----------
// The customer pays only once we know where to deliver and how to reach them; whatever is missing is asked for first.
function checkout(method){
 if(!totals().items||!STORE.open)return;
 if(S.mode==='delivery'&&!inRange(S.address)){S.sheet={type:'address',next:method,q:''};return}
 if(!detailsOk()){S.sheet={type:'details',next:method};return}
 if(method==='card')S.sheet={type:'card',num:'',exp:'',cvc:''};else startPay('vipps');
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
 const err=numDone&&!numOk?'Sjekk kortnummeret.':m&&!expOk?'Kortet er utløpt, eller datoen er feil.':'';
 return{ok:numOk&&expOk&&cvcOk,err,badNum:numDone&&!numOk,badExp:!!m&&!expOk,brand:cardBrand(n),last4:n.slice(-4)};
}
function syncCard(){
 const sh=S.sheet,c=cardCheck(sh);
 $('cc-brand').textContent=c.brand;$('cc-err').textContent=c.err;
 $('f-num').classList.toggle('bad',c.badNum);$('f-exp').classList.toggle('bad',c.badExp);
 $('cc-pay').disabled=!c.ok;$('cc-pay').textContent=`Betal ${totals().total} kr`;
}
document.addEventListener('input',e=>{
 const sh=S.sheet,el=e.target;if(!sh)return;
 if(el.id==='addr-q')return searchAddress(el.value);
 if(el.id==='cu-name'||el.id==='cu-phone'){S.customer[el.id==='cu-name'?'name':'phone']=el.value;$('cu-err').textContent='';return save()}
 if(el.id==='cu-note'){S.note=el.value;return save()}
 if(sh.type!=='card')return;
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
 const del=S.mode==='delivery',a=S.address,dest=del?{lat:a.lat,lng:a.lng}:null;local.dest=dest;
 const body={lines:local.lines,extras:local.extras,mode:S.mode,address:del?`${a.line}, ${a.post}`:'',dest,note:del?S.note.trim():'',
  customer:{name:S.customer.name.trim(),phone:S.customer.phone},payment:{method}};
 const placed=!LIVE?Promise.resolve(null):B?B.placeOrder(body):fetch('api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
  .then(async r=>{const b=await r.json().catch(()=>({}));if(!r.ok)throw new Error(b.error||'Kunne ikke sende bestillingen');return b});
 Promise.all([placed,pause]).then(([o])=>{
  S.order=o?{...local,id:o.id,number:o.number,total:o.total,status:o.status,createdAt:o.createdAt,times:o.times,driver:o.driver,pos:o.pos,skew:o.now-Date.now()}:local;
  S.last={lines:local.lines,extras:local.extras};S.lines=[];S.extras={};
  S.sheet=null;S.screen='tracker';S.virt=0;lastTick=Date.now();render();
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
  showToast(`${gone.join(', ')} er utsolgt — fjernet fra kurven`,null)}
 if(S.sheet?.type==='pizza'&&byId(MENU,S.sheet.id).soldOut)S.sheet=null;
 if(S.sheet?.type!=='card')render();
}
async function syncOrder(){
 const o=S.order;if(!o?.id||['done','cancelled'].includes(o.status))return;
 try{let b;if(B)b=await B.order(o.id);else{const r=await fetch('api/orders/'+o.id,{cache:'no-store'});if(!r.ok)return;b=await r.json()}
  if(S.order!==o)return;o.status=b.status;o.times=b.times;o.driver=b.driver;o.pos=b.pos;o.skew=b.now-Date.now();save();if(S.screen==='tracker')renderTracker();else renderMenu()}catch(e){}
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
  lmap=L.map(mapEl,{zoomControl:false,attributionControl:true,scrollWheelZoom:false});
  // standard OpenStreetMap tiles, darkened in CSS to match the app
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',
   {maxZoom:19,className:'dark-tiles',attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(lmap);
  lmap.setView([SHOP.lat,SHOP.lng],15);
 }
 return mapEl;
}
const MARK={shop:{color:'#FF5500',fill:'#18181B',r:7},dest:{color:'#10B981',fill:'#10B981',r:7},driver:{color:'#fff',fill:'#8B5CF6',r:8}};
function drawMap(pts){
 if(lmap){
  lmap.invalidateSize();
  for(const k of Object.keys(MARK)){
   const p=pts[k];
   if(!p){if(lmarks[k]){lmarks[k].remove();delete lmarks[k]}continue}
   if(!lmarks[k])lmarks[k]=L.circleMarker([p.lat,p.lng],{radius:MARK[k].r,color:MARK[k].color,weight:3,fillColor:MARK[k].fill,fillOpacity:1}).addTo(lmap);
   else lmarks[k].setLatLng([p.lat,p.lng]);
  }
  // re-frame when the set of points changes or the driver leaves the view
  const list=Object.values(pts).filter(Boolean),key=Object.keys(pts).filter(k=>pts[k]).join();
  if(list.length&&(key!==fitKey||(pts.driver&&!lmap.getBounds().pad(-.1).contains([pts.driver.lat,pts.driver.lng])))){
   fitKey=key;if(list.length===1)lmap.setView([list[0].lat,list[0].lng],15);else lmap.fitBounds(list.map(p=>[p.lat,p.lng]),{padding:[28,28],maxZoom:16});
  }
  return;
 }
 // drawn fallback: the points projected into the box, on a faint street grid
 const list=Object.values(pts).filter(Boolean),W=358,H=150,pad=26;
 const la=list.map(p=>p.lat),ln=list.map(p=>p.lng),k=Math.cos(SHOP.lat*Math.PI/180);
 const spanX=Math.max((Math.max(...ln)-Math.min(...ln))*k,.004),spanY=Math.max(Math.max(...la)-Math.min(...la),.002);
 const sc=Math.min((W-2*pad)/spanX,(H-2*pad)/spanY),cx=(Math.max(...ln)+Math.min(...ln))/2,cy=(Math.max(...la)+Math.min(...la))/2;
 const xy=p=>[W/2+(p.lng-cx)*k*sc,H/2-(p.lat-cy)*sc];
 const dot=(p,m)=>{if(!p)return'';const[x,y]=xy(p);return(m===MARK.driver?`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="15" fill="#8B5CF6" opacity=".25"/>`:'')+
  `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${m.r}" fill="${m.fill}" stroke="${m.color}" stroke-width="3"/>`};
 const line=pts.dest?(()=>{const[a1,b1]=xy(pts.shop),[a2,b2]=xy(pts.dest);return`<path d="M${a1} ${b1}L${a2} ${b2}" stroke="#3F3F46" stroke-width="4" stroke-linecap="round" stroke-dasharray="2 8"/>`})():'';
 mapEl.innerHTML=`<svg width="100%" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">
  <g stroke="#1E1E22" stroke-width="10" fill="none"><path d="M0 34H${W}M0 112H${W}M60 0V${H}M150 0V${H}M250 0V${H}M320 0V${H}"/></g>
  ${line}${dot(pts.shop,MARK.shop)}${dot(pts.dest,MARK.dest)}${dot(pts.driver,MARK.driver)}</svg>`;
}

function renderTracker(){
 const pick=S.mode==='pickup',order=S.order||{lines:S.lines,extras:S.extras,total:totals().total};
 // A server order follows the kitchen's real status and the real clock; the standalone demo follows a sped-up timer.
 const live=!!order.id,now=Date.now()+(order.skew||0),cancelled=live&&order.status==='cancelled';
 const v=live?Math.min(TOTAL,(now-order.createdAt)/1000):S.virt;
 const waiting=live&&!pick&&order.status==='ready'; // baked, waiting for the driver to collect it
 const stage=live?({received:0,oven:1,ready:pick?2:1,out:2,done:3}[order.status]??0):STEPS.reduce((a,s,i)=>v>=s.at?i:a,0);
 const done=stage===3,left=done||cancelled?0:Math.max(0,TOTAL-v);
 const st=cancelled?{label:'Kansellert',color:'#EF4444',tint:'rgba(239,68,68,.14)',fg:'#FCA5A5'}:STEPS[stage];
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
  <header class="trk-head"><button class="round" data-act="back" aria-label="Tilbake til menyen">←</button>
   <div class="trk-id"><small>Bestilling</small><b>${number}</b></div>
   <span class="badge" style="background:${st.tint};color:${st.fg}"><i style="background:${st.color}"></i>${badge}</span></header>
  <div class="ring"><svg width="248" height="248" viewBox="0 0 248 248">
    <circle cx="124" cy="124" r="110" fill="none" stroke="#1F1F23" stroke-width="14"/>
    <circle cx="124" cy="124" r="110" fill="none" stroke="${done?'#10B981':'#FF5500'}" stroke-width="14" stroke-linecap="round" stroke-dasharray="691.15" stroke-dashoffset="${(691.15*(1-left/TOTAL)).toFixed(2)}"/></svg>
   <div class="c"><div class="cap">${cancelled?'Kansellert':done?(pick?'Hentet':'Levert'):!left?'Når som helst':pick?'Klar om':'Fremme om'}</div><div class="t">${cancelled?'–':time}</div><div class="e">${cancelled?'Kontakt oss hvis dette er feil':done?'Velbekomme!':live?'Direkte fra kjøkkenet':`Fart: ${SPEED===1?'sanntid':SPEED+'× demo'}`}</div></div></div>
  <div class="box steps">${STEPS.map((s,i)=>{const past=!cancelled&&i<stage,cur=!cancelled&&i===stage,on=past||cur;
   return `<div class="step"><div class="rail"><div class="dot" style="background:${on?s.color:'transparent'};border-color:${on?s.color:'#3F3F46'};box-shadow:${cur&&!done?`0 0 0 5px ${s.tint}`:'none'}">${past||(cur&&done)?'✓':''}</div>
    ${i<3?`<div class="ln" style="background:${past?STEPS[i+1].color:'#27272A'}"></div>`:''}</div>
    <div class="tx"><b style="color:${on?'#fff':'#71717A'}">${label(i)}</b><span>${sub(i)}</span></div></div>`}).join('')}</div>
  ${pick?`<div class="box" style="padding:16px"><b style="font-size:16px">Hent hos ${esc(SHOP.name)}</b><div class="sh-sub">${esc(SHOP.address)} · Vis bestilling ${number} i disken</div></div>`
  :`<div class="box"><div class="map"><div class="map-slot"></div><div class="dist">${distLine}</div>${stale}</div>
   ${driver?`<div class="driver"><div class="avatar">${esc(driver.name[0]||'?')}</div><div style="flex:1;min-width:0"><b style="font-size:16px">${esc(driver.name)}</b><div class="sh-sub" style="margin:0">${esc(driver.vehicle||'Bud')}</div></div>
    ${driver.phone?`<a class="call${order.status==='out'||(!live&&stage===2)?' live':''}" href="tel:${esc(driver.phone.replace(/\s/g,''))}">📞 Ring</a>`:''}</div>`
   :`<div class="driver"><div class="avatar">🛵</div><div style="flex:1;min-width:0"><b style="font-size:16px">Vi finner et bud til deg</b><div class="sh-sub" style="margin:0">Du ser budet her så snart noen har tatt leveringen</div></div></div>`}</div>`}
  <div class="summary"><span>${esc(summary(order))||'—'}</span><b>${order.total} kr</b></div>
  ${live?'':'<button class="ghost" data-act="restart">↺ Start tiden på nytt</button>'}`;
 if(!pick){$('tracker-body').querySelector('.map-slot').replaceWith(mapNode());drawMap({shop:SHOP,dest,driver:drv})}
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
 extra:d=>{bumpExtra(d.id,1);showToast('La til '+byId(EXTRAS,d.id).name,()=>bumpExtra(d.id,-1))},
 mode:(d,el)=>{S.mode=el.dataset.mode},
 reorder:()=>{S.last.lines.filter(l=>!byId(MENU,l.id).soldOut).forEach(l=>addLine(l,l.qty,{toast:false}));
  Object.entries(S.last.extras).filter(([id])=>!byId(EXTRAS,id).soldOut).forEach(([id,q])=>{S.extras[id]=(S.extras[id]||0)+q});
  showToast('Forrige bestilling lagt til',null);bumpBag()},
 undo:()=>{S.toast?.undo?.();S.toast=null},
 'open-pizza':d=>{if(!byId(MENU,d.id).soldOut)S.sheet={type:'pizza',id:d.id,size:'M',tops:[],qty:1}},
 'open-cart':()=>{S.sheet={type:'cart'}},
 'open-address':()=>{S.sheet={type:'address',next:S.sheet?.next,q:''}},
 'open-details':()=>{S.sheet={type:'details'}},
 'pick-hit':(d,el)=>{if(el.getAttribute('aria-disabled')){showToast(`Vi leverer bare innen ${String(STORE.deliveryRadiusKm).replace('.',',')} km — velg Hent selv`,null,true);render();return}
  const a={...(d.src==='hits'?S.sheet.hits:S.recent)[+d.i]},next=S.sheet.next;
  S.address=a;S.recent=[a,...S.recent.filter(r=>r.line!==a.line||r.post!==a.post)].slice(0,3);
  S.sheet=null;heroTick();if(next)checkout(next)},
 'details-done':()=>{
  const err=S.customer.name.trim().length<2?'Skriv inn navnet ditt.':!C.normPhone(S.customer.phone)?'Skriv inn et gyldig norsk mobilnummer, f.eks. 412 34 567.':'';
  if(err){$('cu-err').textContent=err;return}
  S.customer.phone=C.normPhone(S.customer.phone);const next=S.sheet.next;S.sheet=null;if(next)checkout(next)},
 'close-sheet':()=>{if(S.sheet?.type!=='pay')S.sheet=null},
 size:d=>{S.sheet.size=d.id},
 top:d=>{const t=S.sheet.tops,i=t.indexOf(d.id);if(i>=0)t.splice(i,1);else if(t.length<MAX_TOPS)t.push(d.id);
  t.sort((a,b)=>TOPPINGS.findIndex(x=>x.id===a)-TOPPINGS.findIndex(x=>x.id===b))},
 'sh-qty':d=>{S.sheet.qty=Math.max(1,S.sheet.qty+Number(d.d))},
 'sh-add':()=>{const sh=S.sheet;S.sheet=null;addLine(sh,sh.qty)},
 line:d=>{const l=S.lines[d.i];l.qty+=Number(d.d);if(l.qty<=0)S.lines.splice(d.i,1)},
 'cart-extra':d=>bumpExtra(d.id,Number(d.d)),
 pay:()=>checkout('vipps'),
 'open-card':()=>checkout('card'),
 'pay-card':()=>{const c=cardCheck(S.sheet);if(c.ok)startPay('card',`${c.brand||'Kort'} •••• ${c.last4}`)},
 back:()=>{S.screen='menu'},
 track:()=>{S.screen='tracker'},
 restart:()=>{S.virt=0;lastTick=Date.now()}};

document.addEventListener('click',e=>{
 const el=e.target.closest('[data-act]');if(!el||el.disabled)return;
 const fn=actions[el.dataset.act];if(!fn)return;
 fn(el.dataset,el);render();
});
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&S.sheet?.type==='card'&&e.target.tagName==='INPUT'){actions['pay-card']();render();return}
 if(e.key==='Enter'&&S.sheet?.type==='details'&&e.target.tagName==='INPUT'){e.preventDefault();
  const next={'cu-name':'cu-phone','cu-phone':S.mode==='delivery'?'cu-note':null}[e.target.id];if(next){$(next).focus();return}actions['details-done']();render();return}
 if(e.key==='Enter'&&e.target.id==='addr-q'){e.preventDefault();const b=document.querySelector('#addr-hits .addr:not(.far)');if(b)b.click();return}
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
