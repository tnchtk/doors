/* =========================================================================
   EVENT BINDING (per-page)
   ========================================================================= */
function bindPageEvents(){
  const c=document.getElementById('content');
  if(route.page==='admin') bindAdminEvents(c);

  c.querySelector('[data-create-object]')?.addEventListener('click',createNewObject);
  c.querySelectorAll('[data-create-block]').forEach(el=>el.addEventListener('click',()=>createNewBlock(el.dataset.createBlock)));
  c.querySelectorAll('[data-create-floor]').forEach(el=>el.addEventListener('click',()=>createNewFloor(JSON.parse(el.dataset.createFloor))));
  c.querySelectorAll('[data-create-apartment]').forEach(el=>el.addEventListener('click',()=>createNewApartment(JSON.parse(el.dataset.createApartment))));
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
  overlay.querySelector('form').addEventListener('submit',e=>{
    e.preventDefault();
    const values=Object.fromEntries(new FormData(e.currentTarget).entries());
    if(onSave(values)!==false)close();
  });
  overlay.querySelector('input,select')?.focus();
}

function createNewObject(){
  openDataEntryModal('Новый объект',[
    {id:'name',label:'Название объекта',required:true},
    {id:'address',label:'Адрес'},
  ],values=>{
    const name=values.name.trim();
    if(!name){toast('Введите название объекта');return false;}
    if(state.objects.some(o=>o.name.trim().toLocaleLowerCase()===name.toLocaleLowerCase())){toast('Объект с таким названием уже есть');return false;}
    const obj={id:newRecordId('o'),name,address:values.address.trim(),blocks:[]};
    state.objects.push(obj);saveState();goto('objects',{objId:obj.id});toast('Объект создан');return true;
  });
}

function createNewBlock(objId){
  const obj=state.objects.find(o=>o.id===objId);if(!obj)return;
  const nextNumber=obj.blocks.length+1;
  openDataEntryModal('Новый блок',[
    {id:'name',label:'Название блока',value:`Блок ${nextNumber}`,required:true},
  ],values=>{
    const name=values.name.trim();
    if(!name){toast('Введите название блока');return false;}
    if(obj.blocks.some(b=>b.name.trim().toLocaleLowerCase()===name.toLocaleLowerCase())){toast('Такой блок уже есть');return false;}
    const block={id:newRecordId('b'),name,floors:[]};
    obj.blocks.push(block);saveState();goto('objects',{objId:obj.id,blockId:block.id});toast('Блок создан');return true;
  });
}

function createNewFloor(ctx){
  const obj=state.objects.find(o=>o.id===ctx.objId),block=obj?.blocks.find(b=>b.id===ctx.blockId);if(!block)return;
  const nextNumber=Math.max(0,...block.floors.map(f=>Number(f.num)||0))+1;
  openDataEntryModal('Новый этаж',[
    {id:'num',label:'Номер этажа',type:'number',value:nextNumber,min:1,step:1,required:true},
    {id:'brigadeId',label:'Бригада',options:[{value:'',label:'Не назначена'},...state.brigades.map(b=>({value:b.id,label:b.name}))]},
  ],values=>{
    const num=Number(values.num);
    if(!Number.isInteger(num)||num<1){toast('Укажите корректный номер этажа');return false;}
    if(block.floors.some(f=>Number(f.num)===num)){toast('Такой этаж уже есть');return false;}
    const floor={id:newRecordId('f'),num,brigadeId:values.brigadeId||null,apartments:[]};
    block.floors.push(floor);saveState();goto('objects',{objId:obj.id,blockId:block.id,floorId:floor.id});toast('Этаж добавлен');return true;
  });
}

function createNewApartment(ctx){
  const obj=state.objects.find(o=>o.id===ctx.objId),block=obj?.blocks.find(b=>b.id===ctx.blockId),floor=block?.floors.find(f=>f.id===ctx.floorId);if(!floor)return;
  openDataEntryModal('Новая квартира',[
    {id:'num',label:'Номер квартиры',required:true},
    {id:'doorCount',label:'Количество дверей',type:'number',value:1,min:1,max:100,step:1,required:true},
  ],values=>{
    const num=values.num.trim(),doorCount=Number(values.doorCount);
    if(!num||!Number.isInteger(doorCount)||doorCount<1||doorCount>100){toast('Проверьте номер квартиры и количество дверей');return false;}
    if(floor.apartments.some(a=>String(a.num).trim()===num)){toast('Такая квартира на этаже уже есть');return false;}
    const apt={id:newRecordId('apt'),num,doors:Array.from({length:doorCount},(_,i)=>({id:newRecordId('d'),n:i+1,status:'not_started',problem:null,photo:false}))};
    floor.apartments.push(apt);saveState();goto('objects',{objId:obj.id,blockId:block.id,floorId:floor.id,aptId:apt.id});toast('Квартира добавлена');return true;
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
  openDataEntryModal('Новая бригада',[
    {id:'name',label:'Название бригады',required:true},
    {id:'leader',label:'Бригадир',required:true},
    {id:'phone',label:'Телефон'},
    {id:'workers',label:'Количество сотрудников',type:'number',value:1,min:1,step:1,required:true},
    {id:'pricePerDoor',label:'Оплата за дверь, сом',type:'number',value:0,min:0,step:'0.01'},
  ],values=>{
    const name=values.name.trim(),leader=values.leader.trim(),workers=Number(values.workers),price=Number(values.pricePerDoor)||0;
    if(!name||!leader||!Number.isInteger(workers)||workers<1||price<0){toast('Проверьте данные бригады');return false;}
    if(state.brigades.some(b=>b.name.trim().toLocaleLowerCase()===name.toLocaleLowerCase())){toast('Такая бригада уже есть');return false;}
    const brigade={id:newRecordId('br'),name,leader,phone:values.phone.trim(),workers,pricePerDoor:price,advance:0,paid:0};
    state.brigades.push(brigade);saveState();render();toast('Бригада создана');return true;
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
        <input value="${findObj(ctx.objId).name}, ${ctx.blockName}, ${ctx.floor} эт., кв. ${ctx.apt}" disabled></div>
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
