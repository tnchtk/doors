/* =========================================================================
   EVENT BINDING (per-page)
   ========================================================================= */
function bindPageEvents(){
  const c=document.getElementById('content');
  bindBrigadeFinanceEvents(c);
  if(route.page==='admin') bindAdminEvents(c);
  if(route.page==='reports') bindAvrEvents(c);

  c.querySelector('[data-create-object]')?.addEventListener('click',createNewObject);
  c.querySelectorAll('[data-delete-object]').forEach(button=>button.addEventListener('click',event=>{
    event.stopPropagation();
    deleteWorkspaceObject(button.dataset.deleteObject,button);
  }));
  c.querySelectorAll('[data-object-archive]').forEach(button=>button.addEventListener('click',()=>toggleWorkspaceObjectArchive(button.dataset.objectArchive,button)));
  c.querySelectorAll('[data-managed-object-edit]').forEach(button=>button.addEventListener('click',()=>editExistingObject(button.dataset.managedObjectEdit)));
  c.querySelectorAll('[data-managed-block-edit]').forEach(button=>button.addEventListener('click',()=>editExistingBlock(JSON.parse(button.dataset.managedBlockEdit))));
  c.querySelectorAll('[data-create-block]').forEach(el=>el.addEventListener('click',()=>createNewBlock(el.dataset.createBlock)));
  c.querySelectorAll('[data-edit-block]').forEach(el=>el.addEventListener('click',event=>{
    event.stopPropagation();
    editExistingBlock(JSON.parse(el.dataset.editBlock));
  }));
  c.querySelectorAll('[data-create-floor]').forEach(el=>el.addEventListener('click',()=>createNewFloor(JSON.parse(el.dataset.createFloor))));
  c.querySelectorAll('[data-copy-floor]').forEach(el=>el.addEventListener('click',event=>{
    event.stopPropagation();
    openCopyFloorModal(JSON.parse(el.dataset.copyFloor));
  }));
  c.querySelectorAll('[data-floor-rate]').forEach(el=>el.addEventListener('click',event=>{
    event.stopPropagation();
    openFloorFinanceEditor(JSON.parse(el.dataset.floorRate));
  }));
  c.querySelectorAll('[data-create-door]').forEach(el=>el.addEventListener('click',()=>createNewDoor(JSON.parse(el.dataset.createDoor))));
  c.querySelector('[data-create-brigade]')?.addEventListener('click',createNewBrigade);

  c.querySelectorAll('[data-open-obj]').forEach(el=>el.addEventListener('click',()=>goto('objects',{objId:el.dataset.openObj})));
  c.querySelectorAll('[data-open-block]').forEach(el=>el.addEventListener('click',()=>goto('objects',{objId:route.objId, blockId:el.dataset.openBlock})));
  c.querySelectorAll('[data-open-floor]').forEach(el=>el.addEventListener('click',()=>goto('objects',{objId:route.objId, blockId:route.blockId, floorId:el.dataset.openFloor})));
  c.querySelectorAll('[data-open-apt]').forEach(el=>el.addEventListener('click',()=>goto('objects',{objId:route.objId, blockId:route.blockId, floorId:route.floorId, aptId:el.dataset.openApt})));
  c.querySelectorAll('[data-open-brigade]').forEach(el=>el.addEventListener('click',()=>goto('brigades',{brigadeId:el.dataset.openBrigade})));

  c.querySelectorAll('[data-crumb-go]').forEach(el=>{
    el.addEventListener('click',()=>{
      const target=JSON.parse(el.dataset.crumbGo);
      goto(target.page, target);
    });
  });

  if(cloudEnabled&&cloudProfile?.role==='foreman')return;

  c.querySelectorAll('[data-door-status]').forEach(el=>{
    el.addEventListener('click', (e)=>openStatusMenu(e, JSON.parse(el.dataset.doorStatus)));
  });

  c.querySelectorAll('[data-req-status]').forEach(el=>{
    el.addEventListener('change', ()=>{
      const req=state.requests.find(r=>r.id===el.dataset.reqStatus);
      req.status=el.value; saveState(); toast('Статус заявки обновлён'); render();
    });
  });
  c.querySelectorAll('[data-pur-status]').forEach(el=>{
    el.addEventListener('change', ()=>{
      const p=state.purchases.find(x=>x.id===el.dataset.purStatus);
      p.status=el.value; saveState(); toast('Статус закупки обновлён'); render();
    });
  });

  c.querySelectorAll('[data-new-request]').forEach(el=>el.addEventListener('click',()=>openRequestModal(JSON.parse(el.dataset.newRequest))));
  c.querySelectorAll('[data-new-purchase]').forEach(el=>el.addEventListener('click',()=>openPurchaseModal(JSON.parse(el.dataset.newPurchase))));
  c.querySelectorAll('[data-new-movement]').forEach(el=>el.addEventListener('click',()=>openMovementModal()));
  c.querySelectorAll('[data-resolve-problem]').forEach(el=>el.addEventListener('click',()=>resolveProblem(JSON.parse(el.dataset.resolveProblem))));
  c.querySelectorAll('[data-export]').forEach(el=>el.addEventListener('click',()=>exportCSV(el.dataset.export)));
}

