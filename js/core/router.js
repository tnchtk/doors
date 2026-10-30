let route = {page:'dashboard'}; // mutated by nav
let sidebarOpen=false;

function currentTheme(){
  return document.documentElement.dataset.theme==='dark'?'dark':'light';
}
function themeIcon(theme){
  return theme==='dark'
    ? '<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg>'
    : '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20.4 15.4A8.5 8.5 0 0 1 8.6 3.6 8.5 8.5 0 1 0 20.4 15.4Z"/></svg>';
}
function themeToggleMarkup(extraClass=''){
  const theme=currentTheme(),isDark=theme==='dark';
  const label=isDark?'Включить светлую тему':'Включить тёмную тему';
  return `<button class="theme-toggle ${extraClass}" type="button" data-theme-toggle aria-label="${label}" title="${label}" aria-pressed="${isDark}">${themeIcon(theme)}</button>`;
}
function bindThemeToggle(){
  document.querySelectorAll('[data-theme-toggle]').forEach(button=>button.addEventListener('click',()=>{
    const theme=currentTheme()==='dark'?'light':'dark';
    document.documentElement.dataset.theme=theme;
    try{localStorage.setItem('doors-theme',theme);}catch(_){}
    const label=theme==='dark'?'Включить светлую тему':'Включить тёмную тему';
    button.innerHTML=themeIcon(theme);
    button.setAttribute('aria-label',label);
    button.setAttribute('title',label);
    button.setAttribute('aria-pressed',String(theme==='dark'));
  }));
}

const NAV_ITEMS=[
  {id:'dashboard', label:'Дашборд', icon:'dashboard'},
  {id:'objects', label:'Объекты', icon:'objects'},
  {id:'object-management', label:'Управление объектами', icon:'objects'},
  {id:'brigades', label:'Бригады', icon:'brigades'},
  {id:'supply', label:'Снабжение', icon:'supply', badgeFn: s=>activeRequests(s).filter(r=>r.status==='new').length},
  {id:'warehouse', label:'Склад', icon:'warehouse'},
  {id:'purchases', label:'Закупки', icon:'purchases'},
  {id:'problems', label:'Проблемы', icon:'problems', badgeFn: s=>allDoors(s).filter(x=>x.door.status==='problem').length},
  {id:'reports', label:'Отчёты', icon:'reports'},
  {id:'admin', label:'Админ-панель', icon:'admin'},
];

function navItemsForUser(){
  if(!cloudEnabled)return NAV_ITEMS;
  const role=cloudProfile?.role;
  if(role==='admin')return NAV_ITEMS.filter(item=>item.id!=='object-management');
  if(role==='manager')return NAV_ITEMS.filter(item=>item.id!=='admin');
  if(role==='foreman')return NAV_ITEMS.filter(item=>['dashboard','objects','problems'].includes(item.id));
  return NAV_ITEMS.filter(item=>item.id==='dashboard');
}
function canOpenPage(page){return !cloudEnabled||navItemsForUser().some(item=>item.id===page);}
function nameOfPage(p){return (NAV_ITEMS.find(n=>n.id===p)||{}).label||'';}

