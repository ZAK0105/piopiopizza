'use strict';
// Tiny JSON-file store. One process owns the file; writes are debounced and atomic (tmp + rename).
const fs=require('fs');
const path=require('path');

const DEFAULTS=()=>({
 seq:1000,            // last order number issued
 orders:[],
 staff:[],           // {id,name,role,phone,vehicle,active,pin_hash,demo}
 overrides:{},        // itemId -> {price?:number, available?:boolean}
 settings:{open:true,pauseMessage:'',deliveryFee:49,etaMin:18,pickupMin:12}});

function open(dir){
 fs.mkdirSync(dir,{recursive:true});
 const file=path.join(dir,'db.json');
 let data=DEFAULTS();
 if(fs.existsSync(file)){
  const d=JSON.parse(fs.readFileSync(file,'utf8')); // a corrupt file should stop the server, not be silently replaced
  data={...data,...d,settings:{...data.settings,...d.settings}};
 }
 let timer=null;
 const flush=()=>{clearTimeout(timer);timer=null;const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(data));fs.renameSync(tmp,file)};
 const save=()=>{if(!timer)timer=setTimeout(flush,150)};
 return{data,save,flush,file};
}
module.exports={open};
