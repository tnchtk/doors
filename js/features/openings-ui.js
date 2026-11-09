function floorOpeningsList(obj,block,floor){
  const brigade=state.brigades.find(item=>item.id===floor.brigadeId);
  const openings=(floor.apartments||[]).flatMap(apt=>(apt.openings||[]).map(opening=>({apt,opening})));
  const doors=openings.flatMap(item=>item.opening.doors||[]);
  const acceptedCount=openings.filter(item=>acceptedOpening(item.opening)).length;
  const materialRows=materialsTable(openings.map(item=>item.opening)).filter(item=>item.needed>0);
  const foreman=isForemanWorkspaceUser();
  const canWork=foreman||!cloudEnabled;
  const manager=canManageWorkspace()&&!foreman;
  const ids={objId:obj.id,blockId:block.id,floorId:floor.id};
  return `
    ${crumb([{label:'Объекты',click:{page:'objects'}},{label:obj.name,click:{page:'objects',objId:obj.id}},{label:block.name,click:{page:'objects',objId:obj.id,blockId:block.id}},{label:`${floor.num} этаж`}])}
    <section class="panel floor-door-summary">
      <div><span class="dashboard-eyebrow">Ведомость этажа</span><h3>${openings.length} ${openings.length===1?'проём':'проёмов'} · ${doors.length} ${doors.length===1?'дверь':'дверей'}</h3><p>Бригада: <strong>${htmlEscape(brigade?.name||'Не назначена')}</strong> · Принято: ${acceptedCount}</p></div>
      ${canManageWorkspace()?`<button type="button" class="btn primary" data-add-floor-doors='${htmlEscape(JSON.stringify(ids))}'>+ Добавить двери</button>`:''}
    </section>
    ${manager?'<div class="opening-role-hint">Состав двери задаётся здесь. Двойная дверь считается одним проёмом с двумя полотнами.</div>':''}
    ${foreman?'<div class="opening-role-hint">Отмечайте установку каждого полотна, добавляйте фото и отправляйте готовые проёмы менеджеру.</div>':''}
    <div class="opening-list floor-opening-list">
      ${openings.map(({apt,opening})=>renderOpeningCard({obj,block,floor,apt,floorLevel:true},opening,{canWork,manager,foreman})).join('')||'<div class="empty">На этаже пока нет дверей. Менеджер может добавить состав этажа.</div>'}
    </div>
    <section class="panel opening-material-panel"><div class="panel-head"><div><h3>Комплектующие на этаже</h3><span class="hint">Потребность по всему заданному составу</span></div></div><div class="opening-material-grid">${materialRows.map(item=>`<div><span>${htmlEscape(item.name)}</span><strong>${openingQty(item.needed)} ${htmlEscape(item.unit)}</strong></div>`).join('')||'<span class="hint">Добавьте двери, чтобы рассчитать комплектующие.</span>'}</div></section>
  `;
}

const FLOOR_DOOR_TYPES=[
  {type:'single_glass',label:'Одинарная дверь со стеклом',double:false,glass:true},
  {type:'single_solid',label:'Одинарная глухая дверь',double:false,glass:false},
  {type:'double_glass',label:'Двойная дверь со стеклом',double:true,glass:true},
  {type:'double_solid',label:'Двойная глухая дверь',double:true,glass:false},
];