function newRecordId(prefix){
  const suffix=window.crypto?.randomUUID?window.crypto.randomUUID().replaceAll('-',''):`${Date.now().toString(36)}${Math.random().toString(36).slice(2,10)}`;
  return `${prefix}${suffix}`;
}

function openDataEntryModal(title,fields,onSave){
  const overlay=document.createElement('div');
  overlay.className='overlay';
  overlay.innerHTML=`<div class="modal" role="dialog" aria-modal="true">
    <h3>${adminEsc(title)}</h3>
    <form>
      ${fields.map(f=>`<div class="field"><label for="entry_${adminEsc(f.id)}">${adminEsc(f.label)}</label>${f.options?`<select id="entry_${adminEsc(f.id)}" name="${adminEsc(f.id)}">${f.options.map(o=>`<option value="${adminEsc(o.value)}" ${String(o.value)===String(f.value)?'selected':''}>${adminEsc(o.label)}</option>`).join('')}</select>`:`<input id="entry_${adminEsc(f.id)}" name="${adminEsc(f.id)}" type="${f.type||'text'}" value="${adminEsc(f.value??'')}" ${f.min!==undefined?`min="${f.min}"`:''} ${f.max!==undefined?`max="${f.max}"`:''} ${f.step!==undefined?`step="${f.step}"`:''} ${f.required?'required':''}>`}</div>`).join('')}
      <div class="modal-actions"><button type="button" class="btn ghost" data-cancel>Отмена</button><button type="submit" class="btn primary">Создать</button></div>
    </form>
  </div>`;
  document.body.appendChild(overlay);
  const close=()=>overlay.remove();
  overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
  overlay.querySelector('[data-cancel]').addEventListener('click',close);
  overlay.querySelector('form').addEventListener('submit',async e=>{
    e.preventDefault();
    const form=e.currentTarget,button=form.querySelector('[type="submit"]');
    const values=Object.fromEntries(new FormData(form).entries());
    button.disabled=true;button.textContent='Сохраняем…';
    try{if(await onSave(values)!==false)close();}
    catch(error){toast(error.message||'Не удалось сохранить данные');}
    finally{if(button.isConnected){button.disabled=false;button.textContent='Создать';}}
  });
  overlay.querySelector('input,select')?.focus();
  return overlay;
}

