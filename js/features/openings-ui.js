function apartmentList(obj,block,floor){
  const brigade=state.brigades.find(item=>item.id===floor.brigadeId);
  return `
    ${crumb([{label:'Объекты',click:{page:'objects'}},{label:obj.name,click:{page:'objects',objId:obj.id}},{label:block.name,click:{page:'objects',objId:obj.id,blockId:block.id}},{label:`${floor.num} этаж`}])}
    <div class="panel opening-floor-note"><span>Бригада на этаже</span><strong>${htmlEscape(brigade?.name||'Не назначена')}</strong></div>
    <div class="panel-head opening-section-head"><div><h3>Квартиры</h3><span class="hint">Состав проёмов и комплектующие считаются автоматически</span></div>${canManageWorkspace()?`<button class="btn primary sm" data-create-apartment='${htmlEscape(JSON.stringify({objId:obj.id,blockId:block.id,floorId:floor.id}))}'>Добавить квартиру</button>`:''}</div>
    <div class="card-grid">
      ${(floor.apartments||[]).map(apt=>{
        const doors=apartmentDoors(apt).map(item=>item.door);
        const c=countByStatus(doors.map(door=>({door})));
        const accepted=(apt.openings||[]).filter(acceptedOpening).length;
        const pct=doors.length?Math.round(c.accepted/doors.length*100):0;
        const flags=(apt.openings||[]).filter(opening=>['issue_reported','pending','changes_requested'].includes(opening.reviewStatus)).length;
        return `<article class="tile apartment-opening-tile" data-open-apt="${htmlEscape(apt.id)}" tabindex="0" role="button" aria-label="Открыть квартиру ${htmlEscape(apt.num)}">
          <div class="t-name">Квартира ${htmlEscape(apt.num)}</div>
          <div class="t-meta">${(apt.openings||[]).length} проёмов · ${doors.length} дверей · принято ${accepted}</div>
          <div class="t-progress"><div class="bar"><span style="width:${pct}%"></span></div><span class="t-pct">${pct}%</span></div>
          ${flags?`<span class="pill ${apt.openings.some(opening=>opening.reviewStatus==='changes_requested')?'warn':'info'}">${flags} требуют внимания</span>`:''}
        </article>`;
      }).join('')||'<div class="empty">На этаже пока нет квартир</div>'}
    </div>`;
}

function doorList(obj,block,floor,apt){
  const context={obj,block,floor,apt};
  const foreman=isForemanWorkspaceUser();
  const canWork=foreman||!cloudEnabled;
  const manager=canManageWorkspace()&&!foreman;
  const allDoorsForApt=apartmentDoors(apt).map(item=>item.door);
  const accepted=(apt.openings||[]).filter(acceptedOpening).length;
  const configureTemplate=canManageWorkspace()&&openingTemplateEditable(apt);
  const materialRows=materialsTable(apt.openings||[]).filter(item=>item.needed>0);
  return `
    ${crumb([{label:'Объекты',click:{page:'objects'}},{label:obj.name,click:{page:'objects',objId:obj.id}},{label:block.name,click:{page:'objects',objId:obj.id,blockId:block.id}},{label:`${floor.num} этаж`,click:{page:'objects',objId:obj.id,blockId:block.id,floorId:floor.id}},{label:`Квартира ${apt.num}`}])}
    <section class="panel apartment-spec-summary">
      <div><span class="dashboard-eyebrow">Состав квартиры</span><h3>${(apt.openings||[]).length} проёмов · ${allDoorsForApt.length} дверей</h3><p>${accepted} проёмов приняты менеджером</p></div>
      ${canManageWorkspace()?`<div class="opening-heading-actions">${configureTemplate?`<button type="button" class="btn sm" data-configure-template='${htmlEscape(JSON.stringify({objId:obj.id,blockId:block.id,floorId:floor.id,aptId:apt.id}))}'>${apt.openings.every(opening=>opening.type==='legacy')?'Указать типы проёмов':'Изменить состав'}</button>`:''}<button type="button" class="btn sm" data-add-opening='${htmlEscape(JSON.stringify({objId:obj.id,blockId:block.id,floorId:floor.id,aptId:apt.id}))}'>Добавить проём</button></div>`:''}
    </section>
    ${manager?`<div class="opening-role-hint">Проверяйте фото каждого проёма. После принятия весь комплект попадёт в АВР.</div>`:''}
    ${foreman?`<div class="opening-role-hint">Обновляйте двери на назначенном этаже, добавляйте фото и отправляйте готовый проём менеджеру.</div>`:''}
    <div class="opening-list">
      ${(apt.openings||[]).map(opening=>renderOpeningCard(context,opening,{canWork,manager,foreman})).join('')||'<div class="empty">Проёмы не заданы</div>'}
    </div>
    <section class="panel opening-material-panel"><div class="panel-head"><div><h3>Комплектующие для квартиры</h3><span class="hint">Потребность по заданным проёмам</span></div></div><div class="opening-material-grid">${materialRows.map(item=>`<div><span>${htmlEscape(item.name)}</span><strong>${openingQty(item.needed)} ${htmlEscape(item.unit)}</strong></div>`).join('')}</div></section>
  `;
}

