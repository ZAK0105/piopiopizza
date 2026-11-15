// Pio Pio Pizza order rules — pure functions with no I/O, so the same code runs in the Node server,
// in the Base44 backend functions and in the admin dashboard.
(function(root){
/*BODY*/
const TARGET_MIN=20; // the "door in 20" promise
const FLOW={delivery:['received','oven','out','done'],pickup:['received','oven','ready','done']};
const ACTIVE=['received','oven','out','ready'];
const DEFAULT_SETTINGS={open:true,pauseMessage:'',deliveryFee:49,etaMin:18,pickupMin:12};

class Invalid extends Error{constructor(msg,status=400){super(msg);this.status=status}}
const byId=(arr,id)=>arr.find(x=>x.id===id);
const isInt=(n,min,max)=>Number.isInteger(n)&&n>=min&&n<=max;

// ---- catalog ----
// overrides: {itemId:{price?,available?}} set by the admin on top of the menu's standard prices
function catalog(M,overrides){
 const o=overrides||{};
 const row=(x,group)=>({id:x.id,name:x.name,group,basePrice:x.price,price:o[x.id]?.price??x.price,available:o[x.id]?.available!==false});
 return[...M.PIZZAS.map(p=>row(p,'pizzas')),...M.EXTRAS.map(e=>row(e,e.group))];
}
function publicMenu(M,overrides,settings){
 const items={};for(const c of catalog(M,overrides))items[c.id]={price:c.price,available:c.available};
 const s={...DEFAULT_SETTINGS,...settings};
 return{items,settings:{open:s.open,pauseMessage:s.pauseMessage,deliveryFee:s.deliveryFee,etaMin:s.etaMin,pickupMin:s.pickupMin}};
}
// Returns the new override for one item ({} = back to standard), or throws Invalid.
function patchOverride(item,current,patch){
 const o={...current};
 if('available' in patch){if(typeof patch.available!=='boolean')throw new Invalid('available must be true or false');
  if(patch.available)delete o.available;else o.available=false}
 if('price' in patch){if(patch.price===null)delete o.price;
  else{if(!isInt(patch.price,0,100000))throw new Invalid('price must be a whole number of kroner');
   if(patch.price===item.basePrice)delete o.price;else o.price=patch.price}}
 return o;
}
function patchSettings(patch){
 const n={};
 if('open' in patch){if(typeof patch.open!=='boolean')throw new Invalid('open must be true or false');n.open=patch.open}
 if('pauseMessage' in patch){if(typeof patch.pauseMessage!=='string'||patch.pauseMessage.length>120)throw new Invalid('pauseMessage is too long');n.pauseMessage=patch.pauseMessage.trim()}
 for(const[k,max]of[['deliveryFee',1000],['etaMin',180],['pickupMin',180]])
  if(k in patch){if(!isInt(patch[k],0,max))throw new Invalid(`${k} must be a whole number between 0 and ${max}`);n[k]=patch[k]}
 return n;
}

// ---- orders ----
// Prices are always computed here; anything the client says about money is ignored.
// Returns the order without id/number — the caller's storage assigns those.
function priceOrder(M,overrides,settings,body,{demo=false,now=Date.now(),force=false}={}){
 if(!body||typeof body!=='object')throw new Invalid('Bad request');
 const s={...DEFAULT_SETTINGS,...settings};
 if(!s.open&&!force)throw new Invalid(s.pauseMessage||'The kitchen is not taking orders right now.',409);
 const cat=new Map(catalog(M,overrides).map(c=>[c.id,c]));
 const mode=body.mode;if(mode!=='delivery'&&mode!=='pickup')throw new Invalid('mode must be delivery or pickup');
 const lines=[],extras=[];let count=0;
 if(!Array.isArray(body.lines)||body.lines.length>20)throw new Invalid('Bad lines');
 for(const l of body.lines){
  const p=byId(M.PIZZAS,l?.id),z=byId(M.SIZES,l?.size);
  if(!p||!z)throw new Invalid('Unknown pizza or size');
  if(!isInt(l.qty,1,20))throw new Invalid('Bad quantity');
  const tops=Array.isArray(l.tops)?[...new Set(l.tops)]:null;
  if(!tops||tops.length>M.MAX_TOPS||tops.some(t=>!byId(M.TOPPINGS,t)))throw new Invalid('Bad toppings');
  const c=cat.get(p.id);if(!c.available&&!force)throw new Invalid(`${p.name} is sold out`,409);
  lines.push({id:p.id,name:p.name,size:z.id,tops,qty:l.qty,unit:c.price+z.add+tops.length*M.TOP_PRICE});count+=l.qty;
 }
 const ex=body.extras&&typeof body.extras==='object'&&!Array.isArray(body.extras)?body.extras:{};
 for(const[id,qty]of Object.entries(ex)){
  const e=byId(M.EXTRAS,id);if(!e)throw new Invalid('Unknown item');
  if(!isInt(qty,1,20))throw new Invalid('Bad quantity');
  const c=cat.get(id);if(!c.available&&!force)throw new Invalid(`${e.name} is sold out`,409);
  extras.push({id,name:e.name,qty,unit:c.price});count+=qty;
 }
 if(!count)throw new Invalid('The bag is empty');
 if(count>60)throw new Invalid('That is a lot of pizza — please call us for large orders');
 let address='';
 if(mode==='delivery'){address=typeof body.address==='string'?body.address.trim().slice(0,120):'';
  if(!address)throw new Invalid('A delivery address is required')}
 const method=body.payment?.method;if(method!=='vipps'&&method!=='card')throw new Invalid('payment.method must be vipps or card');
 const subtotal=lines.reduce((a,l)=>a+l.qty*l.unit,0)+extras.reduce((a,e)=>a+e.qty*e.unit,0);
 const fee=mode==='delivery'?s.deliveryFee:0;
 const order={createdAt:now,status:'received',times:{received:now},mode,address,lines,extras,subtotal,fee,total:subtotal+fee,payment:{method}};
 if(demo)order.demo=true;
 return order;
}
// Moves an order one step; returns the changed {status,times} or throws Invalid.
function transition(o,action,now=Date.now()){
 const flow=FLOW[o.mode],i=flow.indexOf(o.status),times={...o.times};let status=o.status;
 if(action==='advance'){if(i<0||i>=flow.length-1)throw new Invalid('Order cannot be advanced',409);status=flow[i+1];times[status]=now}
 else if(action==='back'){if(i<=0||o.status==='done')throw new Invalid('Order cannot be moved back',409);delete times[o.status];status=flow[i-1]}
 else if(action==='cancel'){if(!ACTIVE.includes(o.status))throw new Invalid('Order is already closed',409);status='cancelled';times.cancelled=now}
 else throw new Invalid('Unknown action');
 return{status,times};
}
// What a customer may see about their own order.
const publicOrder=(o,id)=>({id,number:o.number,status:o.status,mode:o.mode,createdAt:o.createdAt,times:o.times,total:o.total,
 lines:o.lines.map(l=>({name:l.name,qty:l.qty})),extras:o.extras.map(e=>({name:e.name,qty:e.qty})),now:Date.now()});

// ---- statistics ----
const fmts={};
function local(ts,tz){
 const f=fmts[tz]||(fmts[tz]=new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}));
 const p={};for(const x of f.formatToParts(ts))p[x.type]=x.value;return{day:`${p.year}-${p.month}-${p.day}`,hour:+p.hour}}
