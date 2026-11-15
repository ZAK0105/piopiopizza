'use strict';
// Builds dist-base44/: the files to place in the Base44 app (same paths as in the app's source tree).
// Hand-written Base44 files live in base44/; everything shared with the stand-alone version is generated from app/ and admin/.
const fs=require('fs');const path=require('path');
const root=path.join(__dirname,'..'),out=path.join(root,'dist-base44');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const write=(f,s)=>{const p=path.join(out,f);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,s)};
fs.rmSync(out,{recursive:true,force:true});

// hand-written files, copied as they are
(function copy(dir){for(const e of fs.readdirSync(path.join(root,'base44',dir),{withFileTypes:true})){
 const rel=path.join(dir,e.name);if(e.isDirectory())copy(rel);
 else write(rel.startsWith('src')||rel==='index.html'?rel:path.join('base44',rel),read(path.join('base44',rel)))}})('');

// shared modules as ES modules: the part between the BODY and END markers, plus a default export
const esm=f=>{const s=read(f),a=s.indexOf('/*BODY*/'),b=s.indexOf('/*END*/');if(a<0||b<0)throw new Error('markers missing in '+f);
 return'// GENERATED from '+f+' by tools/base44-build.js — edit the source, not this file.\n'+s.slice(a+9,b)+'export default M;\n'};
for(const m of['menu','core']){write(`base44/shared/${m}.ts`,esm(`app/${m}.js`));write(`src/piopio/${m}.js`,esm(`app/${m}.js`))}

// front-end logic and styles, unchanged
const gen=f=>'// GENERATED from '+f+' by tools/base44-build.js — edit the source, not this file.\n';
write('src/piopio/app.js',gen('app/app.js')+read('app/app.js'));
write('src/piopio/admin.js',gen('admin/admin.js')+read('admin/admin.js'));
write('src/piopio/app.css',read('app/styles.css'));
write('src/piopio/admin.css',read('admin/admin.css'));

// page markup: what sits inside <body>, without the script tags
const body=f=>{const s=read(f);return s.slice(s.indexOf('<body>')+6,s.indexOf('</body>')).replace(/<script[^>]*><\/script>\s*/g,'').trim()};
write('src/piopio/markup.js',gen('app/index.html and admin/index.html')+
 'export const customerHtml='+JSON.stringify(body('app/index.html'))+';\nexport const adminHtml='+JSON.stringify(body('admin/index.html'))+';\n');

// pizza photos: public URLs once uploaded to the app's media library (tools/base44-images.json), local paths otherwise
const urls=path.join(__dirname,'base44-images.json');
write('src/piopio/images.js',gen('tools/base44-images.json')+'export const images='+(fs.existsSync(urls)?fs.readFileSync(urls,'utf8').trim():'{}')+';\n');

const list=[];(function walk(d){for(const e of fs.readdirSync(path.join(out,d),{withFileTypes:true})){const r=path.join(d,e.name);e.isDirectory()?walk(r):list.push(r)}})('');
for(const f of list.sort())console.log(String(fs.statSync(path.join(out,f)).size).padStart(7),f);
