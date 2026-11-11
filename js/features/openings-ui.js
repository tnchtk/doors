const FLOOR_STATUS_LABELS={
  not_started:{label:'Не начато',cls:'neutral'},
  in_progress:{label:'В работе',cls:'warn'},
  pending:{label:'На проверке',cls:'info'},
  changes_requested:{label:'Нужна доработка',cls:'warn'},
  accepted:{label:'Принят',cls:'ok'},
};

function ruPlural(n,one,few,many){const m=n%100,d=n%10;return m>10&&m<20?many:d===1?one:d>=2&&d<=4?few:many;}
function floorOpeningItems(floor){return (floor.apartments||[]).flatMap(apt=>(apt.openings||[]).map(opening=>({apt,opening})));}
function floorStatusExplicit(floor){return Boolean(floor&&floor.status&&FLOOR_STATUS_LABELS[floor.status]);}
function floorStatus(floor){
  if(floorStatusExplicit(floor))return floor.status;
  const openings=floorOpeningItems(floor).map(item=>item.opening);
  if(openings.length&&openings.every(acceptedOpening))return 'accepted';
  if(openings.some(opening=>opening.reviewStatus==='pending'))return 'pending';
  if(openings.some(opening=>opening.reviewStatus==='changes_requested'))return 'changes_requested';
  if(openings.some(opening=>(opening.doors||[]).some(door=>['materials_ready','in_progress','installed'].includes(door.status))))return 'in_progress';
  return 'not_started';
}

function floorDoorSummary(items){
  const rows=[
    {label:'Одинарные со стеклом',double:false,glass:true,count:0},
    {label:'Одинарные глухие',double:false,glass:false,count:0},
    {label:'Двойные со стеклом',double:true,glass:true,count:0},
    {label:'Двойные глухие',double:true,glass:false,count:0},
  ];
  items.forEach(({opening})=>{
    const double=openingDoorCount(opening)>=2,glass=(opening.doors||[]).some(door=>door.glass);
    const row=rows.find(item=>item.double===double&&item.glass===glass);
    if(row)row.count++;
  });
  return {
    rows,
    glass:rows.filter(row=>row.glass).reduce((sum,row)=>sum+row.count,0),
    solid:rows.filter(row=>!row.glass).reduce((sum,row)=>sum+row.count,0),
    double:rows.filter(row=>row.double).reduce((sum,row)=>sum+row.count,0),
    total:items.length,
  };
}


const FLOOR_PRIORITY={changes_requested:0,in_progress:1,not_started:2,pending:3,accepted:4};
function foremanFloorRows(){
  const rows=[];
  activeObjects(state).forEach(obj=>(obj.blocks||[]).forEach(block=>(block.floors||[]).forEach(floor=>{
    const status=floorStatus(floor);
    rows.push({obj,block,floor,status,summary:floorDoorSummary(floorOpeningItems(floor))});
  })));
  return rows.sort((a,b)=>FLOOR_PRIORITY[a.status]-FLOOR_PRIORITY[b.status]||String(a.obj.name).localeCompare(String(b.obj.name),'ru')||(Number(a.floor.num)||0)-(Number(b.floor.num)||0));
}
function foremanHome(){
  const rows=foremanFloorRows();
  const count=keys=>rows.filter(row=>keys.includes(row.status)).length;
  const todo=count(['changes_requested','in_progress','not_started']),waiting=count(['pending']),done=count(['accepted']);
  const list=rows.map(({obj,block,floor,status,summary})=>{
    const meta=FLOOR_STATUS_LABELS[status];
    const brigade=state.brigades.find(item=>item.id===floor.brigadeId);
    const note=status==='changes_requested'&&floor.managerNote?`<p class="my-floor-note">${htmlEscape(floor.managerNote)}</p>`:'';
    return `<button type="button" class="my-floor-row" data-goto-floor='${htmlEscape(JSON.stringify({objId:obj.id,blockId:block.id,floorId:floor.id}))}'>
      <span class="my-floor-main"><strong>${htmlEscape(floor.num)} этаж</strong><span>${htmlEscape(obj.name)} · ${htmlEscape(block.name)}</span><span class="hint">${htmlEscape(brigade?.name||'Бригада не назначена')} · ${summary.total} ${ruPlural(summary.total,'дверь','двери','дверей')} · ${summary.glass} со стеклом · ${summary.solid} глухих · ${summary.double} двойных</span>${note}</span>
      <span class="pill ${meta.cls}">${meta.label}</span></button>`;
  }).join('');
  return `<div class="dashboard-heading"><div><div class="dashboard-eyebrow">Бригадир</div><h2>Мои этажи</h2><p>Откройте этаж, поставьте статус и отправьте менеджеру, когда всё установлено.</p></div></div>
    <div class="my-floor-counts"><div><strong>${todo}</strong><span>в работе</span></div><div><strong>${waiting}</strong><span>на проверке</span></div><div><strong>${done}</strong><span>принято</span></div></div>
    <section class="my-floor-list" aria-label="Мои этажи">${list||'<div class="empty">Вам пока не назначены этажи. Попросите менеджера назначить бригаду на этаж.</div>'}</section>
    ${typeof foremanRequestsPanel==='function'?foremanRequestsPanel():''}
    ${foremanFinanceCard()}`;
}

