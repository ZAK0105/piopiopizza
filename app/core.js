// Pio Pio Pizza order rules — pure functions with no I/O, so the same code runs in the Node server,
// in the Base44 backend functions and in the admin dashboard.
(function(root){
/*BODY*/
const TARGET_MIN=20; // the "door in 20" promise
// Delivery orders wait at 'ready' until a driver picks them up; pickup orders wait there for the customer.
const FLOW={delivery:['received','oven','ready','out','done'],pickup:['received','oven','ready','done']};
const ACTIVE=['received','oven','out','ready'];
const DEFAULT_SETTINGS={open:true,pauseMessage:'',deliveryFee:49,etaMin:18,pickupMin:12,deliveryRadiusKm:5};
const SHOP={name:'Pio Pio Grünerløkka',address:'Thorvald Meyers gate 12',lat:59.92898,lng:10.75990};
const STAFF_ROLES=['driver','kitchen'];

class Invalid extends Error{constructor(msg,status=400){super(msg);this.status=status}}
const byId=(arr,id)=>arr.find(x=>x.id===id);
const isInt=(n,min,max)=>Number.isInteger(n)&&n>=min&&n<=max;
// A map position, or null when the input is not one.
const toPos=p=>p&&typeof p==='object'&&Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&Math.abs(p.lat)<=90&&Math.abs(p.lng)<=180
 ?{lat:Math.round(p.lat*1e5)/1e5,lng:Math.round(p.lng*1e5)/1e5}:null;
// Straight-line distance in km, close enough at city scale
const distKm=(a,b)=>{const r=Math.PI/180,x=(b.lng-a.lng)*r*Math.cos((a.lat+b.lat)/2*r),y=(b.lat-a.lat)*r;return Math.hypot(x,y)*6371};
// A Norwegian phone number as "+47 412 34 567", or null. Accepts spaces, +47 and 0047.
function normPhone(v){
 if(typeof v!=='string')return null;
 let d=v.replace(/[\s().-]/g,'');
 if(d.startsWith('+47'))d=d.slice(3);else if(d.startsWith('0047'))d=d.slice(4);
 if(!/^[2-9][0-9]{7}$/.test(d))return null;
 // mobiles (4/9) are written 412 34 567, landlines 22 33 44 55
 return /^[49]/.test(d)?`+47 ${d.slice(0,3)} ${d.slice(3,5)} ${d.slice(5)}`:`+47 ${d.slice(0,2)} ${d.slice(2,4)} ${d.slice(4,6)} ${d.slice(6)}`;
}

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
 return{items,settings:{open:s.open,pauseMessage:s.pauseMessage,deliveryFee:s.deliveryFee,etaMin:s.etaMin,pickupMin:s.pickupMin,deliveryRadiusKm:s.deliveryRadiusKm}};
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
 if('deliveryRadiusKm' in patch){const v=patch.deliveryRadiusKm;
  if(typeof v!=='number'||!(v>=.5&&v<=50))throw new Invalid('The delivery radius must be between 0.5 and 50 km');n.deliveryRadiusKm=Math.round(v*10)/10}
 return n;
}

// ---- orders ----
// Prices are always computed here; anything the client says about money is ignored.
// Returns the order without id/number — the caller's storage assigns those.
function priceOrder(M,overrides,settings,body,{demo=false,now=Date.now(),force=false}={}){
 if(!body||typeof body!=='object')throw new Invalid('Bad request');
 const s={...DEFAULT_SETTINGS,...settings};
 if(!s.open&&!force)throw new Invalid(s.pauseMessage||'Kjøkkenet tar ikke imot bestillinger akkurat nå.',409);
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
  const c=cat.get(p.id);if(!c.available&&!force)throw new Invalid(`${p.name} er utsolgt`,409);
  lines.push({id:p.id,name:p.name,size:z.id,tops,qty:l.qty,unit:c.price+z.add+tops.length*M.TOP_PRICE});count+=l.qty;
 }
 const ex=body.extras&&typeof body.extras==='object'&&!Array.isArray(body.extras)?body.extras:{};
 for(const[id,qty]of Object.entries(ex)){
  const e=byId(M.EXTRAS,id);if(!e)throw new Invalid('Unknown item');
  if(!isInt(qty,1,20))throw new Invalid('Bad quantity');
  const c=cat.get(id);if(!c.available&&!force)throw new Invalid(`${e.name} er utsolgt`,409);
  extras.push({id,name:e.name,qty,unit:c.price});count+=qty;
 }
 if(!count)throw new Invalid('Handlekurven er tom');
 if(count>60)throw new Invalid('Det var mye pizza — ring oss for store bestillinger');
 // who to contact; demo orders have no real person behind them
 const c=body.customer&&typeof body.customer==='object'?body.customer:{};
 const name=typeof c.name==='string'?c.name.trim().replace(/\s+/g,' ').slice(0,60):'';
 const phone=normPhone(c.phone);
 if(!demo){if(name.length<2)throw new Invalid('Skriv inn navnet ditt');if(!phone)throw new Invalid('Skriv inn et gyldig norsk mobilnummer')}
 const note=typeof body.note==='string'?body.note.trim().slice(0,200):'';
 let address='',dest=null;
 if(mode==='delivery'){address=typeof body.address==='string'?body.address.trim().slice(0,120):'';
  if(!address)throw new Invalid('Leveringsadresse mangler');
  dest=toPos(body.dest);if(!dest)throw new Invalid('Velg adressen fra listen, så vi vet hvor den er');
  const km=distKm(SHOP,dest);
  if(km>s.deliveryRadiusKm&&!force)throw new Invalid(`Adressen er ${km.toFixed(1).replace('.',',')} km unna — vi leverer innen ${String(s.deliveryRadiusKm).replace('.',',')} km`,422)}
 const method=body.payment?.method;if(method!=='vipps'&&method!=='card')throw new Invalid('payment.method must be vipps or card');
 const subtotal=lines.reduce((a,l)=>a+l.qty*l.unit,0)+extras.reduce((a,e)=>a+e.qty*e.unit,0);
 const fee=mode==='delivery'?s.deliveryFee:0;
 const order={createdAt:now,status:'received',times:{received:now},mode,address,lines,extras,subtotal,fee,total:subtotal+fee,payment:{method},
  customer:{name,phone:phone||''},note,dest,driver:null,pos:null};
 if(demo)order.demo=true;
 return order;
}
// What an order keeps about its driver, copied at assignment so old orders still show who delivered them.
const driverInfo=s=>({id:s.id,name:s.name,phone:s.phone||'',vehicle:s.vehicle||''});
// Changes an order; returns the changed fields or throws Invalid. Admin actions; staff go through staffAct.
// assign/unassign take the driver's staff record in opts.driver.
function transition(o,action,now=Date.now(),opts={}){
 const flow=FLOW[o.mode],i=flow.indexOf(o.status),times={...o.times};let status=o.status;
 if(action==='advance'){if(i<0||i>=flow.length-1)throw new Invalid('Order cannot be advanced',409);
  if(o.mode==='delivery'&&o.status==='ready'&&!o.driver)throw new Invalid('Assign a driver first',409);
  status=flow[i+1];times[status]=now}
 else if(action==='back'){if(i<=0||o.status==='done')throw new Invalid('Order cannot be moved back',409);delete times[o.status];status=flow[i-1]}
 else if(action==='cancel'){if(!ACTIVE.includes(o.status))throw new Invalid('Order is already closed',409);status='cancelled';times.cancelled=now}
 else if(action==='assign'||action==='unassign'){
  if(o.mode!=='delivery')throw new Invalid('Pickup orders have no driver',409);
  if(!['received','oven','ready'].includes(o.status))throw new Invalid('The driver can only change before the order leaves',409);
  if(action==='unassign')return{driver:null};
  const d=opts.driver;if(!d||d.role!=='driver'||d.active===false)throw new Invalid('Choose an active driver');
  return{driver:driverInfo(d)};
 }
 else throw new Invalid('Unknown action');
 return{status,times};
}
// What a customer may see about their own order: no address, and the driver's position only while they are on the way.
const publicOrder=(o,id)=>({id,number:o.number,status:o.status,mode:o.mode,createdAt:o.createdAt,times:o.times,total:o.total,
 lines:o.lines.map(l=>({name:l.name,qty:l.qty})),extras:o.extras.map(e=>({name:e.name,qty:e.qty})),
 dest:o.dest||null,shop:SHOP,
 driver:o.driver?{name:o.driver.name,phone:o.driver.phone,vehicle:o.driver.vehicle}:null,
 pos:o.status==='out'&&o.pos?o.pos:null,now:Date.now()});

