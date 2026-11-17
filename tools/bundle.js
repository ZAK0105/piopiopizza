'use strict';
// Builds dist/pio-pio-pizza.html: the customer app as one self-contained file (demo mode, no server needed).
const fs=require('fs');const path=require('path');
const app=path.join(__dirname,'..','app'),read=f=>fs.readFileSync(path.join(app,f),'utf8');
const menu=require(path.join(app,'menu.js'));
const img={};for(const p of menu.PIZZAS)img[p.id]='data:image/png;base64,'+fs.readFileSync(path.join(app,'images',p.id+'.png')).toString('base64');
const js='window.PP_IMAGES='+JSON.stringify(img)+';\n'+read('app.js');
const html=read('index.html')
 .replace('<link rel="stylesheet" href="styles.css">',()=>'<style>'+read('styles.css')+'</style>')
 .replace('<script src="menu.js"></script>',()=>'<script>'+read('menu.js')+'</script>')
 .replace('<script src="core.js"></script>',()=>'<script>'+read('core.js')+'</script>')
 .replace('<script src="app.js"></script>',()=>'<script>'+js+'</script>');
const out=path.join(__dirname,'..','dist');fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'pio-pio-pizza.html'),html);
console.log('dist/pio-pio-pizza.html',Math.round(html.length/1024)+' KB');
