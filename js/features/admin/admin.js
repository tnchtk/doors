function adminEsc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

function pageAdmin(){
  const doorCount=allDoors(state).length;
  return `
    <div class="section-title"><h2>Администрирование</h2></div>
    <div class="subhead">Справочники, резервные копии и состояние хранилища</div>
    <div class="kpi-grid">
      <div class="kpi accent"><div class="val">${state.objects.length}</div><div class="lbl">Объектов</div></div>
      <div class="kpi"><div class="val">${state.brigades.length}</div><div class="lbl">Бригад</div></div>
      <div class="kpi"><div class="val">${doorCount}</div><div class="lbl">Дверей в учёте</div></div>
      <div class="kpi ok"><div class="val" id="dbStatus">Проверка…</div><div class="lbl">${cloudEnabled?'Общая база данных':'Локальная база данных'}</div></div>
    </div>
    <div class="panel"><div class="panel-head"><h3>Объекты</h3><span class="hint">${cloudEnabled?'Изменения доступны всей команде':'Изменения сохраняются в базе браузера'}</span></div>
      <div class="tbl-wrap"><table><thead><tr><th>Название</th><th>Блоки</th><th>Квартиры</th><th></th></tr></thead><tbody>
      ${state.objects.map(o=>`<tr><td>${adminEsc(o.name)}</td><td>${o.blocks.length}</td><td>${o.blocks.reduce((n,b)=>n+b.floors.reduce((x,f)=>x+f.apartments.length,0),0)}</td><td><button class="btn sm" data-admin-edit-object="${adminEsc(o.id)}">Изменить</button></td></tr>`).join('')}
      </tbody></table></div>
    </div>
    <div class="panel"><div class="panel-head"><h3>Бригады</h3><span class="hint">Редактирование основных данных</span></div>
      <div class="tbl-wrap"><table><thead><tr><th>Бригада</th><th>Бригадир</th><th>Телефон</th><th>Сотрудники</th><th></th></tr></thead><tbody>
      ${state.brigades.map(b=>`<tr><td>${adminEsc(b.name)}</td><td>${adminEsc(b.leader)}</td><td>${adminEsc(b.phone)}</td><td>${b.workers}</td><td><button class="btn sm" data-admin-edit-brigade="${adminEsc(b.id)}">Изменить</button></td></tr>`).join('')}
      </tbody></table></div>
    </div>
    <div class="panel"><div class="panel-head"><h3>Данные и резервные копии</h3></div>
      <p class="admin-note">${cloudEnabled?'Данные хранятся в общей облачной базе. JSON-копия содержит все объекты, двери, заявки, закупки и складские движения.':'Данные хранятся в IndexedDB этого браузера и устройства. Резервная копия содержит все объекты, двери, заявки, закупки и складские движения.'}</p>
      <div class="admin-actions"><button class="btn primary" data-admin-backup>Скачать копию JSON</button><label class="btn" for="adminImport">Восстановить из JSON</label><input id="adminImport" type="file" accept="application/json,.json" hidden>${cloudEnabled?'':'<button class="btn" data-admin-reset>Сбросить демо данные</button>'}</div>
      <p class="admin-note admin-warning">${cloudEnabled?'Учетные записи создаются администратором проекта Supabase. Одновременно разрешено не более 10 активных сотрудников; все активные сотрудники могут изменять общие данные.':'Выбор роли в боковом меню демонстрационный и не ограничивает доступ. Для общей работы нескольких сотрудников подключите облачную базу и вход с проверкой прав.'}</p>
    </div>`;
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
  overlay.querySelector('form').addEventListener('submit',e=>{
    e.preventDefault();
    const values=Object.fromEntries(new FormData(e.currentTarget).entries());
    if(onSave(values)) close();
  });
  overlay.querySelector('input')?.focus();
}

async function bindAdminEvents(container){
  const status=container.querySelector('#dbStatus');
  if(status) status.textContent=cloudEnabled?cloudStatus:await dbReady.then(db=>db?'Подключена':'LocalStorage');
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
