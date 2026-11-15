'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');const os=require('os');const path=require('path');
const {createApp}=require('../server/server.js');

let app,base,cookie='';
const call=async(method,url,body,auth=true)=>{
 const r=await fetch(base+url,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(auth&&cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});
 return{status:r.status,body:await r.json().catch(()=>null),headers:r.headers}};
const order=(over={})=>({mode:'delivery',address:'Markveien 35',payment:{method:'vipps'},
 lines:[{id:'piopio',size:'L',tops:['cheese','nduja'],qty:2}],extras:{'coke-15':1,garlic:2},...over});

test.before(async()=>{
 app=createApp({dataDir:fs.mkdtempSync(path.join(os.tmpdir(),'piopio-')),password:'test-password'});
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
 const r=await call('POST','/api/orders',order());assert.equal(r.status,409);assert.match(r.body.error,/sold out/);
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
