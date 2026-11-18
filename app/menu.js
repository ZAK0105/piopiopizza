// Pio Pio Pizza menu — the single source of truth for products and base prices.
// Loaded by the customer app (as the PIOPIO_MENU global) and by the server (require).
(function(root){
/*BODY*/
// The real Pio Pio menu (piopio.no, Nesodden and Sagene/Bjølsen). One size; every pizza contains wheat and milk.
// photo = which picture to show until each pizza has its own.
const SAN='San Marzano-tomatsaus',FIOR='fior di latte-mozzarella',EVO='extra virgin olivenolje';
const PIZZAS=[
 {id:'margherita',name:'Margherita',ing:`${SAN}, ${FIOR}, basilikum, ${EVO}`,price:190,cats:['veggie'],photo:'margherita'},
 {id:'pepperoni',name:'Pepperoni / Vesuvio',ing:`${SAN}, ${FIOR}, pepperoni eller skinke, oregano, ${EVO}`,price:200,cats:['meat'],photo:'pepperoni'},
 {id:'piopio',name:'Pio Pio',ing:`${SAN}, ${FIOR}, salsiccia, løk, sopp, kapers, pepper, parmesan, ${EVO}`,price:230,tag:'Husets',cats:['meat'],photo:'funghi'},
 {id:'diablo',name:'Diablo',ing:`${SAN}, ${FIOR}, nduja, fersk chili, ${EVO}`,price:220,tag:'Sterk',cats:['spicy','meat'],photo:'diavola'},
 {id:'nesodden',name:'Nesodden Special',ing:`${SAN}, ${FIOR}, italiensk skinke, pepperoni picante, basilikum, ${EVO}`,price:220,cats:['spicy','meat'],photo:'pepperoni'},
 {id:'mafioso',name:'Mafioso Palermo',ing:`${SAN}, ${FIOR}, bacon, pepperoni picante, ${EVO}`,price:220,cats:['spicy','meat'],photo:'diavola'},
 {id:'bovina',name:'Bovina',ing:`${SAN}, ${FIOR}, marinert biff, løk, sopp, oregano`,price:220,cats:['meat'],photo:'funghi'},
 {id:'funghi',name:'Funghi',ing:`Spring cream, fior di latte, husets soppmiks, gorgonzola picante, sitron, pepper, ${EVO}`,price:220,cats:['veggie'],photo:'funghi'},
 {id:'pollo',name:'Pollo Pollo',ing:`Spring cream, ${FIOR}, currymarinert kylling, grønn paprika, løk, ruccola, ${EVO}`,price:220,cats:['meat'],photo:'piopio'},
 {id:'vegetariana',name:'Vegetariana',ing:`${SAN}, ${FIOR}, sopp, oliven, oregano, ${EVO}`,price:220,cats:['veggie'],photo:'margherita'},
 {id:'diavola',name:'Diavola',ing:`${SAN}, fior di latte, nduja, løk, chili, ${EVO}`,price:220,tag:'Sterk',cats:['spicy','meat'],photo:'diavola'},
 {id:'quattro',name:'Quattro Formaggi',ing:`${SAN}, fior di latte, gorgonzola, taleggio, parmesan, ${EVO}`,price:220,cats:['veggie'],photo:'margherita'},
 {id:'adriatica',name:'Adriatica',ing:`${SAN}, ${FIOR}, ruccola, soltørkede tomater, parmesan, ${EVO}`,price:240,cats:['veggie'],photo:'margherita'},
 {id:'prosciutto',name:'Prosciutto Mushroom',ing:`${SAN}, ${FIOR}, prosciutto cotto (skinke), sopp, ${EVO}`,price:240,cats:['meat'],photo:'funghi'},
 {id:'chicken',name:'Chicken Spinach',ing:`${SAN}, ${FIOR}, kremet kylling, parmesan, ${EVO}`,price:245,cats:['meat'],photo:'piopio'},
 {id:'royal',name:'Royal',ing:`Prosciutto di Parma, ${FIOR}, ruccola, parmesan, ${EVO}`,price:250,cats:['meat'],photo:'pepperoni'}];
PIZZAS.forEach(p=>{p.allergens='Hvete, melk'});
const SIZES=[{id:'M',label:'Hel pizza',cm:0,add:0}];
// "Tillegg" on the menu: gluten-free base or vegan cheese, 59 kr each
const TOPPINGS=[{id:'glutenfree',name:'Glutenfri bunn'},{id:'vegancheese',name:'Vegansk ost'}];
const TOP_PRICE=59,MAX_TOPS=2;
const SIDES=[{id:'garlicbread',name:'Hvitløksbrød',em:'🥖',price:59},{id:'cheesebread',name:'Hvitløksbrød med ost',em:'🧀',price:69},
 {id:'fries',name:'Pommes frites',em:'🍟',price:49},{id:'sweetfries',name:'Søtpotetfries',em:'🍠',price:59},
 {id:'wings',name:'Kyllingvinger ×6',em:'🍗',price:89},{id:'mozzsticks',name:'Mozzarellasticks ×5',em:'🫕',price:79},
 {id:'onionrings',name:'Løkringer',em:'🧅',price:55},{id:'salad',name:'Salat',em:'🥗',price:59}];
const DIPS=[{id:'garlic',name:'Hvitløksdip',em:'🧄',price:25},{id:'chili',name:'Chilihonning',em:'🍯',price:25},
 {id:'aioli',name:'Aioli',em:'🥣',price:25},{id:'bbq',name:'BBQ-dip',em:'🔥',price:25},{id:'sriracha',name:'Srirachamajones',em:'🌶️',price:25}];
const DESSERTS=[{id:'tiramisu',name:'Tiramisu',em:'🍰',price:69},{id:'fondant',name:'Sjokoladefondant',em:'🍫',price:69},
 {id:'icecream',name:'Vaniljeis',em:'🍨',price:59}];
// Each brand is sold as 0.5 L and 1.5 L; c = bottle colour, l = label colour
const BRANDS=[{id:'coke',name:'Coca-Cola',c:'#E61A27'},{id:'cokezero',name:'Coca-Cola Zero',c:'#161616',l:'#E61A27'},
 {id:'pepsi',name:'Pepsi',c:'#0B4EA2'},{id:'pepsimax',name:'Pepsi Max',c:'#0A0A0A',l:'#1F8BFF'},
 {id:'fanta',name:'Fanta',c:'#FF8300'},{id:'fantaex',name:'Fanta Exotic',c:'#F0437A',l:'#FFD23F'},
 {id:'sprite',name:'Sprite',c:'#0A9E4A'},{id:'7up',name:'7UP',c:'#12A150',l:'#E4002B'},
 {id:'solo',name:'Solo',c:'#F7A600',l:'#D2232A'},{id:'solosuper',name:'Solo Super',c:'#F7A600',l:'#1A1A1A'},
 {id:'urge',name:'Urge',c:'#3F9C35',l:'#D7E44A'},{id:'mozell',name:'Mozell',c:'#C9D46C',l:'#1E5B2E'},
 {id:'villa',name:'Villa Farris',c:'#6B1F3A',l:'#F1E5C8'},{id:'mdew',name:'Mountain Dew',c:'#8CC63F',l:'#D2232A'},
 {id:'farris',name:'Farris',c:'#0E4C92',l:'#C9E4F7',water:true},{id:'bonaqua',name:'Bonaqua',c:'#1C75BC',l:'#E6F4FB',water:true},
 {id:'imsdal',name:'Imsdal',c:'#7CCBEA',l:'#0E4C92',water:true}];
const BOTTLES=[{id:'05',label:'0.5 L',price:39,water:35},{id:'15',label:'1.5 L',price:59,water:49}];
const DRINKS=BRANDS.flatMap(b=>BOTTLES.map(z=>({id:`${b.id}-${z.id}`,brand:b.id,size:z.id,name:`${b.name} ${z.label}`,short:b.name,
 price:b.water?z.water:z.price})));
const tag=(arr,group)=>arr.map(x=>Object.assign(x,{group}));
const EXTRAS=[...tag(SIDES,'sides'),...tag(DIPS,'dips'),...tag(DRINKS,'drinks'),...tag(DESSERTS,'desserts')];
const DELIVERY_FEE=49;
const M={PIZZAS,SIZES,TOPPINGS,TOP_PRICE,MAX_TOPS,SIDES,DIPS,DESSERTS,BRANDS,BOTTLES,DRINKS,EXTRAS,DELIVERY_FEE};
/*END*/
if(typeof module!=='undefined'&&module.exports)module.exports=M;else root.PIOPIO_MENU=M;
})(typeof globalThis!=='undefined'?globalThis:this);