// ---- staff ----
// Checks admin input for a staff member; returns the fields to store (a PIN comes back as `pin` for the caller to hash).
function patchStaff(patch,creating){
 const n={},str=(k,max,re)=>{if(k in patch){const v=typeof patch[k]==='string'?patch[k].trim():null;
  if(v===null||v.length>max||(v&&re&&!re.test(v)))throw new Invalid(`Check the ${k}`);n[k]=v}};
 str('name',40);str('phone',20,/^\+?[0-9 ]{4,19}$/);str('vehicle',40);str('email',120,/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
 if('email' in n)n.email=n.email.toLowerCase();
 if('role' in patch){if(!STAFF_ROLES.includes(patch.role))throw new Invalid('Role must be driver or kitchen');n.role=patch.role}
 if('active' in patch){if(typeof patch.active!=='boolean')throw new Invalid('active must be true or false');n.active=patch.active}
 if('pin' in patch&&patch.pin!==''){if(typeof patch.pin!=='string'||!/^[0-9]{4,6}$/.test(patch.pin))throw new Invalid('The PIN must be 4–6 digits');n.pin=patch.pin}
 if(creating&&(!n.name||!n.role))throw new Invalid('A name and a role are required');
 if('name' in n&&!n.name)throw new Invalid('A name is required');
 return n;
}
const staffView=s=>({id:s.id,name:s.name,role:s.role,phone:s.phone||'',vehicle:s.vehicle||'',email:s.email||'',active:s.active!==false,demo:!!s.demo,hasPin:!!s.pin_hash});
// What a staff member sees about an order.
const boardOrder=o=>({id:o.id,number:o.number,status:o.status,mode:o.mode,address:o.address,dest:o.dest||null,createdAt:o.createdAt,times:o.times,
 customer:o.customer||{name:'',phone:''},note:o.note||'',
 lines:o.lines.map(l=>({name:l.name,size:l.size,tops:l.tops,qty:l.qty})),extras:o.extras.map(e=>({name:e.name,qty:e.qty})),driver:o.driver||null,demo:!!o.demo});
// The orders a staff member works on: kitchen staff see every open order, drivers see deliveries that are theirs or still free.
function staffBoard(orders,me){
 let list=orders.filter(o=>ACTIVE.includes(o.status));
 if(me.role==='driver')list=list.filter(o=>o.mode==='delivery'&&(o.driver?o.driver.id===me.id:o.status!=='out'));
 return list.sort((a,b)=>a.createdAt-b.createdAt).map(boardOrder);
}
// What a staff member may do: kitchen staff bake and hand over pickups; drivers take, drive and deliver their own orders.
function staffAct(o,me,action,now=Date.now()){
 if(me.active===false)throw new Invalid('Your staff profile is switched off',403);
 const mine=o.driver&&o.driver.id===me.id;
 if(me.role==='kitchen'){
  if(action!=='advance')throw new Invalid('Unknown action');
  if(!(o.status==='received'||o.status==='oven'||(o.mode==='pickup'&&o.status==='ready')))throw new Invalid('This step is not for the kitchen',409);
  return transition(o,'advance',now);
 }
 if(o.mode!=='delivery')throw new Invalid('Pickup orders have no driver',409);
 if(action==='claim'){
  if(o.driver&&!mine)throw new Invalid(`${o.driver.name} already has this delivery`,409);
  return transition(o,'assign',now,{driver:me});
 }
 if(!mine)throw new Invalid('This delivery is not yours',403);
 if(action==='release')return transition(o,'unassign',now);
 if(action==='advance'){
  if(o.status!=='ready'&&o.status!=='out')throw new Invalid('Wait until the kitchen marks it ready',409);
  return transition(o,'advance',now);
 }
 throw new Invalid('Unknown action');
}
// A driver's position goes on every order they are out delivering. Returns [[order, change]].
function driverPosUpdates(orders,me,pos,now=Date.now()){
 const p=toPos(pos);if(!p)throw new Invalid('Bad position');
 if(me.role!=='driver')throw new Invalid('Only drivers share their position',403);
 return orders.filter(o=>o.status==='out'&&o.driver&&o.driver.id===me.id).map(o=>[o,{pos:{...p,at:now}}]);
}

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
 const items=new Map(),drivers=new Map(),pay={vipps:0,card:0},mode={delivery:0,pickup:0};let active=0;
 for(const o of orders){
  if(ACTIVE.includes(o.status))active++;
  const l=local(o.createdAt,tz);
  if(prevKeys.has(l.day)){prev.push(o);continue}
  if(!inRange.has(l.day))continue;
  cur.push(o);if(o.status==='cancelled')continue;
  byDay[l.day].revenue+=o.total;byDay[l.day].orders++;byHour[l.hour].orders++;
  pay[o.payment.method]+=o.total;mode[o.mode]++;
  if(o.driver&&o.status==='done'&&o.times.out&&o.times.done){const d=drivers.get(o.driver.id)||{id:o.driver.id,name:o.driver.name,deliveries:0,minutes:0};
   d.deliveries++;d.minutes+=(o.times.done-o.times.out)/60000;drivers.set(o.driver.id,d)}
  for(const x of[...o.lines,...o.extras]){const it=items.get(x.id)||{id:x.id,name:x.name,qty:0,revenue:0};it.qty+=x.qty;it.revenue+=x.qty*x.unit;items.set(x.id,it)}
 }
 const pizzaIds=new Set(M.PIZZAS.map(p=>p.id));
 const rank=f=>[...items.values()].filter(f).sort((a,b)=>b.qty-a.qty).slice(0,6);
 return{days,targetMin:TARGET_MIN,current:summarize(cur),previous:summarize(prev),byDay:dayKeys.map(d=>byDay[d]),byHour,
  topPizzas:rank(i=>pizzaIds.has(i.id)),topExtras:rank(i=>!pizzaIds.has(i.id)),payment:pay,mode,active,
  byDriver:[...drivers.values()].sort((a,b)=>b.deliveries-a.deliveries).map(d=>({id:d.id,name:d.name,deliveries:d.deliveries,avgMin:+(d.minutes/d.deliveries).toFixed(1)}))};
}