async function toggleWorkspaceObjectArchive(objectId,button){
  if(!canManageWorkspace()){toast('Архивировать объекты могут только администратор или менеджер');return;}
  const object=state.objects.find(item=>item.id===objectId);if(!object)return;
  const wasArchived=Boolean(object.archivedAt);
  if(!wasArchived&&!confirm(`Архивировать объект «${object.name}»?\n\nОн скроется из рабочих списков, но данные сохранятся и объект можно будет восстановить.`))return;
  const previousState=JSON.parse(JSON.stringify(state));
  button.disabled=true;
  object.archivedAt=wasArchived?null:new Date().toISOString();
  try{
    await saveState();
    if(cloudEnabled&&cloudWriteBlocked){
      try{await readCloudState();}catch{state=previousState;}
      render();toast('Изменение не сохранено. Проверьте подключение и повторите попытку.');return;
    }
    render();toast(wasArchived?`Объект «${object.name}» восстановлен`:`Объект «${object.name}» перемещён в архив`);
  }catch(error){
    state=previousState;render();toast(error.message||'Не удалось изменить объект');
  }finally{
    if(button.isConnected)button.disabled=false;
  }
}

function createNewObject(){
  openDataEntryModal('Новый объект',[
    {id:'name',label:'Название объекта',required:true},
    {id:'address',label:'Адрес'},
  ],async values=>{
    const name=values.name.trim();
    if(!name){toast('Введите название объекта');return false;}
    if(state.objects.some(o=>o.name.trim().toLocaleLowerCase()===name.toLocaleLowerCase())){toast('Объект с таким названием уже есть');return false;}
    const previousState=JSON.parse(JSON.stringify(state));
    const obj={id:newRecordId('o'),name,address:values.address.trim(),blocks:[]};
    state.objects.push(obj);
    await saveState();
    if(cloudEnabled&&cloudWriteBlocked){try{await readCloudState();}catch{state=previousState;}render();throw new Error('Объект не сохранён. Обновите данные и повторите попытку.');}
    if(route.page==='object-management'||route.page==='admin')render();
    else goto('objects',{objId:obj.id});
    toast('Объект создан');return true;
  });
}

async function deleteWorkspaceObject(objectId,button){
  if(!isAdminWorkspaceUser()){toast('Окончательно удалять объекты может только администратор');return;}
  const object=state.objects.find(item=>item.id===objectId);if(!object)return;
  const requestCount=(state.requests||[]).filter(request=>request.objId===objectId).length;
  const details=`Блоки, этажи, квартиры, двери и заявки на материалы (${requestCount}) также будут удалены.`;
  if(!confirm(`Удалить объект «${object.name}» навсегда?\n\n${details}\n\nЭто действие нельзя отменить.`))return;

  const previousState=JSON.parse(JSON.stringify(state));
  button.disabled=true;
  state.objects=state.objects.filter(item=>item.id!==objectId);
  state.requests=(state.requests||[]).filter(request=>request.objId!==objectId);
  try{
    await saveState();
    if(cloudEnabled&&cloudWriteBlocked){
      try{await readCloudState();}catch{state=previousState;}
      render();
      toast('Удаление не сохранено. Проверьте подключение и повторите попытку.');
      return;
    }
    render();
    toast(`Объект «${object.name}» удалён`);
  }catch(error){
    state=previousState;
    render();
    toast(error.message||'Не удалось удалить объект');
  }finally{
    if(button.isConnected)button.disabled=false;
  }
}

function createNewBlock(objId){
  const obj=state.objects.find(o=>o.id===objId);if(!obj)return;
  const nextNumber=obj.blocks.length+1;
  openDataEntryModal('Новый блок',[
    {id:'name',label:'Название блока',value:`Блок ${nextNumber}`,required:true},
  ],async values=>{
    const name=values.name.trim();
    if(!name){toast('Введите название блока');return false;}
    if(obj.blocks.some(b=>b.name.trim().toLocaleLowerCase()===name.toLocaleLowerCase())){toast('Такой блок уже есть');return false;}
    const previousState=JSON.parse(JSON.stringify(state));
    const block={id:newRecordId('b'),name,floors:[]};
    obj.blocks.push(block);
    await saveState();
    if(cloudEnabled&&cloudWriteBlocked){try{await readCloudState();}catch{state=previousState;}render();throw new Error('Блок не сохранён. Обновите данные и повторите попытку.');}
    if(route.page==='object-management'||route.page==='admin')render();
    else goto('objects',{objId:obj.id,blockId:block.id});
    toast('Блок создан');return true;
  });
}