function floorStatusPanel(floor,items,ids,{foreman,manager,canWork}){
  const status=floorStatus(floor);
  const meta=FLOOR_STATUS_LABELS[status];
  const report=floor.foremanReport;
  const reportDate=report?.submittedAt?new Date(report.submittedAt).toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'';
  const idsAttr=htmlEscape(JSON.stringify(ids));
  const locked=status==='pending'||status==='accepted';
  const managerNote=floor.managerNote||items.map(item=>item.opening.managerNote).find(Boolean)||'';
  let body='';
  if(status==='changes_requested'&&managerNote)body+=`<div class="opening-feedback"><strong>Замечание менеджера</strong><p>${htmlEscape(managerNote)}</p></div>`;
  if(report?.submittedAt&&(status==='pending'||status==='accepted'))body+=`<p class="hint">Бригада сообщила о завершении этажа: ${htmlEscape(reportDate)}${report.note?` · «${htmlEscape(report.note)}»`:''}</p>`;
  let bar='';
  if(canWork&&!locked&&items.length){
    body+=`<label class="field"><span>Комментарий к отчёту (необязательно)</span><textarea rows="2" maxlength="2000" data-floor-report-note></textarea></label>`;
    bar=`<div class="floor-actionbar" role="group" aria-label="Действия по этажу"><div class="floor-status-buttons">${['not_started','in_progress'].map(value=>`<button type="button" class="btn" aria-pressed="${status===value}" data-floor-status='${htmlEscape(JSON.stringify({...ids,status:value}))}'>${FLOOR_STATUS_LABELS[value].label}</button>`).join('')}</div><button type="button" class="btn primary floor-submit" data-submit-floor='${idsAttr}'>Этаж закончен</button></div>`;
  }
  if(manager&&status==='pending'){
    bar=`<div class="floor-actionbar" role="group" aria-label="Проверка этажа"><button type="button" class="btn primary" data-floor-review="accept" data-floor-ids='${idsAttr}'>Принять этаж</button><button type="button" class="btn" data-floor-review="return" data-floor-ids='${idsAttr}'>Вернуть с замечанием</button></div>`;
  }
  if(status==='accepted')body+='<p class="hint">Этаж принят, начисление добавлено в баланс бригады.</p>';
  return `<section class="panel floor-status-panel"><div class="panel-head"><div><h3>Статус этажа</h3><span class="hint">Статус задаётся для всего этажа, а не для каждой двери</span></div><span class="pill ${meta.cls}">${meta.label}</span></div>${body}</section>${bar}`;
}