function render(){
  const app=document.getElementById('app');
  if(cloudEnabled&&cloudRecoveryActive){
    app.innerHTML=cloudPasswordRecoveryPage();
    bindCloudAuthEvents();
    return;
  }
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
  if(!canOpenPage(route.page))route={page:navItemsForUser()[0]?.id||'dashboard'};
  const navItems=navItemsForUser();
  app.innerHTML = `
    ${sidebarOpen?'<div class="backdrop" data-close-sidebar></div>':''}
    <aside id="appSidebar" aria-label="Главная навигация" class="sidebar ${sidebarOpen?'open':''}">
      <div class="brand">
        <img class="brand-company-logo brand-logo-light" src="assets/isnur-logo.svg" alt="ИСНУР — инженерное строительство" width="490" height="108">
        <img class="brand-company-logo brand-logo-dark" src="assets/isnur-logo-dark.svg" alt="ИСНУР — инженерное строительство" width="490" height="108">
      </div>
      <nav class="nav">
        ${navItems.map(item=>{
          const badge = item.badgeFn ? item.badgeFn(state) : 0;
          return `<div class="nav-item ${route.page===item.id?'active':''}" data-nav="${item.id}" tabindex="0" role="button">
            ${ICONS[item.icon]}<span>${item.label}</span>
            ${badge>0?`<span class="badge">${badge}</span>`:''}
          </div>`;
          }).join('')}
      </nav>
      ${cloudEnabled?`<div class="account-box"><span class="account-email">${htmlEscape(cloudUser.email||'Сотрудник')}</span><span class="account-status">${htmlEscape(({admin:'Администратор',manager:'Менеджер',foreman:'Бригадир'}[cloudProfile?.role]||'Сотрудник')+' · '+cloudStatus)}</span><button class="btn sm" data-cloud-signout>Выйти</button></div>`:`<div class="role-switch">
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
        <button class="menu-btn" type="button" data-open-sidebar aria-label="Открыть меню" aria-controls="appSidebar"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button>
        <div class="topbar-title">
          <h1>${pageTitle()}</h1>
          <div class="crumb">${pageCrumb()}</div>
        </div>
        ${themeToggleMarkup()}
      </div>
      <div class="content" id="content"></div>
    </div>
  `;
  document.getElementById('content').innerHTML = `${cloudEnabled?'':localModeNotice()}${cloudEnabled&&cloudProfile?.role==='foreman'?'<div class="local-mode-banner"><strong>Режим бригадира.</strong> Здесь показаны только назначенные бригаде этажи. Вы можете отмечать установку дверей, прикладывать фото и отправлять проёмы менеджеру на проверку.</div>':''}${renderPage()}`;
  bindGlobalEvents();
  bindPageEvents();
}

function htmlEscape(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

function cloudBrandMarkup(){
  return `<div class="cloud-entry-brand"><img class="cloud-company-logo brand-logo-light" src="assets/isnur-logo.svg" alt="ИСНУР — инженерное строительство" width="490" height="108"><img class="cloud-company-logo brand-logo-dark" src="assets/isnur-logo-dark.svg" alt="ИСНУР — инженерное строительство" width="490" height="108"></div>`;
}

function cloudGate(title,message,actions=''){
  return `<main class="cloud-entry">${themeToggleMarkup('cloud-entry-theme')}<section class="cloud-entry-card">
    ${cloudBrandMarkup()}<h1>${htmlEscape(title)}</h1>
    <p>${htmlEscape(message)}</p>${cloudError?`<div class="cloud-error">${htmlEscape(cloudError)}</div>`:''}
    <div class="cloud-entry-actions">${actions}</div>
  </section></main>`;
}

function cloudLoginPage(){
  return `<main class="cloud-entry">${themeToggleMarkup('cloud-entry-theme')}<section class="cloud-entry-card">
    ${cloudBrandMarkup()}<h1>Вход в личный кабинет</h1>
    <p>Войдите в общую базу компании. Учетные записи выдает администратор.</p>
    ${cloudError?`<div class="cloud-error">${htmlEscape(cloudError)}</div>`:''}
    <form id="cloudLoginForm">
      <div class="field"><label for="cloudEmail">Электронная почта</label><input id="cloudEmail" name="email" type="email" autocomplete="username" required></div>
      <div class="field"><label for="cloudPassword">Пароль</label><input id="cloudPassword" name="password" type="password" autocomplete="current-password" required></div>
      <div class="cloud-error" id="cloudLoginError" role="alert" hidden></div>
      <div class="cloud-success" id="cloudLoginMessage" role="status" hidden></div>
      <button class="btn primary" type="submit">Войти</button>
      <button class="btn ghost auth-recovery-link" id="cloudForgotPassword" type="button">Забыли пароль?</button>
    </form>
    <div class="cloud-entry-foot">Связь с общей базой защищена учетной записью сотрудника.</div>
  </section></main>`;
}

function cloudPasswordRecoveryPage(){
  const isInvite=cloudPasswordSetupMode==='invite';
  const title=isInvite?'Создать пароль':'Новый пароль';
  const description=isInvite?'Придумайте пароль для входа. Он будет использоваться при следующих посещениях.':'Придумайте новый пароль для своей учетной записи.';
  const submitLabel=isInvite?'Создать пароль':'Сохранить новый пароль';
  return `<main class="cloud-entry">${themeToggleMarkup('cloud-entry-theme')}<section class="cloud-entry-card">
    ${cloudBrandMarkup()}<h1>${title}</h1>
    <p>${description}</p>
    <form id="cloudPasswordForm">
      <div class="field"><label for="cloudNewPassword">${isInvite?'Пароль для входа':'Новый пароль'}</label><input id="cloudNewPassword" name="password" type="password" autocomplete="new-password" minlength="8" required></div>
      <div class="field"><label for="cloudConfirmPassword">Повторите пароль</label><input id="cloudConfirmPassword" name="confirmPassword" type="password" autocomplete="new-password" minlength="8" required></div>
      <div class="cloud-error" id="cloudPasswordError" role="alert" hidden></div>
      <button class="btn primary" type="submit">${submitLabel}</button>
      <button class="btn ghost auth-recovery-link" type="button" data-cancel-password-recovery>Вернуться ко входу</button>
    </form>
    <div class="cloud-entry-foot">Пароль должен содержать не менее 8 символов.</div>
  </section></main>`;
}

function localModeNotice(){
  return `<div class="local-mode-banner"><strong>Локальный режим.</strong> Изменения видны только в этом браузере. Для общей работы подключите Supabase в <code>js/core/cloud-config.js</code>.</div>`;
}

function bindCloudAuthEvents(){
  bindThemeToggle();
  const form=document.getElementById('cloudLoginForm');
  const forgotButton=document.getElementById('cloudForgotPassword');
  forgotButton?.addEventListener('click',async()=>{
    const emailInput=document.getElementById('cloudEmail');
    const errorBox=document.getElementById('cloudLoginError');
    const messageBox=document.getElementById('cloudLoginMessage');
    const email=emailInput.value.trim();
    messageBox.hidden=true;messageBox.textContent='';errorBox.hidden=true;errorBox.textContent='';
    if(!email||!emailInput.checkValidity()){
      errorBox.textContent='Введите корректный адрес электронной почты.';errorBox.hidden=false;emailInput.focus();return;
    }
    forgotButton.disabled=true;forgotButton.textContent='Отправляем ссылку…';
    try{
      const redirectTo=cloudConfig.passwordRedirectUrl||`${window.location.origin}${window.location.pathname}`;
      const {error}=await withCloudTimeout(supabaseClient.auth.resetPasswordForEmail(email,{redirectTo}));
      if(error)throw error;
      messageBox.textContent='Если учетная запись с этим адресом существует, на почту придет ссылка для смены пароля.';
      messageBox.hidden=false;
    }catch(error){errorBox.textContent=error.message||'Не удалось отправить ссылку для сброса.';errorBox.hidden=false;}
    finally{forgotButton.disabled=false;forgotButton.textContent='Забыли пароль?';}
  });
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
  const passwordForm=document.getElementById('cloudPasswordForm');
  passwordForm?.addEventListener('submit',async e=>{
    e.preventDefault();
    const button=passwordForm.querySelector('[type="submit"]');
    const submitLabel=cloudPasswordSetupMode==='invite'?'Создать пароль':'Сохранить новый пароль';
    const errorBox=document.getElementById('cloudPasswordError');
    const values=Object.fromEntries(new FormData(passwordForm).entries());
    errorBox.hidden=true;errorBox.textContent='';
    if(String(values.password).length<8){errorBox.textContent='Пароль должен содержать не менее 8 символов.';errorBox.hidden=false;return;}
    if(values.password!==values.confirmPassword){errorBox.textContent='Пароли не совпадают.';errorBox.hidden=false;return;}
    if(!cloudUser){errorBox.textContent='Ссылка восстановления истекла. Запросите новую.';errorBox.hidden=false;return;}
    button.disabled=true;button.textContent='Сохраняем…';
    try{
      const {error}=await withCloudTimeout(supabaseClient.auth.updateUser({password:values.password}));
      if(error)throw error;
      const wasInvite=cloudPasswordSetupMode==='invite';
      cloudRecoveryActive=false;
      cloudPasswordSetupMode='recovery';
      await loadCloudState(cloudUser);
      render();
      if(typeof toast==='function')toast(wasInvite?'Пароль создан. Теперь можно войти.':'Пароль успешно обновлён.');
    }catch(error){errorBox.textContent=error.message||'Не удалось сохранить новый пароль.';errorBox.hidden=false;}
    finally{button.disabled=false;button.textContent=submitLabel;}
  });
  document.querySelector('[data-cancel-password-recovery]')?.addEventListener('click',async()=>{
    try{await cloudSignOut();}
    catch(error){if(typeof toast==='function')toast(error.message||'Не удалось вернуться ко входу.');}
  });
  document.querySelectorAll('[data-cloud-signout]').forEach(button=>button.addEventListener('click',async()=>{
    button.disabled=true;
    try{await cloudSignOut();}
    catch(error){if(typeof toast==='function')toast(error.message||'Не удалось выйти');button.disabled=false;}
  }));
  document.querySelector('[data-cloud-retry]')?.addEventListener('click',()=>cloudUser&&loadCloudState(cloudUser));
}

function pageTitle(){
  if(route.page==='objects'){const object=route.objId?findObj(route.objId):null;return object&&!object.archivedAt?object.name:'Объекты';}
  return nameOfPage(route.page);
}
function pageCrumb(){
  const d=new Date().toLocaleDateString('ru-RU',{day:'numeric',month:'long',weekday:'long'});
  return d.charAt(0).toUpperCase()+d.slice(1);
}

function goto(page, extra){
  if(!canOpenPage(page))return;
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
  if(route.page==='object-management') return pageObjectManagement();
  if(route.page==='brigades') return pageBrigades();
  if(route.page==='supply') return pageSupply();
  if(route.page==='warehouse') return pageWarehouse();
  if(route.page==='purchases') return pagePurchases();
  if(route.page==='problems') return pageProblems();
  if(route.page==='reports') return pageReports();
  if(route.page==='admin') return pageAdmin();
  return '<div class="empty">Раздел не найден</div>';
}
