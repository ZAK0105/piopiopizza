'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');const os=require('os');const path=require('path');
const {createApp}=require('../server/server.js');

let app,base,cookie='';
const call=async(method,url,body,auth=true)=>{
 const r=await fetch(base+url,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(auth&&cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});
 return{status:r.status,body:await r.json().catch(()=>null),headers:r.headers}};
const order=(over={})=>({mode:'delivery',address:'Markveien 35',dest:{lat:59.9236,lng:10.7563},customer:{name:'Kari Test',phone:'412 34 567'},payment:{method:'vipps'},
 lines:[{id:'piopio',size:'L',tops:['cheese','nduja'],qty:2}],extras:{'coke-15':1,garlic:2},...over});

test.before(async()=>{
 app=createApp({dataDir:fs.mkdtempSync(path.join(os.tmpdir(),'piopio-')),password:'test-password',ordersPerMinute:1000});
 await new Promise(r=>app.server.listen(0,r));base='http://127.0.0.1:'+app.server.address().port});
test.after(()=>app.close());

test('menu is public and lists prices',async()=>{
 const r=await call('GET','/api/menu');assert.equal(r.status,200);
 assert.equal(r.body.items.piopio.price,189);assert.equal(r.body.settings.open,true)});

test('order is priced on the server, ignoring client totals',async()=>{
 const r=await call('POST','/api/orders',{...order(),total:1,fee:0});
 assert.equal(r.status,201);
 // 2×(189+60+2×25)=598, cola 59, 2 dips 50, delivery 49
 assert.equal(r.body.total,598+59+50+49);assert.match(r.body.number,/^PP-\d+$/);assert.equal(r.body.status,'received');
 const again=await call('GET','/api/orders/'+r.body.id);assert.equal(again.body.number,r.body.number);
 assert.equal(again.body.address,undefined,'customer view carries no address')});

test('bad orders are rejected',async()=>{
 for(const bad of[order({lines:[],extras:{}}),order({lines:[{id:'nope',size:'M',tops:[],qty:1}]}),order({lines:[{id:'piopio',size:'M',tops:[],qty:-3}]}),
  order({lines:[{id:'piopio',size:'M',tops:['cheese','nduja','onion','honey'],qty:1}]}),order({address:''}),order({payment:{method:'cash'}}),order({extras:{'coke-15':999}})])
  assert.equal((await call('POST','/api/orders',bad)).status,400);
 assert.equal((await call('GET','/api/orders/'+'0'.repeat(24))).status,404)});

test('admin routes need a session',async()=>{
 assert.equal((await call('GET','/api/admin/orders')).status,401);
 assert.equal((await call('POST','/api/admin/login',{password:'wrong'})).status,401);
 const r=await call('POST','/api/admin/login',{password:'test-password'});assert.equal(r.status,200);
 const set=r.headers.get('set-cookie');assert.match(set,/HttpOnly/);assert.match(set,/SameSite=Strict/);cookie=set.split(';')[0];
 assert.equal((await call('GET','/api/admin/me')).status,200)});

test('cross-site writes are blocked',async()=>{
 const r=await fetch(base+'/api/admin/settings',{method:'PATCH',headers:{'Content-Type':'application/json',Cookie:cookie,Origin:'https://evil.example'},body:'{"open":false}'});
 assert.equal(r.status,403)});

test('kitchen flow: advance through every step, then no further',async()=>{
 const o=(await call('POST','/api/orders',order({mode:'pickup',address:''}))).body;
 const list=(await call('GET','/api/admin/orders?filter=active')).body.orders;assert.ok(list.find(x=>x.id===o.id));
 for(const s of['oven','ready','done'])assert.equal((await call('PATCH','/api/admin/orders/'+o.id,{action:'advance'})).body.status,s);
 assert.equal((await call('PATCH','/api/admin/orders/'+o.id,{action:'advance'})).status,409);
 assert.equal((await call('PATCH','/api/admin/orders/'+o.id,{action:'cancel'})).status,409);
 assert.equal((await call('GET','/api/orders/'+o.id)).body.status,'done')});

