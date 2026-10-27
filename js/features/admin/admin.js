let adminProfilesCache=null;

function adminEsc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

function pageAdmin(){
  const doorCount=allDoors(state).length;
  const apartmentCount=state.objects.reduce((n,o)=>n+o.blocks.reduce((x,b)=>x+b.floors.reduce((y,f)=>y+f.apartments.length,0),0),0);
  const activeProfiles=(adminProfilesCache||[]).filter(profile=>profile.is_active).length;
  return `
    <div class="section-title"><h2>Админ-панель</h2></div>
    <div class="subhead">Управление объектами, блоками, бригадами и доступом сотрудников</div>
    <div class="kpi-grid">
      <div class="kpi accent"><div class="val">${state.objects.length}</div><div class="lbl">Объектов</div></div>
      <div class="kpi"><div class="val">${state.objects.reduce((n,o)=>n+o.blocks.length,0)}</div><div class="lbl">Блоков</div></div>
      <div class="kpi"><div class="val">${doorCount}</div><div class="lbl">Дверей · ${apartmentCount} квартир</div></div>
      <div class="kpi ok"><div class="val" id="dbStatus">Проверка…</div><div class="lbl">${cloudEnabled?'Общая база данных':'Локальная база данных'}</div></div>
    </div>
    <div class="panel"><div class="panel-head"><div><h3>Объекты и блоки</h3><span class="hint">Создавайте объект, затем добавляйте в него блоки</span></div><button class="btn primary sm" data-create-object>+ Новый объект</button></div>
      <div class="tbl-wrap"><table><thead><tr><th>Объект</th><th>Блоки</th><th>Квартиры</th><th>Двери</th><th></th></tr></thead><tbody>
      ${state.objects.map(o=>{
        const apartments=o.blocks.reduce((n,b)=>n+b.floors.reduce((x,f)=>x+f.apartments.length,0),0);
        const doors=o.blocks.reduce((n,b)=>n+b.floors.reduce((x,f)=>x+f.apartments.reduce((y,a)=>y+a.doors.length,0),0),0);
        const blockNames=o.blocks.length?o.blocks.map(b=>adminEsc(b.name)).join(', '):'Пока нет блоков';
        return `<tr><td>${adminEsc(o.name)}</td><td><span class="hint">${blockNames}</span></td><td>${apartments}</td><td>${doors}</td><td><div class="admin-actions"><button class="btn sm" data-admin-add-block="${adminEsc(o.id)}">+ Блок</button><button class="btn sm" data-admin-edit-object="${adminEsc(o.id)}">Изменить</button></div></td></tr>`;
      }).join('')||'<tr><td colspan="5"><div class="empty">Объектов пока нет. Создайте первый объект.</div></td></tr>'}
      </tbody></table></div>
    </div>
    <div class="panel"><div class="panel-head"><div><h3>Бригады</h3><span class="hint">Бригада назначается на этаж; бригадир увидит свои этажи</span></div><button class="btn primary sm" data-create-brigade>+ Новая бригада</button></div>
      <div class="tbl-wrap"><table><thead><tr><th>Бригада</th><th>Бригадир</th><th>Телефон</th><th>Сотрудники</th><th></th></tr></thead><tbody>
      ${state.brigades.map(b=>`<tr><td>${adminEsc(b.name)}</td><td>${adminEsc(b.leader)}</td><td>${adminEsc(b.phone)}</td><td>${Number(b.workers)||0}</td><td><button class="btn sm" data-admin-edit-brigade="${adminEsc(b.id)}">Изменить</button></td></tr>`).join('')||'<tr><td colspan="5"><div class="empty">Бригад пока нет.</div></td></tr>'}
      </tbody></table></div>
    </div>
    ${cloudEnabled?`
    <div class="panel"><div class="panel-head"><div><h3>Сотрудники и роли</h3><span class="hint">${activeProfiles} из 10 активных учетных записей</span></div><button class="btn primary sm" data-admin-invite>+ Пригласить сотрудника</button></div>
      <p class="admin-note">Приглашение отправит сотруднику письмо для входа. После приглашения назначьте роль и для бригадира выберите его бригаду.</p>
      <div id="adminTeamArea">${adminTeamTable(adminProfilesCache)}</div>
    </div>`:`<div class="panel"><div class="panel-head"><h3>Сотрудники и роли</h3></div><p class="admin-note admin-warning">Управление учетными записями доступно после подключения Supabase.</p></div>`}
    <div class="panel"><div class="panel-head"><h3>Резервные копии</h3></div>
      <p class="admin-note">JSON-копия содержит объекты, двери, заявки, закупки и складские движения.</p>
      <div class="admin-actions"><button class="btn primary" data-admin-backup>Скачать копию JSON</button><label class="btn" for="adminImport">Восстановить из JSON</label><input id="adminImport" type="file" accept="application/json,.json" hidden>${cloudEnabled?'':'<button class="btn" data-admin-reset>Сбросить демо данные</button>'}</div>
      ${cloudEnabled?'':'<p class="admin-note admin-warning">Локальный режим хранит данные только в этом браузере.</p>'}
    </div>`;
}

