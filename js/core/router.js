let route = {page:'dashboard'}; // mutated by nav
let sidebarOpen=false;

const NAV_ITEMS=[
  {id:'dashboard', label:'Дашборд', icon:'dashboard'},
  {id:'objects', label:'Объекты', icon:'objects'},
  {id:'brigades', label:'Бригады', icon:'brigades'},
  {id:'supply', label:'Снабжение', icon:'supply', badgeFn: s=>s.requests.filter(r=>r.status==='new').length},
  {id:'warehouse', label:'Склад', icon:'warehouse'},
  {id:'purchases', label:'Закупки', icon:'purchases'},
  {id:'problems', label:'Проблемы', icon:'problems', badgeFn: s=>allDoors(s).filter(x=>x.door.status==='problem').length},
  {id:'reports', label:'Отчёты', icon:'reports'},
  {id:'admin', label:'Администрирование', icon:'admin'},
];

function nameOfPage(p){return (NAV_ITEMS.find(n=>n.id===p)||{}).label||'';}

function render(){
  const app=document.getElementById('app');
  if(cloudEnabled&&!cloudInitialized){
    app.innerHTML=cloudGate('Подключаем общую базу', 'Проверяем вход и загружаем данные…');
    return;
  }
  if(cloudEnabled&&!cloudUser){
    app.innerHTML=cloudLoginPage();
    bindCloudAuthEvents();
    return;
  }
  if(cloudEnabled&&!state){
    app.innerHTML=cloudGate('Нет доступа к общей базе', cloudError||'Не удалось загрузить данные.', '<button class="btn primary" data-cloud-retry>Повторить</button> <button class="btn ghost" data-cloud-signout>Выйти</button>');
    bindCloudAuthEvents();
    return;
  }
  app.innerHTML = `
    ${sidebarOpen?'<div class="backdrop" data-close-sidebar></div>':''}
    <aside class="sidebar ${sidebarOpen?'open':''}">
      <div class="brand">
        <div class="mark">СМ</div>
        <div>
          <div class="name">СметаДверь</div>
          <div class="sub">CRM монтажа дверей</div>
        </div>
      </div>
      <nav class="nav">
        ${NAV_ITEMS.map(item=>{
          const badge = item.badgeFn ? item.badgeFn(state) : 0;
          return `<div class="nav-item ${route.page===item.id?'active':''}" data-nav="${item.id}" tabindex="0" role="button">
            ${ICONS[item.icon]}<span>${item.label}</span>
            ${badge>0?`<span class="badge">${badge}</span>`:''}
          </div>`;
          }).join('')}
      </nav>
      ${cloudEnabled?`<div class="account-box"><span class="account-email">${htmlEscape(cloudUser.email||'Сотрудник')}</span><span class="account-status">${htmlEscape(cloudStatus)}</span><button class="btn sm" data-cloud-signout>Выйти</button></div>`:`<div class="role-switch">
        <label>Роль</label>
        <select id="roleSelect">
          <option>Администратор</option>
          <option>Руководитель</option>
          <option>Снабжение</option>
          <option>Бригадир</option>
          <option>Заказчик</option>
        </select>
      </div>`}
    </aside>
    <div class="main">
      <div class="topbar">
        <div class="menu-btn" data-open-sidebar>☰</div>
        <div>
          <h1>${pageTitle()}</h1>
          <div class="crumb">${pageCrumb()}</div>
        </div>
      </div>
      <div class="content" id="content"></div>
    </div>
  `;
  document.getElementById('content').innerHTML = `${cloudEnabled?'':localModeNotice()}${renderPage()}`;
  bindGlobalEvents();
  bindPageEvents();
}

