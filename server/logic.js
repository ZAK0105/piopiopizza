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
function createOrder(db,body,opts){const o=buildOrder(db,body,opts);db.data.orders.push(o);db.save();return o}
const findOrder=(db,id)=>db.data.orders.find(o=>o.id===id);
function transition(db,id,action,now){
 const o=findOrder(db,id);if(!o)throw new Invalid('Order not found',404);
 Object.assign(o,C.transition(o,action,now));db.save();return o;
}
const publicOrder=o=>C.publicOrder(o,o.id);
const stats=(db,days,now)=>C.stats(M,db.data.orders,days,TZ,now);
const local=ts=>C.local(ts,TZ);
module.exports={M,TZ,FLOW,ACTIVE,TARGET_MIN,Invalid,catalog,publicMenu,setOverride,setSettings,buildOrder,createOrder,findOrder,transition,publicOrder,stats,local};
