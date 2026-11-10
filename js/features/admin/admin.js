let adminProfilesCache=null;

function adminEsc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

function pageAdmin(){
  const objects=activeObjects(state);
  const doorCount=allDoors(state).length;
  const openingCount=allOpenings(state).length;
  const activeProfiles=(adminProfilesCache||[]).filter(profile=>profile.is_active).length;
  return `
    <div class="section-title"><h2>Админ-панель</h2></div>
    <div class="subhead">Управление объектами, блоками, бригадами и доступом сотрудников</div>
    <div class="kpi-grid">
      <div class="kpi accent"><div class="val">${objects.length}</div><div class="lbl">Активных объектов</div></div>
      <div class="kpi"><div class="val">${objects.reduce((n,o)=>n+o.blocks.length,0)}</div><div class="lbl">Активных блоков</div></div>
      <div class="kpi"><div class="val">${doorCount}</div><div class="lbl">Дверей · ${openingCount} проёмов</div></div>
      <div class="kpi ok"><div class="val" id="dbStatus">Проверка…</div><div class="lbl">${cloudEnabled?'Общая база данных':'Локальная база данных'}</div></div>
    </div>
    <div class="panel"><div class="panel-head"><div><h3>Объекты и блоки</h3><span class="hint">Блоки добавляются в карточке объекта в разделе «Объекты»</span></div><button class="btn primary sm" data-create-object>+ Новый объект</button></div>
      <div class="tbl-wrap"><table><thead><tr><th>Объект</th><th>Блоки</th><th>Этажи</th><th>Проёмы</th><th>Двери</th><th>Статус</th><th></th></tr></thead><tbody>
      ${state.objects.map(o=>{
        const floors=o.blocks.reduce((n,b)=>n+(b.floors||[]).length,0);
        const openings=(o.blocks||[]).reduce((n,b)=>n+(b.floors||[]).reduce((x,f)=>x+(f.apartments||[]).reduce((y,a)=>y+(a.openings||[]).length,0),0),0);
        const doors=(o.blocks||[]).reduce((n,b)=>n+(b.floors||[]).reduce((x,f)=>x+(f.apartments||[]).reduce((y,a)=>y+apartmentDoors(a).length,0),0),0);
        const blockNames=o.blocks.length?`<div class="admin-block-list">${o.blocks.map(b=>`<span class="admin-block-item"><span>${adminEsc(b.name)}</span><button class="btn sm" data-admin-edit-block='${adminEsc(JSON.stringify({objId:o.id,blockId:b.id}))}'>Изменить</button></span>`).join('')}</div>`:'Пока нет блоков';
        return `<tr><td>${adminEsc(o.name)}</td><td>${blockNames}</td><td>${floors}</td><td>${openings}</td><td>${doors}</td><td><span class="pill ${o.archivedAt?'neutral':'ok'}">${o.archivedAt?'В архиве':'Активен'}</span></td><td><div class="admin-actions"><button class="btn sm" data-admin-edit-object="${adminEsc(o.id)}">Изменить</button><button class="btn sm" data-object-archive="${adminEsc(o.id)}" data-archived="${o.archivedAt?'1':'0'}">${o.archivedAt?'Восстановить':'Архивировать'}</button><button class="btn sm danger" data-delete-object="${adminEsc(o.id)}">Удалить навсегда</button></div></td></tr>`;
      }).join('')||'<tr><td colspan="7"><div class="empty">Объектов пока нет. Создайте первый объект.</div></td></tr>'}
      </tbody></table></div>
    </div>
    <div class="panel"><div class="panel-head"><div><h3>Бригады</h3><span class="hint">Бригада назначается на этаж; бригадир увидит свои этажи</span></div><button class="btn primary sm" data-create-brigade>+ Новая бригада</button></div>
      <div class="tbl-wrap"><table><thead><tr><th>Бригада</th><th>Бригадир</th><th>Телефон</th><th>Сотрудники</th><th>Базовый тариф</th><th></th></tr></thead><tbody>
      ${state.brigades.map(b=>`<tr><td>${adminEsc(b.name)}</td><td>${adminEsc(b.leader)}</td><td>${adminEsc(b.phone)}</td><td>${Number(b.workers)||0}</td><td class="mono">${Number(b.defaultRatePerOpening)>0?`${Number(b.defaultRatePerOpening).toLocaleString('ru-RU')} сом`:'—'}</td><td><button class="btn sm" data-admin-edit-brigade="${adminEsc(b.id)}">Изменить</button></td></tr>`).join('')||'<tr><td colspan="6"><div class="empty">Бригад пока нет.</div></td></tr>'}
      </tbody></table></div>
    </div>
    ${brigadeFinanceAdminPanel()}
    ${cloudEnabled?`
    <div class="panel"><div class="panel-head"><div><h3>Сотрудники и роли</h3><span class="hint">${activeProfiles} из 10 активных учетных записей</span></div><button class="btn primary sm" data-admin-invite>+ Пригласить сотрудника</button></div>
      <p class="admin-note">Сотрудник создаст пароль по ссылке из письма. После приглашения назначьте роль и при необходимости выберите бригаду.</p>
      <div id="adminTeamArea">${adminTeamTable(adminProfilesCache)}</div>
    </div>`:`<div class="panel"><div class="panel-head"><h3>Сотрудники и роли</h3></div><p class="admin-note admin-warning">Управление учетными записями доступно после подключения Supabase.</p></div>`}
    <div class="panel"><div class="panel-head"><h3>Резервные копии</h3></div>
      <p class="admin-note">JSON-копия содержит объекты, двери, заявки, закупки и складские движения. Финансовый журнал скачивается отдельно в разделе тарифов.</p>
      <div class="admin-actions"><button class="btn primary" data-admin-backup>Скачать копию JSON</button>${isAdminWorkspaceUser()?'<label class="btn" for="adminImport">Восстановить из JSON</label><input id="adminImport" type="file" accept="application/json,.json" hidden>':''}${cloudEnabled?'':'<button class="btn" data-admin-reset>Сбросить демо данные</button>'}</div>
      ${cloudEnabled?'':'<p class="admin-note admin-warning">Локальный режим хранит данные только в этом браузере.</p>'}
    </div>`;
}

