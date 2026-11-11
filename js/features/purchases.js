const PUR_STATUS={created:'Создан', ordered:'Заказан', transit:'В пути', partial:'Принят частично', received:'Принят', cancelled:'Отменён'};
const PUR_STATUS_ORDER=['created','ordered','transit','received'];
const ORDER_STATUS_CLS={created:'neutral', ordered:'info', transit:'warn', partial:'warn', received:'ok', cancelled:'bad'};
const ORDER_MANUAL_STATUSES=['created','ordered','transit'];

function isOrder(purchase){return purchase?.kind==='order'&&Array.isArray(purchase.items);}
function ordersList(){return (state.purchases||[]).filter(isOrder);}
function legacyPurchases(){return (state.purchases||[]).filter(purchase=>!purchase.kind);}
function canOrderMaterials(){return canManageWorkspace()&&!(typeof isForemanWorkspaceUser==='function'&&isForemanWorkspaceUser());}

// Проёмы, которые ещё не вошли ни в один заказ (принятые и старые записи не заказываем).
function orderableOpenings(obj,filter={}){
  const out=[];
  (obj.blocks||[]).forEach(block=>{
    if(filter.blockId&&filter.blockId!==block.id)return;
    (block.floors||[]).forEach(floor=>{
      if(filter.floorId&&filter.floorId!==floor.id)return;
      (floor.apartments||[]).forEach(apt=>(apt.openings||[]).forEach(opening=>{
        if(opening.orderId||opening.type==='legacy'||acceptedOpening(opening))return;
        out.push({block,floor,apt,opening});
      }));
    });
  });
  return out;
}

function orderDoorLabel(glass,widthMm){
  return `Дверное полотно ${glass?'со стеклом':'глухое'}, ${widthMm?`${widthMm} мм`:'ширина не указана'}`;
}

// Материалы, уже закреплённые за заказанными, но ещё не принятыми дверями: их нельзя считать свободным остатком.
function committedMaterials(){
  const sums={};
  (state.objects||[]).forEach(obj=>(obj.blocks||[]).forEach(block=>(block.floors||[]).forEach(floor=>(floor.apartments||[]).forEach(apt=>(apt.openings||[]).forEach(opening=>{
    if(!opening.orderId||acceptedOpening(opening))return;
    Object.entries(openingMaterialNeeds(opening)).forEach(([id,qty])=>{if(id!=='polotno')sums[id]=(sums[id]||0)+qty;});
  })))));
  Object.keys(sums).forEach(id=>{sums[id]=Math.ceil(Number(sums[id].toFixed(4)));});
  return sums;
}

// Считает позиции заказа по выбранным проёмам: полотна по типу и ширине, комплектующие с округлением вверх.
function buildOrderRows(openingItems){
  const materials={},doors={};
  const committed=committedMaterials();
  openingItems.forEach(({opening})=>{
    Object.entries(openingMaterialNeeds(opening)).forEach(([id,qty])=>{if(id!=='polotno')materials[id]=(materials[id]||0)+qty;});
    (opening.doors||[]).forEach(door=>{
      const width=Number(door.widthMm)||0,glass=Boolean(door.glass);
      const key=`${glass?'glass':'solid'}|${width}`;
      if(!doors[key])doors[key]={glass,width,count:0};
      doors[key].count++;
    });
  });
  const doorRows=Object.entries(doors)
    .sort((a,b)=>Number(b[1].glass)-Number(a[1].glass)||a[1].width-b[1].width)
    .map(([key,item])=>({key:`door|${key}`,kind:'door',name:orderDoorLabel(item.glass,item.width),unit:'шт',need:item.count,stock:null,qty:item.count,receivedQty:0}));
  const materialRows=MATERIALS.filter(material=>material.id!=='polotno'&&materials[material.id]>0).map(material=>{
    const need=Math.ceil(Number(materials[material.id].toFixed(4)));
    const stock=Math.max(0,warehouseStock(material.id)-(committed[material.id]||0));
    return {key:`mat|${material.id}`,kind:'material',matId:material.id,name:material.name,unit:material.unit,need,stock,qty:Math.max(0,need-stock),receivedQty:0};
  });
  return {doorRows,materialRows};
}

function orderTotals(order){
  const ordered=order.items.reduce((sum,item)=>sum+Number(item.qty||0),0);
  const received=order.items.reduce((sum,item)=>sum+Number(item.receivedQty||0),0);
  return {ordered,received};
}

function orderDateLabel(value){
  const date=new Date(`${String(value).slice(0,10)}T12:00:00`);
  return Number.isNaN(date.getTime())?'—':date.toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'});
}

function orderScopeLabel(order){
  const byBlock=new Map();
  (order.scope||[]).forEach(item=>{
    if(!byBlock.has(item.blockName))byBlock.set(item.blockName,[]);
    byBlock.get(item.blockName).push(item.floorNum);
  });
  return [...byBlock.entries()].map(([block,floors])=>`${block}: ${floors.join(', ')} эт.`).join('; ')||'—';
}