function floorOpeningsList(obj,block,floor){
  const brigade=state.brigades.find(item=>item.id===floor.brigadeId);
  const items=floorOpeningItems(floor);
  const summary=floorDoorSummary(items);
  const materialRows=materialsTable(items.map(item=>item.opening)).filter(row=>row.needed>0);
  const foreman=isForemanWorkspaceUser();
  const canWork=foreman||!cloudEnabled;
  const manager=canManageWorkspace()&&!foreman;
  const ids={objId:obj.id,blockId:block.id,floorId:floor.id};
  const plural=ruPlural;
  const composition=manager&&items.length?`<details class="panel floor-composition"><summary>Состав этажа: править по одной двери</summary><div class="floor-composition-list">${items.map(({apt,opening})=>{
      const context={obj,block,floor,apt};
      const locked=openingStructureLocked(opening);
      return `<div class="floor-composition-row"><span>${htmlEscape(opening.title||OPENING_TYPE_LABELS[opening.type]||'Проём')}</span>${locked?'<span class="hint">Изменить нельзя</span>':`<button type="button" class="btn sm danger" data-delete-opening='${htmlEscape(JSON.stringify({openingId:opening.id,...openingContextIds(context)}))}'>Удалить</button>`}</div>`;
    }).join('')}</div></details>`:'';
  return `
    ${crumb([{label:'Объекты',click:{page:'objects'}},{label:obj.name,click:{page:'objects',objId:obj.id}},{label:block.name,click:{page:'objects',objId:obj.id,blockId:block.id}},{label:`${floor.num} этаж`}])}
    <section class="panel floor-door-summary">
      <div><span class="dashboard-eyebrow">Ведомость этажа</span><h3>${summary.total} ${plural(summary.total,'дверь','двери','дверей')}</h3><p>Бригада: <strong>${htmlEscape(brigade?.name||'Не назначена')}</strong></p></div>
      ${canManageWorkspace()?`<div class="floor-head-actions"><button type="button" class="btn primary" data-add-floor-doors='${htmlEscape(JSON.stringify(ids))}'>+ Добавить двери</button>${canOrderMaterials()?`<button type="button" class="btn" data-order-scope='${htmlEscape(JSON.stringify(ids))}'>Заказать</button>`:''}</div>`:''}
    </section>
    <section class="panel floor-summary-list">
      <div class="floor-summary-totals"><div><strong>${summary.glass}</strong><span>со стеклом</span></div><div><strong>${summary.solid}</strong><span>глухих</span></div><div><strong>${summary.double}</strong><span>двойных</span></div></div>
      ${summary.total?`<ul class="floor-summary-rows">${summary.rows.filter(row=>row.count).map(row=>`<li><span>${row.label}</span><strong>${row.count}</strong></li>`).join('')}</ul>`:'<div class="empty">На этаже пока нет дверей. Менеджер может добавить состав этажа.</div>'}
    </section>
    ${foreman?'<div class="opening-role-hint">Поставьте этажу статус «В работе», а когда всё установлено, отправьте этаж менеджеру одной кнопкой.</div>':''}
    ${floorStatusPanel(floor,items,ids,{foreman,manager,canWork})}
    ${composition}
    ${typeof floorRequestsPanel==='function'?floorRequestsPanel(obj,block,floor,foreman):''}
    <section class="panel opening-material-panel"><div class="panel-head"><div><h3>Комплектующие на этаже</h3><span class="hint">Потребность по всему заданному составу</span></div></div><div class="opening-material-grid">${materialRows.map(item=>`<div><span>${htmlEscape(item.name)}</span><strong>${openingQty(item.needed)} ${htmlEscape(item.unit)}</strong></div>`).join('')||'<span class="hint">Добавьте двери, чтобы рассчитать комплектующие.</span>'}</div></section>
  `;
}

const FLOOR_DOOR_TYPES=[
  {type:'single_glass',label:'Одинарная дверь со стеклом',double:false,glass:true},
  {type:'single_solid',label:'Одинарная глухая дверь',double:false,glass:false},
  {type:'double_glass',label:'Двойная дверь со стеклом',double:true,glass:true},
  {type:'double_solid',label:'Двойная глухая дверь',double:true,glass:false},
];

