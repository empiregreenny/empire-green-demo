(() => {
  "use strict";

  const PRODUCT_DEFS = {
    house:{name:"House Flower", price:36, cost:7, appeal:1.00, quality:76},
    premium:{name:"Premium Flower", price:48, cost:12, appeal:.75, quality:91},
    preroll:{name:"Pre-Roll", price:14, cost:5, appeal:.66, quality:72},
    vape:{name:"Vape", price:44, cost:11, appeal:.58, quality:80},
    edible:{name:"Edible", price:22, cost:6, appeal:.52, quality:78}
  };

  const BASE = {
    cash:220000, marketShare:7.8, rating:76, brandHeat:48, day:1, hour:8,
    lifetimeRevenue:0, peakHeat:48, running:true, speed:1,
    cropHours:20*24, cropYield:1750, materials:60,
    registers:1, flowerRooms:1, signLevel:1,
    staff:{budtenders:2,growers:2,ops:1},
    products:{
      house:{stock:1100,price:36,on:true},premium:{stock:380,price:48,on:true},
      preroll:{stock:210,price:14,on:true},vape:{stock:90,price:44,on:true},edible:{stock:120,price:22,on:true}
    },
    thoughts:["I came for the house flower."],
    metrics:{servedToday:0,lostToday:0,revenueToday:0,servedYesterday:0,lostYesterday:0,revenueYesterday:0}
  };

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const modalLayer = document.getElementById("modalLayer");
  const gameOverLayer = document.getElementById("gameOverLayer");
  const cashStat = document.getElementById("cashStat");
  const shareStat = document.getElementById("shareStat");
  const ratingStat = document.getElementById("ratingStat");
  const dayStat = document.getElementById("dayStat");
  const pauseBtn = document.getElementById("pauseBtn");
  const speedBtn = document.getElementById("speedBtn");
  const thoughtButton = document.getElementById("thoughtButton");
  const notice = document.getElementById("notice");

  let s = deepClone(BASE);
  let guests = [];
  let nextGuestId = 1;
  let simAccumulator = 0;
  let lastTs = performance.now();
  let reportHorizon = 30;
  let frozen = false;

  function deepClone(v){ return JSON.parse(JSON.stringify(v)); }
  function clamp(n,a,b){ return Math.max(a,Math.min(b,n)); }
  function money(n){ return "$"+Math.round(n).toLocaleString(); }
  function stockTotal(st=s){ return Object.keys(st.products).reduce((a,k)=>a+st.products[k].stock,0); }
  function monthlyPayroll(st=s){ return st.staff.budtenders*3800 + st.staff.growers*4200 + st.staff.ops*4100; }
  function hourlyOverhead(st=s){ return (11800 + monthlyPayroll(st))/720; }
  function serviceCapacityPerHour(st=s){ return st.registers*3.2 + Math.max(0,st.staff.budtenders-1)*1.15; }
  function demandRate(st=s){ return .42 + st.marketShare*.018 + st.brandHeat*.006 + (st.signLevel-1)*.12; }
  function cropEtaHours(st=s){ return Math.max(0,st.cropHours); }

  function resize(){
    const r=canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2);
    canvas.width=Math.max(1,Math.round(r.width*dpr));
    canvas.height=Math.max(1,Math.round(r.height*dpr));
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  window.addEventListener("resize",resize);resize();

  function world(){
    const w=canvas.clientWidth,h=canvas.clientHeight;
    return {w,h,entry:{x:w*.92,y:h*.82},door:{x:w*.73,y:h*.62},counter:{x:w*.56,y:h*.49},exit:{x:w*.91,y:h*.76}};
  }

  function pushThought(text){ s.thoughts.unshift(text); s.thoughts=s.thoughts.slice(0,14); thoughtButton.textContent="Guests: “"+text+"”"; }
  function showNotice(text){ notice.textContent=text;notice.classList.add("show");setTimeout(()=>notice.classList.remove("show"),1500); }

  function chooseProduct(g){
    const keys=Object.keys(PRODUCT_DEFS).filter(k=>s.products[k].on && s.products[k].stock>=1);
    if(!keys.length)return null;
    let best=null,bestScore=-999;
    for(const k of keys){
      const d=PRODUCT_DEFS[k],p=s.products[k];
      const pricePenalty=Math.max(0,p.price-g.budget)*.08;
      const qualityFit=1-Math.abs(d.quality-g.qualityPref)/100;
      const trendFit=1-Math.abs((k==="premium"||k==="vape"?85:55)-g.trendPref)/100;
      const score=d.appeal*1.7+qualityFit*.9+trendFit*.55-pricePenalty+Math.random()*.28;
      if(score>bestScore){bestScore=score;best=k;}
    }
    return best;
  }

  function spawnGuest(){
    if(guests.length>60)return;
    const p=world();
    guests.push({
      id:nextGuestId++,x:p.entry.x,y:p.entry.y,state:"arrive",product:null,
      budget:24+Math.random()*42,qualityPref:55+Math.random()*45,trendPref:Math.random()*100,
      patience:18+Math.random()*22,wait:0,spent:0,thought:""
    });
  }

  function moveToward(g,t,dt,speed=56){
    const dx=t.x-g.x,dy=t.y-g.y,d=Math.hypot(dx,dy)||1,step=speed*dt;
    if(d<=step){g.x=t.x;g.y=t.y;return true}
    g.x+=dx/d*step;g.y+=dy/d*step;return false;
  }

  function queueGuests(){ return guests.filter(g=>g.state==="queue").sort((a,b)=>a.id-b.id); }

  function serveOne(){
    const q=queueGuests(); if(!q.length)return;
    const g=q[0],k=g.product;
    if(!k || s.products[k].stock<1){
      g.thought="They sold out before I got there.";pushThought(g.thought);s.metrics.lostToday++;g.state="leave";return;
    }
    s.products[k].stock-=1;s.cash+=s.products[k].price;s.lifetimeRevenue+=s.products[k].price;
    s.metrics.revenueToday+=s.products[k].price;s.metrics.servedToday++;g.spent=s.products[k].price;
    g.thought="Got the "+PRODUCT_DEFS[k].name+" for $"+s.products[k].price+".";pushThought(g.thought);g.state="leave";
  }

  function updateGuests(dt){
    const p=world();
    for(const g of guests){
      if(g.state==="arrive" && moveToward(g,p.door,dt)){
        g.product=chooseProduct(g);
        if(!g.product){g.thought="Nothing on the menu for me.";pushThought(g.thought);s.metrics.lostToday++;g.state="leave"}
        else g.state="queue";
      } else if(g.state==="queue"){
        const q=queueGuests(),idx=q.indexOf(g),target={x:p.counter.x+idx*13,y:p.counter.y+idx*5};
        moveToward(g,target,dt,34);g.wait+=dt;
        if(g.wait>g.patience){g.thought="I bailed. The line was too slow.";pushThought(g.thought);s.metrics.lostToday++;g.state="leave";s.rating=clamp(s.rating-.35,0,100)}
      } else if(g.state==="leave"){
        if(moveToward(g,p.exit,dt,64))g.state="gone";
      }
    }
    guests=guests.filter(g=>g.state!=="gone");
  }

  function processHour(){
    s.cash-=hourlyOverhead();s.cropHours--;
    if(s.cropHours<=0){
      const yieldAmt=Math.round(s.cropYield*s.flowerRooms);
      s.products.house.stock+=Math.round(yieldAmt*.72);s.products.premium.stock+=Math.round(yieldAmt*.28);
      s.materials=Math.max(0,s.materials-10*s.flowerRooms);s.cropHours=20*24;
      pushThought("Fresh harvest just hit the menu.");showNotice("HARVEST +"+yieldAmt+" flower units");s.brandHeat=clamp(s.brandHeat+2,0,100);
    }
    s.hour++;
    if(s.hour>=24){
      s.hour=0;s.day++;
      s.metrics.servedYesterday=s.metrics.servedToday;s.metrics.lostYesterday=s.metrics.lostToday;s.metrics.revenueYesterday=s.metrics.revenueToday;
      s.metrics.servedToday=0;s.metrics.lostToday=0;s.metrics.revenueToday=0;
      const served=s.metrics.servedYesterday,lost=s.metrics.lostYesterday,total=Math.max(1,served+lost),sat=served/total;
      s.rating=clamp(s.rating+(sat-.72)*3,0,100);
      if(sat>.78&&stockTotal()>250)s.marketShare=clamp(s.marketShare+.05,0,60);
      if(sat<.48)s.marketShare=clamp(s.marketShare-.08,0,60);
      s.brandHeat=clamp(s.brandHeat-.08,0,100);s.peakHeat=Math.max(s.peakHeat,s.brandHeat);
    }
    if(s.cash<=-333333)gameOver();
  }

  function simStep(dt){
    if(!s.running||frozen)return;
    updateGuests(dt);simAccumulator+=dt*s.speed;
    while(simAccumulator>=1){
      if(Math.random()<Math.min(.95,demandRate()))spawnGuest();
      const serves=Math.max(0,Math.floor(serviceCapacityPerHour()/2));
      for(let i=0;i<serves;i++)serveOne();
      processHour();simAccumulator-=1;
    }
  }

  function drawIsoBuilding(p){
    const w=p.w,h=p.h,cx=w*.53,cy=h*.42,bw=Math.min(w*.48,520),bh=Math.min(h*.32,245),dx=bw*.19,dy=bh*.25;
    ctx.fillStyle="#8f9991";ctx.beginPath();ctx.moveTo(cx-bw/2,cy);ctx.lineTo(cx+bw/2-dx,cy-dy);ctx.lineTo(cx+bw/2-dx,cy+bh-dy);ctx.lineTo(cx-bw/2,cy+bh);ctx.closePath();ctx.fill();
    ctx.fillStyle="#6e7971";ctx.beginPath();ctx.moveTo(cx-bw/2,cy);ctx.lineTo(cx-bw/2+dx,cy-dy);ctx.lineTo(cx-bw/2+dx,cy+bh-dy);ctx.lineTo(cx-bw/2,cy+bh);ctx.closePath();ctx.fill();
    ctx.fillStyle="#b7bcb6";ctx.beginPath();ctx.moveTo(cx-bw/2,cy);ctx.lineTo(cx-bw/2+dx,cy-dy);ctx.lineTo(cx+bw/2,cy-dy);ctx.lineTo(cx+bw/2-dx,cy);ctx.closePath();ctx.fill();
    ctx.fillStyle="#1a251d";ctx.font="800 12px system-ui";ctx.fillText("EMPIRE GREEN",cx+bw*.08,cy+bh*.42);
    ctx.fillStyle="#303832";ctx.fillRect(cx-bw*.47,cy+bh*.42,Math.max(22,bw*.08),bh*.22);
    ctx.fillStyle="#d6d8d4";ctx.fillRect(cx+bw*.29,cy+bh*.34,Math.max(28,bw*.1),bh*.28);
  }

  function draw(){
    const p=world(),w=p.w,h=p.h;ctx.clearRect(0,0,w,h);
    ctx.fillStyle="#374139";ctx.fillRect(0,0,w,h);
    ctx.save();ctx.globalAlpha=.22;ctx.strokeStyle="#d9ddd8";ctx.lineWidth=1;
    for(let x=-h;x<w+h;x+=42){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x-h*.28,h);ctx.stroke()}ctx.restore();
    ctx.fillStyle="#262d28";ctx.beginPath();ctx.moveTo(0,h*.76);ctx.lineTo(w*.36,h);ctx.lineTo(w*.72,h);ctx.lineTo(0,h*.47);ctx.closePath();ctx.fill();
    ctx.fillStyle="#242a26";ctx.beginPath();ctx.moveTo(w*.58,h);ctx.lineTo(w,h*.68);ctx.lineTo(w,h*.88);ctx.lineTo(w*.82,h);ctx.closePath();ctx.fill();
    drawIsoBuilding(p);

    ctx.strokeStyle="#d3d8d24d";ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(p.entry.x,p.entry.y);ctx.lineTo(p.door.x,p.door.y);ctx.lineTo(p.counter.x,p.counter.y);ctx.stroke();
    ctx.fillStyle="#101713cc";ctx.fillRect(8,8,118,47);ctx.fillStyle="#dce5dd";ctx.font="700 10px system-ui";ctx.fillText("FRONT / RETAIL",16,24);ctx.fillStyle="#9fac9f";ctx.font="9px system-ui";ctx.fillText(queueGuests().length+" waiting • "+s.metrics.servedToday+" served",16,41);
    ctx.fillStyle="#101713cc";ctx.fillRect(8,h-72,125,47);ctx.fillStyle="#dce5dd";ctx.font="700 10px system-ui";ctx.fillText("REAR / OPERATIONS",16,h-56);ctx.fillStyle="#9fac9f";ctx.font="9px system-ui";ctx.fillText(Math.ceil(cropEtaHours()/24)+"d harvest • "+s.materials+" mat.",16,h-39);

    for(const g of guests){
      ctx.fillStyle=g.state==="queue"?"#d2b66e":g.state==="leave"?"#89958c":"#80a489";
      ctx.beginPath();ctx.arc(g.x,g.y,4.2,0,Math.PI*2);ctx.fill();ctx.fillStyle="#d7b18b";ctx.beginPath();ctx.arc(g.x,g.y-5,2.7,0,Math.PI*2);ctx.fill();
    }
    ctx.fillStyle="#91a99a";ctx.fillRect(p.counter.x-12,p.counter.y-9,28,16);ctx.fillStyle="#0f1712";ctx.font="8px system-ui";ctx.fillText("POS",p.counter.x-7,p.counter.y+2);
    if(s.signLevel>1){ctx.fillStyle="#d5c889";ctx.fillRect(w*.72,h*.25,72,20);ctx.fillStyle="#172018";ctx.font="700 8px system-ui";ctx.fillText("HOUSE DROPS",w*.735,h*.265)}
  }

  function updateHUD(){
    cashStat.textContent=money(s.cash);shareStat.textContent=s.marketShare.toFixed(1)+"%";ratingStat.textContent=Math.round(s.rating);
    dayStat.textContent=s.day+" / "+String(s.hour).padStart(2,"0")+":00";pauseBtn.textContent=s.running?"Ⅱ":"▶";speedBtn.textContent=s.speed+"×";
    thoughtButton.textContent="Guests: “"+(s.thoughts[0]||"Watching the menu.")+"”";
  }

  function frame(ts){const dt=Math.min(.05,(ts-lastTs)/1000);lastTs=ts;simStep(dt);updateHUD();draw();requestAnimationFrame(frame)}

  function card(label,value,small=""){return '<div class="card"><span>'+label+'</span><b>'+value+'</b>'+(small?'<small>'+small+'</small>':'')+'</div>'}
  function closePanel(){modalLayer.innerHTML=""}
  function openPanel(name){modalLayer.innerHTML='<div class="scrim" data-close></div>'+panelHtml(name)}
  function panelHtml(name){
    if(name==="products"){
      return '<section class="panel"><div class="grab"></div><h2>Products</h2><div class="sub">Each offering has its own price, demand and stock.</div>'+Object.keys(PRODUCT_DEFS).map(k=>{
        const d=PRODUCT_DEFS[k],p=s.products[k],margin=p.price-d.cost;
        return '<div class="row"><div class="name"><b>'+d.name+'</b><small>Quality '+d.quality+' • margin '+money(margin)+'</small></div><div class="mini"><b>'+Math.floor(p.stock)+'</b>stock</div><div class="mini"><b>$'+p.price+'</b>price</div><div class="stepper"><button data-price="'+k+'" data-delta="-2">−</button><button data-price="'+k+'" data-delta="2">+</button></div></div>';
      }).join("")+'<button class="close-wide" data-close>Close</button></section>';
    }
    if(name==="staff"){
      return '<section class="panel"><div class="grab"></div><h2>Staff</h2><div class="sub">More staff improves throughput but adds recurring payroll.</div><div class="grid">'+
      card("Budtenders",s.staff.budtenders,"$3,800/mo each")+card("Growers",s.staff.growers,"$4,200/mo each")+card("Ops",s.staff.ops,"$4,100/mo each")+card("Registers",s.registers,"Capacity "+serviceCapacityPerHour().toFixed(1)+"/hr")+card("Payroll",money(monthlyPayroll())+"/mo")+card("Queue",queueGuests().length)+
      '</div><button class="action-card" data-action="hireBud"><b>Hire budtender — $900 onboarding</b><small>+1.15 customers/hour. Recurring salary $3,800/mo.</small></button><button class="action-card" data-action="hireGrow"><b>Hire grower — $900 onboarding</b><small>Recurring salary $4,200/mo.</small></button><button class="close-wide" data-close>Close</button></section>';
    }
    if(name==="build"){
      return '<section class="panel"><div class="grab"></div><h2>Build / Improve</h2><div class="sub">Spend to alter the physical business.</div>'+buildButton("register","Add checkout register","$18,000","More service throughput; reduces abandonment",s.registers>=3)+buildButton("flowerRoom","Build Flower Room II","$52,000","Doubles harvest capacity",s.flowerRooms>=2)+buildButton("sign","Upgrade exterior signage","$9,000","More walk-in demand and brand heat",s.signLevel>=2)+'<button class="close-wide" data-close>Close</button></section>';
    }
    if(name==="thoughts"){
      return '<section class="panel"><div class="grab"></div><h2>Guest thoughts</h2><div class="sub">Use these to diagnose the business.</div>'+s.thoughts.map(t=>'<div class="thought">“'+t+'”</div>').join("")+'<button class="close-wide" data-close>Close</button></section>';
    }
    if(name==="reports"||name==="finance"){
      const p=projection(reportHorizon);
      return '<section class="panel"><div class="grab"></div><h2>Company reports</h2><div class="tabs">'+[30,60,90].map(d=>'<button class="'+(d===reportHorizon?'active':'')+'" data-horizon="'+d+'">'+d+' days</button>').join("")+'</div><div class="grid">'+card("Projected cash",money(p.cash))+card("Net change",(p.delta>=0?"+":"")+money(p.delta))+card("Revenue",money(p.revenue))+card("Menu stock",Math.round(p.stock))+card("Rating",Math.round(p.rating))+card("Market share",p.share.toFixed(1)+"%")+card("Daily guests",Math.round(p.dailyGuests))+card("Capacity/day",Math.round(p.capacityDay))+card("Next harvest",Math.ceil(cropEtaHours()/24)+"d")+'</div><button class="close-wide" data-close>Close</button></section>';
    }
    return '<section class="panel"><div class="grab"></div><h2>Empire Green</h2><button data-close>Close</button></section>';
  }

  function buildButton(action,title,cost,desc,disabled){return '<button class="action-card '+(disabled?'good':'')+'" data-action="'+action+'" '+(disabled?'disabled':'')+'><b>'+title+' — '+(disabled?'BUILT':cost)+'</b><small>'+desc+'</small></button>'}

  function projection(days){
    const dailyGuests=demandRate()*24,cap=serviceCapacityPerHour()*24,served=Math.min(dailyGuests,cap);
    let avgPrice=0,weight=0;
    for(const k of Object.keys(PRODUCT_DEFS)){const d=PRODUCT_DEFS[k],p=s.products[k];avgPrice+=p.price*d.appeal;weight+=d.appeal}
    avgPrice/=weight;
    const dailyRevenue=served*avgPrice*.83,dailyCost=hourlyOverhead()*24,delta=(dailyRevenue-dailyCost)*days;
    const harvests=Math.floor((days*24+(20*24-s.cropHours))/(20*24));
    const stock=Math.max(0,stockTotal()-served*days+harvests*s.cropYield*s.flowerRooms);
    return {cash:s.cash+delta,delta,revenue:dailyRevenue*days,stock,rating:clamp(s.rating+(served/Math.max(1,dailyGuests)-.72)*days*.12,0,100),share:clamp(s.marketShare+(served/Math.max(1,dailyGuests)>.78?days*.008:-days*.01),0,60),dailyGuests,capacityDay:cap};
  }

  function spend(cost,label){
    if(s.cash-cost<=-333333){showNotice("Too much debt risk");return false}
    const p=projection(30);
    if(cost>50000&&p.cash-cost<50000){
      if(!confirm(label+" costs "+money(cost)+". This will leave about "+money(s.cash-cost)+" cash before operations. Proceed?"))return false
    }
    s.cash-=cost;return true;
  }

  function action(a){
    if(a==="pause"){s.running=!s.running;return}
    if(a==="speed"){s.speed=s.speed===1?2:s.speed===2?4:1;return}
    if(a==="hireBud"&&spend(900,"Budtender")){s.staff.budtenders++;showNotice("Budtender hired");openPanel("staff");return}
    if(a==="hireGrow"&&spend(900,"Grower")){s.staff.growers++;showNotice("Grower hired");openPanel("staff");return}
    if(a==="register"&&s.registers<3&&spend(18000,"Checkout register")){s.registers++;showNotice("Register added");closePanel();return}
    if(a==="flowerRoom"&&s.flowerRooms<2&&spend(52000,"Flower Room II")){s.flowerRooms=2;s.cropYield=1850;showNotice("Flower Room II online");closePanel();return}
    if(a==="sign"&&s.signLevel<2&&spend(9000,"Exterior signage")){s.signLevel=2;s.brandHeat=clamp(s.brandHeat+8,0,100);showNotice("Signage upgraded");closePanel();return}
  }

  document.addEventListener("click",e=>{
    const p=e.target.closest("[data-panel]");if(p){openPanel(p.dataset.panel);return}
    const a=e.target.closest("[data-action]");if(a){if(a.dataset.action==="restart"){restart();return}action(a.dataset.action);return}
  });

  modalLayer.addEventListener("click",e=>{
    if(e.target.closest("[data-close]")){closePanel();return}
    const p=e.target.closest("[data-price]");if(p){const k=p.dataset.price,delta=Number(p.dataset.delta);s.products[k].price=clamp(s.products[k].price+delta,6,80);openPanel("products");return}
    const h=e.target.closest("[data-horizon]");if(h){reportHorizon=Number(h.dataset.horizon);openPanel("reports");return}
    const a=e.target.closest("[data-action]");if(a){action(a.dataset.action);return}
  });

  function gameOver(){s.running=false;gameOverLayer.innerHTML='<section class="toasted"><h1>TOASTED</h1><p>EMPIRE GREEN IS INSOLVENT<br><br>DAYS SURVIVED '+s.day+'<br>MARKET SHARE '+s.marketShare.toFixed(1)+'%<br>LIFETIME REVENUE '+money(s.lifetimeRevenue)+'<br>PEAK HEAT '+Math.round(s.peakHeat)+'</p><button data-action="restart">Start over</button></section>'}
  function restart(){s=deepClone(BASE);guests=[];nextGuestId=1;gameOverLayer.innerHTML="";closePanel();pushThought("New company opened.")}

  document.addEventListener("visibilitychange",()=>{frozen=document.hidden});
  pushThought(BASE.thoughts[0]);requestAnimationFrame(frame);
})();