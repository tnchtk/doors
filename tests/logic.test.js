const test=require('node:test');
const assert=require('node:assert/strict');
const {loadApp}=require('./helpers');

function freshApp(){
  const app=loadApp();
  // Один объект, один блок, один этаж-контейнер, бригада с тарифом.
  app.run(`state={
    brigades:[{id:'br1',name:'Бригада 1'}],
    objects:[{id:'o1',name:'Объект',blocks:[{id:'b1',name:'Блок 1',floors:[{id:'f1',num:1,brigadeId:'br1',ratePerOpening:1000,apartments:[{id:'a1',num:'Этаж',isFloorContainer:true,openings:[]}]}]}]}],
    requests:[],purchases:[],movements:[],financeEntries:[],
  };`);
  return app;
}
function addOpenings(app,list){
  app.set('__list',list);
  app.run(`state.objects[0].blocks[0].floors[0].apartments[0].openings=__list.map(([type,width])=>{const o=makeOpening(type,1);o.doors.forEach(d=>{d.widthMm=width;});return o;});`);
}

test('потребность в материалах: нормы на проём',()=>{
  const app=freshApp();
  const needs=app.run(`JSON.stringify(openingMaterialNeeds(makeOpening('double_glass',1)))`);
  const parsed=JSON.parse(needs);
  assert.equal(parsed.polotno,2);
  assert.equal(parsed.petli,4);
  assert.equal(parsed.dobor,2.5);
  assert.equal(parsed.nalich,5);
  assert.equal(parsed.shpingalet,1);
  assert.equal(parsed.korob,0);
  const toilet=JSON.parse(app.run(`JSON.stringify(openingMaterialNeeds(makeOpening('toilet',1)))`));
  assert.equal(toilet.korob,1);
  assert.equal(toilet.porog,1);
});

test('заказ: двери по типу и ширине, комплектующие округляются вверх',()=>{
  const app=freshApp();
  addOpenings(app,[['single_glass',800],['single_solid',900],['double_glass',700],['single_solid',900]]);
  const result=JSON.parse(app.run(`JSON.stringify(buildOrderRows(orderableOpenings(state.objects[0])))`));
  const doors=Object.fromEntries(result.doorRows.map(row=>[row.name,row.qty]));
  assert.equal(doors['Дверное полотно со стеклом, 700 мм'],2);
  assert.equal(doors['Дверное полотно со стеклом, 800 мм'],1);
  assert.equal(doors['Дверное полотно глухое, 900 мм'],2);
  const dobor=result.materialRows.find(row=>row.matId==='dobor');
  assert.equal(dobor.need,10); // 4 проёма × 2,5 = 10
  const odd=freshApp();
  addOpenings(odd,[['single_solid',900]]);
  const oddRows=JSON.parse(odd.run(`JSON.stringify(buildOrderRows(orderableOpenings(state.objects[0])))`));
  assert.equal(oddRows.materialRows.find(row=>row.matId==='dobor').need,3); // 2,5 → 3
});

test('заказ: складской остаток уменьшает количество, закреплённое за заказанными дверями не считается свободным',()=>{
  const app=freshApp();
  addOpenings(app,[['single_solid',900],['single_solid',900]]);
  app.run(`state.movements=[{id:'m1',type:'in',matId:'petli',qty:10,note:'',date:'2026-01-01'}];`);
  let petli=JSON.parse(app.run(`JSON.stringify(buildOrderRows(orderableOpenings(state.objects[0])))`)).materialRows.find(row=>row.matId==='petli');
  assert.equal(petli.need,4);
  assert.equal(petli.stock,10);
  assert.equal(petli.qty,0);
  // Первый проём заказан: его петли закрепляются за ним, свободного остатка меньше.
  app.run(`state.objects[0].blocks[0].floors[0].apartments[0].openings[0].orderId='ord1';`);
  petli=JSON.parse(app.run(`JSON.stringify(buildOrderRows(orderableOpenings(state.objects[0])))`)).materialRows.find(row=>row.matId==='petli');
  assert.equal(petli.need,2);
  assert.equal(petli.stock,8);
});

test('уже заказанные и принятые проёмы не попадают в новый заказ',()=>{
  const app=freshApp();
  addOpenings(app,[['single_solid',900],['single_solid',900],['single_solid',900]]);
  app.run(`const ops=state.objects[0].blocks[0].floors[0].apartments[0].openings;ops[0].orderId='ord1';ops[1].reviewStatus='accepted';`);
  assert.equal(app.run(`orderableOpenings(state.objects[0]).length`),1);
});

test('статус этажа: переходы синхронизируют проёмы и двери',()=>{
  const app=freshApp();
  addOpenings(app,[['single_glass',800],['double_solid',900]]);
  app.run(`globalThis.__ctx=findFloorContext({objId:"o1",blockId:"b1",floorId:"f1"});`);
  const snapshot=()=>JSON.parse(app.run(`JSON.stringify({status:floorStatus(__ctx.floor),openings:__ctx.floor.apartments[0].openings.map(o=>({r:o.reviewStatus,d:o.doors.map(d=>d.status)}))})`));
  assert.equal(snapshot().status,'not_started');
  app.run(`applyFloorTransitionLocally(__ctx,'status','in_progress')`);
  assert.equal(snapshot().status,'in_progress');
  assert.deepEqual(snapshot().openings[0].d,['in_progress']);
  app.run(`applyFloorTransitionLocally(__ctx,'submit','готово')`);
  let snap=snapshot();
  assert.equal(snap.status,'pending');
  assert.equal(snap.openings[1].r,'pending');
  assert.deepEqual(snap.openings[1].d,['installed','installed']);
  assert.throws(()=>app.run(`applyFloorTransitionLocally(__ctx,'status','in_progress')`),/уже отправлен/);
  app.run(`applyFloorTransitionLocally(__ctx,'return','Подправить наличники')`);
  snap=snapshot();
  assert.equal(snap.status,'changes_requested');
  assert.equal(snap.openings[0].r,'changes_requested');
});

