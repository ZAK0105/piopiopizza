'use strict';
// Order rules bound to the JSON store. The rules themselves live in app/core.js.
const crypto=require('crypto');
const M=require('../app/menu.js');
const C=require('../app/core.js');
const {Invalid,FLOW,ACTIVE,TARGET_MIN}=C;

const TZ=process.env.STORE_TZ||'Europe/Oslo';

const catalog=db=>C.catalog(M,db.data.overrides);
const publicMenu=db=>C.publicMenu(M,db.data.overrides,db.data.settings);
function setOverride(db,id,patch){
 const item=catalog(db).find(c=>c.id===id);if(!item)throw new Invalid('Unknown item',404);
 const o=C.patchOverride(item,db.data.overrides[id],patch);
 if(Object.keys(o).length)db.data.overrides[id]=o;else delete db.data.overrides[id];
 db.save();return catalog(db).find(c=>c.id===id);
}
function setSettings(db,patch){Object.assign(db.data.settings,C.patchSettings(patch));db.save();return db.data.settings}

function buildOrder(db,body,opts){
 const o=C.priceOrder(M,db.data.overrides,db.data.settings,body,opts);
 return{id:crypto.randomBytes(12).toString('hex'),number:'PP-'+(++db.data.seq),...o}; // the id doubles as the customer's unguessable tracking token
}
// ---- staff ----
// Staff sign in to the staff dashboard with a PIN; only its hash is stored.
const pinHash=(id,pin)=>crypto.createHash('sha256').update(id+':'+pin).digest('hex');
const findStaff=(db,id)=>db.data.staff.find(s=>s.id===id);
function staffByPin(db,pin){
 if(typeof pin!=='string'||!/^[0-9]{4,6}$/.test(pin))return null;
 return db.data.staff.find(s=>s.active!==false&&s.pin_hash&&s.pin_hash===pinHash(s.id,pin))||null;
}
function pinTaken(db,pin,exceptId){return db.data.staff.some(s=>s.id!==exceptId&&s.pin_hash===pinHash(s.id,pin))}
function addStaff(db,body,{demo=false}={}){
 const n=C.patchStaff(body,true);
 if(!n.pin)throw new Invalid('Choose a PIN for signing in to the staff dashboard');
 const s={id:crypto.randomBytes(8).toString('hex'),active:true,...n};
 if(pinTaken(db,n.pin))throw new Invalid('Another staff member already uses that PIN',409);
 s.pin_hash=pinHash(s.id,n.pin);delete s.pin;if(demo)s.demo=true;
 db.data.staff.push(s);db.save();return s;
}
function updateStaff(db,id,body){
 const s=findStaff(db,id);if(!s)throw new Invalid('Staff member not found',404);
 const n=C.patchStaff(body,false);
 if(n.pin){if(pinTaken(db,n.pin,id))throw new Invalid('Another staff member already uses that PIN',409);s.pin_hash=pinHash(id,n.pin);delete n.pin}
 Object.assign(s,n);db.save();return s;
}
function removeStaff(db,id){const i=db.data.staff.findIndex(s=>s.id===id);if(i<0)throw new Invalid('Staff member not found',404);db.data.staff.splice(i,1);db.save()}

function createOrder(db,body,opts){const o=buildOrder(db,body,opts);db.data.orders.push(o);db.save();return o}
const findOrder=(db,id)=>db.data.orders.find(o=>o.id===id);
function transition(db,id,action,now,driverId){
 const o=findOrder(db,id);if(!o)throw new Invalid('Order not found',404);
 const driver=driverId?findStaff(db,driverId):undefined;
 if(driverId&&!driver)throw new Invalid('Staff member not found',404);
 Object.assign(o,C.transition(o,action,now,{driver}));db.save();return o;
}
function staffAct(db,me,id,action,now){
 const o=findOrder(db,id);if(!o)throw new Invalid('Order not found',404);
 Object.assign(o,C.staffAct(o,me,action,now));db.save();return o;
}
function driverPos(db,me,pos,now){
 const ups=C.driverPosUpdates(db.data.orders,me,pos,now);
 for(const[o,ch]of ups)Object.assign(o,ch);
 if(ups.length)db.save();return ups.map(([o])=>o);
}
const publicOrder=o=>C.publicOrder(o,o.id);
const stats=(db,days,now)=>C.stats(M,db.data.orders,days,TZ,now);
const local=ts=>C.local(ts,TZ);
module.exports={M,C,TZ,FLOW,ACTIVE,TARGET_MIN,Invalid,catalog,publicMenu,setOverride,setSettings,buildOrder,createOrder,findOrder,transition,publicOrder,stats,local,
 findStaff,staffByPin,addStaff,updateStaff,removeStaff,staffAct,driverPos};
