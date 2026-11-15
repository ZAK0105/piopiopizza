'use strict';
// Demo data for the JSON store. Everything created here is flagged demo:true and can be removed again from Settings.
const crypto=require('crypto');
const L=require('./logic.js');
const C=require('../app/core.js');

function simulate(db){return L.createOrder(db,C.randomBody(L.M),{demo:true,force:true})}
function seed(db,days=21,now=Date.now()){
 const made=C.demoHistory(L.M,db.data.overrides,db.data.settings,L.TZ,days,now);
 for(const o of made)db.data.orders.push({id:crypto.randomBytes(12).toString('hex'),number:'PP-'+(++db.data.seq),...o});
 db.data.orders.sort((a,b)=>a.createdAt-b.createdAt);db.save();
 return made.length;
}
function clear(db){const n=db.data.orders.length;db.data.orders=db.data.orders.filter(o=>!o.demo);db.save();return n-db.data.orders.length}
module.exports={seed,simulate,clear};