test('sold-out items and price changes apply to new orders',async()=>{
 await call('PATCH','/api/admin/catalog/piopio',{available:false});
 const r=await call('POST','/api/orders',order());assert.equal(r.status,409);assert.match(r.body.error,/utsolgt/);
 await call('PATCH','/api/admin/catalog/piopio',{available:true,price:200});
 assert.equal((await call('GET','/api/menu')).body.items.piopio.price,200);
 assert.equal((await call('POST','/api/orders',order())).body.total,620+59+50+49);
 await call('PATCH','/api/admin/catalog/piopio',{price:null});
 assert.equal((await call('GET','/api/menu')).body.items.piopio.price,189);
 assert.equal((await call('PATCH','/api/admin/catalog/piopio',{price:-5})).status,400)});

test('pausing the kitchen stops orders',async()=>{
 await call('PATCH','/api/admin/settings',{open:false,pauseMessage:'Back at 17:00'});
 const r=await call('POST','/api/orders',order());assert.equal(r.status,409);assert.equal(r.body.error,'Back at 17:00');
 await call('PATCH','/api/admin/settings',{open:true,deliveryFee:59});
 assert.equal((await call('POST','/api/orders',order())).body.total,598+59+50+59);
 await call('PATCH','/api/admin/settings',{deliveryFee:49})});

test('stats add up and demo data can be loaded and cleared',async()=>{
 const before=(await call('GET','/api/admin/stats?days=1')).body;
 assert.equal(before.current.revenue,before.byDay.reduce((a,d)=>a+d.revenue,0));
 assert.equal(before.payment.vipps+before.payment.card,before.current.revenue);
 const seeded=(await call('POST','/api/admin/demo',{action:'seed'})).body.created;assert.ok(seeded>300);
 const s=(await call('GET','/api/admin/stats?days=14')).body;
 assert.equal(s.byDay.length,14);assert.ok(s.current.orders>200);assert.ok(s.current.onTimePct>40&&s.current.onTimePct<100);
 assert.equal(s.byHour.reduce((a,h)=>a+h.orders,0),s.current.orders);
 assert.equal((await call('POST','/api/admin/demo',{action:'clear'})).body.removed,seeded);
 assert.equal((await call('GET','/api/admin/stats?days=1')).body.current.orders,before.current.orders)});

test('static files: app, admin, and no path traversal',async()=>{
 assert.equal((await fetch(base+'/')).status,200);assert.equal((await fetch(base+'/menu.js')).status,200);
 assert.equal((await fetch(base+'/admin/')).status,200);
 for(const p of['/../server/server.js','/%2e%2e/package.json','/admin/..%2f..%2fpackage.json','/data/db.json'])
  assert.notEqual((await fetch(base+p)).status,200,p)});

// ---- staff ----
let staffCookie='';
const staffCall=async(op,body={},ck=staffCookie)=>{
 const r=await fetch(base+'/api/staff/'+op,{method:'POST',headers:{'Content-Type':'application/json',...(ck?{Cookie:ck}:{})},body:JSON.stringify(body)});
 return{status:r.status,body:await r.json().catch(()=>null),headers:r.headers}};

test('admin manages staff; PINs are never sent back',async()=>{
 assert.equal((await call('POST','/api/admin/staff',{name:'',role:'driver',pin:'1234'})).status,400);
 assert.equal((await call('POST','/api/admin/staff',{name:'Kari',role:'chef',pin:'1234'})).status,400);
 assert.equal((await call('POST','/api/admin/staff',{name:'Kari',role:'driver',pin:'12'})).status,400);
 const r=await call('POST','/api/admin/staff',{name:'Kari Nord',role:'driver',phone:'+47 400 00 000',vehicle:'Scooter',pin:'4321'});
 assert.equal(r.status,201);assert.equal(r.body.hasPin,true);assert.equal(r.body.pin,undefined);assert.equal(r.body.pin_hash,undefined);
 assert.equal((await call('POST','/api/admin/staff',{name:'Per',role:'kitchen',pin:'4321'})).status,409,'PIN must be unique');
 const k=await call('POST','/api/admin/staff',{name:'Per Kokk',role:'kitchen',pin:'8765'});assert.equal(k.status,201);
 const list=(await call('GET','/api/admin/staff')).body;assert.equal(list.length,2);assert.ok(list.every(x=>!('pin_hash' in x)));
});