function renderOpeningCard(context,opening,permissions){
  const title=opening.title||`${OPENING_TYPE_LABELS[opening.type]||'Проём'} ${opening.n||''}`;
  const review=OPENING_REVIEW_LABELS[opening.reviewStatus]||OPENING_REVIEW_LABELS.not_submitted;
  const doorCount=openingDoorCount(opening);
  const cards=(opening.doors||[]).map(door=>{
    const isLocked=acceptedOpening(opening)||opening.reviewStatus==='pending';
    return `<div class="opening-door-row"><div class="opening-door-main"><div><strong>${door.glass?'Дверь со стеклом':'Дверь'} ${door.n}</strong><span>${door.status==='accepted'?'Принято':STATUS[door.status]?.label||'Не начато'}</span></div>
      ${permissions.canWork&&!isLocked?`<label class="field opening-status-field"><span>Статус</span><select data-door-work-status='${htmlEscape(JSON.stringify({openingId:opening.id,doorId:door.id,...openingContextIds(context)}))}'>${['not_started','materials_ready','in_progress','installed'].map(status=>`<option value="${status}" ${door.status===status?'selected':''}>${STATUS[status].label}</option>`).join('')}</select></label>`:''}
      ${permissions.canWork&&!isLocked?`<label class="btn sm opening-photo-button">Добавить фото<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" data-opening-photo='${htmlEscape(JSON.stringify({openingId:opening.id,doorId:door.id,...openingContextIds(context)}))}'></label>`:''}
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
    <header class="opening-card-head"><div><span class="opening-kicker">${htmlEscape(OPENING_TYPE_LABELS[opening.type]||'Проём')}</span><h3>${htmlEscape(title)}</h3><p>${doorCount} ${doorCount===1?'дверь':'двери'} · ${opening.doors?.some(door=>door.glass)?'со стеклом':'без стекла'}</p></div><span class="pill ${statusClass}">${review.label}</span></header>
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
function openingTemplateEditable(apartment){
  const openings=apartment.openings||[];
  if(openings.length&&openings.every(opening=>opening.type==='legacy'))return true;
  return openings.length>0&&openings.every(opening=>opening.reviewStatus==='not_submitted'&&opening.doors.every(door=>door.status==='not_started'&&!(door.photos||[]).length));
}

const bindPageEventsBeforeOpenings=bindPageEvents;
bindPageEvents=function(){
  bindPageEventsBeforeOpenings();
  bindOpeningEvents(document.getElementById('content'));
};

function bindOpeningEvents(container){
  if(!container)return;
  container.querySelectorAll('[data-open-apt]').forEach(element=>{
    element.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();goto('objects',{objId:route.objId,blockId:route.blockId,floorId:route.floorId,aptId:element.dataset.openApt});}});
  });
  container.querySelector('[data-configure-template]')?.addEventListener('click',event=>openApartmentTemplate(JSON.parse(event.currentTarget.dataset.configureTemplate)));
  container.querySelectorAll('[data-door-work-status]').forEach(element=>element.addEventListener('change',async()=>{
    const context=findOpeningContext(JSON.parse(element.dataset.doorWorkStatus));if(!context)return;
    const door=context.opening.doors.find(item=>item.id===JSON.parse(element.dataset.doorWorkStatus).doorId);if(!door)return;
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
  const overlay=document.createElement('div');overlay.className='overlay';
  overlay.innerHTML=`<div class="modal" role="dialog" aria-modal="true"><h3>Добавить проём</h3><p class="hint">Выберите тип. Двери и комплектующие добавятся автоматически.</p><label class="field"><span>Тип проёма</span><select data-new-opening-type><option value="large">Большой — 2 двери со стеклом</option><option value="kitchen">Кухонный — 1 дверь со стеклом</option><option value="toilet">Туалет — дверь, коробка и порог</option><option value="custom">Нестандартный — 1 дверь</option></select></label><div class="modal-actions"><button class="btn ghost" data-cancel>Отмена</button><button class="btn primary" data-confirm>Добавить</button></div></div>`;
  document.body.appendChild(overlay);overlay.querySelector('[data-cancel]').addEventListener('click',()=>overlay.remove());
  overlay.querySelector('[data-confirm]').addEventListener('click',async()=>{
    const obj=state.objects.find(item=>item.id===ids.objId),block=obj?.blocks.find(item=>item.id===ids.blockId),floor=block?.floors.find(item=>item.id===ids.floorId),apt=floor?.apartments.find(item=>item.id===ids.aptId);if(!apt)return;
    const type=overlay.querySelector('[data-new-opening-type]').value;
    const number=(apt.openings.filter(opening=>opening.type===type).reduce((max,opening)=>Math.max(max,Number(opening.n)||0),0))+1;
    apt.openings.push(makeOpening(type,number));
    try{await saveManagerOpeningState();}catch(error){toast(error.message);return;}
    overlay.remove();toast('Проём добавлен');render();
  });
}

function createNewApartment(context){
  openApartmentTemplate(context,null,true);
}

function openApartmentTemplate(ids,existingApartment=null,isNew=false){
  const obj=state.objects.find(item=>item.id===ids.objId),block=obj?.blocks.find(item=>item.id===ids.blockId),floor=block?.floors.find(item=>item.id===ids.floorId);
  const apt=existingApartment||floor?.apartments.find(item=>item.id===ids.aptId);if(!floor)return;
  const overlay=document.createElement('div');overlay.className='overlay';
  overlay.innerHTML=`<div class="modal apartment-template-modal" role="dialog" aria-modal="true"><h3>${isNew?'Новая квартира':'Типы проёмов'}</h3><p class="hint">Кухонный проём с одной дверью добавится автоматически. Для каждого туалета создаётся своя дверь с коробкой и порогом.</p><form><label class="field"><span>Номер квартиры</span><input name="num" required value="${htmlEscape(apt?.num||'')}"></label><div class="opening-template-fields"><label class="field"><span>Большие проёмы</span><select name="large"><option value="1">1</option><option value="2">2</option></select></label><label class="field"><span>Туалеты</span><select name="toilet"><option value="1">1</option><option value="2">2</option></select></label></div><p class="opening-template-note">Каждый большой проём: 2 двери со стеклом. На каждый проём: 2,5 добора, 5 наличников и 1 ручка. На дверь: 2 петли и 1 баллон монтажной пены.</p><div class="modal-actions"><button type="button" class="btn ghost" data-cancel>Отмена</button><button type="submit" class="btn primary">${isNew?'Создать квартиру':'Сохранить состав'}</button></div></form></div>`;
  document.body.appendChild(overlay);
  if(apt){
    const large=Math.min(2,Math.max(1,apt.openings.filter(opening=>opening.type==='large').length||1));
    const toilet=Math.min(2,Math.max(1,apt.openings.filter(opening=>opening.type==='toilet').length||1));
    overlay.querySelector('[name="large"]').value=String(large);overlay.querySelector('[name="toilet"]').value=String(toilet);
  }
  const close=()=>overlay.remove();overlay.querySelector('[data-cancel]').addEventListener('click',close);overlay.addEventListener('click',event=>{if(event.target===overlay)close();});
  overlay.querySelector('form').addEventListener('submit',async event=>{
    event.preventDefault();const form=new FormData(event.currentTarget),num=String(form.get('num')||'').trim(),large=Number(form.get('large')),toilet=Number(form.get('toilet'));
    if(!num||![1,2].includes(large)||![1,2].includes(toilet)){toast('Проверьте номер квартиры и количество проёмов');return;}
    if(isNew&&floor.apartments.some(item=>String(item.num).trim()===num)){toast('Такая квартира на этаже уже есть');return;}
    if(isNew){floor.apartments.push(apartmentFromTemplate(num,large,toilet));}
    else{
      const oldDoors=apartmentDoors(apt).map(item=>item.door);const generated=apartmentFromTemplate(num,large,toilet);const newDoors=generated.openings.flatMap(opening=>opening.doors);
      for(let index=0;index<newDoors.length&&index<oldDoors.length;index++){
        const created=newDoors[index],old=oldDoors[index];Object.assign(created,old,{id:old.id,n:created.n,glass:created.glass,photos:Array.isArray(old.photos)?old.photos:[]});
      }
      for(let index=newDoors.length;index<oldDoors.length;index++){
        const extra=makeOpening('custom',index-newDoors.length+1),old=oldDoors[index];Object.assign(extra.doors[0],old,{id:old.id,glass:false,photos:Array.isArray(old.photos)?old.photos:[]});generated.openings.push(extra);
      }
      generated.openings.forEach(opening=>{
        if(opening.doors.length&&opening.doors.every(door=>door.status==='accepted'))opening.reviewStatus='accepted';
        const oldIssue=opening.doors.find(door=>door.problem||door.status==='problem');
        if(oldIssue&&opening.reviewStatus!=='accepted'){opening.reviewStatus='changes_requested';opening.managerNote=oldIssue.problem||'Проверьте старое замечание по двери';}
      });
      apt.num=num;apt.openings=generated.openings;
    }
    await saveState();
    if(cloudWriteBlocked){toast('Состав не сохранён. Обновите данные и попробуйте ещё раз.');return;}
    close();toast(isNew?'Квартира создана с комплектами проёмов':'Состав квартиры обновлён');
    if(isNew)goto('objects',{objId:obj.id,blockId:block.id,floorId:floor.id,aptId:floor.apartments.at(-1).id});else render();
  });
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
  context.opening.reviewStatus=status;context.opening.managerNote=note;
  if(status==='accepted'){
    context.opening.acceptedAt=new Date().toISOString();
    context.opening.doors.forEach(door=>door.status='accepted');
  }else context.opening.acceptedAt=null;
  try{await saveManagerOpeningState();}catch(error){toast(error.message);render();return;}
  toast(status==='accepted'?'Проём принят':'Замечание отправлено бригадиру');render();
}

function pageProblems(){
  const rows=allOpenings(state).filter(({opening})=>['issue_reported','pending','changes_requested'].includes(opening.reviewStatus)||opening.issue?.status==='open');
  const title=isForemanWorkspaceUser()?'Замечания по проёмам':'Проверка проёмов';
  return `<div class="panel"><div class="panel-head"><div><h3>${title}</h3><span class="hint">${isForemanWorkspaceUser()?'Ответ менеджера или проверка готовых проёмов':'Сообщения бригадиров и проёмы на проверке'}</span></div><span class="pill info">${rows.filter(row=>['issue_reported','pending'].includes(row.opening.reviewStatus)).length} ожидают ответа</span></div>
    <div class="review-queue">${rows.map(({opening,apt,floor,block,obj})=>`<article class="review-row"><div><strong>${htmlEscape(obj.name)} · ${htmlEscape(block.name)} · этаж ${htmlEscape(floor.num)} · кв. ${htmlEscape(apt.num)}</strong><span>${htmlEscape(opening.title||OPENING_TYPE_LABELS[opening.type])} · ${openingDoorCount(opening)} двери</span><p>${htmlEscape(opening.managerNote||opening.foremanNote||'Ожидает проверки по фото')}</p></div><span class="pill ${['issue_reported','pending'].includes(opening.reviewStatus)?'info':'warn'}">${OPENING_REVIEW_LABELS[opening.reviewStatus]?.label||'Замечание'}</span><button class="btn sm" data-open-opening-context='${htmlEscape(JSON.stringify({objId:obj.id,blockId:block.id,floorId:floor.id,aptId:apt.id}))}'>Открыть</button></article>`).join('')||'<div class="empty">Нет проёмов на проверке и без замечаний</div>'}</div></div>`;
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
