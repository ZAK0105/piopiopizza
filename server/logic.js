'use strict';
// Order rules: catalog with admin overrides, server-side pricing/validation, status flow, statistics.
const crypto=require('crypto');
const M=require('../app/menu.js');

const TZ=process.env.STORE_TZ||'Europe/Oslo';
const TARGET_MIN=20; // the "door in 20" promise
const FLOW={delivery:['received','oven','out','done'],pickup:['received','oven','ready','done']};
const ACTIVE=['received','oven','out','ready'];

class Invalid extends Error{constructor(msg,status=400){super(msg);this.status=status}}
const byId=(arr,id)=>arr.find(x=>x.id===id);
const isInt=(n,min,max)=>Number.isInteger(n)&&n>=min&&n<=max;

// ---- catalog ----
function catalog(db){
 const o=db.data.overrides;
 const row=(x,group)=>({id:x.id,name:x.name,group,basePrice:x.price,price:o[x.id]?.price??x.price,available:o[x.id]?.available!==false});
 return[...M.PIZZAS.map(p=>row(p,'pizzas')),...M.EXTRAS.map(e=>row(e,e.group))];
}
function publicMenu(db){
 const items={};for(const c of catalog(db))items[c.id]={price:c.price,available:c.available};
 const s=db.data.settings;
 return{items,settings:{open:s.open,pauseMessage:s.pauseMessage,deliveryFee:s.deliveryFee,etaMin:s.etaMin,pickupMin:s.pickupMin}};
}
function setOverride(db,id,patch){
 const item=byId(catalog(db),id);if(!item)throw new Invalid('Unknown item',404);
 const o={...db.data.overrides[id]};
 if('available' in patch){if(typeof patch.available!=='boolean')throw new Invalid('available must be true or false');
  if(patch.available)delete o.available;else o.available=false}
 if('price' in patch){if(patch.price===null)delete o.price;
  else{if(!isInt(patch.price,0,100000))throw new Invalid('price must be a whole number of kroner');
   if(patch.price===item.basePrice)delete o.price;else o.price=patch.price}}
 if(Object.keys(o).length)db.data.overrides[id]=o;else delete db.data.overrides[id];
 db.save();return byId(catalog(db),id);
}
function setSettings(db,patch){
 const s=db.data.settings,n={};
 if('open' in patch){if(typeof patch.open!=='boolean')throw new Invalid('open must be true or false');n.open=patch.open}
 if('pauseMessage' in patch){if(typeof patch.pauseMessage!=='string'||patch.pauseMessage.length>120)throw new Invalid('pauseMessage is too long');n.pauseMessage=patch.pauseMessage.trim()}
 for(const[k,max]of[['deliveryFee',1000],['etaMin',180],['pickupMin',180]])
  if(k in patch){if(!isInt(patch[k],0,max))throw new Invalid(`${k} must be a whole number between 0 and ${max}`);n[k]=patch[k]}
 Object.assign(s,n);db.save();return s;
}

// ---- orders ----
// Prices are always computed here; anything the client says about money is ignored.
function buildOrder(db,body,{demo=false,now=Date.now(),force=false}={}){
 if(!body||typeof body!=='object')throw new Invalid('Bad request');
 const s=db.data.settings;
 if(!s.open&&!force)throw new Invalid(s.pauseMessage||'The kitchen is not taking orders right now.',409);
 const cat=new Map(catalog(db).map(c=>[c.id,c]));
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
 const order={id:crypto.randomBytes(12).toString('hex'),number:'PP-'+(++db.data.seq),createdAt:now,status:'received',times:{received:now},
  mode,address,lines,extras,subtotal,fee,total:subtotal+fee,payment:{method}};
 if(demo)order.demo=true;
 return order;
}
function createOrder(db,body,opts){const o=buildOrder(db,body,opts);db.data.orders.push(o);db.save();return o}
const findOrder=(db,id)=>db.data.orders.find(o=>o.id===id);
function transition(db,id,action,now=Date.now()){
 const o=findOrder(db,id);if(!o)throw new Invalid('Order not found',404);
 const flow=FLOW[o.mode],i=flow.indexOf(o.status);
 if(action==='advance'){if(i<0||i>=flow.length-1)throw new Invalid('Order cannot be advanced',409);o.status=flow[i+1];o.times[o.status]=now}
 else if(action==='back'){if(i<=0||o.status==='done')throw new Invalid('Order cannot be moved back',409);delete o.times[o.status];o.status=flow[i-1]}
 else if(action==='cancel'){if(!ACTIVE.includes(o.status))throw new Invalid('Order is already closed',409);o.status='cancelled';o.times.cancelled=now}
 else throw new Invalid('Unknown action');
 db.save();return o;
}
// What a customer may see about their own order (the id is an unguessable token).
const publicOrder=o=>({id:o.id,number:o.number,status:o.status,mode:o.mode,createdAt:o.createdAt,times:o.times,total:o.total,
 lines:o.lines.map(l=>({name:l.name,qty:l.qty})),extras:o.extras.map(e=>({name:e.name,qty:e.qty})),now:Date.now()});

// ---- statistics ----
const dfmt=new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'});
function local(ts){const p={};for(const x of dfmt.formatToParts(ts))p[x.type]=x.value;return{day:`${p.year}-${p.month}-${p.day}`,hour:+p.hour}}
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
function stats(db,days,now=Date.now()){
 days=Math.min(Math.max(days|0,1),90);
 const dayKeys=[];for(let i=days-1;i>=0;i--)dayKeys.push(local(now-i*864e5).day);
 const prevKeys=new Set();for(let i=2*days-1;i>=days;i--)prevKeys.add(local(now-i*864e5).day);
 const inRange=new Set(dayKeys),cur=[],prev=[];
 const byDay=Object.fromEntries(dayKeys.map(d=>[d,{day:d,revenue:0,orders:0}]));
 const byHour=Array.from({length:24},(_,h)=>({hour:h,orders:0}));
 const items=new Map(),pay={vipps:0,card:0},mode={delivery:0,pickup:0};
 for(const o of db.data.orders){
  const l=local(o.createdAt);
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
  topPizzas:rank(i=>pizzaIds.has(i.id)),topExtras:rank(i=>!pizzaIds.has(i.id)),payment:pay,mode,
  active:db.data.orders.filter(o=>ACTIVE.includes(o.status)).length};
}
module.exports={M,TZ,FLOW,ACTIVE,TARGET_MIN,Invalid,catalog,publicMenu,setOverride,setSettings,buildOrder,createOrder,findOrder,transition,publicOrder,stats,local};
