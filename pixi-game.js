(() => {
"use strict";

const host=document.getElementById("gameHost");
const statusEl=document.getElementById("status");
const thoughtEl=document.getElementById("thought");
const sheetLayer=document.getElementById("sheetLayer");

const PRODUCTS={
  house:{name:"House Flower",price:36,stock:1200,appeal:1.00},
  premium:{name:"Premium Flower",price:48,stock:420,appeal:.78},
  preroll:{name:"Pre-Roll",price:14,stock:260,appeal:.72},
  vape:{name:"Vape",price:44,stock:110,appeal:.58},
  edible:{name:"Edible",price:22,stock:160,appeal:.52}
};

const state={
  cash:220000,share:7.8,rating:76,day:1,hour:9,running:true,speed:1,
  queueCapacity:1,budtenders:2,served:0,lost:0,revenue:0,thoughts:["I came for the house flower."]
};

const guests=[];
let nextGuest=1;
let app,world,peopleLayer,queueLayer;
let spawnTimer=0,serveTimer=0,simHourTimer=0;

function money(n){return "$"+Math.round(n).toLocaleString()}
function clamp(n,a,b){return Math.max(a,Math.min(b,n))}
function pushThought(t){state.thoughts.unshift(t);state.thoughts=state.thoughts.slice(0,12);thoughtEl.textContent="Guests: “"+t+"”"}
function updateHUD(){
  document.getElementById("cash").textContent=money(state.cash);
  document.getElementById("share").textContent=state.share.toFixed(1)+"%";
  document.getElementById("rating").textContent=Math.round(state.rating);
  document.getElementById("day").textContent=state.day+" / "+String(state.hour).padStart(2,"0")+":00";
  document.getElementById("pause").textContent=state.running?"Ⅱ":"▶";
  document.getElementById("speed").textContent=state.speed+"×";
}

function dims(){
  const w=app.renderer.width/app.renderer.resolution;
  const h=app.renderer.height/app.renderer.resolution;
  return {w,h,entry:{x:w*.92,y:h*.82},door:{x:w*.72,y:h*.63},browse:{x:w*.62,y:h*.51},counter:{x:w*.53,y:h*.46},exit:{x:w*.9,y:h*.76}};
}

function gRect(x,y,w,h,color,alpha=1){
  const g=new PIXI.Graphics();
  g.rect(x,y,w,h).fill({color,alpha});
  return g;
}
function gPoly(points,color,alpha=1){
  const g=new PIXI.Graphics();
  g.poly(points).fill({color,alpha});
  return g;
}
function label(text,x,y,size=12,color=0xf3f1e7){
  const t=new PIXI.Text({text,style:{fontFamily:"Arial",fontSize:size,fill:color,fontWeight:"700"}});
  t.x=x;t.y=y;return t;
}

function buildWorld(){
  world.removeChildren();
  const {w,h}=dims();

  world.addChild(gRect(0,0,w,h,0x354038));
  for(let x=-h;x<w+h;x+=46){
    const line=new PIXI.Graphics();
    line.moveTo(x,0).lineTo(x-h*.28,h).stroke({color:0xd6ddd7,width:1,alpha:.14});
    world.addChild(line);
  }

  world.addChild(gPoly([0,h*.73,w*.34,h,w*.66,h,0,h*.45],0x252c27));
  world.addChild(gPoly([w*.56,h,w,h*.67,w,h*.89,w*.82,h],0x222824));

  const cx=w*.52,cy=h*.39,bw=Math.min(w*.54,640),bh=Math.min(h*.34,285),dx=bw*.19,dy=bh*.24;
  world.addChild(gPoly([cx-bw/2,cy,cx+bw/2-dx,cy-dy,cx+bw/2-dx,cy+bh-dy,cx-bw/2,cy+bh],0x89958d));
  world.addChild(gPoly([cx-bw/2,cy,cx-bw/2+dx,cy-dy,cx-bw/2+dx,cy+bh-dy,cx-bw/2,cy+bh],0x6c786f));
  world.addChild(gPoly([cx-bw/2,cy,cx-bw/2+dx,cy-dy,cx+bw/2,cy-dy,cx+bw/2-dx,cy],0xb7bcb6));

  world.addChild(gRect(cx+bw*.30,cy+bh*.31,Math.max(28,bw*.09),bh*.29,0xd7dad4));
  world.addChild(gRect(cx-bw*.47,cy+bh*.43,Math.max(25,bw*.08),bh*.22,0x303832));
  world.addChild(label("EMPIRE GREEN",cx+bw*.05,cy+bh*.39,Math.max(10,Math.min(16,w/70)),0x172019));

  const path=new PIXI.Graphics();
  const d=dims();
  path.moveTo(d.entry.x,d.entry.y).lineTo(d.door.x,d.door.y).lineTo(d.browse.x,d.browse.y).lineTo(d.counter.x,d.counter.y)
    .stroke({color:0xe5e8e2,width:4,alpha:.25});
  world.addChild(path);

  world.addChild(gRect(d.counter.x-20,d.counter.y-12,42,22,0x91a99a));
  world.addChild(label("POS",d.counter.x-10,d.counter.y-5,9,0x101612));

  queueLayer.removeChildren();
}

function makeGuest(){
  const d=dims();
  const body=new PIXI.Container();
  const dot=new PIXI.Graphics().circle(0,0,4).fill(0x80a489);
  const head=new PIXI.Graphics().circle(0,-6,3).fill(0xd4ad88);
  body.addChild(dot,head);
  body.x=d.entry.x;body.y=d.entry.y;
  peopleLayer.addChild(body);

  const g={
    id:nextGuest++,view:body,x:d.entry.x,y:d.entry.y,state:"arrive",
    budget:26+Math.random()*42,patience:12+Math.random()*18,wait:0,product:null
  };
  guests.push(g);
}

function chooseProduct(g){
  let best=null,score=-999;
  for(const [k,p] of Object.entries(PRODUCTS)){
    if(p.stock<1)continue;
    const pricePenalty=Math.max(0,p.price-g.budget)*.09;
    const s=p.appeal*2-pricePenalty+Math.random()*.35;
    if(s>score){score=s;best=k}
  }
  return best;
}

function moveTo(g,target,dt,speed=72){
  const dx=target.x-g.x,dy=target.y-g.y,dist=Math.hypot(dx,dy)||1,step=speed*dt;
  if(dist<=step){g.x=target.x;g.y=target.y;g.view.x=g.x;g.view.y=g.y;return true}
  g.x+=dx/dist*step;g.y+=dy/dist*step;g.view.x=g.x;g.view.y=g.y;return false;
}

function queue(){return guests.filter(g=>g.state==="queue").sort((a,b)=>a.id-b.id)}

function updateGuests(dt){
  const d=dims();
  for(const g of guests){
    if(g.state==="arrive"&&moveTo(g,d.door,dt)){g.state="browse";g.product=chooseProduct(g)}
    else if(g.state==="browse"&&moveTo(g,d.browse,dt,58)){
      if(!g.product){pushThought("Nothing I wanted was in stock.");state.lost++;g.state="leave"}
      else g.state="queue";
    }else if(g.state==="queue"){
      const q=queue(),idx=q.indexOf(g);
      const target={x:d.counter.x+idx*14,y:d.counter.y+idx*6};
      moveTo(g,target,dt,44);
      g.wait+=dt;
      if(g.wait>g.patience){pushThought("The line was too long, so I left.");state.lost++;state.rating=clamp(state.rating-.3,0,100);g.state="leave"}
    }else if(g.state==="leave"){
      if(moveTo(g,d.exit,dt,84)){g.state="gone";peopleLayer.removeChild(g.view)}
    }
  }
  for(let i=guests.length-1;i>=0;i--)if(guests[i].state==="gone")guests.splice(i,1);
}

function serve(){
  const q=queue();if(!q.length)return;
  const slots=Math.max(1,state.queueCapacity+Math.floor((state.budtenders-1)/2));
  for(let n=0;n<slots;n++){
    const g=queue()[0];if(!g)break;
    const p=PRODUCTS[g.product];
    if(!p||p.stock<1){pushThought("They sold out before I got to the counter.");state.lost++;g.state="leave";continue}
    p.stock-=1;state.cash+=p.price;state.revenue+=p.price;state.served++;
    pushThought("Got the "+p.name+" for $"+p.price+".");g.state="leave";
  }
}

function hourTick(){
  state.cash-=34 + state.budtenders*5.2;
  state.hour++;
  if(state.hour>=24){
    state.hour=0;state.day++;
    const total=Math.max(1,state.served+state.lost),success=state.served/total;
    if(success>.72)state.share=clamp(state.share+.05,0,60);
    if(success<.48)state.share=clamp(state.share-.06,0,60);
    state.served=0;state.lost=0;
  }
}

function simulate(dt){
  if(!state.running)return;
  spawnTimer+=dt*state.speed;
  serveTimer+=dt*state.speed;
  simHourTimer+=dt*state.speed;

  while(spawnTimer>1.2){spawnTimer-=1.2;if(guests.length<45)makeGuest()}
  while(serveTimer>1.6){serveTimer-=1.6;serve()}
  while(simHourTimer>2.5){simHourTimer-=2.5;hourTick()}
  updateGuests(dt*state.speed);
}

function productSheet(){
  return '<div class="scrim" data-close></div><section class="sheet"><div class="grab"></div><h2>Products</h2><div class="sub">Every product has its own stock, price and pull.</div>'+
  Object.entries(PRODUCTS).map(([k,p])=>'<div class="row"><div class="name"><b>'+p.name+'</b><small>Appeal '+Math.round(p.appeal*100)+'</small></div><div class="mini"><b>'+Math.floor(p.stock)+'</b>stock</div><div class="mini"><b>$'+p.price+'</b>price</div><div class="stepper"><button data-price="'+k+'" data-delta="-2">−</button><button data-price="'+k+'" data-delta="2">+</button></div></div>').join("")+
  '<button class="close" data-close>Close</button></section>';
}
function staffSheet(){
  return '<div class="scrim" data-close></div><section class="sheet"><div class="grab"></div><h2>Staff</h2><div class="sub">Staff changes physical throughput.</div>'+
  '<div class="card"><b>'+state.budtenders+' budtenders</b><small>More staff improves counter throughput.</small></div>'+
  '<button class="card" data-hire="bud"><b>Hire budtender — $900</b><small>$3,800/mo ongoing payroll</small></button>'+
  '<button class="close" data-close>Close</button></section>';
}
function buildSheet(){
  return '<div class="scrim" data-close></div><section class="sheet"><div class="grab"></div><h2>Build</h2><div class="sub">Change the physical business, not just a number.</div>'+
  '<button class="card" data-build="register"><b>Add checkout register — $18,000</b><small>Creates another service slot and shortens queues.</small></button>'+
  '<button class="close" data-close>Close</button></section>';
}
function thoughtsSheet(){
  return '<div class="scrim" data-close></div><section class="sheet"><div class="grab"></div><h2>Guest thoughts</h2>'+
  state.thoughts.map(t=>'<div class="card"><small>“'+t+'”</small></div>').join("")+
  '<button class="close" data-close>Close</button></section>';
}
function openSheet(type){sheetLayer.innerHTML=type==="products"?productSheet():type==="staff"?staffSheet():type==="build"?buildSheet():thoughtsSheet()}
function closeSheet(){sheetLayer.innerHTML=""}

document.getElementById("pause").onclick=()=>{state.running=!state.running;updateHUD()};
document.getElementById("speed").onclick=()=>{state.speed=state.speed===1?2:state.speed===2?4:1;updateHUD()};
document.getElementById("products").onclick=()=>openSheet("products");
document.getElementById("staff").onclick=()=>openSheet("staff");
document.getElementById("build").onclick=()=>openSheet("build");
thoughtEl.onclick=()=>openSheet("thoughts");

sheetLayer.addEventListener("click",e=>{
  if(e.target.closest("[data-close]")){closeSheet();return}
  const p=e.target.closest("[data-price]");
  if(p){const k=p.dataset.price;PRODUCTS[k].price=clamp(PRODUCTS[k].price+Number(p.dataset.delta),6,80);openSheet("products");return}
  const h=e.target.closest("[data-hire]");
  if(h&&state.cash>=900){state.cash-=900;state.budtenders++;pushThought("More staff just came on shift.");openSheet("staff");return}
  const b=e.target.closest("[data-build]");
  if(b&&b.dataset.build==="register"&&state.cash>=18000){state.cash-=18000;state.queueCapacity++;pushThought("The new checkout line is moving faster.");closeSheet();return}
});

async function boot(){
  try{
    app=new PIXI.Application();
    await app.init({resizeTo:host,backgroundColor:0x303a32,antialias:true,resolution:Math.min(devicePixelRatio||1,2),autoDensity:true});
    host.insertBefore(app.canvas,statusEl);
    world=new PIXI.Container();
    queueLayer=new PIXI.Container();
    peopleLayer=new PIXI.Container();
    app.stage.addChild(world,queueLayer,peopleLayer);
    buildWorld();
    app.renderer.on("resize",buildWorld);
    statusEl.textContent="Live store simulation";
    app.ticker.add(t=>{simulate(t.deltaMS/1000);updateHUD()});
    updateHUD();
  }catch(err){
    statusEl.textContent="Pixi error: "+(err&&err.message?err.message:String(err));
    statusEl.style.color="#e37d78";
  }
}
boot();
})();