// ---- demo data ----
// Plausible random orders, so the dashboard can be explored before real orders exist. Always flagged demo:true.
const pick=a=>a[Math.floor(Math.random()*a.length)];
const weighted=pairs=>{let r=Math.random()*pairs.reduce((a,p)=>a+p[1],0);for(const[v,w]of pairs){if((r-=w)<=0)return v}return pairs[0][0]};
// Streets around the shop with a point on each, so demo deliveries can be drawn on the map
const STREETS=[['Thorvald Meyers gate',59.9241,10.7588],['Markveien',59.9236,10.7563],['Karl Johans gate',59.9130,10.7389],['Sofienberggata',59.9216,10.7655],
 ['Toftes gate',59.9257,10.7591],['Grüners gate',59.9233,10.7547],['Helgesens gate',59.9265,10.7631],['Sannergata',59.9290,10.7578],['Trondheimsveien',59.9195,10.7713],['Bogstadveien',59.9262,10.7268]];
// Sample team for exploring the staff features. No e-mail or phone, so nobody real is contacted.
const DEMO_STAFF=[{name:'Jonas Berg',role:'driver',vehicle:'Electric scooter · EL 4821',pin:'1111'},{name:'Amira Haddad',role:'driver',vehicle:'E-bike',pin:'2222'},
 {name:'Lars Moen',role:'driver',vehicle:'Car · EV 1290',pin:'3333'},{name:'Sofie Lund',role:'kitchen',pin:'4444'},{name:'Mateo Rossi',role:'kitchen',pin:'5555'}];