test('driver flow: claim, pick up, share position, deliver — and the customer sees it',async()=>{
 assert.equal((await staffCall('login',{pin:'0000'},'')).status,401);
 const login=await staffCall('login',{pin:'4321'},'');assert.equal(login.status,200);
 staffCookie=login.headers.get('set-cookie').split(';')[0];
 const me=(await staffCall('me')).body.me;assert.equal(me.role,'driver');
 const placed=(await call('POST','/api/orders',order({dest:{lat:59.93,lng:10.76},note:'Ring på hos Test'}),false)).body;
 assert.deepEqual((await call('GET','/api/orders/'+placed.id,null,false)).body.dest,{lat:59.93,lng:10.76});
 let board=(await staffCall('board')).body.orders;const o=board.find(x=>x.number===placed.number);
 assert.ok(o,'free delivery is on the driver board');assert.equal(o.address,'Markveien 35');
 assert.deepEqual(o.customer,{name:'Kari Test',phone:'+47 412 34 567'});assert.equal(o.note,'Ring på hos Test');
 assert.equal((await staffCall('act',{id:o.id,action:'advance'})).status,403,'cannot leave before claiming');
 assert.equal((await staffCall('act',{id:o.id,action:'claim'})).status,200);
 let pub=(await call('GET','/api/orders/'+placed.id,null,false)).body;assert.equal(pub.driver.name,'Kari Nord');assert.equal(pub.pos,null);
 assert.equal((await staffCall('act',{id:o.id,action:'advance'})).status,409,'not ready yet');
 // the kitchen bakes it
 const kc=(await staffCall('login',{pin:'8765'},'')).headers.get('set-cookie').split(';')[0];
 assert.ok((await staffCall('board',{},kc)).body.orders.some(x=>x.id===o.id));
 assert.equal((await staffCall('act',{id:o.id,action:'claim'},kc)).status,400);
 for(const st of['oven','ready'])assert.equal((await staffCall('act',{id:o.id,action:'advance'},kc)).body.status,st);
 assert.equal((await staffCall('act',{id:o.id,action:'advance'},kc)).status,409,'kitchen does not send deliveries out');
 assert.equal((await staffCall('act',{id:o.id,action:'advance'})).body.status,'out');
 assert.equal((await staffCall('location',{lat:59.925,lng:10.758})).body.updated,1);
 assert.equal((await staffCall('location',{lat:'x',lng:10})).status,400);
 pub=(await call('GET','/api/orders/'+placed.id,null,false)).body;
 assert.equal(pub.status,'out');assert.equal(pub.pos.lat,59.925);assert.equal(pub.address,undefined);
 assert.equal((await staffCall('act',{id:o.id,action:'advance'})).body.status,'done');
 pub=(await call('GET','/api/orders/'+placed.id,null,false)).body;assert.equal(pub.pos,null,'position hidden after delivery');
 const s=(await call('GET','/api/admin/stats?days=1')).body;assert.ok(s.byDriver.some(d=>d.name==='Kari Nord'&&d.deliveries>=1));
});

