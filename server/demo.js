'use strict';
// Demo data for the JSON store. Everything created here is flagged demo:true and can be removed again from Settings.
const crypto=require('crypto');
const L=require('./logic.js');
const C=require('../app/core.js');

function simulate(db){return L.createOrder(db,C.randomBody(L.M),{demo:true,force:true})}
// The sample team, added once (sign in to the staff dashboard with their PINs: 1111–5555).
function seedStaff(db){
 if(db.data.staff.some(s=>s.demo))return;
 for(const s of C.DEMO_STAFF){try{L.addStaff(db,s,{demo:true})}catch(e){if(e.status!==409)throw e}} // a PIN already in use: skip that sample
}
function seed(db,days=21,now=Date.now()){
 seedStaff(db);
 const drivers=db.data.staff.filter(s=>s.role==='driver'&&s.active!==false);
 const made=C.demoHistory(L.M,db.data.overrides,db.data.settings,L.TZ,days,now,drivers);
 for(const o of made)db.data.orders.push({id:crypto.randomBytes(12).toString('hex'),number:'PP-'+(++db.data.seq),...o});
 db.data.orders.sort((a,b)=>a.createdAt-b.createdAt);db.save();
 return made.length;
}
function clear(db){const n=db.data.orders.length;db.data.orders=db.data.orders.filter(o=>!o.demo);db.data.staff=db.data.staff.filter(s=>!s.demo);db.save();return n-db.data.orders.length}
module.exports={seed,simulate,clear};