const doorMin=o=>o.status==='done'&&o.times.done?(o.times.done-o.createdAt)/60000:null;
function summarize(orders){
 const sold=orders.filter(o=>o.status!=='cancelled');
 const revenue=sold.reduce((a,o)=>a+o.total,0);
 const times=sold.map(doorMin).filter(t=>t!==null);
 return{orders:sold.length,revenue,avgOrder:sold.length?Math.round(revenue/sold.length):0,
  cancelled:orders.length-sold.length,
  avgDoorMin:times.length?+(times.reduce((a,b)=>a+b,0)/times.length).toFixed(1):null,
  onTimePct:times.length?Math.round(100*times.filter(t=>t<=TARGET_MIN).length/times.length):null,timed:times.length};
}
// The first day stats(days) needs orders from, as a timestamp with a day of slack.
const statsSince=(days,now=Date.now())=>now-(2*Math.min(Math.max(days|0,1),90)+1)*864e5;
function stats(M,orders,days,tz,now=Date.now()){
 days=Math.min(Math.max(days|0,1),90);
 const dayKeys=[];for(let i=days-1;i>=0;i--)dayKeys.push(local(now-i*864e5,tz).day);
 const prevKeys=new Set();for(let i=2*days-1;i>=days;i--)prevKeys.add(local(now-i*864e5,tz).day);
 const inRange=new Set(dayKeys),cur=[],prev=[];
 const byDay=Object.fromEntries(dayKeys.map(d=>[d,{day:d,revenue:0,orders:0}]));
 const byHour=Array.from({length:24},(_,h)=>({hour:h,orders:0}));
 const items=new Map(),pay={vipps:0,card:0},mode={delivery:0,pickup:0};let active=0;
 for(const o of orders){
  if(ACTIVE.includes(o.status))active++;
  const l=local(o.createdAt,tz);
  if(prevKeys.has(l.day)){prev.push(o);continue}
  if(!inRange.has(l.day))continue;
  cur.push(o);if(o.status==='cancelled')continue;
  byDay[l.day].revenue+=o.total;byDay[l.day].orders++;byHour[l.hour].orders++;
  pay[o.payment.method]+=o.total;mode[o.mode]++;
  for(const x of[...o.lines,...o.extras]){const it=items.get(x.id)||{id:x.id,name:x.name,qty:0,revenue:0};it.qty+=x.qty;it.revenue+=x.qty*x.unit;items.set(x.id,it)}
 }
 const pizzaIds=new Set(M.PIZZAS.map(p=>p.id));
 const rank=f=>[...items.values()].filter(f).sort((a,b)=>b.qty-a.qty).slice(0,6);
 return{days,targetMin:TARGET_MIN,current:summarize(cur),previous:summarize(prev),byDay:dayKeys.map(d=>byDay[d]),byHour,
  topPizzas:rank(i=>pizzaIds.has(i.id)),topExtras:rank(i=>!pizzaIds.has(i.id)),payment:pay,mode,active};
}