function floorDoorFormRow(index){
  return `<div class="floor-door-form-row" data-floor-door-row>
    <div class="floor-door-row-head"><strong data-floor-door-row-title>Позиция ${index+1}</strong>${index?`<button type="button" class="btn sm ghost" data-remove-floor-door-row aria-label="Удалить позицию ${index+1}">Убрать</button>`:''}</div>
    <label class="field"><span>Тип двери</span><select data-floor-door-double><option value="single">Одинарная</option><option value="double">Двойная</option></select></label>
    <label class="field"><span>Исполнение</span><select data-floor-door-glass><option value="solid">Глухая</option><option value="glass">Со стеклом</option></select></label>
    <label class="field"><span>Количество</span><input type="number" value="1" min="0" max="500" step="1" inputmode="numeric" data-floor-door-count></label>
    <label class="field"><span data-floor-door-width-label>Ширина двери, мм</span><input type="number" min="1" max="5000" step="1" inputmode="numeric" placeholder="Например, 800" data-floor-door-width></label>
  </div>`;
}

function openFloorDoorBatchModal(ids){
  if(!canManageWorkspace()||isForemanWorkspaceUser()){toast('Добавлять двери может администратор или менеджер');return;}
  const obj=state.objects.find(item=>item.id===ids.objId);
  const block=obj?.blocks.find(item=>item.id===ids.blockId);
  const floor=block?.floors.find(item=>item.id===ids.floorId);
  if(!obj||!block||!floor)return;
  const overlay=document.createElement('div');
  overlay.className='overlay';
  overlay.innerHTML=`<div class="modal floor-door-modal" role="dialog" aria-modal="true" aria-labelledby="floorDoorTitle">
    <div class="floor-door-modal-head"><h3 id="floorDoorTitle">Добавить двери · ${htmlEscape(floor.num)} этаж</h3><button type="button" class="btn primary sm" data-add-floor-door-row>+ Позиция</button></div>
    <p class="hint">Для каждой позиции выберите тип и исполнение двери, укажите количество и ширину. Для двойной двери задаётся ширина одной створки.</p>
    <div class="opening-template-note">Двойная дверь — один проём из двух полотен. При принятии к тарифу за проём добавится 500 сомов.</div>
    <form>
      <div class="floor-door-form-list">${floorDoorFormRow(0)}</div>
      <div class="modal-actions"><button type="button" class="btn ghost" data-cancel>Отмена</button><button type="submit" class="btn primary">Добавить двери</button></div>
    </form>
  </div>`;
  document.body.appendChild(overlay);
  const close=()=>overlay.remove();
  overlay.querySelector('[data-cancel]').addEventListener('click',close);
  overlay.addEventListener('click',event=>{if(event.target===overlay)close();});
  const rowList=overlay.querySelector('.floor-door-form-list');
  const updateRows=()=>{
    const rows=[...rowList.querySelectorAll('[data-floor-door-row]')];
    rows.forEach((row,index)=>{
      row.querySelector('[data-floor-door-row-title]').textContent=`Позиция ${index+1}`;
      const remove=row.querySelector('[data-remove-floor-door-row]');
      if(remove)remove.setAttribute('aria-label',`Удалить позицию ${index+1}`);
      row.querySelector('[data-floor-door-width-label]').textContent=row.querySelector('[data-floor-door-double]').value==='double'?'Ширина створки, мм':'Ширина двери, мм';
    });
  };
  overlay.querySelector('[data-add-floor-door-row]').addEventListener('click',()=>{
    const count=rowList.querySelectorAll('[data-floor-door-row]').length;
    if(count>=20){toast('Можно добавить не больше 20 позиций за раз');return;}
    rowList.insertAdjacentHTML('beforeend',floorDoorFormRow(count));
    updateRows();
    rowList.lastElementChild.querySelector('[data-floor-door-double]').focus();
  });
  rowList.addEventListener('change',event=>{
    if(event.target.matches('[data-floor-door-double]'))updateRows();
  });
  rowList.addEventListener('click',event=>{
    const remove=event.target.closest('[data-remove-floor-door-row]');
    if(!remove)return;
    remove.closest('[data-floor-door-row]').remove();
    updateRows();
  });
  overlay.querySelector('form').addEventListener('submit',async event=>{
    event.preventDefault();
    const form=event.currentTarget;
    const submit=form.querySelector('[type="submit"]');
    const rows=[];
    for(const [index,row] of [...rowList.querySelectorAll('[data-floor-door-row]')].entries()){
      const double=row.querySelector('[data-floor-door-double]').value==='double';
      const glass=row.querySelector('[data-floor-door-glass]').value==='glass';
      const count=Number(row.querySelector('[data-floor-door-count]').value);
      const widthMm=Number(row.querySelector('[data-floor-door-width]').value);
      const type=`${double?'double':'single'}_${glass?'glass':'solid'}`;
      const item=FLOOR_DOOR_TYPES.find(option=>option.type===type);
      if(!Number.isInteger(count)||count<0||count>500){toast(`Проверьте количество в позиции ${index+1}`);return;}
      if(!count)continue;
      if(!Number.isInteger(widthMm)||widthMm<1||widthMm>5000){toast(`Укажите ширину двери в позиции ${index+1}`);return;}
      rows.push({...item,count,widthMm});
    }
    if(!rows.length){toast('Укажите количество хотя бы в одной строке');return;}
    const statusBefore=floorStatus(floor);
    if(statusBefore==='pending'){toast('Этаж на проверке. Сначала примите его или верните бригадиру.');return;}
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
        opening.title=`${row.label} ${number} · ${row.double?'ширина створки':'ширина'} ${row.widthMm} мм`;
        opening.doors=opening.doors.map(door=>({...door,widthMm:row.widthMm}));
        floorEntry.openings.push(opening);
        floorOpenings.push(opening);
      }
    }
    if(statusBefore==='accepted'||statusBefore==='changes_requested')floor.status='in_progress';
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
    const width=Number(door.widthMm)||0;
    const size=width?`${doorCount===2?'Ширина створки':'Ширина двери'}: ${width} мм`:'';
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
  container.querySelectorAll('[data-goto-floor]').forEach(element=>element.addEventListener('click',()=>goto('objects',JSON.parse(element.dataset.gotoFloor))));
  container.querySelectorAll('[data-floor-status]').forEach(element=>element.addEventListener('click',()=>{
    const data=JSON.parse(element.dataset.floorStatus);
    runFloorAction('status',{objId:data.objId,blockId:data.blockId,floorId:data.floorId},data.status);
  }));
  container.querySelectorAll('[data-submit-floor]').forEach(element=>element.addEventListener('click',async()=>{
    const ids=JSON.parse(element.dataset.submitFloor);
    const note=container.querySelector('[data-floor-report-note]')?.value||'';
    if(!confirm('Отправить этаж менеджеру как законченный? После отправки править его нельзя, пока менеджер не ответит.'))return;
    element.disabled=true;
    await runFloorAction('submit',ids,note);
  }));
  container.querySelectorAll('[data-floor-review]').forEach(element=>element.addEventListener('click',()=>{
    const ids=JSON.parse(element.dataset.floorIds);
    if(element.dataset.floorReview==='accept'){
      if(!confirm('Принять этаж целиком? Бригаде будет начислена оплата по тарифу за каждый проём.'))return;
      element.disabled=true;
      runFloorAction('accept',ids);
    }else openFloorReturnModal(ids);
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

function findFloorContext(ids){
  const obj=state.objects.find(item=>item.id===ids.objId),block=obj?.blocks.find(item=>item.id===ids.blockId),floor=block?.floors.find(item=>item.id===ids.floorId);
  return obj&&block&&floor?{obj,block,floor}:null;
}

// Меняет статус этажа и синхронно статусы проёмов и дверей внутри него (локальный режим и возврат менеджером).
function applyFloorTransitionLocally(context,kind,arg){
  const floor=context.floor,now=new Date().toISOString();
  const status=floorStatus(floor);
  const items=floorOpeningItems(floor).filter(item=>!acceptedOpening(item.opening));
  const setAll=(review,doorStatus)=>items.forEach(({opening})=>{
    opening.reviewStatus=review;
    (opening.doors||[]).forEach(door=>{
      door.status=doorStatus;
      door.installedAt=['installed','accepted'].includes(doorStatus)?(door.installedAt||now):null;
    });
  });
  if(kind==='status'){
    if(status==='pending'||status==='accepted')throw new Error('Этаж уже отправлен менеджеру или принят');
    floor.status=arg;setAll('not_submitted',arg);
  }else if(kind==='submit'){
    if(status==='pending'||status==='accepted')throw new Error('Этаж уже отправлен менеджеру или принят');
    if(!items.length)throw new Error('На этаже нет дверей, которые можно отправить на проверку');
    floor.status='pending';setAll('pending','installed');
    items.forEach(({opening})=>{opening.submittedAt=now;});
    floor.foremanReport={submittedAt:now,note:arg||'',openingsCount:items.length};
    delete floor.managerNote;
  }else if(kind==='return'){
    floor.status='changes_requested';floor.managerNote=arg;setAll('changes_requested','in_progress');
    items.forEach(({opening})=>{opening.managerNote=arg;opening.acceptedAt=null;});
  }else if(kind==='accept'){
    if(!floor.brigadeId)throw new Error('Сначала назначьте бригаду на этот этаж.');
    const rate=Number(floor.ratePerOpening);
    if(!Number.isFinite(rate)||rate<=0)throw new Error('Сначала задайте тариф за проём для этого этажа.');
    state.financeEntries=Array.isArray(state.financeEntries)?state.financeEntries:[];
    items.forEach(({opening})=>{
      const doorCount=(opening.doors||[]).length;
      state.financeEntries.unshift({
        id:`accrual-${newRecordId('fe')}`,brigade_id:floor.brigadeId,entry_type:'accrual',
        amount:rate+(doorCount===2?500:0),occurred_on:now.slice(0,10),floor_id:floor.id,opening_id:opening.id,
        rate_per_opening:rate,door_count:doorCount,note:opening.title||'Принятый проём',created_at:now,
      });
      opening.acceptedAt=now;
    });
    setAll('accepted','accepted');
    floor.status='accepted';delete floor.managerNote;
  }
}

async function runFloorAction(kind,ids,arg){
  const context=findFloorContext(ids);
  if(!context){toast('Этаж не найден');return;}
  const messages={status:'Статус этажа обновлён',submit:'Этаж отправлен менеджеру',accept:'Этаж принят, начисление добавлено в баланс бригады',return:'Замечание отправлено бригадиру'};
  const previousState=JSON.parse(JSON.stringify(state));
  try{
    if(cloudEnabled&&isForemanWorkspaceUser()){
      if(kind==='status')await callFloorRpc('set_foreman_floor_status',ids,{p_status:arg});
      else if(kind==='submit')await callFloorRpc('submit_foreman_floor',ids,{p_note:arg||''});
      else throw new Error('Это действие доступно менеджеру');
    }else if(cloudEnabled&&kind==='accept'){
      await callFloorRpc('accept_floor_with_accrual',ids,{});
    }else{
      applyFloorTransitionLocally(context,kind,arg);
      await saveManagerOpeningState();
      if(kind==='accept')refreshBrigadeFinance();
    }
    toast(messages[kind]);
  }catch(error){
    state=previousState;
    toast(error.message||'Не удалось выполнить действие');
  }
  render();
}

function openFloorReturnModal(ids){
  const overlay=document.createElement('div');overlay.className='overlay';
  overlay.innerHTML=`<div class="modal" role="dialog" aria-modal="true"><h3>Вернуть этаж на доработку</h3><p class="hint">Напишите бригадиру, что нужно исправить на этаже.</p><label class="field"><span>Замечание</span><textarea rows="4" data-manager-note required></textarea></label><div class="modal-actions"><button class="btn ghost" data-cancel>Отмена</button><button class="btn primary" data-confirm>Отправить замечание</button></div></div>`;
  document.body.appendChild(overlay);overlay.querySelector('[data-cancel]').addEventListener('click',()=>overlay.remove());
  overlay.querySelector('[data-confirm]').addEventListener('click',async()=>{
    const note=overlay.querySelector('[data-manager-note]').value.trim();if(!note){toast('Добавьте текст замечания');return;}
    overlay.remove();await runFloorAction('return',ids,note);
  });
}

function reviewFloorRows(source){
  const out=[];
  activeObjects(source).forEach(obj=>(obj.blocks||[]).forEach(block=>(block.floors||[]).forEach(floor=>{
    if(floorStatusExplicit(floor)&&['pending','changes_requested'].includes(floor.status))out.push({obj,block,floor});
  })));
  return out;
}
function reviewOpeningRows(source){
  return allOpenings(source).filter(({opening,floor})=>{
    if(opening.issue?.status==='open'||opening.reviewStatus==='issue_reported')return true;
    return !floorStatusExplicit(floor)&&['pending','changes_requested'].includes(opening.reviewStatus);
  });
}
function reviewBadgeCount(source){return reviewFloorRows(source).length+reviewOpeningRows(source).length;}
function pendingReviewCount(source){
  return reviewFloorRows(source).filter(row=>row.floor.status==='pending').length
    +reviewOpeningRows(source).filter(({opening})=>['issue_reported','pending'].includes(opening.reviewStatus)).length;
}

function pageProblems(){
  const floorRows=reviewFloorRows(state);
  const rows=reviewOpeningRows(state);
  const foremanView=isForemanWorkspaceUser();
  const title=foremanView?'Замечания':'Проверка этажей';
  const waiting=pendingReviewCount(state);
  const floorHtml=floorRows.map(({obj,block,floor})=>{
    const summary=floorDoorSummary(floorOpeningItems(floor));
    const meta=FLOOR_STATUS_LABELS[floor.status];
    return `<article class="review-row"><div><strong>${htmlEscape(obj.name)} · ${htmlEscape(block.name)} · этаж ${htmlEscape(floor.num)}</strong><span>${summary.total} ${ruPlural(summary.total,'дверь','двери','дверей')} · ${summary.glass} со стеклом · ${summary.solid} глухих · ${summary.double} двойных</span><p>${htmlEscape(floor.status==='changes_requested'?(floor.managerNote||'Нужна доработка'):(floor.foremanReport?.note||'Ожидает проверки'))}</p></div><span class="pill ${meta.cls}">${meta.label}</span><button class="btn sm" data-open-opening-context='${htmlEscape(JSON.stringify({objId:obj.id,blockId:block.id,floorId:floor.id}))}'>Открыть</button></article>`;
  }).join('');
  const openingHtml=rows.map(({opening,apt,floor,block,obj})=>`<article class="review-row"><div><strong>${htmlEscape(obj.name)} · ${htmlEscape(block.name)} · этаж ${htmlEscape(floor.num)}${apt.isFloorContainer?'':` · кв. ${htmlEscape(apt.num)}`}</strong><span>${htmlEscape(opening.title||OPENING_TYPE_LABELS[opening.type])} · ${openingDoorCount(opening)} двери</span><p>${htmlEscape(opening.managerNote||opening.foremanNote||'Ожидает проверки')}</p></div><span class="pill ${['issue_reported','pending'].includes(opening.reviewStatus)?'info':'warn'}">${OPENING_REVIEW_LABELS[opening.reviewStatus]?.label||'Замечание'}</span><button class="btn sm" data-open-opening-context='${htmlEscape(JSON.stringify({objId:obj.id,blockId:block.id,floorId:floor.id,aptId:apt.id}))}'>Открыть</button></article>`).join('');
  return `<div class="panel"><div class="panel-head"><div><h3>${title}</h3><span class="hint">${foremanView?'Ответ менеджера по этажам':'Этажи, которые бригады отметили законченными'}</span></div><span class="pill info">${waiting} ожидают ответа</span></div>
    <div class="review-queue">${floorHtml+openingHtml||'<div class="empty">Нет этажей на проверке и без замечаний</div>'}</div></div>`;
}

const problemNavItem=NAV_ITEMS.find(item=>item.id==='problems');
if(problemNavItem){
  problemNavItem.label='Замечания';
  problemNavItem.badgeFn=source=>reviewBadgeCount(source);
}

const bindProblemsBase=bindPageEvents;
bindPageEvents=function(){
  bindProblemsBase();
  document.querySelectorAll('[data-open-opening-context]').forEach(element=>element.addEventListener('click',()=>goto('objects',{...JSON.parse(element.dataset.openOpeningContext)})));
};