function openFloorDoorBatchModal(ids){
  if(!canManageWorkspace()||isForemanWorkspaceUser()){toast('Добавлять двери может администратор или менеджер');return;}
  const obj=state.objects.find(item=>item.id===ids.objId);
  const block=obj?.blocks.find(item=>item.id===ids.blockId);
  const floor=block?.floors.find(item=>item.id===ids.floorId);
  if(!obj||!block||!floor)return;
  const overlay=document.createElement('div');
  overlay.className='overlay';
  overlay.innerHTML=`<div class="modal floor-door-modal" role="dialog" aria-modal="true" aria-labelledby="floorDoorTitle">
    <h3 id="floorDoorTitle">Добавить двери · ${htmlEscape(floor.num)} этаж</h3>
    <p class="hint">Для каждой позиции укажите количество и размер в миллиметрах. Для двойной двери ширина указывается на одну створку.</p>
    <div class="opening-template-note">Двойная дверь — один проём из двух полотен. При принятии к тарифу за проём добавится 500 сомов.</div>
    <form>
      <div class="floor-door-form-list">${FLOOR_DOOR_TYPES.map(item=>`<div class="floor-door-form-row">
        <div class="floor-door-kind"><strong>${item.label}</strong><span>${item.double?'1 проём · 2 полотна':'1 проём · 1 полотно'}</span></div>
        <label class="field"><span>Количество</span><input type="number" name="count_${item.type}" value="0" min="0" max="500" step="1" inputmode="numeric" aria-label="Количество · ${item.label}"></label>
        <label class="field"><span>Ширина ${item.double?'створки':'двери'}, мм</span><input type="number" name="width_${item.type}" min="1" max="5000" step="1" inputmode="numeric" placeholder="Например, 700" aria-label="Ширина ${item.double?'створки':'двери'}, миллиметры · ${item.label}"></label>
        <label class="field"><span>Высота, мм</span><input type="number" name="height_${item.type}" min="1" max="5000" step="1" inputmode="numeric" placeholder="Например, 2000" aria-label="Высота, миллиметры · ${item.label}"></label>
      </div>`).join('')}</div>
      <div class="modal-actions"><button type="button" class="btn ghost" data-cancel>Отмена</button><button type="submit" class="btn primary">Добавить двери</button></div>
    </form>
  </div>`;
  document.body.appendChild(overlay);
  const close=()=>overlay.remove();
  overlay.querySelector('[data-cancel]').addEventListener('click',close);
  overlay.addEventListener('click',event=>{if(event.target===overlay)close();});
  overlay.querySelector('form').addEventListener('submit',async event=>{
    event.preventDefault();
    const form=event.currentTarget;
    const submit=form.querySelector('[type="submit"]');
    const rows=[];
    for(const item of FLOOR_DOOR_TYPES){
      const count=Number(form.elements[`count_${item.type}`].value);
      const widthMm=Number(form.elements[`width_${item.type}`].value);
      const heightMm=Number(form.elements[`height_${item.type}`].value);
      if(!Number.isInteger(count)||count<0||count>500){toast(`Проверьте количество: ${item.label.toLocaleLowerCase()}`);return;}
      if(!count)continue;
      if(!Number.isInteger(widthMm)||widthMm<1||widthMm>5000||!Number.isInteger(heightMm)||heightMm<1||heightMm>5000){toast(`Укажите ширину и высоту в миллиметрах: ${item.label.toLocaleLowerCase()}`);return;}
      rows.push({...item,count,widthMm,heightMm});
    }
    if(!rows.length){toast('Укажите количество хотя бы в одной строке');return;}
    const previousState=JSON.parse(JSON.stringify(state));
    floor.apartments=Array.isArray(floor.apartments)?floor.apartments:[];
    let floorEntry=floor.apartments.find(item=>item.isFloorContainer);
    if(!floorEntry){
      floorEntry={id:newRecordId('apt'),num:`Этаж ${floor.num}`,isFloorContainer:true,openings:[]};
      floor.apartments.push(floorEntry);
    }
    floorEntry.openings=Array.isArray(floorEntry.openings)?floorEntry.openings:[];
    const floorOpenings=floor.apartments.flatMap(apartment=>apartment.openings||[]);
    for(const row of rows){
      let number=floorOpenings.filter(opening=>opening.type===row.type).reduce((max,opening)=>Math.max(max,Number(opening.n)||0),0);
      for(let index=0;index<row.count;index++){
        number++;
        const opening=makeOpening(row.type,number);
        opening.title=`${row.label} ${number} · ${row.widthMm} × ${row.heightMm} мм${row.double?' / створка':''}`;
        opening.doors=opening.doors.map(door=>({...door,widthMm:row.widthMm,heightMm:row.heightMm}));
        floorEntry.openings.push(opening);
      }
    }
    submit.disabled=true;
    submit.textContent='Сохраняем…';
    try{
      await saveManagerOpeningState();
      close();
      toast(`Добавлено проёмов: ${rows.reduce((sum,row)=>sum+row.count,0)}`);
      render();
    }catch(error){
      state=previousState;
      close();
      render();
      toast(error.message||'Не удалось сохранить двери');
    }
  });
}

