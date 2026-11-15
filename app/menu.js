// Pio Pio Pizza menu — the single source of truth for products and base prices.
// Loaded by the customer app (as the PIOPIO_MENU global) and by the server (require).
(function(root){
const PIZZAS=[
 {id:'margherita',name:'Margherita',ing:'San Marzano, fior di latte, basil',price:149,cats:['veggie']},
 {id:'piopio',name:'Pio Pio',ing:'Peri-peri chicken, red onion, chili honey',price:189,tag:'Hot',cats:['spicy','meat']},
 {id:'pepperoni',name:'Pepperoni',ing:'Double pepperoni, mozzarella, oregano',price:179,cats:['meat']},
 {id:'funghi',name:'Funghi',ing:'Mushrooms, garlic cream, thyme, parmesan',price:179,cats:['veggie']},
 {id:'diavola',name:'Diavola',ing:'Spicy salami, nduja, jalapeño',price:189,cats:['spicy','meat']}];
const SIZES=[{id:'S',label:'Small',cm:30,add:-20},{id:'M',label:'Medium',cm:33,add:0},{id:'L',label:'Large',cm:40,add:60}];
const TOPPINGS=[{id:'cheese',name:'Extra cheese'},{id:'jalapeno',name:'Jalapeño'},{id:'nduja',name:'Nduja'},
 {id:'mushroom',name:'Mushrooms'},{id:'onion',name:'Red onion'},{id:'honey',name:'Chili honey'}];
const TOP_PRICE=25,MAX_TOPS=3;
const SIDES=[{id:'garlicbread',name:'Garlic bread',em:'🥖',price:59},{id:'cheesebread',name:'Cheesy garlic bread',em:'🧀',price:69},
 {id:'fries',name:'Fries',em:'🍟',price:49},{id:'sweetfries',name:'Sweet potato fries',em:'🍠',price:59},
 {id:'wings',name:'Chicken wings ×6',em:'🍗',price:89},{id:'mozzsticks',name:'Mozzarella sticks ×5',em:'🫕',price:79},
 {id:'onionrings',name:'Onion rings',em:'🧅',price:55},{id:'salad',name:'Side salad',em:'🥗',price:59}];
const DIPS=[{id:'garlic',name:'Garlic dip',em:'🧄',price:25},{id:'chili',name:'Chili honey',em:'🍯',price:25},
 {id:'aioli',name:'Aioli',em:'🥣',price:25},{id:'bbq',name:'BBQ dip',em:'🔥',price:25},{id:'sriracha',name:'Sriracha mayo',em:'🌶️',price:25}];
const DESSERTS=[{id:'tiramisu',name:'Tiramisu',em:'🍰',price:69},{id:'fondant',name:'Chocolate fondant',em:'🍫',price:69},
 {id:'icecream',name:'Vanilla ice cream',em:'🍨',price:59}];
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
if(typeof module!=='undefined'&&module.exports)module.exports=M;else root.PIOPIO_MENU=M;
})(typeof globalThis!=='undefined'?globalThis:this);
