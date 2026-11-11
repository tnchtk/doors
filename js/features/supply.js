const REQ_STATUS = {new:'Новая', in_progress:'В обработке', collected:'Собрано', delivered:'Передано', received:'Получено'};
const REQ_STATUS_ORDER = ['new','in_progress','collected','delivered','received'];
const REQ_STATUS_CLS = {new:'bad', in_progress:'warn', collected:'info', delivered:'ok', received:'neutral'};
const REQ_FOREMAN_LABELS = {new:'Отправлена', in_progress:'Принята в работу', collected:'Собрана', delivered:'Передана вам', received:'Получена'};

const supplyView={objId:'',closed:false};

function requestNumber(request){
  const value=request.number??String(request.id||'').replace(/\D/g,'');
  return value===''?'—':value;
}

function requestPlace(request){
  const obj=findObj(request.objId);
  return [obj?obj.name:'',request.blockName,request.floor?`${request.floor} этаж`:'',request.apt?`кв. ${request.apt}`:''].filter(Boolean).join(' · ');
}

function requestItemsLabel(request){
  return (request.items||[]).map(item=>`${MAT_BY_ID[item.matId]?.name||item.matId} ${item.qty} ${MAT_BY_ID[item.matId]?.unit||''}`.trim()).join(', ');
}

// Сколько каждого материала не хватает на складе для выдачи по заявке.
function requestShortages(request){
  return (request.items||[]).map(item=>{
    const stock=warehouseStock(item.matId);
    return {matId:item.matId,qty:Number(item.qty),stock,short:Math.max(0,Number(item.qty)-stock)};
  }).filter(row=>row.short>0);
}

function supplyRequestCard(request){
  const brigade=state.brigades.find(item=>item.id===request.brigadeId);
  const shortages=requestShortages(request);
  const closed=request.status==='delivered'||request.status==='received';
  const id=htmlEscape(request.id);
  const stockMap=Object.fromEntries(shortages.map(row=>[row.matId,row]));
  return `<article class="order-card supply-request" data-request-card="${id}">
    <header class="order-card-head"><div><h4>${request.status==='new'?'<span class="inline-dot bad" aria-hidden="true"></span>':''}Заявка №${htmlEscape(requestNumber(request))}</h4><span class="hint">${htmlEscape(orderDateLabel(request.date))} · ${htmlEscape(brigade?.name||'Бригада не указана')}</span></div><span class="pill ${REQ_STATUS_CLS[request.status]||'neutral'}">${REQ_STATUS[request.status]||request.status}</span></header>
    <p class="order-scope">${htmlEscape(requestPlace(request))}</p>
    <ul class="supply-items">${(request.items||[]).map(item=>{
      const material=MAT_BY_ID[item.matId];
      const short=stockMap[item.matId];
      return `<li><span>${htmlEscape(material?.name||item.matId)}</span><strong>${htmlEscape(item.qty)} ${htmlEscape(material?.unit||'')}</strong>${!closed&&short?`<span class="pill bad">на складе ${short.stock}, не хватает ${short.short}</span>`:''}</li>`;
    }).join('')}</ul>
    ${request.comment?`<p class="order-comment">«${htmlEscape(request.comment)}»</p>`:''}
    ${request.createdByName?`<p class="hint">Создал: ${htmlEscape(request.createdByName)}</p>`:''}
    <div class="order-actions">
      <select class="req-status-select" aria-label="Статус заявки" data-supply-status="${id}">${REQ_STATUS_ORDER.map(value=>`<option value="${value}" ${value===request.status?'selected':''}>${REQ_STATUS[value]}</option>`).join('')}</select>
      ${request.status==='collected'?`<button type="button" class="btn sm primary" data-supply-status-set="${id}" data-status="delivered">Передать бригаде</button>`:''}
      ${shortages.length&&!closed&&!request.orderId?`<button type="button" class="btn sm" data-supply-short-order="${id}">Заказать недостающее</button>`:''}
      ${request.orderId?'<span class="hint">Недостающее заказано</span>':''}
    </div>
  </article>`;
}