function createNewFloor(ctx){
  const obj=state.objects.find(o=>o.id===ctx.objId),block=obj?.blocks.find(b=>b.id===ctx.blockId);if(!block)return;
  const nextNumber=Math.max(0,...block.floors.map(f=>Number(f.num)||0))+1;
  const fields=[
    {id:'num',label:'Номер этажа',type:'number',value:nextNumber,min:1,step:1,required:true},
    {id:'brigadeId',label:'Бригада',options:[{value:'',label:'Не назначена'},...state.brigades.map(b=>({value:b.id,label:b.name}))]},
  ];
  if(isAdminWorkspaceUser())fields.push({id:'ratePerOpening',label:'Оплата за проём, сом',type:'number',value:'',min:0,step:'0.01'});
  const overlay=openDataEntryModal('Новый этаж',fields,async values=>{
    const num=Number(values.num);
    if(!Number.isInteger(num)||num<1){toast('Укажите корректный номер этажа');return false;}
    if(block.floors.some(f=>Number(f.num)===num)){toast('Такой этаж уже есть');return false;}
    const brigadeId=values.brigadeId||null,rate=isAdminWorkspaceUser()&&values.ratePerOpening!==''?Number(values.ratePerOpening):null;
    if(brigadeId&&isAdminWorkspaceUser()&&(!Number.isFinite(rate)||rate<=0)){toast('Укажите цену за проём для назначенной бригады');return false;}
    const previousState=JSON.parse(JSON.stringify(state));
    const floor={id:newRecordId('f'),num,brigadeId,ratePerOpening:rate,apartments:[]};
    block.floors.push(floor);await saveState();
    if(cloudEnabled&&cloudWriteBlocked){try{await readCloudState();}catch{state=previousState;}render();throw new Error('Этаж не сохранён. Обновите данные и повторите попытку.');}
    goto('objects',{objId:obj.id,blockId:block.id,floorId:floor.id});toast('Этаж добавлен');return true;
  });
  if(isAdminWorkspaceUser()){
    const brigadeSelect=overlay.querySelector('#entry_brigadeId'),rateInput=overlay.querySelector('#entry_ratePerOpening');
    brigadeSelect?.addEventListener('change',()=>{
      const brigade=state.brigades.find(item=>item.id===brigadeSelect.value);
      rateInput.value=brigade?.defaultRatePerOpening??'';
    });
  }
}

function openCopyFloorModal(ctx){
  if(!canManageWorkspace()||(cloudEnabled&&cloudProfile?.role==='foreman')){toast('Копировать этажи может администратор или менеджер');return;}
  const obj=state.objects.find(item=>item.id===ctx.objId),block=obj?.blocks.find(item=>item.id===ctx.blockId),source=block?.floors.find(item=>item.id===ctx.floorId);
  if(!obj||!block||!source)return;
  const nextFloorNumber=Math.max(0,...block.floors.map(item=>Number(item.num)||0))+1;
  const sourceApartments=source.apartments||[];
  const fields=[{id:'num',label:'Номер нового этажа',type:'number',value:nextFloorNumber,min:1,step:1,required:true}];
  openDataEntryModal(`Копировать этаж ${source.num}`,fields,async values=>{
    const num=Number(values.num);
    if(!Number.isSafeInteger(num)||num<1){toast('Укажите корректный номер этажа');return false;}
    if(block.floors.some(item=>Number(item.num)===num)){toast('Такой этаж в блоке уже есть');return false;}
    const duplicate={
      id:newRecordId('f'),
      num,
      brigadeId:source.brigadeId||null,
      ratePerOpening:source.ratePerOpening??null,
      apartments:sourceApartments.map(apartment=>({
        id:newRecordId('apt'),
        num:apartment.isFloorContainer?`Этаж ${num}`:apartment.num,
        isFloorContainer:Boolean(apartment.isFloorContainer),
        openings:(apartment.openings||[]).map((opening,openingIndex)=>({
          id:newRecordId('op'),
          type:OPENING_TYPE_LABELS[opening.type]?opening.type:'custom',
          n:Number(opening.n)||openingIndex+1,
          title:opening.title||`${OPENING_TYPE_LABELS[opening.type]||OPENING_TYPE_LABELS.custom} ${Number(opening.n)||openingIndex+1}`,
          doors:(opening.doors||[]).map((door,doorIndex)=>makeDoorLeaf(doorIndex+1,Boolean(door.glass),{widthMm:door.widthMm,heightMm:door.heightMm})),
          reviewStatus:'not_submitted',
          foremanNote:'',
          managerNote:'',
          submittedAt:null,
          acceptedAt:null,
        })),
      })),
    };
    const previousState=JSON.parse(JSON.stringify(state));
    block.floors.push(duplicate);
    await saveState();
    if(cloudEnabled&&cloudWriteBlocked){
      try{await readCloudState();}catch{state=previousState;}
      render();
      throw new Error('Этаж не скопирован. Обновите данные и повторите попытку.');
    }
    goto('objects',{objId:obj.id,blockId:block.id,floorId:duplicate.id});
    toast(`Этаж ${num} скопирован. Состав, бригада и тариф перенесены; статусы, фото и история выплат — нет.`);
    return true;
  });
}

