(() => {
  "use strict";

  const BASE = {
    cash: 220000,
    lifetimeRevenue: 0,
    day: 1,
    marketShare: 7.8,
    satisfaction: 76,
    brandHeat: 48,
    price: 38,
    inventory: { flower: 1700, processed: 280, limited: 0 },
    cropDay: 43,
    cropLength: 63,
    materials: 55,
    queue: 3,
    staff: { retail: 2, grow: 2, ops: 1 },
    managers: { retail: false, ops: false, brand: false, rnd: false },
    upgrades: { express: false, flower2: false },
    growFocus: "balanced",
    rndWins: 0,
    rndProgress: 0,
    running: true,
    speed: 1,
    peakHeat: 48
  };

  const app = document.getElementById("app");
  const stage = document.getElementById("stage");
  const panelLayer = document.getElementById("panelLayer");
  const gameOverLayer = document.getElementById("gameOverLayer");
  const toastEl = document.getElementById("toast");
  const cashValue = document.getElementById("cashValue");
  const shareValue = document.getElementById("shareValue");
  const outlookValue = document.getElementById("outlookValue");
  const pauseBtn = document.getElementById("pauseBtn");
  const speedBtn = document.getElementById("speedBtn");

  let state = clone(BASE);
  let scene = "property";
  let horizon = 30;
  let toastTimer = null;
  let frozenForVisibility = false;

  function clone(v){ return JSON.parse(JSON.stringify(v)); }
  function clamp(n,a,b){ return Math.max(a,Math.min(b,n)); }
  function money(n){ return "$" + Math.round(n).toLocaleString(); }
  function totalStock(s=state){ return Math.round(s.inventory.flower+s.inventory.processed+s.inventory.limited); }
  function daysToHarvest(s=state){ return Math.max(0,s.cropLength-s.cropDay); }
  function dailyFixed(s=state){
    // All staff labels are monthly salaries; convert them to daily burn here.
    const staffPayroll = (
      s.staff.retail*3800 +
      s.staff.grow*4200 +
      s.staff.ops*4100
    ) / 30;
    const managerPayroll = (
      (s.managers.retail ? 4300 : 0) +
      (s.managers.ops ? 4350 : 0) +
      (s.managers.brand ? 4200 : 0) +
      (s.managers.rnd ? 4600 : 0)
    ) / 30;
    const rentUtilitiesCompliance = 11800 / 30;
    return rentUtilitiesCompliance + staffPayroll + managerPayroll;
  }
  function retailCapacity(s=state){
    return s.staff.retail*34 + (s.upgrades.express ? 24 : 0) + (s.managers.retail ? 14 : 0);
  }
  function demandPerDay(s=state){
    const priceEffect = (40-s.price)*1.45;
    const brand = s.brandHeat*.42;
    const share = s.marketShare*1.7;
    const sat = (s.satisfaction-70)*.5;
    return Math.max(18, 31 + brand + share + priceEffect + sat);
  }
  function avgUnitRevenue(s=state){
    const mixTotal = Math.max(1,totalStock(s));
    const pf = s.inventory.flower/mixTotal;
    const pp = s.inventory.processed/mixTotal;
    const pl = s.inventory.limited/mixTotal;
    return s.price*(pf + pp*1.28 + pl*1.62);
  }
  function harvestYield(s=state){
    let y = s.upgrades.flower2 ? 3100 : 1700;
    if(s.growFocus==="yield") y*=1.16;
    if(s.growFocus==="quality") y*=.88;
    return Math.round(y);
  }

  function deterministicDay(s){
    const demand = demandPerDay(s);
    const capacity = retailCapacity(s);
    const queuePressure = Math.max(0,demand-capacity);
    s.queue = clamp(Math.round(queuePressure/8),0,14);

    let sellable = totalStock(s);
    const unitsSold = Math.min(sellable, Math.min(demand, capacity + 18));
    let remain = unitsSold;

    const limitedSold = Math.min(s.inventory.limited, remain*.10);
    s.inventory.limited -= limitedSold; remain -= limitedSold;
    const processedSold = Math.min(s.inventory.processed, remain*.24);
    s.inventory.processed -= processedSold; remain -= processedSold;
    const flowerSold = Math.min(s.inventory.flower, remain);
    s.inventory.flower -= flowerSold;

    const revenue = flowerSold*s.price + processedSold*s.price*1.28 + limitedSold*s.price*1.62;
    s.cash += revenue - dailyFixed(s);
    s.lifetimeRevenue += revenue;

    if(sellable < demand*5) s.satisfaction -= .45;
    else if(s.queue >= 8) s.satisfaction -= .28;
    else if(s.queue <= 3) s.satisfaction += .08;
    s.satisfaction = clamp(s.satisfaction,0,100);

    s.cropDay++;
    if(s.cropDay >= s.cropLength){
      if(s.materials >= 12){
        s.inventory.flower += harvestYield(s);
        s.materials -= 12;
      }
      s.cropDay = 0;
    }

    if(s.rndProgress>0){
      s.rndProgress++;
      if(s.rndProgress>=12){
        s.rndProgress = 0;
        s.rndWins++;
        s.brandHeat = clamp(s.brandHeat+4,0,100);
        s.inventory.limited += 120;
      }
    }

    if(s.managers.ops && s.materials < 18 && s.cash > 1800){
      s.cash -= 1800;
      s.materials += 45;
    }

    const stockDays = totalStock(s)/Math.max(1,demand);
    if(stockDays>14 && s.satisfaction>75) s.marketShare += .015;
    if(stockDays<3 || s.satisfaction<55) s.marketShare -= .025;
    s.marketShare = clamp(s.marketShare,0,60);
    s.brandHeat = clamp(s.brandHeat-.025,0,100);
    s.peakHeat = Math.max(s.peakHeat,s.brandHeat);
    s.day++;
    return {revenue,unitsSold};
  }

  function project(days){
    const p = clone(state);
    const startCash = p.cash;
    const startRevenue = p.lifetimeRevenue;
    let harvests = 0;
    for(let i=0;i<days;i++){
      const before = p.cropDay;
      deterministicDay(p);
      if(p.cropDay < before) harvests++;
      if(p.cash<=-333333) break;
    }
    const demand = demandPerDay(p);
    const coverage = totalStock(p)/Math.max(1,demand);
    let bottleneck = "Demand generation";
    if(coverage<7) bottleneck="Inventory";
    else if(p.queue>=7) bottleneck="Retail throughput";
    else if(p.materials<20) bottleneck="Materials";
    else if(!p.managers.ops || !p.managers.retail) bottleneck="Management bandwidth";
    else if(!p.upgrades.flower2) bottleneck="Cultivation capacity";
    return {
      cash:p.cash, cashDelta:p.cash-startCash, revenue:p.lifetimeRevenue-startRevenue,
      flower:p.inventory.flower, processed:p.inventory.processed, limited:p.inventory.limited,
      coverage, harvests, satisfaction:p.satisfaction, heat:p.brandHeat, share:p.marketShare,
      queue:p.queue, bottleneck
    };
  }

  function businessStatus(){
    const p=project(30);
    if(p.cash<=-250000 || p.coverage<2 || p.satisfaction<45) return ["Risk","bad"];
    if(p.coverage<8 || p.queue>=7 || p.cashDelta < -25000) return ["Pressure","warn"];
    return ["Growing","good"];
  }

  function projectedNet(days=30, candidate=state){
    const original = state;
    state = candidate;
    const p = project(days);
    state = original;
    return p.cashDelta;
  }

  function impactText(candidate, cost=0){
    const net = projectedNet(30,candidate);
    const afterCash = candidate.cash;
    const sign = net >= 0 ? "+" : "";
    return "Cash " + money(afterCash) + " • 30D " + sign + money(net);
  }

  function confirmRiskyPurchase(candidate, label, cost){
    const p = (() => {
      const original = state;
      state = candidate;
      const result = project(30);
      state = original;
      return result;
    })();
    const risky = p.cashDelta < -45000 || p.cash < 50000 || p.coverage < 4;
    if(!risky) return true;
    return window.confirm(
      label + " may strain the business.\n\n" +
      "Cost now: " + money(cost) + "\n" +
      "30-day cash: " + money(p.cash) + "\n" +
      "30-day change: " + (p.cashDelta>=0?"+":"") + money(p.cashDelta) + "\n" +
      "Stock coverage: " + Math.round(p.coverage) + " days\n\n" +
      "Proceed?"
    );
  }

  function showToast(msg){
    clearTimeout(toastTimer);
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    toastTimer=setTimeout(()=>toastEl.classList.remove("show"),1600);
  }

  function updateHUD(){
    cashValue.textContent = money(state.cash);
    shareValue.textContent = state.marketShare.toFixed(1)+"%";
    const [label,cls]=businessStatus();
    outlookValue.textContent=label;
    outlookValue.className=cls;
    pauseBtn.textContent=state.running?"Pause":"Run";
    speedBtn.textContent=state.speed+"× speed";
  }

  function currentSignal(){
    const p=project(30);
    if(totalStock()<350) return ["Stock pressure",Math.round(p.coverage)+" projected days of coverage"];
    if(daysToHarvest()<=6) return ["Harvest approaching",daysToHarvest()+" days • +"+harvestYield()+" flower expected"];
    if(state.queue>=7) return ["Front queue growing","Retail capacity is constraining demand"];
    return ["Likely next constraint",p.bottleneck];
  }

  function peopleMarkup(){
    const count=clamp(state.queue+3,3,10);
    return Array.from({length:count},(_,i)=>{
      const left=8+(i%5)*17, top=12+Math.floor(i/5)*42+(i%2)*8;
      return '<button class="person" data-open="customer" aria-label="Inspect customer" style="left:'+left+'%;top:'+top+'%"></button>';
    }).join("");
  }

  function propertyMarkup(){
    const [sig,sub]=currentSignal();
    return '<section class="property">'+
      '<div class="parking-lines"></div><div class="road road--rear"></div><div class="road road--front"></div>'+
      '<div class="site">'+
        '<div class="building"><div class="building__rear"></div><div class="building__front"></div><div class="building__roof"></div><div class="building__second"></div>'+
        '<div class="roof-unit ru1"></div><div class="roof-unit ru2"></div><div class="roof-unit ru3"></div><div class="loading-bay"></div><div class="brand-sign">EMPIRE GREEN</div></div>'+
        '<button class="hotspot hotspot--grow" data-room="grow">Grow<small>'+daysToHarvest()+'d to harvest</small></button>'+
        '<button class="hotspot hotspot--ops" data-room="ops">Backend<small>'+state.materials+' materials</small></button>'+
        '<button class="hotspot hotspot--retail" data-room="retail">Retail<small>'+state.queue+' queue</small></button>'+
        '<button class="hotspot hotspot--brand" data-room="brand">Brand<small>'+Math.round(state.brandHeat)+' heat</small></button>'+
        '<button class="hotspot hotspot--rd" data-room="rnd">R&D<small>'+state.rndWins+' wins</small></button>'+
      '</div>'+
      '<div class="vehicle car"></div><div class="vehicle truck"><span class="cab"></span></div>'+
      '<div class="people">'+peopleMarkup()+'</div>'+
      '<button class="signal" data-open="outlook"><b>'+sig+'</b><span>'+sub+'</span></button>'+
      '<button class="chat-btn" data-open="feed" aria-label="Open customer feed">CHAT</button>'+
    '</section>';
  }

  function actionButton(action,label,sub,disabled=false){
    return '<button class="action-btn" data-action="'+action+'" '+(disabled?'disabled':'')+'><b>'+label+'</b><small>'+sub+'</small></button>';
  }

  function roomMarkup(name){
    let title="",sub="",world="",actions="";
    if(name==="retail"){
      title="Retail floor"; sub="Price, flow and staffing change demand in real time";
      world='<div class="room-floor"></div>'+
        '<div class="fixture" style="left:7%;top:14%;width:23%">MENU<small>$'+state.price+' / unit</small></div>'+
        '<div class="fixture" style="left:39%;top:46%;width:24%">MAIN COUNTER<small>'+state.staff.retail+' budtenders</small></div>'+
        '<div class="fixture" style="right:7%;top:15%;width:22%">'+(state.upgrades.express?'EXPRESS':'ENTRY')+'<small>queue '+state.queue+'</small></div>'+
        '<div class="people" style="right:9%;bottom:11%;width:70%;height:36%">'+peopleMarkup()+'</div>';
      actions=actionButton("priceDown","Price −$2","Demand ↑ • margin ↓",state.price<=24)+
        actionButton("priceUp","Price +$2","Margin ↑ • resistance ↑",state.price>=60)+
        actionButton("hireRetail","Hire budtender","$900 onboarding • $3,800/mo")+
        actionButton("express",state.upgrades.express?"Express active":"Build express",state.upgrades.express?"Queue relief online":"$18,000 • capacity +24",state.upgrades.express);
    }
    if(name==="grow"){
      title="Flower room"; sub="Capacity, harvest timing and quality are tied together";
      world='<div class="room-floor"></div>'+
        Array.from({length:18},(_,i)=>'<div class="plant" style="left:'+(10+(i%6)*14)+'%;top:'+(19+Math.floor(i/6)*25)+'%"></div>').join("")+
        '<div class="fixture" style="right:5%;top:8%;width:24%">HARVEST<small>'+daysToHarvest()+' days • '+harvestYield()+' units</small></div>'+
        '<div class="worker" style="left:18%;top:76%"></div>';
      actions=actionButton("focusBalanced","Balanced",state.growFocus==="balanced"?"Active":"Standard yield / heat",state.growFocus==="balanced")+
        actionButton("focusQuality","Quality push",state.growFocus==="quality"?"Active":"Yield −12% • heat +",state.growFocus==="quality")+
        actionButton("focusYield","Yield push",state.growFocus==="yield"?"Active":"Yield +16% • heat −",state.growFocus==="yield")+
        actionButton("flower2",state.upgrades.flower2?"Flower II online":"Build Flower II",state.upgrades.flower2?"Capacity expanded":"$52,000 • nearly 2× harvest",state.upgrades.flower2);
    }
    if(name==="ops"){
      title="Backend operations"; sub="Packaging, materials and product mix live here";
      world='<div class="room-floor"></div>'+
        '<div class="fixture" style="left:7%;top:15%;width:26%">DRY / CURE<small>'+Math.round(state.inventory.flower)+' flower</small></div>'+
        '<div class="fixture" style="left:38%;top:47%;width:26%">PACKAGING<small>'+state.materials+' materials</small></div>'+
        '<div class="fixture" style="right:7%;top:15%;width:22%">DOCK<small>'+(state.managers.ops?"managed":"manual")+'</small></div>'+
        '<div class="worker" style="left:69%;top:69%"></div>';
      actions=actionButton("materials","Order materials","$1,800 • +45 materials")+
        actionButton("process","Process 200 flower","→ 145 processed • higher revenue",state.inventory.flower<200)+
        actionButton("hireOps",state.managers.ops?"Ops lead hired":"Hire Ops lead",state.managers.ops?"Auto-restock materials":"$1,200 onboarding • $4,350/mo",state.managers.ops);
    }
    if(name==="brand"){
      title="Brand / market"; sub="Heat brings traffic. Traffic creates operational pressure.";
      world='<div class="room-floor"></div>'+
        '<div class="fixture" style="left:8%;top:17%;width:34%">BRAND HEAT<small>'+Math.round(state.brandHeat)+'/100</small></div>'+
        '<div class="fixture" style="right:8%;top:17%;width:34%">MARKET SHARE<small>'+state.marketShare.toFixed(1)+'%</small></div>'+
        '<div class="fixture" style="left:30%;top:56%;width:40%">LIMITED PRODUCT<small>'+Math.round(state.inventory.limited)+' units</small></div>';
      actions=actionButton("campaign","Local campaign","$12,000 • heat +12 • demand ↑")+
        actionButton("limitedDrop","Create limited drop","Use 180 flower → 120 limited",state.inventory.flower<180)+
        actionButton("hireBrand",state.managers.brand?"Brand lead hired":"Hire Brand lead",state.managers.brand?"Heat decay reduced":"$1,200 onboarding • $4,200/mo",state.managers.brand);
    }
    if(name==="rnd"){
      title="Second floor • R&D"; sub="Experiments create product, genetics and identity";
      world='<div class="room-floor"></div>'+
        '<div class="fixture" style="left:7%;top:16%;width:27%">GENETICS<small>'+state.rndWins+' wins</small></div>'+
        '<div class="fixture" style="left:37%;top:49%;width:27%">PRODUCT LAB<small>'+(state.rndProgress?("day "+state.rndProgress+"/12"):"idle")+'</small></div>'+
        '<div class="fixture" style="right:7%;top:16%;width:27%">CREATIVE<small>heat '+Math.round(state.brandHeat)+'</small></div>'+
        '<div class="worker" style="left:23%;top:72%"></div>';
      actions=actionButton("startRnd",state.rndProgress?"Experiment running":"Run experiment",state.rndProgress?"Completes at day 12":"$7,000 • 12 days • product upside",state.rndProgress>0)+
        actionButton("pheno","Pheno project","$9,500 • heat +6 • quality signal")+
        actionButton("hireRnd",state.managers.rnd?"R&D lead hired":"Hire R&D lead",state.managers.rnd?"Future experiments cheaper":"$1,200 onboarding • $4,600/mo",state.managers.rnd);
    }
    return '<section class="room"><header class="room-head"><b>'+title+'</b><small>'+sub+'</small></header>'+
      '<div class="room-world">'+world+'</div><div class="action-strip">'+actions+'</div>'+
      '<button class="home-btn" data-action="home">Property</button></section>';
  }

  function renderScene(){
    stage.innerHTML = scene==="property" ? propertyMarkup() : roomMarkup(scene);
    updateHUD();
  }

  function feedPanel(){
    const lowStock=totalStock()<500;
    return '<div class="scrim" data-close-panel></div><section class="panel"><div class="grabber"></div><h2>Live customer feed</h2>'+
      '<div class="feed-item">“'+(state.queue>=7?"The line is moving slow.":"This place moves pretty quick.")+'”</div>'+
      '<div class="feed-item">“'+(state.price>=44?"That price is getting steep.":"Price feels fair.")+'”</div>'+
      '<div class="feed-item">“'+(lowStock?"They keep running out of house flower.":"I came for the house flower.")+'”</div>'+
      '<div class="feed-item">“'+(state.brandHeat>=68?"Everybody is talking about this place.":"I’d come back.")+'”</div>'+
      '<button data-close-panel>Close</button></section>';
  }

  function customerPanel(){
    const thoughts = state.queue>=7 ? "This line better move." : state.price>=44 ? "I may check another shop." : totalStock()<400 ? "Hope they still have what I came for." : "I want to try the house flower.";
    const budget = 38 + Math.round((state.satisfaction%7)*5);
    return '<div class="scrim" data-close-panel></div><section class="panel"><div class="grabber"></div><h2>Customer</h2>'+
      '<div class="cards"><div class="card"><span>Budget</span><b>$'+budget+'</b></div><div class="card"><span>Quality bias</span><b>'+(state.brandHeat>60?"High":"Medium")+'</b></div>'+
      '<div class="card"><span>Latest thought</span><b>'+thoughts+'</b></div></div><button data-close-panel>Close</button></section>';
  }

  function outlookPanel(){
    const p=project(horizon);
    const trend=p.cashDelta>=0?"+"+money(p.cashDelta):money(p.cashDelta);
    return '<div class="scrim" data-close-panel></div><section class="panel"><div class="grabber"></div><h2>Business outlook</h2>'+
      '<div class="tabs">'+[30,60,90].map(d=>'<button class="'+(d===horizon?"on":"")+'" data-horizon="'+d+'">'+d+' days</button>').join("")+'</div>'+
      '<div class="note"><b>Likely next constraint: '+p.bottleneck+'</b><br>Forecast responds to price, staffing, capacity, inventory mix, harvest timing and demand.</div>'+
      '<div class="cards">'+
        card("Projected cash",money(p.cash))+card("Cash change",trend)+card("Revenue",money(p.revenue))+
        card("House flower",Math.round(p.flower)+" units")+card("Processed",Math.round(p.processed)+" units")+card("Limited",Math.round(p.limited)+" units")+
        card("Stock coverage",Math.round(p.coverage)+" days")+card("Harvests",p.harvests)+card("Queue",p.queue)+
        card("Satisfaction",Math.round(p.satisfaction)+"%")+card("Brand heat",Math.round(p.heat))+card("Market share",p.share.toFixed(1)+"%")+
      '</div><button data-close-panel>Close</button></section>';
  }
  function card(label,value){ return '<div class="card"><span>'+label+'</span><b>'+value+'</b></div>'; }

  function openPanel(type){
    panelLayer.innerHTML = type==="outlook" ? outlookPanel() : type==="feed" ? feedPanel() : customerPanel();
  }
  function closePanel(){ panelLayer.innerHTML=""; }

  function spend(amount,label,mutateCandidate){
    if(state.cash-amount<=-333333){ showToast("That would immediately toast the company."); return false; }
    const candidate = clone(state);
    candidate.cash -= amount;
    if(typeof mutateCandidate === "function") mutateCandidate(candidate);
    if(!confirmRiskyPurchase(candidate,label,amount)) return false;
    state.cash -= amount;
    checkBankruptcy();
    return true;
  }

  function hireWithOnboarding(roleKey, staffKey, monthlySalary, onboarding){
    const candidate=clone(state);
    candidate.cash-=onboarding;
    if(staffKey) candidate.staff[staffKey]++;
    if(roleKey) candidate.managers[roleKey]=true;
    const label=(roleKey ? roleKey.charAt(0).toUpperCase()+roleKey.slice(1)+" lead" : staffKey+" staff");
    if(!confirmRiskyPurchase(candidate,label,onboarding)) return false;
    state.cash-=onboarding;
    if(staffKey) state.staff[staffKey]++;
    if(roleKey) state.managers[roleKey]=true;
    showToast(label+" hired • "+money(monthlySalary)+"/mo • "+impactText(state));
    return true;
  }

  function applyAction(action){
    if(action==="home"){ scene="property"; renderScene(); return; }
    if(action==="pause"){ state.running=!state.running; updateHUD(); showToast(state.running?"Simulation running":"Simulation paused"); return; }
    if(action==="speed"){ state.speed=state.speed===1?2:state.speed===2?4:1; updateHUD(); showToast(state.speed+"× simulation speed"); return; }

    if(action==="priceDown"){ state.price=Math.max(24,state.price-2); showToast("Retail price "+money(state.price)+" • "+impactText(state)); }
    if(action==="priceUp"){ state.price=Math.min(60,state.price+2); showToast("Retail price "+money(state.price)+" • "+impactText(state)); }

    if(action==="hireRetail"){
      hireWithOnboarding(null,"retail",3800,900);
    }

    if(action==="express"&&!state.upgrades.express){
      const candidate=clone(state);candidate.cash-=18000;candidate.upgrades.express=true;
      if(spend(18000,"Express checkout",c=>c.upgrades.express=true)){
        state.upgrades.express=true;
        showToast("Express online • "+impactText(state));
      }
    }

    if(action==="focusBalanced"){state.growFocus="balanced";showToast("Grow focus: balanced • "+impactText(state));}
    if(action==="focusQuality"){state.growFocus="quality";state.brandHeat=clamp(state.brandHeat+2,0,100);showToast("Quality push • yield lower, heat higher");}
    if(action==="focusYield"){state.growFocus="yield";state.brandHeat=clamp(state.brandHeat-1,0,100);showToast("Yield push • harvest larger, heat slightly lower");}

    if(action==="flower2"&&!state.upgrades.flower2){
      if(spend(52000,"Flower Room II",c=>c.upgrades.flower2=true)){
        state.upgrades.flower2=true;
        showToast("Flower II online • "+impactText(state));
      }
    }

    if(action==="materials"){
      if(spend(1800,"Materials order",c=>c.materials+=45)){
        state.materials+=45;
        showToast("+45 materials • "+impactText(state));
      }
    }

    if(action==="process"&&state.inventory.flower>=200){
      state.inventory.flower-=200;
      state.inventory.processed+=145;
      state.materials=Math.max(0,state.materials-3);
      showToast("200 flower → 145 processed • higher unit value");
    }

    if(action==="hireOps"&&!state.managers.ops){
      hireWithOnboarding("ops",null,4350,1200);
    }

    if(action==="campaign"){
      if(spend(12000,"Local campaign",c=>{
        c.brandHeat=clamp(c.brandHeat+(c.managers.brand?15:12),0,100);
        c.marketShare=clamp(c.marketShare+.35,0,60);
      })){
        state.brandHeat=clamp(state.brandHeat+(state.managers.brand?15:12),0,100);
        state.marketShare=clamp(state.marketShare+.35,0,60);
        showToast("Campaign live • demand rising • "+impactText(state));
      }
    }

    if(action==="limitedDrop"&&state.inventory.flower>=180){
      state.inventory.flower-=180;
      state.inventory.limited+=120;
      state.brandHeat=clamp(state.brandHeat+5,0,100);
      showToast("Limited drop created • margin + / flower stock −");
    }

    if(action==="hireBrand"&&!state.managers.brand){
      hireWithOnboarding("brand",null,4200,1200);
    }

    if(action==="startRnd"&&!state.rndProgress){
      const cost=state.managers.rnd?5600:7000;
      if(spend(cost,"R&D experiment",c=>c.rndProgress=1)){
        state.rndProgress=1;
        showToast("Experiment started • 12 days • "+impactText(state));
      }
    }

    if(action==="pheno"){
      if(spend(9500,"Pheno project",c=>{c.rndWins++;c.brandHeat=clamp(c.brandHeat+6,0,100);})){
        state.rndWins++;
        state.brandHeat=clamp(state.brandHeat+6,0,100);
        showToast("Pheno project landed • heat +6 • "+impactText(state));
      }
    }

    if(action==="hireRnd"&&!state.managers.rnd){
      hireWithOnboarding("rnd",null,4600,1200);
    }

    state.peakHeat=Math.max(state.peakHeat,state.brandHeat);
    renderScene();
    checkBankruptcy();
  }
  function checkBankruptcy(){
    if(state.cash>-333333) return false;
    state.running=false;
    closePanel();
    gameOverLayer.innerHTML='<section class="toasted"><h1>TOASTED</h1><p>EMPIRE GREEN IS INSOLVENT<br><br>FINAL SHARE '+state.marketShare.toFixed(1)+'%<br>LIFETIME REVENUE '+money(state.lifetimeRevenue)+'<br>DAYS SURVIVED '+state.day+'<br>PEAK HEAT '+Math.round(state.peakHeat)+'</p><button data-action="restart">Start over</button></section>';
    return true;
  }

  function restart(){
    state=clone(BASE);scene="property";horizon=30;gameOverLayer.innerHTML="";closePanel();renderScene();showToast("New company started");
  }

  app.addEventListener("click",e=>{
    const roomBtn=e.target.closest("[data-room]");
    if(roomBtn){scene=roomBtn.dataset.room;renderScene();return;}
    const open=e.target.closest("[data-open]");
    if(open){openPanel(open.dataset.open);return;}
    const person=e.target.closest(".person");
    if(person){openPanel("customer");return;}
    const action=e.target.closest("[data-action]");
    if(action){
      if(action.dataset.action==="restart"){restart();return;}
      applyAction(action.dataset.action);return;
    }
  });

  panelLayer.addEventListener("click",e=>{
    if(e.target.closest("[data-close-panel]")){closePanel();return;}
    const tab=e.target.closest("[data-horizon]");
    if(tab){horizon=Number(tab.dataset.horizon);openPanel("outlook");}
  });

  function liveTick(){
    if(!state.running || frozenForVisibility || gameOverLayer.innerHTML) return;
    for(let i=0;i<state.speed;i++){
      deterministicDay(state);
      if(state.managers.brand) state.brandHeat=clamp(state.brandHeat+.01,0,100);
      if(checkBankruptcy()) return;
    }
    updateHUD();
    updateSceneNumbers();
  }

  function updateSceneNumbers(){
    if(scene==="property"){
      const grow=stage.querySelector(".hotspot--grow small"); if(grow) grow.textContent=daysToHarvest()+"d to harvest";
      const ops=stage.querySelector(".hotspot--ops small"); if(ops) ops.textContent=state.materials+" materials";
      const retail=stage.querySelector(".hotspot--retail small"); if(retail) retail.textContent=state.queue+" queue";
      const brand=stage.querySelector(".hotspot--brand small"); if(brand) brand.textContent=Math.round(state.brandHeat)+" heat";
      const signal=stage.querySelector(".signal"); if(signal){const [a,b]=currentSignal();signal.innerHTML="<b>"+a+"</b><span>"+b+"</span>";}
    } else {
      const head=stage.querySelector(".room-head");
      if(head && state.day%3===0) renderScene();
    }
  }

  document.addEventListener("visibilitychange",()=>{
    if(document.hidden){ frozenForVisibility=true; }
    else { frozenForVisibility=false; }
  });

  renderScene();
  // One real-time tick is deliberately slower than one in-game day so purchases
  // and management decisions have time to be read before the economy advances.
  setInterval(liveTick,2000);
})();