function doorList(obj,block,floor,apt){
  const context={obj,block,floor,apt};
  const foreman=isForemanWorkspaceUser();
  const canWork=foreman||!cloudEnabled;
  const manager=canManageWorkspace()&&!foreman;
  const allDoorsForApt=apartmentDoors(apt).map(item=>item.door);
  const accepted=(apt.openings||[]).filter(acceptedOpening).length;
  const materialRows=materialsTable(apt.openings||[]).filter(item=>item.needed>0);
  const ids={objId:obj.id,blockId:block.id,floorId:floor.id,aptId:apt.id};
  const locationLabel=apt.isFloorContainer?`${floor.num} этаж`:`Квартира ${apt.num}`;
  return `
    ${crumb([{label:'Объекты',click:{page:'objects'}},{label:obj.name,click:{page:'objects',objId:obj.id}},{label:block.name,click:{page:'objects',objId:obj.id,blockId:block.id}},{label:`${floor.num} этаж`,click:{page:'objects',objId:obj.id,blockId:block.id,floorId:floor.id}},{label:locationLabel}])}
    <section class="panel apartment-spec-summary">
      <div><span class="dashboard-eyebrow">Ведомость этажа</span><h3>${(apt.openings||[]).length} проёмов · ${allDoorsForApt.length} дверей</h3><p>${accepted} проёмов приняты менеджером</p></div>
      ${canManageWorkspace()?`<div class="opening-heading-actions"><button type="button" class="btn sm" data-add-opening='${htmlEscape(JSON.stringify(ids))}'>Добавить проём</button><button type="button" class="btn sm" data-add-standalone-door='${htmlEscape(JSON.stringify(ids))}'>Добавить дверь</button></div>`:''}
    </section>
    ${manager?`<div class="opening-role-hint">Проверяйте фото каждого проёма. После принятия весь комплект попадёт в АВР.</div>`:''}
    ${foreman?`<div class="opening-role-hint">Обновляйте двери на назначенном этаже, добавляйте фото и отправляйте готовый проём менеджеру.</div>`:''}
    <div class="opening-list">
      ${(apt.openings||[]).map(opening=>renderOpeningCard(context,opening,{canWork,manager,foreman})).join('')||'<div class="empty">Проёмы не заданы</div>'}
    </div>
    <section class="panel opening-material-panel"><div class="panel-head"><div><h3>Комплектующие на этаже</h3><span class="hint">Потребность по заданным проёмам</span></div></div><div class="opening-material-grid">${materialRows.map(item=>`<div><span>${htmlEscape(item.name)}</span><strong>${openingQty(item.needed)} ${htmlEscape(item.unit)}</strong></div>`).join('')}</div></section>
  `;
}

