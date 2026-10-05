(() => {
"use strict";

const PRODUCT_DEFS={
  house:{name:"House Flower",category:"Flower",baseDemand:1.00,quality:76,heat:42,cost:7},
  premium:{name:"Premium Flower",category:"Flower",baseDemand:.72,quality:91,heat:72,cost:12},
  preroll:{name:"Pre-Roll",category:"Convenience",baseDemand:.62,quality:72,heat:52,cost:5},
  vape:{name:"Vape",category:"Processed",baseDemand:.56,quality:80,heat:64,cost:11},
  edible:{name:"Edible",category:"Processed",baseDemand:.46,quality:78,heat:49,cost:6},
  limited:{name:"Limited Drop",category:"Special",baseDemand:.22,quality:95,heat:92,cost:17}
};

const BASE={
  cash:220000,lifetimeRevenue:0,day:1,marketShare:7.8,satisfaction:76,brandHeat:48,
  products:{
    house:{stock:1250,price:36,enabled:true},
    premium:{stock:450,price:48,enabled:true},
    preroll:{stock:260,price:14,enabled:true},
    vape:{stock:90,price:44,enabled:true},
    edible:{stock:140,price:22,enabled:true},
    limited:{stock:0,price:58,enabled:false}
  },
  cropDay:43,cropLength:63,materials:55,queue:3,
  staff:{retail:2,grow:2,ops:1},
  managers:{retail:false,ops:false,brand:false,rnd:false},
  upgrades:{express:false,flower2:false},
  growFocus:"balanced",rndWins:0,rndProgress:0,running:true,speed:1,peakHeat:48,
  lastThought:"I came for the house flower."
};

const app=document.getElementById("app"),stage=document.getElementById("stage"),
panelLayer=document.getElementById("panelLayer"),gameOverLayer=document.getElementById("gameOverLayer"),
toastEl=document.getElementById("toast"),cashValue=document.getElementById("cashValue"),
shareValue=document.getElementById("shareValue"),outlookValue=document.getElementById("outlookValue"),
pauseBtn=document.getElementById("pauseBtn"),speedBtn=document.getElementById("speedBtn");

const clone=v=>JSON.parse(JSON.stringify(v));
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const money=n=>"$"+Math.round(n).toLocaleString();
let state=clone(BASE),scene="property",horizon=30,toastTimer=null,frozen=false;

function enabledProducts(s=state){return Object.keys(PRODUCT_DEFS).filter(k=>s.products[k].enabled)}
function totalStock(s=state){return enabledProducts(s).reduce((sum,k)=>sum+s.products[k].stock,0)}
function daysToHarvest(s=state){return Math.max(0,s.cropLength-s.cropDay)}
function dailyFixed(s=state){
  const payroll=(s.staff.retail*3800+s.staff.grow*4200+s.staff.ops*4100)/30;
  const mgr=((s.managers.retail?4300:0)+(s.managers.ops?4350:0)+(s.managers.brand?4200:0)+(s.managers.rnd?4600:0))/30;
  return 11800/30+payroll+mgr;
}
function retailCapacity(s=state){return s.staff.retail*46+(s.upgrades.express?30:0)+(s.managers.retail?20:0)}
function baseTraffic(s=state){return 34+s.brandHeat*.38+s.marketShare*1.45+(s.satisfaction-70)*.42}
function productDemand(k,s=state){
  const d=PRODUCT_DEFS[k],p=s.products[k];
  if(!p.enabled)return 0;
  const ideal=d.category==="Convenience"?15:d.category==="Processed"?34:d.category==="Special"?58:(d.quality>85?48:36);
  const priceFactor=clamp(1+(ideal-p.price)/40,.45,1.55);
  const heatFactor=.72+(d.heat+s.brandHeat)/260;
  return Math.max(0,baseTraffic(s)*d.baseDemand*priceFactor*heatFactor*.32);
}
function harvestYield(s=state){
  let y=s.upgrades.flower2?2850:1650;
  if(s.growFocus==="yield")y*=1.16;
  if(s.growFocus==="quality")y*=.88;
  return Math.round(y);
}
function productMargin(k,s=state){
  const d=PRODUCT_DEFS[k],p=s.products[k];
  return p.price-d.cost;
}
function chooseThought(s=state){
  const candidates=[];
  for(const k of Object.keys(PRODUCT_DEFS)){
    const d=PRODUCT_DEFS[k],p=s.products[k];
    if(!p.enabled)continue;
    if(p.stock<15)candidates.push("They're out of "+d.name+".");
    else if(productMargin(k,s)<4)candidates.push(d.name+" is cheap here.");
    else if(p.price>(d.category==="Flower"?50:d.category==="Processed"?46:60))candidates.push(d.name+" feels expensive.");
  }
  if(s.queue>=7)candidates.push("The line is moving way too slow.");
  if(s.brandHeat>=70)candidates.push("Everybody keeps talking about this place.");
  if(!candidates.length)candidates.push("I found what I wanted.","This place has a solid menu.","I'd come back.");
  return candidates[s.day%candidates.length];
}

function deterministicDay(s){
  const capacity=retailCapacity(s);
  const rawDemand=enabledProducts(s).reduce((sum,k)=>sum+productDemand(k,s),0);
  const throughput=Math.min(rawDemand,capacity);
  s.queue=clamp(Math.round(Math.max(0,rawDemand-capacity)/9),0,14);
  let remaining=throughput,revenue=0,units=0;

  const ordered=enabledProducts(s).sort((a,b)=>productDemand(b,s)-productDemand(a,s));
  for(const k of ordered){
    if(remaining<=0)break;
    const want=productDemand(k,s);
    const sell=Math.min(s.products[k].stock,want,remaining);
    s.products[k].stock-=sell;remaining-=sell;units+=sell;revenue+=sell*s.products[k].price;
  }
  s.cash+=revenue-dailyFixed(s);
  s.lifetimeRevenue+=revenue;

  const stockDays=totalStock(s)/Math.max(1,rawDemand);
  if(stockDays<4)s.satisfaction-=.35;
  else if(s.queue>=8)s.satisfaction-=.25;
  else if(s.queue<=3)s.satisfaction+=.06;
  s.satisfaction=clamp(s.satisfaction,0,100);

  s.cropDay++;
  if(s.cropDay>=s.cropLength){
    if(s.materials>=12){
      const y=harvestYield(s);
      s.products.house.stock+=Math.round(y*.73);
      s.products.premium.stock+=Math.round(y*.27);
      s.materials-=12;
    }
    s.cropDay=0;
  }

  if(s.rndProgress>0){
    s.rndProgress++;
    if(s.rndProgress>=12){
      s.rndProgress=0;s.rndWins++;s.brandHeat=clamp(s.brandHeat+5,0,100);
      s.products.limited.enabled=true;s.products.limited.stock+=120;
    }
  }

  if(s.managers.ops&&s.materials<18&&s.cash>1800){s.cash-=1800;s.materials+=45}
  if(stockDays>12&&s.satisfaction>76)s.marketShare+=.014;
  if(stockDays<2||s.satisfaction<55)s.marketShare-=.025;
  s.marketShare=clamp(s.marketShare,0,60);
  s.brandHeat=clamp(s.brandHeat-(s.managers.brand ? .012 : .025),0,100);
  s.peakHeat=Math.max(s.peakHeat,s.brandHeat);
  s.lastThought=chooseThought(s);s.day++;
  return{revenue,units,rawDemand};
}
function project(days,candidate=state){
  const p=clone(candidate),startCash=p.cash,startRev=p.lifetimeRevenue;
  let harvests=0;
  for(let i=0;i<days;i++){const before=p.cropDay;deterministicDay(p);if(p.cropDay<before)harvests++;if(p.cash<=-333333)break}
  const demand=enabledProducts(p).reduce((sum,k)=>sum+productDemand(k,p),0);
  const coverage=totalStock(p)/Math.max(1,demand);
  let bottleneck="Demand generation";
  if(coverage<6)bottleneck="Inventory";
  else if(p.queue>=7)bottleneck="Retail throughput";
  else if(p.materials<20)bottleneck="Materials";
  else if(!p.managers.ops||!p.managers.retail)bottleneck="Management bandwidth";
  else if(!p.upgrades.flower2)bottleneck="Cultivation capacity";
  return{state:p,cash:p.cash,cashDelta:p.cash-startCash,revenue:p.lifetimeRevenue-startRev,coverage,harvests,bottleneck,demand};
}
function businessStatus(){const p=project(30);if(p.cash<=-250000||p.coverage<2||p.state.satisfaction<45)return["Risk","bad"];if(p.coverage<7||p.state.queue>=7||p.cashDelta<-25000)return["Pressure","warn"];return["Growing","good"]}
function updateHUD(){cashValue.textContent=money(state.cash);shareValue.textContent=state.marketShare.toFixed(1)+"%";const[o,c]=businessStatus();outlookValue.textContent=o;outlookValue.className=c;pauseBtn.textContent=state.running?"Ⅱ":"▶";speedBtn.textContent=state.speed+"×"}
function showToast(msg){clearTimeout(toastTimer);toastEl.textContent=msg;toastEl.classList.add("show");toastTimer=setTimeout(()=>toastEl.classList.remove("show"),1800)}
function currentSignal(){const p=project(30);if(totalStock()<500)return["Stock pressure",Math.round(p.coverage)+" projected days of menu coverage"];if(daysToHarvest()<=6)return["Harvest approaching",daysToHarvest()+" days • +"+harvestYield()+" flower expected"];if(state.queue>=7)return["Front queue growing","Retail throughput is constraining demand"];return["Likely next constraint",p.bottleneck]}
function peopleMarkup(){const count=clamp(state.queue+4,4,11);return Array.from({length:count},(_,i)=>'<button class="person" data-open="customer" aria-label="Inspect customer" style="left:'+(7+(i%5)*18)+'%;top:'+(10+Math.floor(i/5)*39+(i%2)*8)+'%"></button>').join("")}
function propertyMarkup(){
  const[sig,sub]=currentSignal();
  return '<section class="property"><div class="parking-lines"></div><div class="road road--rear"></div><div class="road road--front"></div>'+
  '<div class="site"><div class="building"><div class="building__rear"></div><div class="building__front"></div><div class="building__roof"></div><div class="building__second"></div><div class="roof-unit ru1"></div><div class="roof-unit ru2"></div><div class="roof-unit ru3"></div><div class="loading-bay"></div><div class="brand-sign">EMPIRE GREEN</div></div>'+
  '<button class="hotspot hotspot--grow" data-room="grow">Grow<small>'+daysToHarvest()+'d to harvest</small></button>'+
  '<button class="hotspot hotspot--ops" data-room="ops">Backend<small>'+state.materials+' materials</small></button>'+
  '<button class="hotspot hotspot--retail" data-room="retail">Retail<small>'+state.queue+' queue</small></button>'+
  '<button class="hotspot hotspot--brand" data-room="brand">Brand<small>'+Math.round(state.brandHeat)+' heat</small></button>'+
  '<button class="hotspot hotspot--rd" data-room="rnd">R&D<small>'+state.rndWins+' wins</small></button></div>'+
  '<div class="vehicle car"></div><div class="vehicle truck"><span class="cab"></span></div><div class="people">'+peopleMarkup()+'</div>'+
  '<div class="thought-bubble">'+state.lastThought+'</div><button class="signal" data-open="outlook"><b>'+sig+'</b><span>'+sub+'</span></button>'+
  '<button class="chat-btn" data-open="feed">CHAT</button><div class="day-badge">DAY '+state.day+' • '+totalStock()+' units on menu</div></section>';
}
function actionButton(a,l,s,d=false){return '<button class="action-btn" data-action="'+a+'" '+(d?'disabled':'')+'><b>'+l+'</b><small>'+s+'</small></button>'}
function shelf(k,left,top){const d=PRODUCT_DEFS[k],p=state.products[k];return '<button class="store-shelf" data-product="'+k+'" style="left:'+left+'%;top:'+top+'%">'+d.name+'<small>'+Math.round(p.stock)+' • $'+p.price+'</small></button>'}
function roomMarkup(name){
  let title="",sub="",world="",actions="";
  if(name==="retail"){
    title="Retail floor";sub="Every offering has its own price, stock and customer pull.";
    world='<div class="room-floor"></div>'+shelf("house",6,15)+shelf("premium",35,15)+shelf("preroll",65,15)+shelf("vape",11,49)+shelf("edible",41,49)+(state.products.limited.enabled?shelf("limited",70,49):"")+
    '<div class="fixture" style="right:5%;bottom:8%;width:22%">CHECKOUT<small>'+state.staff.retail+' budtenders • queue '+state.queue+'</small></div>';
    actions=actionButton("hireRetail","Hire budtender","$900 onboarding • $3,800/mo")+actionButton("express",state.upgrades.express?"Express active":"Build express",state.upgrades.express?"Queue relief online":"$18,000 • throughput +30",state.upgrades.express)+actionButton("openProducts","Menu pricing","Tune every offering");
  }
  if(name==="grow"){
    title="Flower room";sub="Cultivation supplies multiple retail offerings.";
    world='<div class="room-floor"></div>'+Array.from({length:18},(_,i)=>'<div class="plant" style="left:'+(10+(i%6)*14)+'%;top:'+(19+Math.floor(i/6)*25)+'%"></div>').join("")+'<div class="fixture" style="right:5%;top:8%;width:25%">HARVEST<small>'+daysToHarvest()+' days • '+harvestYield()+' units</small></div><div class="worker" style="left:18%;top:76%"></div>';
    actions=actionButton("focusBalanced","Balanced",state.growFocus==="balanced"?"Active":"Standard split",state.growFocus==="balanced")+actionButton("focusQuality","Premium bias",state.growFocus==="quality"?"Active":"More premium / less total",state.growFocus==="quality")+actionButton("focusYield","Volume bias",state.growFocus==="yield"?"Active":"More house flower",state.growFocus==="yield")+actionButton("flower2",state.upgrades.flower2?"Flower II online":"Build Flower II",state.upgrades.flower2?"Capacity expanded":"$52,000 • larger harvests",state.upgrades.flower2);
  }
  if(name==="ops"){
    title="Backend operations";sub="Convert base inventory into higher-value offerings.";
    world='<div class="room-floor"></div><div class="fixture" style="left:6%;top:14%;width:25%">FLOWER STOCK<small>'+Math.round(state.products.house.stock+state.products.premium.stock)+'</small></div><div class="fixture" style="left:38%;top:46%;width:25%">PACKAGING<small>'+state.materials+' materials</small></div><div class="fixture" style="right:6%;top:14%;width:25%">DOCK<small>'+(state.managers.ops?"managed":"manual")+'</small></div>';
    actions=actionButton("makePrerolls","Make pre-rolls","Use 120 house → 90 pre-rolls",state.products.house.stock<120)+actionButton("makeVapes","Make vapes","Use 160 flower → 90 vapes",state.products.house.stock+state.products.premium.stock<160)+actionButton("makeEdibles","Make edibles","Use 100 house → 120 edibles",state.products.house.stock<100)+actionButton("materials","Order materials","$1,800 • +45")+actionButton("hireOps",state.managers.ops?"Ops lead hired":"Hire Ops lead",state.managers.ops?"Auto-restock online":"$1,200 onboarding • $4,350/mo",state.managers.ops);
  }
  if(name==="brand"){
    title="Brand / market";sub="Build heat around specific offerings instead of one generic score.";
    world='<div class="room-floor"></div><div class="fixture" style="left:8%;top:17%;width:34%">BRAND HEAT<small>'+Math.round(state.brandHeat)+'/100</small></div><div class="fixture" style="right:8%;top:17%;width:34%">MARKET SHARE<small>'+state.marketShare.toFixed(1)+'%</small></div><div class="fixture" style="left:30%;top:56%;width:40%">HOTTEST ITEM<small>'+hottestProduct()+'</small></div>';
    actions=actionButton("campaignHouse","Push house flower","$6,000 • traffic +")+actionButton("campaignPremium","Push premium","$8,000 • premium demand +")+actionButton("limitedDrop","Launch limited drop","Use 180 premium → 120 limited",state.products.premium.stock<180)+actionButton("hireBrand",state.managers.brand?"Brand lead hired":"Hire Brand lead",state.managers.brand?"Heat decay reduced":"$1,200 onboarding • $4,200/mo",state.managers.brand);
  }
  if(name==="rnd"){
    title="Second floor • R&D";sub="Research unlocks new reasons for customers to visit.";
    world='<div class="room-floor"></div><div class="fixture" style="left:7%;top:16%;width:27%">GENETICS<small>'+state.rndWins+' wins</small></div><div class="fixture" style="left:37%;top:49%;width:27%">PRODUCT LAB<small>'+(state.rndProgress?("day "+state.rndProgress+"/12"):"idle")+'</small></div><div class="fixture" style="right:7%;top:16%;width:27%">CREATIVE<small>'+hottestProduct()+'</small></div>';
    actions=actionButton("startRnd",state.rndProgress?"Experiment running":"Run experiment",state.rndProgress?"Completes at day 12":"$7,000 • unlocks limited inventory",state.rndProgress>0)+actionButton("pheno","Pheno project","$9,500 • premium heat +")+actionButton("hireRnd",state.managers.rnd?"R&D lead hired":"Hire R&D lead",state.managers.rnd?"Experiments cheaper":"$1,200 onboarding • $4,600/mo",state.managers.rnd);
  }
  return '<section class="room"><header class="room-head"><b>'+title+'</b><small>'+sub+'</small></header><div class="room-world">'+world+'</div><div class="action-strip">'+actions+'</div><button class="home-btn" data-action="home">Property</button></section>';
}
function hottestProduct(){return Object.keys(PRODUCT_DEFS).filter(k=>state.products[k].enabled).sort((a,b)=>productDemand(b)-productDemand(a))[0] ? PRODUCT_DEFS[Object.keys(PRODUCT_DEFS).filter(k=>state.products[k].enabled).sort((a,b)=>productDemand(b)-productDemand(a))[0]].name : "None"}
function renderScene(){stage.innerHTML=scene==="property"?propertyMarkup():roomMarkup(scene);updateHUD()}
function card(l,v){return '<div class="card"><span>'+l+'</span><b>'+v+'</b></div>'}
function productsPanel(){
  return '<div class="scrim" data-close-panel></div><section class="panel"><div class="grabber"></div><h2>Products & pricing</h2><div class="note">This is your ride list: each offering has its own demand, price sensitivity, stock and margin.</div><div class="product-list">'+Object.keys(PRODUCT_DEFS).map(k=>{
    const d=PRODUCT_DEFS[k],p=state.products[k],off=!p.enabled;
    return '<div class="product-row '+(off?'product-off':'')+'"><div class="name"><b>'+d.name+'</b><small>'+d.category+' • quality '+d.quality+' • margin '+money(productMargin(k))+'</small><span class="product-chip">'+(off?'LOCKED / OFF MENU':Math.round(productDemand(k))+' demand/day')+'</span></div><div class="stock"><b>'+Math.round(p.stock)+'</b><br>stock</div><div class="price"><b>$'+p.price+'</b><br>price</div><div class="stepper"><button data-price="'+k+'" data-delta="-2" '+(off?'disabled':'')+'>−</button><button data-price="'+k+'" data-delta="2" '+(off?'disabled':'')+'>+</button></div></div>';
  }).join("")+'</div><button data-close-panel>Close</button></section>';
}
function staffPanel(){
  return '<div class="scrim" data-close-panel></div><section class="panel"><div class="grabber"></div><h2>Staff & operations</h2><div class="staff-grid">'+
  card("Budtenders",state.staff.retail)+card("Grow staff",state.staff.grow)+card("Ops staff",state.staff.ops)+
  card("Retail capacity",Math.round(retailCapacity())+"/day")+card("Ops manager",state.managers.ops?"Hired":"Open")+card("Brand manager",state.managers.brand?"Hired":"Open")+
  '</div><h3>Payroll</h3><div class="report-line"><span>Daily fixed burn</span><b>'+money(dailyFixed())+'</b></div><div class="report-line"><span>Monthly equivalent</span><b>'+money(dailyFixed()*30)+'</b></div><button data-close-panel>Close</button></section>';
}
function feedPanel(){return '<div class="scrim" data-close-panel></div><section class="panel"><div class="grabber"></div><h2>Guest thoughts</h2>'+[state.lastThought,chooseThought(state),chooseThought({...clone(state),day:state.day+1}),chooseThought({...clone(state),day:state.day+2})].map(x=>'<div class="feed-item">“'+x+'”</div>').join("")+'<button data-close-panel>Close</button></section>'}
function customerPanel(){
  const desired=Object.keys(PRODUCT_DEFS).filter(k=>state.products[k].enabled).sort((a,b)=>productDemand(b)-productDemand(a))[state.day%enabledProducts().length]||"house";
  const p=state.products[desired],d=PRODUCT_DEFS[desired];
  const thought=p.stock<10?"They're out of "+d.name+".":p.price>(d.category==="Flower"?48:45)?"I like "+d.name+", but that price is high.":"I came in for "+d.name+".";
  return '<div class="scrim" data-close-panel></div><section class="panel"><div class="grabber"></div><h2>Customer</h2><div class="cards">'+card("Looking for",d.name)+card("Budget","$"+(30+(state.day%7)*8))+card("Thought",thought)+'</div><button data-close-panel>Close</button></section>';
}
function outlookPanel(){
  const p=project(horizon),trend=p.cashDelta>=0?"+"+money(p.cashDelta):money(p.cashDelta),ps=p.state.products;
  return '<div class="scrim" data-close-panel></div><section class="panel"><div class="grabber"></div><h2>Company reports</h2><div class="tabs">'+[30,60,90].map(d=>'<button class="'+(d===horizon?"on":"")+'" data-horizon="'+d+'">'+d+' days</button>').join("")+'</div><div class="note"><b>Likely next constraint: '+p.bottleneck+'</b><br>Same model that drives the live store drives this forecast.</div><div class="cards">'+
  card("Projected cash",money(p.cash))+card("Cash change",trend)+card("Revenue",money(p.revenue))+card("Coverage",Math.round(p.coverage)+" days")+card("Harvests",p.harvests)+card("Queue",p.state.queue)+
  card("House",Math.round(ps.house.stock))+card("Premium",Math.round(ps.premium.stock))+card("Pre-rolls",Math.round(ps.preroll.stock))+card("Vapes",Math.round(ps.vape.stock))+card("Edibles",Math.round(ps.edible.stock))+card("Limited",Math.round(ps.limited.stock))+
  card("Satisfaction",Math.round(p.state.satisfaction)+"%")+card("Brand heat",Math.round(p.state.brandHeat))+card("Market share",p.state.marketShare.toFixed(1)+"%")+'</div><button data-close-panel>Close</button></section>';
}
function openPanel(type){panelLayer.innerHTML=type==="outlook"?outlookPanel():type==="products"?productsPanel():type==="staff"?staffPanel():type==="feed"?feedPanel():customerPanel()}
function closePanel(){panelLayer.innerHTML=""}
function confirmPurchase(candidate,label,cost){const p=project(30,candidate),risky=p.cashDelta<-45000||p.cash<50000||p.coverage<4;if(!risky)return true;return window.confirm(label+" may strain the business.\n\nCost now: "+money(cost)+"\n30-day cash: "+money(p.cash)+"\n30-day change: "+(p.cashDelta>=0?"+":"")+money(p.cashDelta)+"\nMenu coverage: "+Math.round(p.coverage)+" days\n\nProceed?")}
function spend(amount,label,mutate){if(state.cash-amount<=-333333){showToast("That would immediately toast the company.");return false}const c=clone(state);c.cash-=amount;if(mutate)mutate(c);if(!confirmPurchase(c,label,amount))return false;state.cash-=amount;return true}
function hire(role,staffKey,salary,onboard){const c=clone(state);c.cash-=onboard;if(staffKey)c.staff[staffKey]++;if(role)c.managers[role]=true;if(!confirmPurchase(c,(role||staffKey)+" hire",onboard))return false;state.cash-=onboard;if(staffKey)state.staff[staffKey]++;if(role)state.managers[role]=true;showToast("Hired • "+money(salary)+"/mo");return true}
function applyAction(a){
  if(a==="home"){scene="property";renderScene();return}
  if(a==="pause"){state.running=!state.running;updateHUD();showToast(state.running?"Simulation running":"Simulation paused");return}
  if(a==="speed"){state.speed=state.speed===1?2:state.speed===2?4:1;updateHUD();return}
  if(a==="openProducts"){openPanel("products");return}
  if(a==="hireRetail")hire(null,"retail",3800,900);
  if(a==="express"&&!state.upgrades.express&&spend(18000,"Express checkout",c=>c.upgrades.express=true))state.upgrades.express=true;
  if(a==="focusBalanced")state.growFocus="balanced";
  if(a==="focusQuality"){state.growFocus="quality";state.brandHeat=clamp(state.brandHeat+2,0,100)}
  if(a==="focusYield"){state.growFocus="yield";state.brandHeat=clamp(state.brandHeat-1,0,100)}
  if(a==="flower2"&&!state.upgrades.flower2&&spend(52000,"Flower Room II",c=>c.upgrades.flower2=true))state.upgrades.flower2=true;
  if(a==="materials"&&spend(1800,"Materials order",c=>c.materials+=45))state.materials+=45;
  if(a==="makePrerolls"&&state.products.house.stock>=120){state.products.house.stock-=120;state.products.preroll.stock+=90;state.materials=Math.max(0,state.materials-4);showToast("Pre-roll batch finished")}
  if(a==="makeVapes"&&state.products.house.stock+state.products.premium.stock>=160){let need=160,take=Math.min(need,state.products.house.stock);state.products.house.stock-=take;need-=take;state.products.premium.stock-=Math.min(need,state.products.premium.stock);state.products.vape.stock+=90;state.materials=Math.max(0,state.materials-6);showToast("Vape batch finished")}
  if(a==="makeEdibles"&&state.products.house.stock>=100){state.products.house.stock-=100;state.products.edible.stock+=120;state.materials=Math.max(0,state.materials-5);showToast("Edible batch finished")}
  if(a==="hireOps"&&!state.managers.ops)hire("ops",null,4350,1200);
  if(a==="campaignHouse"&&spend(6000,"House flower campaign")){state.brandHeat=clamp(state.brandHeat+5,0,100);PRODUCT_DEFS.house.heat=clamp(PRODUCT_DEFS.house.heat+6,0,100)}
  if(a==="campaignPremium"&&spend(8000,"Premium campaign")){state.brandHeat=clamp(state.brandHeat+7,0,100);PRODUCT_DEFS.premium.heat=clamp(PRODUCT_DEFS.premium.heat+8,0,100)}
  if(a==="limitedDrop"&&state.products.premium.stock>=180){state.products.premium.stock-=180;state.products.limited.enabled=true;state.products.limited.stock+=120;state.brandHeat=clamp(state.brandHeat+8,0,100)}
  if(a==="hireBrand"&&!state.managers.brand)hire("brand",null,4200,1200);
  if(a==="startRnd"&&!state.rndProgress){const cost=state.managers.rnd?5600:7000;if(spend(cost,"R&D experiment",c=>c.rndProgress=1))state.rndProgress=1}
  if(a==="pheno"&&spend(9500,"Pheno project")){state.rndWins++;state.brandHeat=clamp(state.brandHeat+6,0,100);PRODUCT_DEFS.premium.quality=clamp(PRODUCT_DEFS.premium.quality+1,0,100)}
  if(a==="hireRnd"&&!state.managers.rnd)hire("rnd",null,4600,1200);
  state.peakHeat=Math.max(state.peakHeat,state.brandHeat);renderScene();checkBankruptcy();
}
function checkBankruptcy(){if(state.cash>-333333)return false;state.running=false;closePanel();gameOverLayer.innerHTML='<section class="toasted"><h1>TOASTED</h1><p>EMPIRE GREEN IS INSOLVENT<br><br>FINAL SHARE '+state.marketShare.toFixed(1)+'%<br>LIFETIME REVENUE '+money(state.lifetimeRevenue)+'<br>DAYS SURVIVED '+state.day+'<br>PEAK HEAT '+Math.round(state.peakHeat)+'</p><button data-action="restart">Start over</button></section>';return true}
function restart(){state=clone(BASE);scene="property";horizon=30;gameOverLayer.innerHTML="";closePanel();renderScene()}
app.addEventListener("click",e=>{
  const r=e.target.closest("[data-room]");if(r){scene=r.dataset.room;renderScene();return}
  const o=e.target.closest("[data-open]");if(o){openPanel(o.dataset.open);return}
  const p=e.target.closest("[data-product]");if(p){openPanel("products");return}
  const person=e.target.closest(".person");if(person){openPanel("customer");return}
  const a=e.target.closest("[data-action]");if(a){if(a.dataset.action==="restart"){restart();return}applyAction(a.dataset.action)}
});
panelLayer.addEventListener("click",e=>{
  if(e.target.closest("[data-close-panel]")){closePanel();return}
  const h=e.target.closest("[data-horizon]");if(h){horizon=Number(h.dataset.horizon);openPanel("outlook");return}
  const p=e.target.closest("[data-price]");if(p){const k=p.dataset.price,delta=Number(p.dataset.delta);state.products[k].price=clamp(state.products[k].price+delta,6,80);openPanel("products");updateHUD()}
});
function liveTick(){if(!state.running||frozen||gameOverLayer.innerHTML)return;for(let i=0;i<state.speed;i++){deterministicDay(state);if(checkBankruptcy())return}updateHUD();if(scene==="property"||state.day%3===0)renderScene()}
document.addEventListener("visibilitychange",()=>{frozen=document.hidden});
renderScene();setInterval(liveTick,2000);
})();