'use strict';
// Demo data: plausible random orders, so the dashboard can be explored before real orders exist.
// Everything created here is flagged demo:true and can be removed again from Settings.
const L=require('./logic.js');
const {M}=L;

const pick=a=>a[Math.floor(Math.random()*a.length)];
const weighted=pairs=>{let r=Math.random()*pairs.reduce((a,p)=>a+p[1],0);for(const[v,w]of pairs){if((r-=w)<=0)return v}return pairs[0][0]};
const STREETS=['Thorvald Meyers gate','Markveien','Karl Johans gate','Sofienberggata','Toftes gate','Grüners gate','Helgesens gate','Sannergata','Trondheimsveien','Bogstadveien'];
const PIZZA_W=[['margherita',22],['piopio',30],['pepperoni',26],['funghi',12],['diavola',16]];
// Opening hours 11–22 with a lunch bump and a dinner peak
const HOUR_W=[[11,3],[12,7],[13,6],[14,3],[15,3],[16,5],[17,9],[18,13],[19,12],[20,9],[21,5],[22,2]];

function randomBody(){
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
function simulate(db){return L.createOrder(db,randomBody(),{demo:true,force:true})}

function seed(db,days=21,now=Date.now()){
 const made=[];
 for(let d=days-1;d>=0;d--){
  const dayStart=now-d*864e5,wd=new Date(dayStart).getDay();
  const count=Math.round((wd===5||wd===6?70:wd===0?50:40)*(.8+Math.random()*.4)*(1+(days-d)/days*.25)); // slight growth
  const stamps=[];
  for(let i=0;i<count;i++){
   const {day}=L.local(dayStart),h=weighted(HOUR_W);
   // find the UTC instant for this local day+hour by correcting a first guess
   let ts=Date.parse(`${day}T${String(h).padStart(2,'0')}:00:00Z`);ts-=(L.local(ts).hour-h)*36e5;
   ts+=Math.floor(Math.random()*36e5);
   if(ts<now)stamps.push(ts);
  }
  for(const ts of stamps.sort((a,b)=>a-b)){
   const o=L.buildOrder(db,randomBody(),{demo:true,force:true,now:ts});
   const flow=L.FLOW[o.mode],age=(now-ts)/60000;
   // step durations in minutes: to oven, to out/ready, to done
   const rush=L.local(ts).hour>=18&&L.local(ts).hour<=19?1.18:1;
   const dur=[1+Math.random()*2.5,5+Math.random()*3,(o.mode==='pickup'?3:6)+Math.random()*(o.mode==='pickup'?6:8)*rush];
   let t=ts;
   for(let i=0;i<3;i++){t+=dur[i]*60000;if(t>now)break;o.status=flow[i+1];o.times[o.status]=Math.round(t)}
   if(age>45&&Math.random()<.02){o.status='cancelled';o.times={received:ts,cancelled:ts+120000}}
   db.data.orders.push(o);made.push(o);
  }
 }
 db.data.orders.sort((a,b)=>a.createdAt-b.createdAt);db.save();
 return made.length;
}
function clear(db){const n=db.data.orders.length;db.data.orders=db.data.orders.filter(o=>!o.demo);db.save();return n-db.data.orders.length}
module.exports={seed,simulate,clear,randomBody};