test('приёмка этажа: начисление по тарифу, +500 за двойной проём, без повторов',()=>{
  const app=freshApp();
  addOpenings(app,[['single_glass',800],['double_solid',900],['single_solid',900]]);
  app.run(`globalThis.__ctx=findFloorContext({objId:'o1',blockId:'b1',floorId:'f1'});applyFloorTransitionLocally(__ctx,'submit','');applyFloorTransitionLocally(__ctx,'accept');`);
  const amounts=JSON.parse(app.run(`JSON.stringify(state.financeEntries.map(e=>e.amount).sort())`));
  assert.deepEqual(amounts,[1000,1000,1500]);
  assert.equal(app.run(`floorStatus(__ctx.floor)`),'accepted');
  assert.equal(app.run(`__ctx.floor.apartments[0].openings.every(o=>o.reviewStatus==='accepted')`),true);
});

test('приёмка этажа без тарифа невозможна',()=>{
  const app=freshApp();
  addOpenings(app,[['single_solid',900]]);
  app.run(`globalThis.__ctx=findFloorContext({objId:'o1',blockId:'b1',floorId:'f1'});__ctx.floor.ratePerOpening=0;applyFloorTransitionLocally(__ctx,'submit','');`);
  assert.throws(()=>app.run(`applyFloorTransitionLocally(__ctx,'accept')`),/тариф/i);
  assert.equal(app.run(`state.financeEntries.length`),0);
});

test('сводка этажа: со стеклом, глухие, двойные',()=>{
  const app=freshApp();
  addOpenings(app,[['single_glass',800],['single_solid',900],['double_glass',700],['double_solid',700]]);
  const summary=JSON.parse(app.run(`JSON.stringify(floorDoorSummary(floorOpeningItems(state.objects[0].blocks[0].floors[0])))`));
  assert.equal(summary.total,4);
  assert.equal(summary.glass,2);
  assert.equal(summary.solid,2);
  assert.equal(summary.double,2);
});

test('акты: принятые проёмы, без повторов, период по датам приёмки',()=>{
  const app=freshApp();
  addOpenings(app,[['single_glass',800],['double_solid',900],['single_solid',900]]);
  app.run(`const ops=state.objects[0].blocks[0].floors[0].apartments[0].openings;
    ops[0].reviewStatus='accepted';ops[0].acceptedAt='2026-11-03T10:00:00Z';
    ops[1].reviewStatus='accepted';ops[1].acceptedAt='2026-11-05T10:00:00Z';`);
  assert.equal(app.run(`avrCandidates(state.objects[0]).length`),2);
  const rows=JSON.parse(app.run(`JSON.stringify(avrRowsFor(avrCandidates(state.objects[0]),false))`));
  assert.equal(rows.reduce((sum,row)=>sum+row.count,0),3); // 1 + 2 полотна двойной
  assert.deepEqual(JSON.parse(app.run(`JSON.stringify(avrPeriod(avrCandidates(state.objects[0])))`)),{from:'2026-11-03',to:'2026-11-05'});
  app.run(`state.objects[0].blocks[0].floors[0].apartments[0].openings[0].avrId='avr1';`);
  assert.equal(app.run(`avrCandidates(state.objects[0]).length`),1);
});

test('заявки: нумерация и нехватка на складе',()=>{
  const app=freshApp();
  app.run(`state.requests=[{id:'req5',items:[]},{id:'reqabc',number:7,items:[]}];state.movements=[{id:'m',type:'in',matId:'zamok',qty:2,note:'',date:'2026-01-01'}];`);
  assert.equal(app.run(`nextRequestNumber()`),8);
  const shortages=JSON.parse(app.run(`JSON.stringify(requestShortages({items:[{matId:'zamok',qty:5},{matId:'dobor',qty:3}]}))`));
  assert.deepEqual(shortages.map(row=>[row.matId,row.short]),[['zamok',3],['dobor',3]]);
});

test('заявка «Передано» списывает склад один раз и не проходит при нехватке',async()=>{
  const app=freshApp();
  app.run(`state.requests=[{id:'r1',number:1,objId:'o1',blockName:'Блок 1',floor:1,items:[{matId:'zamok',qty:3}],status:'collected'}];state.movements=[{id:'m',type:'in',matId:'zamok',qty:2,note:'',date:'2026-01-01'}];`);
  await app.run(`setRequestStatus('r1','delivered')`);
  assert.equal(app.run(`state.requests[0].status`),'collected');
  assert.match(app.toasts.at(-1),/не хватает/);
  app.run(`state.movements.unshift({id:'m2',type:'in',matId:'zamok',qty:5,note:'',date:'2026-01-02'});`);
  await app.run(`setRequestStatus('r1','delivered')`);
  assert.equal(app.run(`state.requests[0].status`),'delivered');
  assert.equal(app.run(`warehouseStock('zamok')`),4);
  await app.run(`setRequestStatus('r1','collected')`);
  await app.run(`setRequestStatus('r1','delivered')`);
  assert.equal(app.run(`warehouseStock('zamok')`),4);
});