function createNewDoor(ctx){
  const obj=state.objects.find(o=>o.id===ctx.objId),block=obj?.blocks.find(b=>b.id===ctx.blockId),floor=block?.floors.find(f=>f.id===ctx.floorId),apt=floor?.apartments.find(a=>a.id===ctx.aptId);if(!apt)return;
  const nextNumber=Math.max(0,...apt.doors.map(d=>Number(d.n)||0))+1;
  openDataEntryModal('Добавить дверь',[
    {id:'num',label:'Номер двери в квартире',type:'number',value:nextNumber,min:1,step:1,required:true},
  ],values=>{
    const num=Number(values.num);
    if(!Number.isInteger(num)||num<1){toast('Укажите корректный номер двери');return false;}
    if(apt.doors.some(d=>Number(d.n)===num)){toast('Такой номер двери уже есть');return false;}
    apt.doors.push({id:newRecordId('d'),n:num,status:'not_started',problem:null,photo:false});
    apt.doors.sort((a,b)=>a.n-b.n);saveState();render();toast('Дверь добавлена');return true;
  });
}

function createNewBrigade(){
  const fields=[
    {id:'name',label:'Название бригады',required:true},
    {id:'leader',label:'Бригадир',required:true},
    {id:'phone',label:'Телефон'},
    {id:'workers',label:'Количество сотрудников',type:'number',value:1,min:1,step:1,required:true},
  ];
  if(isAdminWorkspaceUser())fields.push({id:'defaultRatePerOpening',label:'Базовая цена за проём для новых этажей, сом',type:'number',value:'',min:0,step:'0.01'});
  openDataEntryModal('Новая бригада',fields,async values=>{
    const name=values.name.trim(),leader=values.leader.trim(),workers=Number(values.workers);
    const defaultRate=isAdminWorkspaceUser()&&values.defaultRatePerOpening!==''?Number(values.defaultRatePerOpening):null;
    if(!name||!leader||!Number.isInteger(workers)||workers<1||(defaultRate!==null&&(!Number.isFinite(defaultRate)||defaultRate<=0))){toast('Проверьте данные бригады');return false;}
    if(state.brigades.some(b=>b.name.trim().toLocaleLowerCase()===name.toLocaleLowerCase())){toast('Такая бригада уже есть');return false;}
    const previousState=JSON.parse(JSON.stringify(state));
    const brigade={id:newRecordId('br'),name,leader,phone:values.phone.trim(),workers,defaultRatePerOpening:defaultRate};
    state.brigades.push(brigade);await saveState();
    if(cloudEnabled&&cloudWriteBlocked){try{await readCloudState();}catch{state=previousState;}render();throw new Error('Бригада не сохранена. Обновите данные и повторите попытку.');}
    render();toast('Бригада создана');return true;
  });
}