function adminTeamTable(profiles){
  if(!cloudEnabled)return '';
  if(profiles===null)return '<div class="empty">Загружаем сотрудников…</div>';
  if(!profiles.length)return '<div class="empty">Сотрудников пока нет.</div>';
  const roleLabel={admin:'Администратор',manager:'Менеджер',foreman:'Бригадир'};
  return `<div class="tbl-wrap"><table><thead><tr><th>Сотрудник</th><th>Роль</th><th>Бригада</th><th>Доступ</th></tr></thead><tbody>
  ${profiles.map(profile=>`<tr>
    <td><strong>${adminEsc(profile.full_name||'Сотрудник')}</strong><div class="hint">${adminEsc(profile.email||'')}</div></td>
    <td><select class="admin-select" data-admin-role="${adminEsc(profile.id)}" aria-label="Роль сотрудника ${adminEsc(profile.full_name)}">${Object.entries(roleLabel).map(([value,label])=>`<option value="${value}" ${profile.role===value?'selected':''}>${label}</option>`).join('')}</select></td>
    <td><select class="admin-select" data-admin-brigade="${adminEsc(profile.id)}" aria-label="Бригада сотрудника ${adminEsc(profile.full_name)}"><option value="">Не назначена</option>${state.brigades.map(brigade=>`<option value="${adminEsc(brigade.id)}" ${profile.brigade_id===brigade.id?'selected':''}>${adminEsc(brigade.name)}</option>`).join('')}</select></td>
    <td><button class="btn sm ${profile.is_active?'':'ghost'}" data-admin-toggle-active="${adminEsc(profile.id)}" data-active="${profile.is_active?'1':'0'}">${profile.is_active?'Активен':'Отключён'}</button></td>
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
      ${fields.map(f=>`<div class="field"><label for="${adminEsc(f.id)}">${adminEsc(f.label)}</label><input id="${adminEsc(f.id)}" name="${adminEsc(f.id)}" type="${f.type||'text'}" value="${adminEsc(f.value)}" ${f.min!==undefined?`min="${f.min}"`:''} ${f.required?'required':''}></div>`).join('')}
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

async function bindAdminEvents(container){
  const status=container.querySelector('#dbStatus');
  if(status) status.textContent=cloudEnabled?cloudStatus:await dbReady.then(db=>db?'Подключена':'LocalStorage');
  if(cloudEnabled)loadAdminProfiles(container);
  container.querySelectorAll('[data-admin-add-block]').forEach(btn=>btn.addEventListener('click',()=>createNewBlock(btn.dataset.adminAddBlock)));
  container.querySelectorAll('[data-admin-edit-object]').forEach(btn=>btn.addEventListener('click',()=>{
    const obj=state.objects.find(x=>x.id===btn.dataset.adminEditObject);if(!obj)return;
    openAdminEditModal({title:'Изменить объект',fields:[{id:'name',label:'Название объекта',value:obj.name,required:true}],onSave:values=>{
      if(!values.name.trim()){toast('Название не может быть пустым');return false;}
      obj.name=values.name.trim();saveState();render();toast('Объект обновлён');return true;
    }});
  }));
  container.querySelectorAll('[data-admin-edit-brigade]').forEach(btn=>btn.addEventListener('click',()=>{
    const b=state.brigades.find(x=>x.id===btn.dataset.adminEditBrigade);if(!b)return;
    openAdminEditModal({title:`Изменить ${b.name}`,fields:[
      {id:'leader',label:'Имя бригадира',value:b.leader,required:true},
      {id:'phone',label:'Телефон',value:b.phone},
      {id:'workers',label:'Количество сотрудников',value:b.workers,type:'number',min:1,required:true},
    ],onSave:values=>{
      if(!values.leader.trim()||!Number.isInteger(Number(values.workers))||Number(values.workers)<1){toast('Проверьте имя и количество сотрудников');return false;}
      b.leader=values.leader.trim();b.phone=values.phone.trim();b.workers=Number(values.workers);saveState();render();toast('Бригада обновлена');return true;
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
    try{await saveAdminProfile(container,select.dataset.adminBrigade,{brigade_id:select.value||null});}
    catch(error){toast(error.message||'Не удалось назначить бригаду');await loadAdminProfiles(container);}
  }));
  container.querySelectorAll('[data-admin-toggle-active]').forEach(button=>button.addEventListener('click',async()=>{
    const id=button.dataset.adminToggleActive,active=button.dataset.active!=='1';
    try{await saveAdminProfile(container,id,{is_active:active});}
    catch(error){toast(error.message||'Не удалось изменить доступ');await loadAdminProfiles(container);}
  }));
  container.querySelector('[data-admin-backup]')?.addEventListener('click',()=>adminSaveFile(`doorscrm-backup-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify({format:'doorscrm-backup',version:1,exportedAt:new Date().toISOString(),state},null,2),'application/json'));
  container.querySelector('#adminImport')?.addEventListener('change',async e=>{
    const file=e.target.files?.[0];if(!file)return;
    try{
      const backup=JSON.parse(await file.text());const data=backup.state;
      if(!data||!Array.isArray(data.objects)||!Array.isArray(data.brigades)||!Array.isArray(data.requests)||!Array.isArray(data.purchases)||!Array.isArray(data.movements))throw new Error('Неверная структура');
      if(!confirm('Текущие данные будут заменены данными из копии. Продолжить?'))return;
      state=data;saveState();render();toast('Резервная копия восстановлена');
    }catch(err){toast('Не удалось прочитать копию JSON');}
    finally{e.target.value='';}
  });
  container.querySelector('[data-admin-reset]')?.addEventListener('click',()=>{
    if(!confirm('Заменить все данные демонстрационными? Это действие нельзя отменить.'))return;
    state=freshState();saveState();render();toast('Демо данные восстановлены');
  });
}