function pagePurchases(){
  const canOrder=canOrderMaterials();
  const objects=activeObjects(state);
  const ready=objects.map(obj=>({obj,items:orderableOpenings(obj)}));
  const orders=ordersList().slice().sort((a,b)=>Number(b.number)-Number(a.number));
  const legacy=legacyPurchases();
  return `
    <div class="panel">
      <div class="panel-head"><div><h3>К заказу</h3><span class="hint">Двери, добавленные на этажи и ещё не вошедшие ни в один заказ. Заказывать можно по частям.</span></div></div>
      <div class="order-ready-list">
        ${ready.map(({obj,items})=>{
          const doors=items.reduce((sum,item)=>sum+(item.opening.doors||[]).length,0);
          return `<div class="order-ready-row"><div><strong>${htmlEscape(obj.name)}</strong><span class="hint">${items.length?`${items.length} ${ruPlural(items.length,'проём','проёма','проёмов')} · ${doors} ${ruPlural(doors,'дверь','двери','дверей')} ещё не заказаны`:'Всё, что добавлено, уже заказано'}</span></div>${canOrder?`<button type="button" class="btn ${items.length?'primary':''}" ${items.length?'':'disabled'} data-order-scope='${htmlEscape(JSON.stringify({objId:obj.id}))}'>Заказать</button>`:''}</div>`;
        }).join('')||'<div class="empty">Объектов пока нет.</div>'}
      </div>
    </div>
    <div class="panel">
      <div class="panel-head"><div><h3>Заказы</h3><span class="hint">${orders.length} ${ruPlural(orders.length,'заказ','заказа','заказов')}</span></div></div>
      <div class="order-list">
        ${orders.map(order=>orderCard(order,canOrder)).join('')||'<div class="empty">Заказов пока нет. Добавьте двери на этаж и нажмите «Заказать».</div>'}
      </div>
    </div>
    ${legacy.length?`<div class="panel"><div class="panel-head"><h3>Прежние закупки</h3><span class="hint">Записи, созданные до заказов по этажам</span></div>
      <div class="tbl-wrap"><table><thead><tr><th>Материал</th><th>Кол-во</th><th>Поставщик</th><th>Статус</th></tr></thead><tbody>
        ${legacy.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))).map(p=>`<tr><td>${htmlEscape(MAT_BY_ID[p.matId]?.name||p.matId)}</td><td class="mono">${htmlEscape(p.qty)} ${htmlEscape(MAT_BY_ID[p.matId]?.unit||'')}</td><td>${htmlEscape(p.supplier)}</td><td>${htmlEscape(({created:'Создано',ordered:'Заказано',transit:'В пути',received:'Получено'})[p.status]||p.status)}</td></tr>`).join('')}
      </tbody></table></div></div>`:''}
  `;
}

function orderCard(order,canOrder){
  const totals=orderTotals(order);
  const final=order.status==='received'||order.status==='cancelled';
  const idAttr=htmlEscape(order.id);
  return `<article class="order-card" data-order-card="${idAttr}">
    <header class="order-card-head"><div><h4>Заказ №${htmlEscape(order.number)}</h4><span class="hint">${htmlEscape(orderDateLabel(order.date))} · ${htmlEscape(order.objName||'')}</span></div><span class="pill ${ORDER_STATUS_CLS[order.status]||'neutral'}">${PUR_STATUS[order.status]||order.status}</span></header>
    <p class="order-scope">${htmlEscape(orderScopeLabel(order))}</p>
    <p class="hint">${order.items.length} ${ruPlural(order.items.length,'позиция','позиции','позиций')} · принято ${totals.received} из ${totals.ordered}</p>
    ${order.comment?`<p class="order-comment">«${htmlEscape(order.comment)}»</p>`:''}
    <details class="order-items"><summary>Состав заказа</summary><div class="tbl-wrap"><table><thead><tr><th>Позиция</th><th>Ед.</th><th>Заказано</th><th>Принято</th></tr></thead><tbody>
      ${order.items.map(item=>`<tr><td>${htmlEscape(item.name)}</td><td>${htmlEscape(item.unit)}</td><td class="mono">${htmlEscape(item.qty)}</td><td class="mono">${htmlEscape(item.receivedQty||0)}</td></tr>`).join('')}
    </tbody></table></div></details>
    <div class="order-actions">
      <button type="button" class="btn sm" data-order-doc="xlsx" data-order-id="${idAttr}">Excel</button>
      <button type="button" class="btn sm" data-order-doc="pdf" data-order-id="${idAttr}">PDF</button>
      ${canOrder&&!final?`<select class="req-status-select" aria-label="Статус заказа" data-order-status="${idAttr}">${ORDER_MANUAL_STATUSES.map(value=>`<option value="${value}" ${order.status===value?'selected':''}>${PUR_STATUS[value]}</option>`).join('')}${order.status==='partial'?`<option value="partial" selected>${PUR_STATUS.partial}</option>`:''}</select>
      <button type="button" class="btn sm primary" data-order-receive="${idAttr}">Принять</button>
      ${totals.received===0?`<button type="button" class="btn sm danger" data-order-cancel="${idAttr}">Отменить</button>`:''}`:''}
    </div>
  </article>`;
}