/* ---- status menu for a door ---- */
function openStatusMenu(e, ref){
  closeMenus();
  const menu=document.createElement('div');
  menu.className='status-menu';
  menu.innerHTML = STATUS_ORDER.map(s=>`<div class="opt" data-set-status="${s}"><span class="dot ${STATUS[s].cls}"></span>${STATUS[s].label}</div>`).join('');
  document.body.appendChild(menu);
  const rect=e.currentTarget.getBoundingClientRect();
  let top=rect.bottom+6, left=rect.left;
  if(top+240>window.innerHeight) top=rect.top-244;
  if(left+200>window.innerWidth) left=window.innerWidth-210;
  menu.style.top=top+'px'; menu.style.left=left+'px';
  menu.querySelectorAll('[data-set-status]').forEach(opt=>{
    opt.addEventListener('click',()=>{
      const door=findApt(ref.objId,ref.blockId,ref.floorId,ref.aptId).doors.find(d=>d.id===ref.doorId);
      const newStatus=opt.dataset.setStatus;
      door.status=newStatus;
      if(newStatus==='problem'){
        closeMenus();
        openProblemPickModal(ref);
        return;
      }
      door.problem=null;
      door.photo = (newStatus==='installed'||newStatus==='accepted');
      saveState(); toast('Статус двери обновлён'); closeMenus(); render();
    });
  });
  setTimeout(()=>document.addEventListener('click', closeMenus, {once:true}), 0);
}
function closeMenus(){document.querySelectorAll('.status-menu').forEach(m=>m.remove());}

function openProblemPickModal(ref){
  const overlay=document.createElement('div');
  overlay.className='overlay';
  overlay.innerHTML=`
    <div class="modal">
      <h3>Укажите проблему</h3>
      <div class="field">
        <select id="problemSelect">
          ${PROBLEM_TYPES.map(p=>`<option>${p}</option>`).join('')}
        </select>
      </div>
      <div class="modal-actions">
        <button class="btn ghost" data-cancel>Отмена</button>
        <button class="btn primary" data-confirm>Сохранить</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('[data-cancel]').addEventListener('click',()=>overlay.remove());
  overlay.querySelector('[data-confirm]').addEventListener('click',()=>{
    const door=findApt(ref.objId,ref.blockId,ref.floorId,ref.aptId).doors.find(d=>d.id===ref.doorId);
    door.status='problem';
    door.problem=overlay.querySelector('#problemSelect').value;
    saveState(); toast('Проблема зафиксирована'); overlay.remove(); render();
  });
}

function resolveProblem(ref){
  const door=findApt(ref.objId,ref.blockId,ref.floorId,ref.aptId).doors.find(d=>d.id===ref.doorId);
  door.status='installed';
  door.problem=null;
  door.photo=true;
  saveState(); toast('Проблема решена, дверь отмечена установленной'); render();
}

/* ---- new supply request modal ---- */
function openRequestModal(ctx){
  const overlay=document.createElement('div');
  overlay.className='overlay';
  overlay.innerHTML=`
    <div class="modal">
      <h3>Новая заявка на материалы</h3>
      <div class="field"><label>Объект / блок / этаж / квартира</label>
        <input value="${htmlEscape(findObj(ctx.objId).name)}, ${htmlEscape(ctx.blockName)}, ${ctx.floor} эт., кв. ${ctx.apt}" disabled></div>
      <div id="reqItems">
        ${MATERIALS.slice(0,6).map(m=>`
          <div class="mini-grid"><span class="m-name">${m.name}</span><input type="number" min="0" value="0" data-mat="${m.id}"></div>
        `).join('')}
      </div>
      <div class="field"><label>Комментарий</label><textarea id="reqComment" placeholder="Например: не хватает комплекта на две двери"></textarea></div>
      <div class="modal-actions">
        <button class="btn ghost" data-cancel>Отмена</button>
        <button class="btn primary" data-confirm>Отправить заявку</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e=>{if(e.target===overlay) overlay.remove();});
  overlay.querySelector('[data-cancel]').addEventListener('click',()=>overlay.remove());
  overlay.querySelector('[data-confirm]').addEventListener('click',()=>{
    const items=[...overlay.querySelectorAll('[data-mat]')].map(inp=>({matId:inp.dataset.mat, qty:parseInt(inp.value)||0})).filter(it=>it.qty>0);
    if(items.length===0){toast('Укажите хотя бы один материал'); return;}
    state.requests.unshift({
      id:'req'+(state.requests.length+1)+Date.now()%1000,
      objId:ctx.objId, blockName:ctx.blockName, floor:ctx.floor, apt:ctx.apt,
      items, comment:overlay.querySelector('#reqComment').value, status:'new',
      brigadeId:ctx.brigadeId, date:new Date().toISOString().slice(0,10),
    });
    saveState(); toast('Заявка создана и отправлена снабжению'); overlay.remove(); render();
  });
}