function adminTeamTable(profiles){
  if(!cloudEnabled)return '';
  if(profiles===null)return '<div class="empty">Загружаем сотрудников…</div>';
  if(!profiles.length)return '<div class="empty">Сотрудников пока нет.</div>';
  const roleLabel={admin:'Администратор',manager:'Менеджер',foreman:'Бригадир'};
  return `<div class="tbl-wrap"><table><thead><tr><th>Сотрудник</th><th>Роль</th><th>Бригада</th><th>Доступ и действия</th></tr></thead><tbody>
  ${profiles.map(profile=>`<tr>
    <td><strong>${adminEsc(profile.full_name||'Сотрудник')}</strong><div class="hint">${adminEsc(profile.email||'')}</div></td>
    <td><select class="admin-select" data-admin-role="${adminEsc(profile.id)}" aria-label="Роль сотрудника ${adminEsc(profile.full_name)}">${Object.entries(roleLabel).map(([value,label])=>`<option value="${value}" ${profile.role===value?'selected':''}>${label}</option>`).join('')}</select></td>
    <td><select class="admin-select" data-admin-brigade="${adminEsc(profile.id)}" aria-label="Бригада сотрудника ${adminEsc(profile.full_name)}"><option value="">Не назначена</option>${state.brigades.map(brigade=>`<option value="${adminEsc(brigade.id)}" ${profile.brigade_id===brigade.id?'selected':''}>${adminEsc(brigade.name)}</option>`).join('')}</select></td>
    <td><div class="admin-profile-actions"><button class="btn sm ${profile.is_active?'':'ghost'}" data-admin-toggle-active="${adminEsc(profile.id)}" data-active="${profile.is_active?'1':'0'}">${profile.is_active?'Отключить':'Включить'}</button>${profile.role==='manager'?`<button class="btn sm danger" data-admin-delete-manager="${adminEsc(profile.id)}" data-manager-name="${adminEsc(profile.full_name||profile.email||'Сотрудник')}">Удалить</button>`:''}</div></td>
  </tr>`).join('')}
  </tbody></table></div>`;
}