// ---- demo data ----
// Plausible random orders, so the dashboard can be explored before real orders exist. Always flagged demo:true.
const pick=a=>a[Math.floor(Math.random()*a.length)];
const weighted=pairs=>{let r=Math.random()*pairs.reduce((a,p)=>a+p[1],0);for(const[v,w]of pairs){if((r-=w)<=0)return v}return pairs[0][0]};
const STREETS=['Thorvald Meyers gate','Markveien','Karl Johans gate','Sofienberggata','Toftes gate','Grüners gate','Helgesens gate','Sannergata','Trondheimsveien','Bogstadveien'];
const PIZZA_W=[['margherita',22],['piopio',30],['pepperoni',26],['funghi',12],['diavola',16]];
// Opening hours 11–22 with a lunch bump and a dinner peak
const HOUR_W=[[11,3],[12,7],[13,6],[14,3],[15,3],[16,5],[17,9],[18,13],[19,12],[20,9],[21,5],[22,2]];
function randomBody(M){
 const lines=[],n=weighted([[1,50],[2,32],[3,13],[4,5]]);
 for(let i=0;i<n;i++){
  const tops=[];if(Math.random()<.3){const t=[...M.TOPPINGS].sort(()=>Math.random()-.5);tops.push(...t.slice(0,weighted([[1,65],[2,25],[3,10]])).map(x=>x.id))}
  lines.push({id:weighted(PIZZA_W),size:weighted([['S',12],['M',58],['L',30]]),tops,qty:1});
 }
 const extras={};
 const add=(arr,p)=>{if(Math.random()<p){const e=pick(arr);extras[e.id]=(extras[e.id]||0)+1}};
 add(M.DRINKS,.62);add(M.DRINKS,.22);add(M.SIDES,.34);add(M.DIPS,.4);add(M.DESSERTS,.12);
 const mode=Math.random()<.74?'delivery':'pickup';
 return{lines,extras,mode,address:mode==='delivery'?`${pick(STREETS)} ${1+Math.floor(Math.random()*60)}`:'',
  payment:{method:Math.random()<.68?'vipps':'card'}};
}
// Returns `days` of finished and in-progress demo orders, oldest first (no id/number).
function demoHistory(M,overrides,settings,tz,days=21,now=Date.now()){
 const out=[];
 for(let d=days-1;d>=0;d--){
  const dayStart=now-d*864e5,wd=new Date(dayStart).getDay();
  const count=Math.round((wd===5||wd===6?70:wd===0?50:40)*(.8+Math.random()*.4)*(1+(days-d)/days*.25)); // slight growth
  for(let i=0;i<count;i++){
   const {day}=local(dayStart,tz),h=weighted(HOUR_W);
   // find the UTC instant for this local day+hour by correcting a first guess
   let ts=Date.parse(`${day}T${String(h).padStart(2,'0')}:00:00Z`);ts-=(local(ts,tz).hour-h)*36e5;
   ts+=Math.floor(Math.random()*36e5);
   if(ts>=now)continue;
   const o=priceOrder(M,overrides,settings,randomBody(M),{demo:true,force:true,now:ts});
   const flow=FLOW[o.mode],rush=h>=18&&h<=19?1.18:1;
   // step durations in minutes: to oven, to out/ready, to done
   const dur=[1+Math.random()*2.5,5+Math.random()*3,(o.mode==='pickup'?3:6)+Math.random()*(o.mode==='pickup'?6:8)*rush];
   let t=ts;
   for(let k=0;k<3;k++){t+=dur[k]*60000;if(t>now)break;o.status=flow[k+1];o.times[o.status]=Math.round(t)}
   if((now-ts)/60000>45&&Math.random()<.02){o.status='cancelled';o.times={received:ts,cancelled:ts+120000}}
   out.push(o);
  }
 }
 return out.sort((a,b)=>a.createdAt-b.createdAt);
}

// ---- storage records (Base44 entity rows) ----
const toRecord=o=>({number:o.number,status:o.status,mode:o.mode,address:o.address,lines:o.lines,extras:o.extras,subtotal:o.subtotal,fee:o.fee,
 total:o.total,payment_method:o.payment.method,times:o.times,placed_at:o.createdAt,demo:!!o.demo});
const fromRecord=r=>({id:r.id,number:r.number,status:r.status,mode:r.mode,address:r.address||'',lines:r.lines||[],extras:r.extras||[],
 subtotal:r.subtotal,fee:r.fee,total:r.total,payment:{method:r.payment_method},times:r.times||{},createdAt:r.placed_at,demo:!!r.demo});

const M={toRecord,fromRecord,TARGET_MIN,FLOW,ACTIVE,DEFAULT_SETTINGS,Invalid,catalog,publicMenu,patchOverride,patchSettings,priceOrder,transition,publicOrder,
 local,stats,statsSince,randomBody,demoHistory};
/*END*/
if(typeof module!=='undefined'&&module.exports)module.exports=M;else root.PP_CORE=M;
})(typeof globalThis!=='undefined'?globalThis:this);