function htmlEscape(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

function cloudGate(title,message,actions=''){
  return `<main class="cloud-entry"><section class="cloud-entry-card">
    <div class="brand-mark">СМ</div><h1>${htmlEscape(title)}</h1>
    <p>${htmlEscape(message)}</p>${cloudError?`<div class="cloud-error">${htmlEscape(cloudError)}</div>`:''}
    <div class="cloud-entry-actions">${actions}</div>
  </section></main>`;
}

function cloudLoginPage(){
  return `<main class="cloud-entry"><section class="cloud-entry-card">
    <div class="brand-mark">СМ</div><h1>Вход в СметаДверь</h1>
    <p>Войдите в общую базу компании. Учетные записи выдает администратор.</p>
    ${cloudError?`<div class="cloud-error">${htmlEscape(cloudError)}</div>`:''}
    <form id="cloudLoginForm">
      <div class="field"><label for="cloudEmail">Электронная почта</label><input id="cloudEmail" name="email" type="email" autocomplete="username" required></div>
      <div class="field"><label for="cloudPassword">Пароль</label><input id="cloudPassword" name="password" type="password" autocomplete="current-password" required></div>
      <div class="cloud-error" id="cloudLoginError" role="alert" hidden></div>
      <button class="btn primary" type="submit">Войти</button>
    </form>
    <div class="cloud-entry-foot">Связь с общей базой защищена учетной записью сотрудника.</div>
  </section></main>`;
}

function localModeNotice(){
  return `<div class="local-mode-banner"><strong>Локальный режим.</strong> Изменения видны только в этом браузере. Для общей работы подключите Supabase в <code>js/core/cloud-config.js</code>.</div>`;
}

function bindCloudAuthEvents(){
  const form=document.getElementById('cloudLoginForm');
  form?.addEventListener('submit',async e=>{
    e.preventDefault();
    const button=form.querySelector('[type="submit"]');
    const errorBox=document.getElementById('cloudLoginError');
    button.disabled=true;button.textContent='Вход…';
    errorBox.hidden=true;errorBox.textContent='';
    const values=Object.fromEntries(new FormData(form).entries());
    try{await cloudSignIn(values.email.trim(),values.password);}
    catch(error){errorBox.textContent=error.message||'Не удалось войти';errorBox.hidden=false;}
    finally{button.disabled=false;button.textContent='Войти';}
  });
  document.querySelectorAll('[data-cloud-signout]').forEach(button=>button.addEventListener('click',async()=>{
    button.disabled=true;
    try{await cloudSignOut();}
    catch(error){if(typeof toast==='function')toast(error.message||'Не удалось выйти');button.disabled=false;}
  }));
  document.querySelector('[data-cloud-retry]')?.addEventListener('click',()=>cloudUser&&loadCloudState(cloudUser));
}

function pageTitle(){
  if(route.page==='objects') return route.objId ? findObj(route.objId).name : 'Объекты';
  return nameOfPage(route.page);
}
function pageCrumb(){
  const d=new Date().toLocaleDateString('ru-RU',{day:'numeric',month:'long',weekday:'long'});
  return d.charAt(0).toUpperCase()+d.slice(1);
}

function goto(page, extra){
  route = {page, ...extra};
  sidebarOpen=false;
  render();
  window.scrollTo(0,0);
}

function bindGlobalEvents(){
  document.querySelectorAll('[data-nav]').forEach(el=>{
    el.addEventListener('click', ()=>goto(el.dataset.nav));
    el.addEventListener('keydown', e=>{if(e.key==='Enter')goto(el.dataset.nav);});
  });
  const openBtn=document.querySelector('[data-open-sidebar]');
  if(openBtn) openBtn.addEventListener('click', ()=>{sidebarOpen=true; render();});
  const backdrop=document.querySelector('[data-close-sidebar]');
  if(backdrop) backdrop.addEventListener('click', ()=>{sidebarOpen=false; render();});
  bindCloudAuthEvents();
}

function toast(msg){
  const wrap=document.getElementById('toastWrap');
  const el=document.createElement('div');
  el.className='toast';
  el.textContent=msg;
  wrap.appendChild(el);
  setTimeout(()=>el.remove(), 3200);
}

/* =========================================================================
   PAGE: DASHBOARD
   ========================================================================= */
function renderPage(){
  if(route.page==='dashboard') return pageDashboard();
  if(route.page==='objects') return pageObjects();
  if(route.page==='brigades') return pageBrigades();
  if(route.page==='supply') return pageSupply();
  if(route.page==='warehouse') return pageWarehouse();
  if(route.page==='purchases') return pagePurchases();
  if(route.page==='problems') return pageProblems();
  if(route.page==='reports') return pageReports();
  if(route.page==='admin') return pageAdmin();
  return '<div class="empty">Раздел не найден</div>';
}
