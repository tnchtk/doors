/* Заявки на материалы: создание бригадиром и менеджером, статусы, списание со склада, заказ недостающего. */

function nextRequestNumber(){
  return (state.requests||[]).reduce((max,request)=>{
    const number=Number(request.number??String(request.id||'').replace(/\D/g,''));
    return Number.isFinite(number)&&number<1e12?Math.max(max,number):max;
  },0)+1;
}

function floorRequests(obj,block,floor){
  return (state.requests||[]).filter(request=>request.floorId===floor.id||(!request.floorId&&request.objId===obj.id&&request.blockName===block.name&&String(request.floor)===String(floor.num)))
    .sort((a,b)=>String(b.date).localeCompare(String(a.date))||Number(b.number||0)-Number(a.number||0));
}

function requestLine(request,foreman){
  const label=foreman?REQ_FOREMAN_LABELS[request.status]:REQ_STATUS[request.status];
  return `<div class="request-line"><div><strong>№${htmlEscape(requestNumber(request))} · ${htmlEscape(orderDateLabel(request.date))}</strong><span class="hint">${htmlEscape(requestItemsLabel(request))}</span></div><span class="pill ${REQ_STATUS_CLS[request.status]||'neutral'}">${htmlEscape(label||request.status)}</span></div>`;
}

// Панель на странице этажа: кнопка «Нужны материалы» и список заявок этажа со статусами.
function floorRequestsPanel(obj,block,floor,foreman){
  const canCreate=foreman||canManageWorkspace()||!cloudEnabled;
  const list=floorRequests(obj,block,floor);
  if(!canCreate&&!list.length)return '';
  const ids={objId:obj.id,blockId:block.id,floorId:floor.id};
  return `<section class="panel floor-requests"><div class="panel-head"><div><h3>Заявки на материалы</h3><span class="hint">Если чего-то не хватает или материал не подошёл, отправьте заявку снабжению</span></div>${canCreate?`<button type="button" class="btn sm primary" data-floor-request='${htmlEscape(JSON.stringify(ids))}'>Нужны материалы</button>`:''}</div>
    ${list.length?`<div class="request-lines">${list.slice(0,6).map(request=>requestLine(request,foreman)).join('')}</div>`:'<p class="hint">Заявок по этому этажу пока нет.</p>'}</section>`;
}

// Список заявок на главном экране бригадира.
function foremanRequestsPanel(){
  const list=(state.requests||[]).slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))||Number(b.number||0)-Number(a.number||0));
  const open=list.filter(request=>request.status!=='received');
  if(!open.length)return '';
  return `<section class="panel"><div class="panel-head"><div><h3>Мои заявки на материалы</h3><span class="hint">Статус, который выставил снабжение</span></div></div><div class="request-lines">${open.slice(0,8).map(request=>`<div class="request-line"><div><strong>№${htmlEscape(requestNumber(request))} · ${htmlEscape(requestPlace(request))}</strong><span class="hint">${htmlEscape(requestItemsLabel(request))}</span></div><span class="pill ${REQ_STATUS_CLS[request.status]||'neutral'}">${htmlEscape(REQ_FOREMAN_LABELS[request.status]||request.status)}</span></div>`).join('')}</div></section>`;
}

function openFloorRequestModal(ids){
  const context=findFloorContext(ids);
  if(!context){toast('Этаж не найден');return;}
  const foreman=isForemanWorkspaceUser();
  const overlay=document.createElement('div');
  overlay.className='overlay';
  overlay.innerHTML=`<div class="modal order-modal" role="dialog" aria-modal="true" aria-labelledby="reqTitle">
    <h3 id="reqTitle">Заявка на материалы</h3>
    <p class="hint">${htmlEscape(context.obj.name)} · ${htmlEscape(context.block.name)} · ${htmlEscape(context.floor.num)} этаж. Укажите только то, что нужно.</p>
    <div class="order-rows">
      ${MATERIALS.map(material=>`<div class="order-row request-row"><span class="order-row-name">${htmlEscape(material.name)}<span class="hint"> · ${htmlEscape(material.unit)}</span></span><input type="number" min="0" max="1000" step="1" inputmode="numeric" value="0" data-request-qty="${htmlEscape(material.id)}" aria-label="${htmlEscape(material.name)}, ${htmlEscape(material.unit)}"></div>`).join('')}
    </div>
    <label class="field"><span>Комментарий</span><textarea rows="3" maxlength="1000" data-request-comment placeholder="Например: замки не подошли, нужна замена"></textarea></label>
    <div class="modal-actions"><button type="button" class="btn ghost" data-cancel>Отмена</button><button type="button" class="btn primary" data-confirm>Отправить заявку</button></div>
  </div>`;
  document.body.appendChild(overlay);
  const close=()=>overlay.remove();
  overlay.querySelector('[data-cancel]').addEventListener('click',close);
  overlay.addEventListener('click',event=>{if(event.target===overlay)close();});
  overlay.querySelector('[data-confirm]').addEventListener('click',async event=>{
    const items=[];
    for(const input of overlay.querySelectorAll('[data-request-qty]')){
      const qty=Number(input.value);
      if(!Number.isInteger(qty)||qty<0||qty>1000){toast('Количество должно быть целым числом от 0 до 1000');return;}
      if(qty>0)items.push({matId:input.dataset.requestQty,qty});
    }
    if(!items.length){toast('Укажите хотя бы один материал');return;}
    const comment=overlay.querySelector('[data-request-comment]').value.trim();
    const button=event.currentTarget;
    button.disabled=true;button.textContent='Отправляем…';
    const previousState=JSON.parse(JSON.stringify(state));
    try{
      if(foreman){
        await callFloorRpc('create_foreman_material_request',ids,{p_items:items,p_comment:comment});
      }else{
        state.requests=Array.isArray(state.requests)?state.requests:[];
        state.requests.unshift({
          id:newRecordId('req'),number:nextRequestNumber(),objId:context.obj.id,blockId:context.block.id,blockName:context.block.name,
          floorId:context.floor.id,floor:context.floor.num,items,comment,status:'new',brigadeId:context.floor.brigadeId||null,
          date:new Date().toISOString().slice(0,10),createdBy:'manager',createdByName:orderAuthorLabel(),
        });
        await saveManagerOpeningState();
      }
      close();toast('Заявка отправлена снабжению');render();
    }catch(error){
      state=previousState;
      button.disabled=false;button.textContent='Отправить заявку';
      toast(error.message||'Не удалось отправить заявку');
    }
  });
}