function supplySummaryRows(){
  const inTransit={};
  ordersList().filter(order=>order.status!=='cancelled'&&order.status!=='received').forEach(order=>order.items.forEach(item=>{
    const id=item.kind==='door'?'polotno':item.matId;
    inTransit[id]=(inTransit[id]||0)+Math.max(0,Number(item.qty)-Number(item.receivedQty||0));
  }));
  const unorderedItems=activeObjects(state).flatMap(obj=>orderableOpenings(obj));
  const {doorRows,materialRows}=buildOrderRows(unorderedItems);
  const unordered={polotno:doorRows.reduce((sum,row)=>sum+row.need,0)};
  materialRows.forEach(row=>{unordered[row.matId]=row.need;});
  return MATERIALS.map(material=>({...material,stock:warehouseStock(material.id),ordered:inTransit[material.id]||0,unordered:unordered[material.id]||0}));
}

function pageSupply(){
  const all=activeRequests(state);
  const objects=activeObjects(state);
  const view=supplyView;
  const requests=all.filter(request=>view.closed?(request.status==='delivered'||request.status==='received'):(request.status!=='delivered'&&request.status!=='received'))
    .filter(request=>!view.objId||request.objId===view.objId)
    .sort((a,b)=>REQ_STATUS_ORDER.indexOf(a.status)-REQ_STATUS_ORDER.indexOf(b.status)||String(b.date).localeCompare(String(a.date))||Number(b.number||0)-Number(a.number||0));
  const groups=new Map();
  requests.forEach(request=>{
    const obj=findObj(request.objId);
    const key=`${obj?obj.name:'Без объекта'} · ${request.blockName||'Без блока'}`;
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(request);
  });
  const openCount=all.filter(request=>request.status!=='delivered'&&request.status!=='received').length;
  const summary=supplySummaryRows();
  return `
    <div class="panel">
      <div class="panel-head"><div><h3>Заявки от бригад</h3><span class="hint">Заявки приходят по блокам автоматически. Когда статус станет «Передано», материалы спишутся со склада.</span></div></div>
      <div class="supply-filters">
        <div class="segmented" role="group" aria-label="Какие заявки показывать">
          <button type="button" class="btn sm ${view.closed?'':'primary'}" data-supply-closed="0">Открытые · ${openCount}</button>
          <button type="button" class="btn sm ${view.closed?'primary':''}" data-supply-closed="1">Закрытые</button>
        </div>
        <select class="req-status-select" aria-label="Объект" data-supply-object><option value="">Все объекты</option>${objects.map(obj=>`<option value="${htmlEscape(obj.id)}" ${view.objId===obj.id?'selected':''}>${htmlEscape(obj.name)}</option>`).join('')}</select>
      </div>
      ${[...groups.entries()].map(([title,list])=>`<div class="supply-group"><h4>${htmlEscape(title)}</h4><div class="order-list">${list.map(supplyRequestCard).join('')}</div></div>`).join('')||`<div class="empty">${view.closed?'Закрытых заявок пока нет.':'Открытых заявок нет.'}</div>`}
    </div>
    <div class="panel">
      <div class="panel-head"><div><h3>Склад и закупки</h3><span class="hint">Остаток склада, что уже заказано и что ещё не заказано по добавленным дверям</span></div><button type="button" class="btn sm primary" data-goto-page="purchases">К закупкам</button></div>
      <div class="tbl-wrap"><table>
        <thead><tr><th>Материал</th><th>На складе</th><th>Заказано, едет</th><th>Ещё не заказано</th></tr></thead>
        <tbody>${summary.map(row=>`<tr><td>${htmlEscape(row.name)}</td><td class="mono">${row.stock}</td><td class="mono">${row.ordered||'—'}</td><td class="mono">${row.unordered?`<span class="pill warn">${row.unordered} ${htmlEscape(row.unit)}</span>`:'—'}</td></tr>`).join('')}</tbody>
      </table></div>
    </div>
  `;
}
