'use strict';
// Pio Pio Pizza server: customer app at /, admin dashboard at /admin/, JSON API under /api.
// No dependencies — `node server/server.js`.
const http=require('http');
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const L=require('./logic.js');
const demo=require('./demo.js');
const {Invalid}=L;

const ROOT=path.join(__dirname,'..');
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8',
 '.png':'image/png','.svg':'image/svg+xml','.json':'application/json','.ico':'image/x-icon','.webmanifest':'application/manifest+json'};

function createApp({dataDir=process.env.DATA_DIR||path.join(ROOT,'data'),password=process.env.ADMIN_PASSWORD}={}){
 const db=require('./db.js').open(dataDir);
 const generated=!password;if(generated)password=crypto.randomBytes(9).toString('base64url');
 const sessions=new Map(); // token -> expiry
 const streams=new Set();  // open admin SSE responses
 const hits=new Map();     // rate limiting: key -> [timestamps]

 const sha=s=>crypto.createHash('sha256').update(String(s)).digest();
 const passwordOk=p=>crypto.timingSafeEqual(sha(p),sha(password));
 const limited=(key,max,windowMs)=>{const now=Date.now(),a=(hits.get(key)||[]).filter(t=>now-t<windowMs);a.push(now);hits.set(key,a);return a.length>max};
 const sweep=setInterval(()=>{const now=Date.now();for(const[k,a]of hits)if(!a.some(t=>now-t<600000))hits.delete(k);
  for(const[t,exp]of sessions)if(exp<now)sessions.delete(t)},60000);sweep.unref();
 const broadcast=(event,data)=>{const msg=`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;for(const r of streams)r.write(msg)};

 const send=(res,status,body,headers={})=>{const s=JSON.stringify(body);
  res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store',...headers});res.end(s)};
 const readJson=req=>new Promise((ok,fail)=>{
  if(!/^application\/json/.test(req.headers['content-type']||''))return fail(new Invalid('Content-Type must be application/json',415));
  let size=0;const chunks=[];
  req.on('data',c=>{size+=c.length;if(size>20000){fail(new Invalid('Request too large',413));req.destroy()}else chunks.push(c)});
  req.on('end',()=>{try{ok(JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}'))}catch(e){fail(new Invalid('Invalid JSON'))}});
  req.on('error',fail)});
 const cookie=(req,name)=>(req.headers.cookie||'').split(';').map(c=>c.trim().split('=')).find(c=>c[0]===name)?.[1];
 const authed=req=>{const t=cookie(req,'pp_admin'),exp=t&&sessions.get(t);return!!exp&&exp>Date.now()};
 // Browsers send Origin on cross-site writes; reject any that is not this site.
 const sameOrigin=req=>{const o=req.headers.origin;if(!o)return true;try{return new URL(o).host===req.headers.host}catch(e){return false}};
 const ip=req=>req.socket.remoteAddress||'?';

 function serveStatic(req,res,url){
  let rel=decodeURIComponent(url.pathname);
  if(rel==='/admin')return res.writeHead(302,{Location:'/admin/'}).end();
  const base=rel.startsWith('/admin/')?'admin':'app';
  rel=base==='admin'?rel.slice(7):rel.slice(1);
  if(!rel||rel.endsWith('/'))rel+='index.html';
  const dir=path.join(ROOT,base),file=path.normalize(path.join(dir,rel));
  if(!file.startsWith(dir+path.sep))return send(res,403,{error:'Forbidden'});
  fs.readFile(file,(err,buf)=>{
   if(err)return send(res,404,{error:'Not found'});
   res.writeHead(200,{'Content-Type':MIME[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache',
    'X-Content-Type-Options':'nosniff','X-Frame-Options':'SAMEORIGIN','Referrer-Policy':'same-origin'});
   res.end(req.method==='HEAD'?undefined:buf)});
 }

 async function api(req,res,url){
  const p=url.pathname,m=req.method;let x;
  if(m!=='GET'&&m!=='HEAD'&&!sameOrigin(req))throw new Invalid('Cross-site request blocked',403);

  // ---- public ----
  if(p==='/api/menu'&&m==='GET')return send(res,200,L.publicMenu(db));
  if(p==='/api/orders'&&m==='POST'){
   if(limited('order:'+ip(req),20,60000))throw new Invalid('Too many orders — try again in a minute',429);
   const o=L.createOrder(db,await readJson(req));broadcast('order',{type:'new',order:o});
   return send(res,201,L.publicOrder(o))}
  if((x=/^\/api\/orders\/([0-9a-f]{24})$/.exec(p))&&m==='GET'){
   const o=L.findOrder(db,x[1]);if(!o)throw new Invalid('Order not found',404);return send(res,200,L.publicOrder(o))}

  // ---- admin session ----
  if(p==='/api/admin/login'&&m==='POST'){
   if(limited('login:'+ip(req),8,300000))throw new Invalid('Too many attempts — wait a few minutes',429);
   const b=await readJson(req);if(typeof b.password!=='string'||!passwordOk(b.password))throw new Invalid('Wrong password',401);
   const t=crypto.randomBytes(32).toString('hex');sessions.set(t,Date.now()+12*36e5);
   const secure=req.headers['x-forwarded-proto']==='https'?'; Secure':'';
   return send(res,200,{ok:true},{'Set-Cookie':`pp_admin=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${secure}`})}
  if(p==='/api/admin/logout'&&m==='POST'){sessions.delete(cookie(req,'pp_admin'));
   return send(res,200,{ok:true},{'Set-Cookie':'pp_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'})}
  if(!p.startsWith('/api/admin/'))throw new Invalid('Not found',404);
  if(!authed(req))throw new Invalid('Sign in required',401);

  // ---- admin ----
  if(p==='/api/admin/me'&&m==='GET')return send(res,200,{ok:true,tz:L.TZ,targetMin:L.TARGET_MIN});
  if(p==='/api/admin/stream'&&m==='GET'){
   res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store','Connection':'keep-alive','X-Accel-Buffering':'no'});
   res.write('retry: 3000\n\n');streams.add(res);
   const beat=setInterval(()=>res.write(': ping\n\n'),25000);
   req.on('close',()=>{clearInterval(beat);streams.delete(res)});return}
  if(p==='/api/admin/orders'&&m==='GET'){
   const f=url.searchParams.get('filter')||'active',q=(url.searchParams.get('q')||'').toLowerCase().slice(0,40);
   const limit=Math.min(+url.searchParams.get('limit')||200,500);
   let list=db.data.orders;
   if(f==='active')list=list.filter(o=>L.ACTIVE.includes(o.status));
   else if(f==='done'||f==='cancelled')list=list.filter(o=>o.status===f);
   if(q)list=list.filter(o=>o.number.toLowerCase().includes(q)||o.address.toLowerCase().includes(q));
   return send(res,200,{total:list.length,orders:list.slice(-limit).reverse()})}
  if((x=/^\/api\/admin\/orders\/([0-9a-f]{24})$/.exec(p))&&m==='PATCH'){
   const o=L.transition(db,x[1],(await readJson(req)).action);broadcast('order',{type:'update',order:o});return send(res,200,o)}
  if(p==='/api/admin/stats'&&m==='GET')return send(res,200,L.stats(db,+url.searchParams.get('days')||7));
  if(p==='/api/admin/catalog'&&m==='GET')return send(res,200,L.catalog(db));
  if((x=/^\/api\/admin\/catalog\/([\w-]{1,40})$/.exec(p))&&m==='PATCH'){
   const item=L.setOverride(db,x[1],await readJson(req));broadcast('catalog',item);return send(res,200,item)}
  if(p==='/api/admin/settings'&&m==='GET')return send(res,200,db.data.settings);
  if(p==='/api/admin/settings'&&m==='PATCH'){const s=L.setSettings(db,await readJson(req));broadcast('settings',s);return send(res,200,s)}
  if(p==='/api/admin/demo'&&m==='POST'){
   const a=(await readJson(req)).action;
   if(a==='order'){const o=demo.simulate(db);broadcast('order',{type:'new',order:o});return send(res,201,o)}
   if(a==='seed'){const n=demo.seed(db);broadcast('reload',{});return send(res,200,{created:n})}
   if(a==='clear'){const n=demo.clear(db);broadcast('reload',{});return send(res,200,{removed:n})}
   throw new Invalid('Unknown action')}
  throw new Invalid('Not found',404);
 }

 const server=http.createServer((req,res)=>{
  let url;try{url=new URL(req.url,'http://x')}catch(e){return send(res,400,{error:'Bad URL'})}
  if(url.pathname.startsWith('/api/'))
   return api(req,res,url).catch(e=>{
    if(!(e instanceof Invalid))console.error(e);
    if(!res.headersSent)send(res,e instanceof Invalid?e.status:500,{error:e instanceof Invalid?e.message:'Server error'})});
  if(req.method!=='GET'&&req.method!=='HEAD')return send(res,405,{error:'Method not allowed'});
  try{serveStatic(req,res,url)}catch(e){send(res,400,{error:'Bad path'})}
 });
 const close=()=>new Promise(r=>{clearInterval(sweep);for(const s of streams)s.end();db.flush();server.close(r);server.closeAllConnections?.()});
 return{server,db,password,generated,close};
}

if(require.main===module){
 const app=createApp();
 if(process.argv.includes('--demo')&&!app.db.data.orders.length)console.log(`Loaded ${demo.seed(app.db)} demo orders`);
 const port=+process.env.PORT||3000;
 app.server.listen(port,()=>{
  console.log(`Pio Pio Pizza\n  Customer app  http://localhost:${port}/\n  Admin         http://localhost:${port}/admin/`);
  if(app.generated)console.log(`  Admin password (generated for this run; set ADMIN_PASSWORD to choose your own): ${app.password}`);
 });
 for(const sig of['SIGINT','SIGTERM'])process.on(sig,()=>app.close().then(()=>process.exit(0)));
}
module.exports={createApp};