// Меняет статус заявки. При «Передано» списывает материалы со склада (один раз).
async function setRequestStatus(requestId,status){
  const request=(state.requests||[]).find(item=>item.id===requestId);
  if(!request||!REQ_STATUS_ORDER.includes(status)){render();return;}
  const previousState=JSON.parse(JSON.stringify(state));
  if(status==='delivered'&&!request.writtenOff){
    const shortages=requestShortages(request);
    if(shortages.length){
      toast(`На складе не хватает: ${shortages.map(row=>`${MAT_BY_ID[row.matId]?.name||row.matId} ${row.short} ${MAT_BY_ID[row.matId]?.unit||''}`).join(', ')}. Закажите недостающее или оформите приход.`);
      render();return;
    }
    const today=new Date().toISOString().slice(0,10);
    state.movements=Array.isArray(state.movements)?state.movements:[];
    (request.items||[]).forEach(item=>{
      state.movements.unshift({id:newRecordId('m'),type:'out',matId:item.matId,qty:Number(item.qty),note:`Заявка №${requestNumber(request)} · ${requestPlace(request)}`,date:today,requestId:request.id});
    });
    request.writtenOff=true;
  }
  request.status=status;
  try{
    await saveManagerOpeningState();
    toast(status==='delivered'?'Передано бригаде, материалы списаны со склада':'Статус заявки обновлён');
  }catch(error){
    state=previousState;
    toast(error.message||'Не удалось обновить заявку');
  }
  render();
}

// Заказ только на недостающее по заявке.
async function createShortageOrder(requestId){
  const request=(state.requests||[]).find(item=>item.id===requestId);
  if(!request)return;
  const shortages=requestShortages(request);
  if(!shortages.length){toast('На складе всё есть, заказывать нечего');render();return;}
  if(!confirm(`Создать заказ на недостающее по заявке №${requestNumber(request)}?`))return;
  const previousState=JSON.parse(JSON.stringify(state));
  const now=new Date();
  const obj=findObj(request.objId);
  const order={
    id:newRecordId('ord'),kind:'order',number:nextOrderNumber(),date:now.toISOString().slice(0,10),createdAt:now.toISOString(),createdBy:orderAuthorLabel(),
    objId:request.objId,objName:obj?.name||'',
    scope:[{blockId:request.blockId||'',blockName:request.blockName||'',floorId:request.floorId||'',floorNum:request.floor||'',openings:0}],
    items:shortages.map(row=>{const material=MAT_BY_ID[row.matId];return {key:`mat|${row.matId}`,kind:'material',matId:row.matId,name:material?.name||row.matId,unit:material?.unit||'',need:row.qty,stock:row.stock,qty:row.short,receivedQty:0};}),
    status:'created',comment:`По заявке №${requestNumber(request)}`,openingIds:[],requestId:request.id,
  };
  state.purchases=Array.isArray(state.purchases)?state.purchases:[];
  state.purchases.unshift(order);
  request.orderId=order.id;
  try{
    await saveManagerOpeningState();
    toast(`Заказ №${order.number} создан`);
    render();
    offerOrderDownload(order);
  }catch(error){
    state=previousState;
    toast(error.message||'Не удалось создать заказ');
    render();
  }
}

const bindPageEventsBeforeSupply=bindPageEvents;
bindPageEvents=function(){
  bindPageEventsBeforeSupply();
  const container=document.getElementById('content');
  if(!container)return;
  container.querySelectorAll('[data-floor-request]').forEach(element=>element.addEventListener('click',()=>openFloorRequestModal(JSON.parse(element.dataset.floorRequest))));
  container.querySelectorAll('[data-supply-status]').forEach(element=>element.addEventListener('change',()=>setRequestStatus(element.dataset.supplyStatus,element.value)));
  container.querySelectorAll('[data-supply-status-set]').forEach(element=>element.addEventListener('click',()=>setRequestStatus(element.dataset.supplyStatusSet,element.dataset.status)));
  container.querySelectorAll('[data-supply-short-order]').forEach(element=>element.addEventListener('click',()=>createShortageOrder(element.dataset.supplyShortOrder)));
  container.querySelectorAll('[data-supply-closed]').forEach(element=>element.addEventListener('click',()=>{supplyView.closed=element.dataset.supplyClosed==='1';render();}));
  container.querySelector('[data-supply-object]')?.addEventListener('change',event=>{supplyView.objId=event.currentTarget.value;render();});
  container.querySelectorAll('[data-goto-page]').forEach(element=>element.addEventListener('click',()=>goto(element.dataset.gotoPage,{})));
};