/* ---- new purchase modal ---- */
function openPurchaseModal(ctx){
  const overlay=document.createElement('div');
  overlay.className='overlay';
  overlay.innerHTML=`
    <div class="modal">
      <h3>Создать закупку</h3>
      <div class="field"><label>Материал</label><input value="${MAT_BY_ID[ctx.matId].name}" disabled></div>
      <div class="field"><label>Количество</label><input type="number" id="purQty" value="${ctx.qty}"></div>
      <div class="field"><label>Поставщик</label><input id="purSupplier" placeholder="Название поставщика"></div>
      <div class="field"><label>Цена за ед., сом</label><input type="number" id="purPrice" value="150"></div>
      <div class="modal-actions">
        <button class="btn ghost" data-cancel>Отмена</button>
        <button class="btn primary" data-confirm>Создать</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e=>{if(e.target===overlay) overlay.remove();});
  overlay.querySelector('[data-cancel]').addEventListener('click',()=>overlay.remove());
  overlay.querySelector('[data-confirm]').addEventListener('click',()=>{
    const supplier=overlay.querySelector('#purSupplier').value || 'Без названия';
    state.purchases.unshift({
      id:'p'+(state.purchases.length+1)+Date.now()%1000,
      matId:ctx.matId,
      qty:parseInt(overlay.querySelector('#purQty').value)||0,
      supplier, price:parseFloat(overlay.querySelector('#purPrice').value)||0,
      status:'created', date:new Date().toISOString().slice(0,10),
    });
    saveState(); toast('Закупка создана'); overlay.remove(); render();
  });
}

/* ---- new movement modal ---- */
function openMovementModal(){
  const overlay=document.createElement('div');
  overlay.className='overlay';
  overlay.innerHTML=`
    <div class="modal">
      <h3>Добавить движение склада</h3>
      <div class="field"><label>Тип</label>
        <select id="movType"><option value="in">Приход</option><option value="out">Выдача</option><option value="move">Перемещение</option></select>
      </div>
      <div class="field"><label>Материал</label>
        <select id="movMat">${MATERIALS.map(m=>`<option value="${m.id}">${m.name}</option>`).join('')}</select>
      </div>
      <div class="field"><label>Количество</label><input type="number" id="movQty" value="10"></div>
      <div class="field"><label>Комментарий</label><input id="movNote" placeholder="Например: Блок 1 → Блок 2"></div>
      <div class="modal-actions">
        <button class="btn ghost" data-cancel>Отмена</button>
        <button class="btn primary" data-confirm>Сохранить</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e=>{if(e.target===overlay) overlay.remove();});
  overlay.querySelector('[data-cancel]').addEventListener('click',()=>overlay.remove());
  overlay.querySelector('[data-confirm]').addEventListener('click',()=>{
    state.movements.unshift({
      id:'m'+(state.movements.length+1)+Date.now()%1000,
      type:overlay.querySelector('#movType').value,
      matId:overlay.querySelector('#movMat').value,
      qty:parseInt(overlay.querySelector('#movQty').value)||0,
      note:overlay.querySelector('#movNote').value,
      date:new Date().toISOString().slice(0,10),
    });
    saveState(); toast('Движение добавлено'); overlay.remove(); render();
  });
}

/* ---- CSV export (client-side, no download API needed) ---- */