const PIZZA_W=[['margherita',22],['piopio',30],['pepperoni',26],['funghi',12],['diavola',16]];
// Opening hours 11–22 with a lunch bump and a dinner peak
const HOUR_W=[[11,3],[12,7],[13,6],[14,3],[15,3],[16,5],[17,9],[18,13],[19,12],[20,9],[21,5],[22,2]];
const FIRST=['Ingrid','Ola','Nora','Emil','Sara','Jakob','Leah','Filip','Maja','Henrik','Amina','Mohammed','Thea','Lukas','Ida','Ali'];
function randomBody(M){
 const st=pick(STREETS);
 const lines=[],n=weighted([[1,50],[2,32],[3,13],[4,5]]);
 for(let i=0;i<n;i++){
  const tops=[];if(Math.random()<.3){const t=[...M.TOPPINGS].sort(()=>Math.random()-.5);tops.push(...t.slice(0,weighted([[1,65],[2,25],[3,10]])).map(x=>x.id))}
  lines.push({id:weighted(PIZZA_W),size:weighted([['S',12],['M',58],['L',30]]),tops,qty:1});
 }
 const extras={};
 const add=(arr,p)=>{if(Math.random()<p){const e=pick(arr);extras[e.id]=(extras[e.id]||0)+1}};
 add(M.DRINKS,.62);add(M.DRINKS,.22);add(M.SIDES,.34);add(M.DIPS,.4);add(M.DESSERTS,.12);
 const mode=Math.random()<.74?'delivery':'pickup';
 return{lines,extras,mode,address:mode==='delivery'?`${st[0]} ${1+Math.floor(Math.random()*60)}`:'',
  dest:mode==='delivery'?{lat:st[1]+(Math.random()-.5)*.002,lng:st[2]+(Math.random()-.5)*.004}:null,
  customer:{name:pick(FIRST)+' '+String.fromCharCode(65+Math.floor(Math.random()*26))+'.'},note:Math.random()<.15?pick(['2. etasje','Ring på hos Hansen','Dørkode 1234','Bakgården']):'',
  payment:{method:Math.random()<.68?'vipps':'card'}};
}
// Returns `days` of finished and in-progress demo orders, oldest first (no id/number).
// drivers: staff records to hand the deliveries to.
function demoHistory(M,overrides,settings,tz,days=21,now=Date.now(),drivers=[]){
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
   // step durations in minutes: to oven, to ready, then to done (pickup) or waiting for a driver and driving (delivery)
   const dur=o.mode==='pickup'?[1+Math.random()*2.5,5+Math.random()*3,3+Math.random()*6*rush]
    :[1+Math.random()*2.5,5+Math.random()*3,.5+Math.random()*2.5*rush,5+Math.random()*7*rush];
   if(o.mode==='delivery'&&drivers.length)o.driver=driverInfo(pick(drivers));
   let t=ts;
   for(let k=0;k<dur.length;k++){t+=dur[k]*60000;if(t>now)break;o.status=flow[k+1];o.times[o.status]=Math.round(t)}
   if(o.mode==='delivery'&&o.status==='received')o.driver=null;
   if((now-ts)/60000>45&&Math.random()<.02){o.status='cancelled';o.times={received:ts,cancelled:ts+120000}}
   out.push(o);
  }
 }
 return out.sort((a,b)=>a.createdAt-b.createdAt);
}