function renderOpeningCard(context,opening,permissions){
  const title=opening.title||`${OPENING_TYPE_LABELS[opening.type]||'Проём'} ${opening.n||''}`;
  const review=OPENING_REVIEW_LABELS[opening.reviewStatus]||OPENING_REVIEW_LABELS.not_submitted;
  const doorCount=openingDoorCount(opening);
  const canEditStructure=permissions.manager&&!openingStructureLocked(opening);
  const cards=(opening.doors||[]).map(door=>{
    const isLocked=acceptedOpening(opening)||opening.reviewStatus==='pending';
    const width=Number(door.widthMm)||0,height=Number(door.heightMm)||0;
    const size=width&&height?`${width} × ${height} мм${doorCount===2?' · створка':''}`:'';
    return `<div class="opening-door-row"><div class="opening-door-main"><div><strong>${door.glass?'Дверь со стеклом':'Дверь'} ${door.n}</strong><span>${door.status==='accepted'?'Принято':STATUS[door.status]?.label||'Не начато'}</span></div>
      ${size?`<span class="opening-door-size">${size}</span>`:''}
      ${permissions.canWork&&!isLocked?`<label class="field opening-status-field"><span>Статус</span><select data-door-work-status='${htmlEscape(JSON.stringify({openingId:opening.id,doorId:door.id,...openingContextIds(context)}))}'>${['not_started','materials_ready','in_progress','installed'].map(status=>`<option value="${status}" ${door.status===status?'selected':''}>${STATUS[status].label}</option>`).join('')}</select></label>`:''}
      ${permissions.canWork&&!isLocked?`<label class="btn sm opening-photo-button">Добавить фото<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" data-opening-photo='${htmlEscape(JSON.stringify({openingId:opening.id,doorId:door.id,...openingContextIds(context)}))}'></label>`:''}
      ${canEditStructure&&!context.floorLevel?`<button type="button" class="btn sm danger opening-delete-door" aria-label="Удалить дверь ${htmlEscape(door.n)}" data-delete-door='${htmlEscape(JSON.stringify({openingId:opening.id,doorId:door.id,...openingContextIds(context)}))}'>Удалить дверь</button>`:''}
      </div>
      ${(door.photos||[]).length?`<div class="opening-photos">${door.photos.map((photo,index)=>{
        const path=typeof photo==='string'?photo:photo.path||photo.localDataUrl||'';
        if(!path)return '';
        if(path.startsWith('data:'))return `<a class="opening-photo" href="${htmlEscape(path)}" target="_blank" rel="noopener"><img src="${htmlEscape(path)}" alt="Фото двери ${door.n}, ${index+1}" loading="lazy"></a>`;
        return `<a class="opening-photo" href="#" data-photo-path="${htmlEscape(path)}" aria-label="Открыть фото двери ${door.n}"><span>Загрузка фото…</span></a>`;
      }).join('')}</div>`:`<div class="opening-no-photo">Фото пока не добавлено</div>`}
    </div>`;
  }).join('');
  const componentRows=Object.entries(openingMaterialNeeds(opening)).filter(([,qty])=>qty>0).map(([id,qty])=>{
    const item=MAT_BY_ID[id];return item?`${item.name}: ${openingQty(qty)} ${item.unit}`:'';
  }).filter(Boolean);
  const statusClass={issue_reported:'info',pending:'info',accepted:'ok',changes_requested:'warn',not_submitted:'neutral'}[opening.reviewStatus]||'neutral';
  return `<article class="panel opening-card" data-opening-card="${htmlEscape(opening.id)}">
    <header class="opening-card-head"><div><span class="opening-kicker">${htmlEscape(OPENING_TYPE_LABELS[opening.type]||'Проём')}</span><h3>${htmlEscape(title)}</h3><p>${doorCount} ${doorCount===1?'дверь':'двери'} · ${opening.doors?.some(door=>door.glass)?'со стеклом':'без стекла'}</p></div><div class="opening-card-tools"><span class="pill ${statusClass}">${review.label}</span>${canEditStructure?`${context.floorLevel?'':`<button type="button" class="btn sm" data-add-door-to-opening='${htmlEscape(JSON.stringify({openingId:opening.id,...openingContextIds(context)}))}'>Добавить дверь</button>`}<button type="button" class="btn sm danger" data-delete-opening='${htmlEscape(JSON.stringify({openingId:opening.id,...openingContextIds(context)}))}'>Удалить проём</button>`:''}</div></header>
    <div class="opening-components"><span>Комплект</span><p>${componentRows.map(htmlEscape).join(' · ')||'Без шаблонных комплектующих'}</p></div>
    ${opening.managerNote?`<div class="opening-feedback"><strong>Замечание менеджера</strong><p>${htmlEscape(opening.managerNote)}</p></div>`:''}
    ${opening.foremanNote?`<div class="opening-foreman-note"><strong>Комментарий бригадира</strong><p>${htmlEscape(opening.foremanNote)}</p></div>`:''}
    <div class="opening-doors">${cards}</div>
    ${permissions.canWork&&!acceptedOpening(opening)&&opening.reviewStatus!=='pending'?`<label class="field opening-note-field"><span>Комментарий по проёму</span><textarea rows="2" data-foreman-note='${htmlEscape(JSON.stringify({openingId:opening.id,...openingContextIds(context)}))}' placeholder="Например, чего не хватает или что нужно исправить">${htmlEscape(opening.foremanNote||'')}</textarea></label><div class="opening-actions"><button class="btn" data-save-opening='${htmlEscape(JSON.stringify({openingId:opening.id,...openingContextIds(context)}))}'>Сохранить</button><button class="btn" data-report-opening-issue='${htmlEscape(JSON.stringify({openingId:opening.id,...openingContextIds(context)}))}'>Сообщить замечание</button><button class="btn primary" data-submit-opening='${htmlEscape(JSON.stringify({openingId:opening.id,...openingContextIds(context)}))}'>Отправить на проверку</button></div>`:''}
    ${permissions.manager&&opening.reviewStatus==='pending'?`<div class="opening-actions"><button class="btn primary" data-review-action="accept" data-opening-context='${htmlEscape(JSON.stringify({openingId:opening.id,...openingContextIds(context)}))}'>Принять по фото</button><button class="btn" data-review-action="return" data-opening-context='${htmlEscape(JSON.stringify({openingId:opening.id,...openingContextIds(context)}))}'>Вернуть с замечанием</button></div>`:''}
    ${permissions.manager&&opening.reviewStatus==='issue_reported'?`<div class="opening-actions"><button class="btn" data-review-action="return" data-opening-context='${htmlEscape(JSON.stringify({openingId:opening.id,...openingContextIds(context)}))}'>Ответить и назначить доработку</button></div>`:''}
  </article>`;
}

const OPENING_REVIEW_LABELS={not_submitted:{label:'В работе'},issue_reported:{label:'Сообщение бригадира'},pending:{label:'На проверке'},accepted:{label:'Принят'},changes_requested:{label:'Нужна доработка'}};

function openingContextIds(context){return {objId:context.obj.id,blockId:context.block.id,floorId:context.floor.id,aptId:context.apt.id};}
function openingQty(value){return Number(value).toLocaleString('ru-RU',{maximumFractionDigits:2});}
function findOpeningContext(ids){
  const obj=state.objects.find(item=>item.id===ids.objId),block=obj?.blocks.find(item=>item.id===ids.blockId),floor=block?.floors.find(item=>item.id===ids.floorId),apt=floor?.apartments.find(item=>item.id===ids.aptId),opening=apt?.openings?.find(item=>item.id===ids.openingId);
  return obj&&block&&floor&&apt&&opening?{obj,block,floor,apt,opening}:null;
}
function isForemanWorkspaceUser(){return cloudEnabled&&cloudProfile?.role==='foreman';}
const bindPageEventsBeforeOpenings=bindPageEvents;
bindPageEvents=function(){
  bindPageEventsBeforeOpenings();
  bindOpeningEvents(document.getElementById('content'));
};

function bindOpeningEvents(container){
  if(!container)return;
  container.querySelectorAll('[data-add-floor-doors]').forEach(element=>element.addEventListener('click',()=>openFloorDoorBatchModal(JSON.parse(element.dataset.addFloorDoors))));
  container.querySelectorAll('[data-open-apt]').forEach(element=>{
    element.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();goto('objects',{objId:route.objId,blockId:route.blockId,floorId:route.floorId,aptId:element.dataset.openApt});}});
  });
  container.querySelectorAll('[data-add-standalone-door]').forEach(element=>element.addEventListener('click',()=>openAddDoorModal(JSON.parse(element.dataset.addStandaloneDoor))));
  container.querySelectorAll('[data-add-door-to-opening]').forEach(element=>element.addEventListener('click',()=>{
    const ids=JSON.parse(element.dataset.addDoorToOpening);openAddDoorModal(ids,ids.openingId);
  }));
  container.querySelectorAll('[data-delete-door]').forEach(element=>element.addEventListener('click',()=>deleteApartmentDoor(JSON.parse(element.dataset.deleteDoor))));
  container.querySelectorAll('[data-delete-opening]').forEach(element=>element.addEventListener('click',()=>deleteApartmentOpening(JSON.parse(element.dataset.deleteOpening))));
  container.querySelectorAll('[data-door-work-status]').forEach(element=>element.addEventListener('change',async()=>{
    const context=findOpeningContext(JSON.parse(element.dataset.doorWorkStatus));if(!context)return;
    const door=context.opening.doors.find(item=>item.id===JSON.parse(element.dataset.doorWorkStatus).doorId);if(!door)return;
    if(element.value==='installed'&&door.status!=='installed')door.installedAt=new Date().toISOString();
    else if(element.value!=='installed')door.installedAt=null;
    door.status=element.value;
    await persistOpeningWork(context,false);
  }));
  container.querySelectorAll('[data-foreman-note]').forEach(element=>element.addEventListener('input',()=>{
    const context=findOpeningContext(JSON.parse(element.dataset.foremanNote));if(context)context.opening.foremanNote=element.value;
  }));
  container.querySelectorAll('[data-save-opening]').forEach(element=>element.addEventListener('click',async()=>{
    const context=findOpeningContext(JSON.parse(element.dataset.saveOpening));if(!context)return;
    await persistOpeningWork(context,false);
  }));
  container.querySelectorAll('[data-submit-opening]').forEach(element=>element.addEventListener('click',async()=>{
    const context=findOpeningContext(JSON.parse(element.dataset.submitOpening));if(!context)return;
    const missing=context.opening.doors.filter(door=>door.status!=='installed'&&door.status!=='accepted'||!(door.photos||[]).length);
    if(missing.length){toast('Для каждой двери отметьте установку и добавьте фото');return;}
    context.opening.reviewStatus='pending';context.opening.submittedAt=new Date().toISOString();
    await persistOpeningWork(context,true);
  }));
  container.querySelectorAll('[data-report-opening-issue]').forEach(element=>element.addEventListener('click',async()=>{
    const context=findOpeningContext(JSON.parse(element.dataset.reportOpeningIssue));if(!context)return;
    if(!context.opening.foremanNote.trim()){toast('Опишите замечание по проёму');return;}
    context.opening.reviewStatus='issue_reported';
    await persistOpeningWork(context,false,true);
  }));
  container.querySelectorAll('[data-opening-photo]').forEach(element=>element.addEventListener('change',async()=>{
    const file=element.files?.[0];if(!file)return;
    await uploadOpeningPhoto(JSON.parse(element.dataset.openingPhoto),file);
    element.value='';
  }));
  container.querySelectorAll('[data-review-action]').forEach(element=>element.addEventListener('click',async()=>{
    const context=findOpeningContext(JSON.parse(element.dataset.openingContext));if(!context)return;
    if(element.dataset.reviewAction==='accept')await reviewOpening(context,'accepted','');
    else openOpeningReturnModal(context);
  }));
  container.querySelector('[data-add-opening]')?.addEventListener('click',event=>openAddOpeningModal(JSON.parse(event.currentTarget.dataset.addOpening)));
  container.querySelectorAll('[data-photo-path]').forEach(element=>{element.addEventListener('click',event=>{if(element.getAttribute('href')==='#')event.preventDefault();});loadPrivatePhoto(element);});
}

async function persistOpeningWork(context,submit,reportIssue=false){
  try{
    if(isForemanWorkspaceUser())await saveForemanOpeningWork(context,context.opening,submit,reportIssue);
    else await saveManagerOpeningState();
    toast(submit?'Проём отправлен менеджеру':reportIssue?'Замечание отправлено менеджеру':'Изменение сохранено');render();
  }catch(error){toast(error.message||'Не удалось сохранить проём');}
}

async function saveManagerOpeningState(){
  await saveState();
  if(cloudEnabled&&cloudWriteBlocked)throw new Error('Изменение не сохранено. Обновите общие данные и повторите попытку.');
}

async function uploadOpeningPhoto(ids,file){
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)){toast('Выберите фото в формате JPG, PNG или WebP');return;}
  if(file.size>10*1024*1024){toast('Фото должно быть меньше 10 МБ');return;}
  const context=findOpeningContext(ids);if(!context)return;
  const door=context.opening.doors.find(item=>item.id===ids.doorId);if(!door)return;
  if(acceptedOpening(context.opening)||context.opening.reviewStatus==='pending'){toast('Сначала дождитесь ответа менеджера');return;}
  if(!cloudEnabled){
    if(file.size>1500000){toast('В локальном режиме выберите фото меньше 1,5 МБ');return;}
    try{door.photos=[...(door.photos||[]),{localDataUrl:await fileToDataUrl(file),uploadedAt:new Date().toISOString()}];await saveState();toast('Фото сохранено на этом устройстве');render();}catch(error){toast(error.message||'Не удалось сохранить фото');}
    return;
  }
  if(!supabaseClient){toast('Подождите, пока загрузится подключение к Supabase');return;}
  const extension=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';
  const path=[context.obj.id,context.block.id,context.floor.id,context.apt.id,context.opening.id,door.id,`${openingId('photo')}.${extension}`].join('/');
  try{
    const {error}=await supabaseClient.storage.from('door-photos').upload(path,file,{contentType:file.type,upsert:false});
    if(error)throw error;
    door.photos=[...(door.photos||[]),{path,uploadedAt:new Date().toISOString()}];
    if(isForemanWorkspaceUser())await saveForemanOpeningWork(context,context.opening,false);
    else await saveManagerOpeningState();
    toast('Фото добавлено');render();
  }catch(error){
    toast(String(error.message||'Не удалось загрузить фото').includes('Bucket not found')?'Сначала выполните SQL-файл настройки фотографий в Supabase':error.message||'Не удалось загрузить фото');
  }
}

function fileToDataUrl(file){
  return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file);});
}

async function loadPrivatePhoto(element){
  const path=element.dataset.photoPath;
  if(!path||!supabaseClient)return;
  const {data,error}=await supabaseClient.storage.from('door-photos').createSignedUrl(path,1800);
  if(error||!data?.signedUrl){element.innerHTML='<span>Фото недоступно</span>';return;}
  element.href=data.signedUrl;
  element.innerHTML=`<img src="${htmlEscape(data.signedUrl)}" alt="Фото двери" loading="lazy">`;
}

function openAddOpeningModal(ids){
  if(!canManageWorkspace()||isForemanWorkspaceUser()){toast('Изменять состав квартиры может администратор или менеджер');return;}
  const overlay=document.createElement('div');overlay.className='overlay';
  overlay.innerHTML=`<div class="modal" role="dialog" aria-modal="true"><h3>Добавить проём</h3><p class="hint">Выберите тип. Двери и комплектующие добавятся автоматически.</p><label class="field"><span>Тип проёма</span><select data-new-opening-type><option value="large">Большой — 2 двери со стеклом</option><option value="kitchen">Кухонный — 1 дверь со стеклом</option><option value="toilet">Туалет — дверь, коробка и порог</option><option value="custom">Нестандартный — 1 дверь</option></select></label><div class="modal-actions"><button class="btn ghost" data-cancel>Отмена</button><button class="btn primary" data-confirm>Добавить</button></div></div>`;
  document.body.appendChild(overlay);overlay.querySelector('[data-cancel]').addEventListener('click',()=>overlay.remove());
  overlay.querySelector('[data-confirm]').addEventListener('click',async()=>{
    const apt=findApartmentContext(ids)?.apt;if(!apt)return;
    const type=overlay.querySelector('[data-new-opening-type]').value;
    const number=(apt.openings||[]).filter(opening=>opening.type===type).reduce((max,opening)=>Math.max(max,Number(opening.n)||0),0)+1;
    const previousState=JSON.parse(JSON.stringify(state));
    apt.openings=apt.openings||[];apt.openings.push(makeOpening(type,number));
    if(!await persistApartmentStructureChange(previousState))return;
    overlay.remove();toast('Проём добавлен');render();
  });
}

function openingFinanceWasAccrued(openingId){
  const entries=cloudEnabled?brigadeFinanceEntries:(state?.financeEntries||[]);
  return (entries||[]).some(entry=>(entry.entry_type||entry.type)==='accrual'&&String(entry.opening_id||entry.openingId)===String(openingId));
}

function openingStructureLockReason(opening){
  if(opening.reviewStatus==='pending')return 'Нельзя менять состав проёма, пока он находится на проверке.';
  if(acceptedOpening(opening)||(opening.doors||[]).some(door=>door.status==='accepted')||openingFinanceWasAccrued(opening.id))return 'Этот проём уже принят или учтён в выплатах. Его состав менять нельзя.';
  return '';
}

function openingStructureLocked(opening){return Boolean(openingStructureLockReason(opening));}

function findApartmentContext(ids){
  const obj=state.objects.find(item=>item.id===ids.objId),block=obj?.blocks.find(item=>item.id===ids.blockId),floor=block?.floors.find(item=>item.id===ids.floorId),apt=floor?.apartments.find(item=>item.id===ids.aptId);
  return obj&&block&&floor&&apt?{obj,block,floor,apt}:null;
}

function resetOpeningReviewAfterStructureChange(opening){
  opening.reviewStatus='not_submitted';
  opening.foremanNote='';
  opening.managerNote='';
  opening.submittedAt=null;
  opening.acceptedAt=null;
}

async function persistApartmentStructureChange(previousState){
  try{await saveManagerOpeningState();return true;}
  catch(error){state=previousState;render();toast(error.message||'Не удалось сохранить состав проёма');return false;}
}

function openAddDoorModal(ids,targetOpeningId=null){
  if(!canManageWorkspace()||isForemanWorkspaceUser()){toast('Изменять состав может администратор или менеджер');return;}
  const context=findApartmentContext(ids);if(!context)return;
  const opening=targetOpeningId?(context.apt.openings||[]).find(item=>item.id===targetOpeningId):null;
  if(targetOpeningId&&!opening)return;
  if(opening){const reason=openingStructureLockReason(opening);if(reason){toast(reason);return;}}
  const defaultGlass=opening?opening.type==='large'||opening.type==='kitchen':false;
  const title=opening?`Добавить дверь · ${opening.title||'проём'}`:'Добавить дверь на этаж';
  openDataEntryModal(title,[{id:'glass',label:'Исполнение двери',value:String(defaultGlass),options:[{value:'false',label:'Без стекла'},{value:'true',label:'Со стеклом'}]}],async values=>{
    const previousState=JSON.parse(JSON.stringify(state));
    if(opening){
      const n=(opening.doors||[]).reduce((max,door)=>Math.max(max,Number(door.n)||0),0)+1;
      opening.doors=opening.doors||[];opening.doors.push(makeDoorLeaf(n,values.glass==='true'));
      resetOpeningReviewAfterStructureChange(opening);
    }else{
      const number=(context.apt.openings||[]).filter(item=>item.type==='custom').reduce((max,item)=>Math.max(max,Number(item.n)||0),0)+1;
      const newOpening=makeOpening('custom',number);
      newOpening.title=`Дверь ${number}`;
      newOpening.doors[0].glass=values.glass==='true';
      context.apt.openings=context.apt.openings||[];context.apt.openings.push(newOpening);
    }
    if(!await persistApartmentStructureChange(previousState))return false;
    render();toast(opening?'Дверь добавлена в проём':'Дверь добавлена');return true;
  });
}

async function deleteApartmentDoor(ids){
  if(!canManageWorkspace()||isForemanWorkspaceUser()){toast('Изменять состав квартиры может администратор или менеджер');return;}
  const context=findOpeningContext(ids);if(!context)return;
  const reason=openingStructureLockReason(context.opening);if(reason){toast(reason);return;}
  if(context.opening.doors.length<=1){toast('В проёме осталась последняя дверь. Чтобы удалить её, удалите весь проём.');return;}
  const door=context.opening.doors.find(item=>item.id===ids.doorId);if(!door)return;
  if(!confirm(`Удалить дверь №${door.n} из проёма «${context.opening.title||context.opening.type}»? Её фото и отметки будут убраны из карточки.`))return;
  const previousState=JSON.parse(JSON.stringify(state));
  context.opening.doors=context.opening.doors.filter(item=>item.id!==door.id);
  context.opening.doors.forEach((item,index)=>item.n=index+1);
  resetOpeningReviewAfterStructureChange(context.opening);
  if(!await persistApartmentStructureChange(previousState))return;
  render();toast('Дверь удалена');
}

async function deleteApartmentOpening(ids){
  if(!canManageWorkspace()||isForemanWorkspaceUser()){toast('Изменять состав может администратор или менеджер');return;}
  const context=findOpeningContext(ids);if(!context)return;
  const reason=openingStructureLockReason(context.opening);if(reason){toast(reason);return;}
  const doorCount=(context.opening.doors||[]).length;
  const place=context.apt.isFloorContainer?'с этажа':'из квартиры';
  if(!confirm(`Удалить проём «${context.opening.title||context.opening.type}» и ${doorCount} ${doorCount===1?'дверь':'двери'} ${place}? Фото и отметки этого проёма будут убраны из карточки.`))return;
  const previousState=JSON.parse(JSON.stringify(state));
  context.apt.openings=context.apt.openings.filter(item=>item.id!==context.opening.id);
  if(!await persistApartmentStructureChange(previousState))return;
  render();toast('Проём удалён');
}

function openOpeningReturnModal(context){
  const overlay=document.createElement('div');overlay.className='overlay';
  overlay.innerHTML=`<div class="modal" role="dialog" aria-modal="true"><h3>Вернуть на доработку</h3><p class="hint">Напишите бригадиру, что нужно исправить в этом проёме.</p><label class="field"><span>Замечание</span><textarea rows="4" data-manager-note required></textarea></label><div class="modal-actions"><button class="btn ghost" data-cancel>Отмена</button><button class="btn primary" data-confirm>Отправить замечание</button></div></div>`;
  document.body.appendChild(overlay);overlay.querySelector('[data-cancel]').addEventListener('click',()=>overlay.remove());
  overlay.querySelector('[data-confirm]').addEventListener('click',async()=>{
    const note=overlay.querySelector('[data-manager-note]').value.trim();if(!note){toast('Добавьте текст замечания');return;}
    overlay.remove();await reviewOpening(context,'changes_requested',note);
  });
}

async function reviewOpening(context,status,note){
  if(status==='accepted'&&context.opening.reviewStatus!=='pending'){toast('Менеджер принимает проём после полной проверки');return;}
  if(status==='accepted'){
    try{await acceptOpeningWithAccrual(context);}
    catch(error){toast(error.message||'Не удалось принять проём');render();return;}
    toast('Проём принят, начисление добавлено в баланс бригады');render();return;
  }
  context.opening.reviewStatus=status;context.opening.managerNote=note;
  context.opening.acceptedAt=null;
  try{await saveManagerOpeningState();}catch(error){toast(error.message);render();return;}
  toast('Замечание отправлено бригадиру');render();
}

function pageProblems(){
  const rows=allOpenings(state).filter(({opening})=>['issue_reported','pending','changes_requested'].includes(opening.reviewStatus)||opening.issue?.status==='open');
  const title=isForemanWorkspaceUser()?'Замечания по проёмам':'Проверка проёмов';
  return `<div class="panel"><div class="panel-head"><div><h3>${title}</h3><span class="hint">${isForemanWorkspaceUser()?'Ответ менеджера или проверка готовых проёмов':'Сообщения бригадиров и проёмы на проверке'}</span></div><span class="pill info">${rows.filter(row=>['issue_reported','pending'].includes(row.opening.reviewStatus)).length} ожидают ответа</span></div>
    <div class="review-queue">${rows.map(({opening,apt,floor,block,obj})=>`<article class="review-row"><div><strong>${htmlEscape(obj.name)} · ${htmlEscape(block.name)} · этаж ${htmlEscape(floor.num)}${apt.isFloorContainer?'':` · кв. ${htmlEscape(apt.num)}`}</strong><span>${htmlEscape(opening.title||OPENING_TYPE_LABELS[opening.type])} · ${openingDoorCount(opening)} двери</span><p>${htmlEscape(opening.managerNote||opening.foremanNote||'Ожидает проверки по фото')}</p></div><span class="pill ${['issue_reported','pending'].includes(opening.reviewStatus)?'info':'warn'}">${OPENING_REVIEW_LABELS[opening.reviewStatus]?.label||'Замечание'}</span><button class="btn sm" data-open-opening-context='${htmlEscape(JSON.stringify({objId:obj.id,blockId:block.id,floorId:floor.id,aptId:apt.id}))}'>Открыть</button></article>`).join('')||'<div class="empty">Нет проёмов на проверке и без замечаний</div>'}</div></div>`;
}

const problemNavItem=NAV_ITEMS.find(item=>item.id==='problems');
if(problemNavItem){
  problemNavItem.label='Замечания';
  problemNavItem.badgeFn=source=>allOpenings(source).filter(({opening})=>['issue_reported','pending','changes_requested'].includes(opening.reviewStatus)||opening.issue?.status==='open').length;
}

const bindProblemsBase=bindPageEvents;
bindPageEvents=function(){
  bindProblemsBase();
  document.querySelectorAll('[data-open-opening-context]').forEach(element=>element.addEventListener('click',()=>goto('objects',{...JSON.parse(element.dataset.openOpeningContext)})));
};