test('drivers cannot touch other drivers\' orders; admin assigns and needs a driver to send out',async()=>{
 const staff=(await call('GET','/api/admin/staff')).body,kari=staff.find(x=>x.name==='Kari Nord');
 const other=(await call('POST','/api/admin/staff',{name:'Ola Bud',role:'driver',pin:'2468'})).body;
 const placed=(await call('POST','/api/orders',order(),false)).body;
 const id=(await call('GET','/api/admin/orders?filter=active')).body.orders.find(x=>x.number===placed.number).id;
 for(let i=0;i<2;i++)await call('PATCH','/api/admin/orders/'+id,{action:'advance'});
 assert.equal((await call('PATCH','/api/admin/orders/'+id,{action:'advance'})).status,409,'no driver yet');
 assert.equal((await call('PATCH','/api/admin/orders/'+id,{action:'assign',driverId:other.id})).body.driver.name,'Ola Bud');
 assert.ok(!(await staffCall('board')).body.orders.some(x=>x.id===id),'hidden from other drivers');
 assert.equal((await staffCall('act',{id,action:'claim'})).status,409);
 assert.equal((await staffCall('act',{id,action:'advance'})).status,403);
 // an admin can act as a staff member
 assert.equal((await fetch(base+'/api/staff/act',{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({id,action:'advance',as:other.id})}).then(r=>r.json())).status,'out');
 assert.equal((await call('PATCH','/api/admin/orders/'+id,{action:'unassign'})).status,409,'too late to change driver');
 // switching a driver off ends their access
 await call('PATCH','/api/admin/staff/'+kari.id,{active:false});
 assert.equal((await staffCall('board')).status,401);
 await call('PATCH','/api/admin/staff/'+kari.id,{active:true});
 assert.equal((await call('DELETE','/api/admin/staff/'+other.id)).status,200);
});

test('demo data brings a sample team and assigns drivers',async()=>{
 const n=(await call('POST','/api/admin/demo',{action:'seed'})).body.created;assert.ok(n>300);
 const staff=(await call('GET','/api/admin/staff')).body;assert.equal(staff.filter(x=>x.demo).length,5);
 assert.equal((await staffCall('login',{pin:'1111'},'')).status,200);
 const s=(await call('GET','/api/admin/stats?days=7')).body;assert.equal(s.byDriver.filter(d=>/Jonas|Amira|Lars/.test(d.name)).length,3);
 await call('POST','/api/admin/demo',{action:'clear'});
 assert.equal((await call('GET','/api/admin/staff')).body.filter(x=>x.demo).length,0);
});

test('customers give a name, a Norwegian phone number and an address inside the delivery area',async()=>{
 const bad=async(o,re)=>{const r=await call('POST','/api/orders',o,false);assert.ok(r.status>=400,JSON.stringify(o));if(re)assert.match(r.body.error,re);return r};
 await bad(order({customer:{name:'',phone:'41234567'}}),/navn/);
 await bad(order({customer:{name:'Kari',phone:'1234'}}),/mobilnummer/);
 await bad(order({customer:{name:'Kari',phone:'+46 70 123 45 67'}}),/mobilnummer/);
 await bad(order({dest:null}),/listen/);
 const far=await bad(order({address:'Karl Johans gate 1, Drammen',dest:{lat:59.744,lng:10.204}}),/km unna/);assert.equal(far.status,422);
 // pickup needs no address, but still a name and number
 assert.equal((await call('POST','/api/orders',order({mode:'pickup',address:'',dest:null}),false)).status,201);
 await bad(order({mode:'pickup',address:'',dest:null,customer:{}}),/navn/);
 // the number is stored tidily and stays out of the customer view
 const r=await call('POST','/api/orders',order({customer:{name:'  Kari   Test ',phone:'0047 41234567'}}),false);assert.equal(r.status,201);
 assert.equal(JSON.stringify(r.body).includes('412'),false,'no phone in the public order');
 const a=(await call('GET','/api/admin/orders?filter=active')).body.orders.find(x=>x.number===r.body.number);
 assert.deepEqual(a.customer,{name:'Kari Test',phone:'+47 412 34 567'});
 // a wider radius lets the far address in; every delivery pays the fee
 await call('PATCH','/api/admin/settings',{deliveryRadiusKm:40});
 assert.equal((await call('GET','/api/menu')).body.settings.deliveryRadiusKm,40);
 const ok=await call('POST','/api/orders',order({address:'Drammen',dest:{lat:59.744,lng:10.204},lines:[],extras:{'coke-05':1}}),false);
 assert.equal(ok.status,201);assert.equal(ok.body.total,39+49);
 assert.equal((await call('PATCH','/api/admin/settings',{deliveryRadiusKm:0})).status,400);
 await call('PATCH','/api/admin/settings',{deliveryRadiusKm:5});
});