function adminSaveFile(name, content, type){
  const url=URL.createObjectURL(new Blob([content],{type}));
  const a=document.createElement('a');a.href=url;a.download=name;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function openAdminEditModal({title, fields, onSave}){
  const overlay=document.createElement('div');
  overlay.className='overlay';
  overlay.innerHTML=`<div class="modal" role="dialog" aria-modal="true" aria-labelledby="adminModalTitle">
    <h3 id="adminModalTitle">${adminEsc(title)}</h3>
    <form data-admin-form>
      ${fields.map(f=>`<div class="field"><label for="${adminEsc(f.id)}">${adminEsc(f.label)}</label><input id="${adminEsc(f.id)}" name="${adminEsc(f.id)}" type="${f.type||'text'}" value="${adminEsc(f.value)}" ${f.min!==undefined?`min="${f.min}"`:''} ${f.step!==undefined?`step="${f.step}"`:''} ${f.required?'required':''}></div>`).join('')}
      <div class="modal-actions"><button type="button" class="btn ghost" data-cancel>Отмена</button><button type="submit" class="btn primary">Сохранить</button></div>
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
    catch(error){toast(error.message||'Не удалось выполнить действие');}
    finally{if(button.isConnected){button.disabled=false;button.textContent='Сохранить';}}
  });
  overlay.querySelector('input')?.focus();
}

async function loadAdminProfiles(container){
  if(!cloudEnabled||!supabaseClient)return;
  const area=container.querySelector('#adminTeamArea');
  if(area)area.innerHTML=adminTeamTable(null);
  const {data,error}=await supabaseClient.from('profiles').select('id,full_name,email,role,is_active,brigade_id').order('created_at');
  if(error){if(area)area.innerHTML=`<div class="empty">Не удалось загрузить сотрудников: ${adminEsc(error.message)}</div>`;return;}
  adminProfilesCache=data||[];
  if(area)area.innerHTML=adminTeamTable(adminProfilesCache);
  const hint=container.querySelector('.panel .panel-head .hint');
  if(hint&&hint.textContent.includes('активных учетных записей'))hint.textContent=`${adminProfilesCache.filter(profile=>profile.is_active).length} из 10 активных учетных записей`;
}

async function saveAdminProfile(container,id,changes){
  const {error}=await supabaseClient.from('profiles').update(changes).eq('id',id);
  if(error)throw error;
  const current=adminProfilesCache?.find(profile=>profile.id===id);
  if(current)Object.assign(current,changes);
  if(cloudUser?.id===id&&cloudProfile){Object.assign(cloudProfile,changes);}
  await loadAdminProfiles(container);
  if(cloudUser?.id===id&&changes.role)render();
  toast('Данные сотрудника обновлены');
  return true;
}


function editExistingObject(objectId){
  const object=state.objects.find(item=>item.id===objectId);if(!object)return;
  openAdminEditModal({title:`Изменить объект · ${object.name}`,fields:[
    {id:'name',label:'Название объекта',value:object.name,required:true},
    {id:'address',label:'Адрес',value:object.address||''},
  ],onSave:async values=>{
    const name=values.name.trim();
    if(!name){toast('Название не может быть пустым');return false;}
    if(state.objects.some(item=>item.id!==object.id&&item.name.trim().toLocaleLowerCase()===name.toLocaleLowerCase())){toast('Объект с таким названием уже есть');return false;}
    const previous={name:object.name,address:object.address};
    object.name=name;object.address=values.address.trim();
    await saveState();
    if(cloudEnabled&&cloudWriteBlocked){try{await readCloudState();}catch{object.name=previous.name;object.address=previous.address;}render();throw new Error('Объект не сохранён. Обновите данные и повторите попытку.');}
    render();toast('Объект обновлён');return true;
  }});
}

function editExistingBlock(ids){
  const object=state.objects.find(item=>item.id===ids.objId),block=object?.blocks.find(item=>item.id===ids.blockId);
  if(!object||!block)return;
  openAdminEditModal({title:`Изменить блок · ${block.name}`,fields:[{id:'name',label:'Название блока',value:block.name,required:true}],onSave:async values=>{
    const name=values.name.trim();
    if(!name){toast('Название не может быть пустым');return false;}
    if(object.blocks.some(item=>item.id!==block.id&&item.name.trim().toLocaleLowerCase()===name.toLocaleLowerCase())){toast('В этом объекте уже есть блок с таким названием');return false;}
    const previousName=block.name;
    block.name=name;
    await saveState();
    if(cloudEnabled&&cloudWriteBlocked){try{await readCloudState();}catch{block.name=previousName;}render();throw new Error('Блок не сохранён. Обновите данные и повторите попытку.');}
    render();toast('Блок обновлён');return true;
  }});
}

async function bindAdminEvents(container){
  const status=container.querySelector('#dbStatus');
  if(status) status.textContent=cloudEnabled?cloudStatus:await dbReady.then(db=>db?'Подключена':'LocalStorage');
  if(cloudEnabled)loadAdminProfiles(container);
  container.querySelectorAll('[data-admin-edit-block]').forEach(btn=>btn.addEventListener('click',()=>editExistingBlock(JSON.parse(btn.dataset.adminEditBlock))));
  container.querySelectorAll('[data-admin-edit-object]').forEach(btn=>btn.addEventListener('click',()=>editExistingObject(btn.dataset.adminEditObject)));
  container.querySelectorAll('[data-admin-edit-brigade]').forEach(btn=>btn.addEventListener('click',()=>{
    const b=state.brigades.find(x=>x.id===btn.dataset.adminEditBrigade);if(!b)return;
    openAdminEditModal({title:`Изменить ${b.name}`,fields:[
      {id:'leader',label:'Имя бригадира',value:b.leader,required:true},
      {id:'phone',label:'Телефон',value:b.phone},
      {id:'workers',label:'Количество сотрудников',value:b.workers,type:'number',min:1,required:true},
      {id:'defaultRatePerOpening',label:'Базовая цена за проём для новых этажей, сом',value:b.defaultRatePerOpening??'',type:'number',min:0,step:'0.01'},
    ],onSave:async values=>{
      const defaultRate=values.defaultRatePerOpening===''?null:Number(values.defaultRatePerOpening);
      if(!values.leader.trim()||!Number.isInteger(Number(values.workers))||Number(values.workers)<1||(defaultRate!==null&&(!Number.isFinite(defaultRate)||defaultRate<=0))){toast('Проверьте имя, количество сотрудников и цену');return false;}
      const previous={leader:b.leader,phone:b.phone,workers:b.workers,defaultRatePerOpening:b.defaultRatePerOpening};
      b.leader=values.leader.trim();b.phone=values.phone.trim();b.workers=Number(values.workers);b.defaultRatePerOpening=defaultRate;await saveState();
      if(cloudEnabled&&cloudWriteBlocked){Object.assign(b,previous);try{await readCloudState();}catch{}render();throw new Error('Бригада не обновлена. Проверьте подключение и повторите попытку.');}
      render();toast('Бригада обновлена');return true;
    }});
  }));
  container.querySelector('[data-admin-invite]')?.addEventListener('click',()=>openAdminEditModal({
    title:'Пригласить сотрудника',
    fields:[{id:'full_name',label:'Имя сотрудника',required:true},{id:'email',label:'Электронная почта',type:'email',required:true}],
    onSave:async values=>{
      const full_name=values.full_name.trim(),email=values.email.trim();
      if(!full_name||!email){toast('Введите имя и электронную почту');return false;}
      const {data,error}=await supabaseClient.functions.invoke('invite-employee',{body:{full_name,email}});
      if(error){
        let message=error.message||'Не удалось пригласить сотрудника';
        try{const details=await error.context?.json();if(details?.error)message=details.error;}catch{}
        throw new Error(message);
      }
      if(data?.error)throw new Error(data.error);
      toast(`Приглашение отправлено: ${email}`);
      await loadAdminProfiles(container);
      return true;
    }
  }));
  container.querySelectorAll('[data-admin-role]').forEach(select=>select.addEventListener('change',async()=>{
    try{await saveAdminProfile(container,select.dataset.adminRole,{role:select.value});}
    catch(error){toast(error.message||'Не удалось изменить роль');await loadAdminProfiles(container);}
  }));
  container.querySelectorAll('[data-admin-brigade]').forEach(select=>select.addEventListener('change',async()=>{
    const profile=adminProfilesCache?.find(item=>item.id===select.dataset.adminBrigade);
    const taken=select.value&&adminProfilesCache?.find(item=>item.id!==select.dataset.adminBrigade&&item.role==='foreman'&&item.is_active&&item.brigade_id===select.value);
    if(taken){toast(`Эта бригада уже закреплена за бригадиром «${taken.full_name||taken.email}». У каждого бригадира должна быть своя бригада.`);await loadAdminProfiles(container);return;}
    try{await saveAdminProfile(container,select.dataset.adminBrigade,{brigade_id:select.value||null});}
    catch(error){toast(error.message||'Не удалось назначить бригаду');await loadAdminProfiles(container);}
  }));
  container.querySelectorAll('[data-admin-toggle-active]').forEach(button=>button.addEventListener('click',async()=>{
    const id=button.dataset.adminToggleActive,active=button.dataset.active!=='1';
    try{await saveAdminProfile(container,id,{is_active:active});}
    catch(error){toast(error.message||'Не удалось изменить доступ');await loadAdminProfiles(container);}
  }));
  container.querySelectorAll('[data-admin-delete-manager]').forEach(button=>button.addEventListener('click',async()=>{
    const id=button.dataset.adminDeleteManager,name=button.dataset.managerName||'этого менеджера';
    if(!confirm(`Удалить учётную запись менеджера «${name}»? Он больше не сможет войти. Его запись будет удалена из Supabase.`))return;
    button.disabled=true;
    try{
      const {data,error}=await supabaseClient.functions.invoke('delete-manager',{body:{user_id:id}});
      if(error){
        let message=error.message||'Не удалось удалить менеджера';
        try{const details=await error.context?.json();if(details?.error)message=details.error;}catch{}
        if(error.context?.status===404||message.includes('delete-manager')&&(message.includes('not found')||message.includes('schema cache')))message='Сначала разверните функцию delete-manager в проекте Supabase.';
        throw new Error(message);
      }
      if(data?.error)throw new Error(data.error);
      adminProfilesCache=(adminProfilesCache||[]).filter(profile=>profile.id!==id);
      render();toast(`Менеджер «${name}» удалён`);
    }catch(error){toast(error.message||'Не удалось удалить менеджера');button.disabled=false;}
  }));
  container.querySelector('[data-admin-backup]')?.addEventListener('click',()=>adminSaveFile(`doorscrm-backup-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify({format:'doorscrm-backup',version:1,exportedAt:new Date().toISOString(),state},null,2),'application/json'));
  container.querySelector('#adminImport')?.addEventListener('change',async e=>{
    const file=e.target.files?.[0];if(!file)return;
    try{
      if(!isAdminWorkspaceUser()){toast('Восстанавливать данные из копии может только администратор');return;}
      if(file.size>20*1024*1024)throw new Error('Файл слишком большой');
      const backup=JSON.parse(await file.text());const data=backup?.state;
      if(backup?.format!=='doorscrm-backup'||!data||!Array.isArray(data.objects)||!Array.isArray(data.brigades)||!Array.isArray(data.requests)||!Array.isArray(data.purchases)||!Array.isArray(data.movements))throw new Error('Неверная структура');
      const restored=normalizeCloudState(data);
      if(!confirm(`Текущие данные будут заменены данными из копии (объектов: ${restored.objects.length}, бригад: ${restored.brigades.length}). Продолжить?`))return;
      const previous=state;
      state=restored;
      await saveState();
      if(cloudEnabled&&cloudWriteBlocked){state=previous;render();toast('Копия не сохранена в общей базе, данные не изменены');return;}
      render();toast('Резервная копия восстановлена');
    }catch(err){toast('Не удалось прочитать копию JSON');}
    finally{e.target.value='';}
  });
  container.querySelector('[data-admin-reset]')?.addEventListener('click',()=>{
    if(!confirm('Заменить все данные демонстрационными? Это действие нельзя отменить.'))return;
    state=freshState();saveState();render();toast('Демо данные восстановлены');
  });
}