// ---- storage records (Base44 entity rows) ----
const toRecord=o=>({number:o.number,status:o.status,mode:o.mode,address:o.address,lines:o.lines,extras:o.extras,subtotal:o.subtotal,fee:o.fee,
 customer_name:o.customer?.name||'',customer_phone:o.customer?.phone||'',note:o.note||'',
 total:o.total,payment_method:o.payment.method,times:o.times,placed_at:o.createdAt,demo:!!o.demo,dest:o.dest||null,driver:o.driver||null,pos:o.pos||null});
const fromRecord=r=>({id:r.id,number:r.number,status:r.status,mode:r.mode,address:r.address||'',lines:r.lines||[],extras:r.extras||[],
 subtotal:r.subtotal,fee:r.fee,total:r.total,payment:{method:r.payment_method},times:r.times||{},createdAt:r.placed_at,demo:!!r.demo,
 dest:r.dest||null,driver:r.driver||null,pos:r.pos||null,customer:{name:r.customer_name||'',phone:r.customer_phone||''},note:r.note||''});

const M={toRecord,fromRecord,TARGET_MIN,FLOW,ACTIVE,DEFAULT_SETTINGS,SHOP,STAFF_ROLES,DEMO_STAFF,Invalid,toPos,distKm,normPhone,catalog,publicMenu,patchOverride,patchSettings,
 priceOrder,transition,publicOrder,patchStaff,staffView,staffBoard,staffAct,driverPosUpdates,local,stats,statsSince,randomBody,demoHistory};
/*END*/
if(typeof module!=='undefined'&&module.exports)module.exports=M;else root.PP_CORE=M;
})(typeof globalThis!=='undefined'?globalThis:this);
