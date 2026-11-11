const STORAGE_KEY='doorscrm_v1';
const DB_NAME='doorscrm';
const DB_VERSION=1;
let state=null;
let dbReady=Promise.resolve(null);
const cloudConfig=window.DOORS_CLOUD_CONFIG||{};
const cloudEnabled=cloudConfig.enabled!==false&&Boolean(cloudConfig.supabaseUrl&&cloudConfig.publishableKey);
let supabaseClient=null;
let cloudUser=null;
let cloudRecoveryActive=false;
let cloudPasswordSetupMode='recovery';
let cloudProfile=null;
function canManageWorkspace(){return !cloudEnabled||['admin','manager'].includes(cloudProfile?.role);}
function isAdminWorkspaceUser(){return !cloudEnabled||cloudProfile?.role==='admin';}
let cloudRevision=null;
let cloudInitialized=!cloudEnabled;
let cloudStatus=cloudEnabled?'Подключение к общей базе…':'Локальный режим';
let cloudError='';
let cloudChannel=null;
let cloudSaveQueue=Promise.resolve();
let cloudSavePending=false;
let cloudPendingRemoteRevision=0;
let cloudWriteBlocked=false;
let cloudLoadingUserId=null;
let cloudLoadPromise=null;
let brigadeFinanceEntries=[];
let foremanFinanceSummary=null;
let brigadeFinanceError='';
const CLOUD_REQUEST_TIMEOUT_MS=15000;

function cloudAuthLinkType(){
  const hash=window.location.hash.startsWith('#')?window.location.hash.slice(1):window.location.hash;
  const params=new URLSearchParams(`${window.location.search.slice(1)}&${hash}`);
  return params.get('type')||'';
}

function beginCloudPasswordSetup(user,mode){
  if(cloudRecoveryActive&&cloudPasswordSetupMode===mode&&cloudUser?.id===user.id)return;
  cloudRecoveryActive=true;
  cloudPasswordSetupMode=mode;
  cloudUser=user;
  state=null;
  cloudError='';
  cloudStatus=mode==='invite'?'Создание пароля':'Восстановление пароля';
  cloudInitialized=true;
  if(typeof render==='function')render();
}

function withCloudTimeout(promise){
  let timer;
  const timeout=new Promise((_,reject)=>{
    timer=setTimeout(()=>reject(new Error('Supabase не ответил за 15 секунд. Проверьте интернет и состояние проекта, затем повторите попытку.')),CLOUD_REQUEST_TIMEOUT_MS);
  });
  return Promise.race([Promise.resolve(promise),timeout]).finally(()=>clearTimeout(timer));
}

function freshState(){
  const brigades=buildBrigades();
  const objects=buildObjects(brigades);
  return {
    brigades, objects,
    requests:[
      {id:'req1', objId:'o0', blockName:'Блок 3', floor:7, apt:74, items:[{matId:'korob',qty:2},{matId:'dobor',qty:4},{matId:'ruchka',qty:2},{matId:'petli',qty:4}], comment:'Не хватает комплекта на две двери', status:'new', brigadeId:'br5', date:daysAgo(0)},
      {id:'req2', objId:'o0', blockName:'Блок 1', floor:3, apt:31, items:[{matId:'zamok',qty:3}], comment:'Замки не подошли, нужна замена', status:'in_progress', brigadeId:'br1', date:daysAgo(1)},
      {id:'req3', objId:'o1', blockName:'Блок 2', floor:5, apt:52, items:[{matId:'nalich',qty:6},{matId:'pena',qty:2}], comment:'', status:'collected', brigadeId:'br7', date:daysAgo(2)},
      {id:'req4', objId:'o2', blockName:'Блок 4', floor:2, apt:24, items:[{matId:'dobor',qty:8},{matId:'porog',qty:4}], comment:'Срочно, бригада простаивает', status:'delivered', brigadeId:'br11', date:daysAgo(3)},
      {id:'req5', objId:'o1', blockName:'Блок 1', floor:6, apt:64, items:[{matId:'ruchka',qty:4},{matId:'planka',qty:4}], comment:'', status:'received', brigadeId:'br6', date:daysAgo(5)},
    ],
    purchases:[
      {id:'p1', matId:'dobor', qty:300, supplier:'СтройДвери КГ', price:180, status:'ordered', date:daysAgo(2)},
      {id:'p2', matId:'korob', qty:60, supplier:'ДверьПром', price:1450, status:'transit', date:daysAgo(4)},
      {id:'p3', matId:'pena', qty:120, supplier:'ХимСтрой', price:210, status:'received', date:daysAgo(7)},
    ],
    movements:[
      {id:'m1', type:'in', matId:'korob', qty:500, note:'Поставщик ДверьПром, накладная №884', date:daysAgo(9)},
      {id:'m2', type:'out', matId:'korob', qty:100, note:'Блок 1, ЖК Ала-Тоо', date:daysAgo(8)},
      {id:'m3', type:'move', matId:'dobor', qty:150, note:'Блок 1 → Блок 2, ЖК Восток', date:daysAgo(6)},
      {id:'m4', type:'out', matId:'ruchka', qty:220, note:'ЖК Южный, снабжение бригад', date:daysAgo(3)},
      {id:'m5', type:'in', matId:'pena', qty:120, note:'ХимСтрой, накладная №221', date:daysAgo(1)},
    ],
    problemsResolved:{}, // id -> true
    activityLog:[],
    financeEntries:[],
  };
}
function emptyState(){
  return {brigades:[],objects:[],requests:[],purchases:[],movements:[],problemsResolved:{},activityLog:[],financeEntries:[]};
}
function daysAgo(n){const d=new Date();d.setDate(d.getDate()-n);return d.toISOString().slice(0,10);}

function loadLegacyState(){
  try{
    const raw=localStorage.getItem(STORAGE_KEY);
    if(raw) return JSON.parse(raw);
  }catch(e){ console.warn('storage read failed', e); }
  return null;
}
function openDatabase(){
  if(!('indexedDB' in window)) return Promise.resolve(null);
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,DB_VERSION);
    request.onupgradeneeded=()=>request.result.createObjectStore('appState',{keyPath:'id'});
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
}
function readDatabase(db){
  return new Promise((resolve,reject)=>{
    const req=db.transaction('appState','readonly').objectStore('appState').get('main');
    req.onsuccess=()=>resolve(req.result?.data||null);
    req.onerror=()=>reject(req.error);
  });
}

function normalizeCloudState(value){
  const blank=emptyState();
  const source=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  return normalizeOpeningState({
    ...blank,...source,
    brigades:Array.isArray(source.brigades)?source.brigades:[],
    objects:Array.isArray(source.objects)?source.objects:[],
    requests:Array.isArray(source.requests)?source.requests:[],
    purchases:Array.isArray(source.purchases)?source.purchases:[],
    movements:Array.isArray(source.movements)?source.movements:[],
    problemsResolved:source.problemsResolved&&typeof source.problemsResolved==='object'?source.problemsResolved:{},
    activityLog:Array.isArray(source.activityLog)?source.activityLog:[],
    financeEntries:Array.isArray(source.financeEntries)?source.financeEntries:[],
  });
}

async function refreshBrigadeFinance(){
  brigadeFinanceError='';
  if(!cloudEnabled){
    brigadeFinanceEntries=Array.isArray(state?.financeEntries)?state.financeEntries:[];
    foremanFinanceSummary=null;
    return;
  }
  if(!supabaseClient||!cloudProfile)return;
  try{
    if(cloudProfile.role==='foreman'){
      const {data,error}=await withCloudTimeout(supabaseClient.rpc('get_foreman_finance_summary'));
      if(error)throw error;
      foremanFinanceSummary=data||null;
      brigadeFinanceEntries=[];
    }else{
      const {data,error}=await withCloudTimeout(supabaseClient.from('brigade_financial_entries').select('id,brigade_id,entry_type,amount,occurred_on,floor_id,opening_id,rate_per_opening,door_count,note,created_at,created_by').order('occurred_on',{ascending:false}).order('created_at',{ascending:false}));
      if(error)throw error;
      brigadeFinanceEntries=data||[];
      foremanFinanceSummary=null;
    }
  }catch(error){
    brigadeFinanceError=error.message||'Не удалось загрузить финансовый учёт';
    brigadeFinanceEntries=[];
    foremanFinanceSummary=null;
  }
}

function stopCloudSubscription(){
  if(cloudChannel&&supabaseClient){supabaseClient.removeChannel(cloudChannel);cloudChannel=null;}
}

async function readCloudState(){
  if(cloudProfile?.role==='foreman'){
    const {data,error}=await withCloudTimeout(supabaseClient.rpc('get_foreman_app_state'));
    if(error) throw error;
    if(!data?.state) throw new Error('Не удалось загрузить назначенные этажи. Проверьте SQL-миграцию ролей.');
    state=normalizeCloudState(data.state);
    cloudRevision=Number(data.revision);
  }else{
    const {data,error}=await withCloudTimeout(supabaseClient.from('app_state').select('state,revision').eq('id',1).maybeSingle());
    if(error) throw error;
    if(!data) throw new Error('Не найдена таблица общей базы. Выполните SQL-схему в Supabase.');
    state=normalizeCloudState(data.state);
    cloudRevision=Number(data.revision);
  }
  await refreshBrigadeFinance();
  cloudStatus='Общая база подключена';
  cloudError='';
}

function subscribeToCloudState(){
  stopCloudSubscription();
  if(cloudProfile?.role==='foreman') return;
  cloudChannel=supabaseClient.channel('doors-shared-state')
    .on('postgres_changes',{event:'UPDATE',schema:'public',table:'app_state',filter:'id=eq.1'},payload=>{
      const incomingRevision=Number(payload.new?.revision||0);
      if(incomingRevision<=cloudRevision)return;
      if(cloudSavePending){cloudPendingRemoteRevision=Math.max(cloudPendingRemoteRevision,incomingRevision);return;}
      state=normalizeCloudState(payload.new.state);
      cloudRevision=incomingRevision;
      cloudStatus='Общая база подключена';
      if(typeof render==='function')render();
    })
    .on('postgres_changes',{event:'*',schema:'public',table:'brigade_financial_entries'},()=>{
      refreshBrigadeFinance().then(()=>{if(typeof render==='function')render();});
    })
    .subscribe(status=>{
      if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'){
        cloudStatus='Общая база подключена · синхронизация прервана';
        if(typeof render==='function')render();
      }
    });
}

async function loadCloudState(user){
  if(cloudLoadingUserId===user.id&&cloudLoadPromise)return cloudLoadPromise;
  cloudUser=user;
  cloudLoadingUserId=user.id;
  cloudLoadPromise=(async()=>{
    state=null;cloudError='';cloudStatus='Загрузка общей базы…';
    try{
      const {data:profile,error:profileError}=await withCloudTimeout(supabaseClient.from('profiles').select('id,full_name,email,role,is_active,brigade_ids').eq('id',user.id).maybeSingle());
      if(profileError)throw profileError;
      if(!profile||!profile.is_active)throw new Error('Учетная запись не активирована. Попросите администратора проверить доступ.');
      cloudProfile=profile;
      await readCloudState();
      cloudUser=user;
      cloudWriteBlocked=false;
      cloudPendingRemoteRevision=0;
      subscribeToCloudState();
    }catch(error){
      state=null;cloudError=error.message||'Не удалось открыть общую базу';cloudStatus='Нет доступа к общей базе';
      stopCloudSubscription();
    }finally{
      cloudInitialized=true;cloudLoadingUserId=null;cloudLoadPromise=null;
      if(typeof render==='function')render();
    }
  })();
  return cloudLoadPromise;
}

async function initializeCloud(){
  if(!window.supabase?.createClient){
    cloudError='Не загрузилась библиотека Supabase. Проверьте подключение к интернету.';
    cloudInitialized=true;cloudStatus='Ошибка подключения';
    if(typeof render==='function')render();
    return null;
  }
  supabaseClient=window.supabase.createClient(cloudConfig.supabaseUrl,cloudConfig.publishableKey);
  supabaseClient.auth.onAuthStateChange((event,session)=>{
    if(event==='SIGNED_OUT'){
      cloudRecoveryActive=false;cloudPasswordSetupMode='recovery';stopCloudSubscription();cloudUser=null;state=null;cloudRevision=null;cloudProfile=null;cloudWriteBlocked=false;brigadeFinanceEntries=[];foremanFinanceSummary=null;brigadeFinanceError='';
      cloudStatus='Вход не выполнен';cloudError='';cloudInitialized=true;
      if(typeof render==='function')render();
    }else if(event==='PASSWORD_RECOVERY'&&session?.user){
      beginCloudPasswordSetup(session.user,'recovery');
    }else if(event==='SIGNED_IN'&&session?.user){
      if(cloudAuthLinkType()==='invite'){
        beginCloudPasswordSetup(session.user,'invite');
      }else{
        setTimeout(()=>{if(!cloudRecoveryActive&&cloudUser?.id!==session.user.id)loadCloudState(session.user);},0);
      }
    }
  });
  const {data,error}=await withCloudTimeout(supabaseClient.auth.getSession());
  if(error){
    cloudError=error.message;cloudStatus='Ошибка входа';cloudInitialized=true;
    if(typeof render==='function')render();
    return null;
  }
  if(data.session?.user){
    if(cloudAuthLinkType()==='invite')beginCloudPasswordSetup(data.session.user,'invite');
    else await loadCloudState(data.session.user);
  }else{
    cloudStatus='Вход не выполнен';cloudInitialized=true;
    if(typeof render==='function')render();
  }
  return null;
}

async function cloudSignIn(email,password){
  if(!supabaseClient)throw new Error('Сначала настройте подключение к облачной базе.');
  const {data,error}=await withCloudTimeout(supabaseClient.auth.signInWithPassword({email,password}));
  if(error)throw error;
  await loadCloudState(data.user);
}

async function cloudSignOut(){
  if(!supabaseClient)return;
  const {error}=await supabaseClient.auth.signOut();
  if(error)throw error;
}

async function persistCloudSnapshot(snapshot){
  if(!cloudUser||cloudRevision===null)return;
  // Каждая попытка сохранения проверяется по ревизии на сервере, поэтому прошлая ошибка не должна навсегда блокировать запись.
  cloudWriteBlocked=false;
  cloudSavePending=true;
  try{
    const {data,error}=await supabaseClient.rpc('save_app_state',{
      p_expected_revision:cloudRevision,
      p_state:snapshot,
    });
    if(error)throw error;
    cloudRevision=Number(data);
    cloudStatus='Общая база подключена';cloudError='';cloudWriteBlocked=false;
    if(cloudPendingRemoteRevision>cloudRevision){
      await readCloudState();
      if(typeof render==='function')render();
    }
    cloudPendingRemoteRevision=0;
  }catch(error){
    cloudWriteBlocked=true;
    if(error.code==='40001'||String(error.message||'').includes('WORKSPACE_CONFLICT')){
      try{await readCloudState();}catch(readError){cloudError=readError.message||'Не удалось обновить общие данные';}
      cloudStatus='Данные обновлены с сервера';
      if(typeof toast==='function')toast('Другой сотрудник успел изменить данные. Ваше изменение не сохранено — повторите его.');
    }else{
      cloudError=error.message||'Ошибка сохранения';
      cloudStatus='Не удалось сохранить в общей базе';
      if(typeof toast==='function')toast('Изменение не сохранено в общей базе. Проверьте интернет и обновите страницу.');
    }
    if(typeof render==='function')render();
  }finally{
    cloudSavePending=false;
  }
}

function saveState(){
  if(!state)return;
  if(cloudEnabled&&cloudProfile?.role==='foreman'){
    cloudStatus='Режим просмотра';
    if(typeof toast==='function')toast('Эта правка недоступна бригадиру. Отмечайте двери, добавляйте фото и отправляйте проём на проверку в карточке проёма.');
    readCloudState().then(()=>{if(typeof render==='function')render();}).catch(error=>{
      cloudError=error.message||'Не удалось обновить назначенные этажи';
      if(typeof render==='function')render();
    });
    return Promise.resolve(false);
  }
  const snapshot=JSON.parse(JSON.stringify(state));
  if(cloudEnabled){
    cloudSaveQueue=cloudSaveQueue.then(()=>persistCloudSnapshot(snapshot));
    return cloudSaveQueue;
  }
  dbReady.then(db=>{
    if(!db){localStorage.setItem(STORAGE_KEY,JSON.stringify(snapshot));return;}
    const tx=db.transaction('appState','readwrite');
    tx.objectStore('appState').put({id:'main',data:snapshot,updatedAt:new Date().toISOString()});
  }).catch(e=>console.warn('database write failed',e));
}

async function saveForemanOpeningWork(context,opening,submit=false,reportIssue=false){
  if(!cloudEnabled||cloudProfile?.role!=='foreman'){await saveState();return true;}
  if(!supabaseClient||cloudRevision===null)throw new Error('Общая база ещё загружается. Повторите попытку.');
  const {data,error}=await withCloudTimeout(supabaseClient.rpc('save_foreman_opening_work',{
    p_expected_revision:cloudRevision,
    p_object_id:context.obj.id,
    p_block_id:context.block.id,
    p_floor_id:context.floor.id,
    p_apartment_id:context.apt.id,
    p_opening_id:opening.id,
    p_door_updates:opening.doors.map(door=>({id:door.id,status:door.status,photos:door.photos||[]})),
    p_foreman_note:opening.foremanNote||'',
    p_submit:submit,
    p_report_issue:reportIssue,
  }));
  if(error){
    await readCloudState();
    if(typeof render==='function')render();
    if(String(error.message||'').includes('save_foreman_opening_work'))throw new Error('Для записи бригадирских отметок выполните js/data/data-base-photos.sql в Supabase.');
    throw error;
  }
  cloudRevision=Number(data);
  cloudStatus='Общая база подключена';cloudError='';
  return true;
}

async function callFloorRpc(name,ids,extra){
  if(!supabaseClient||cloudRevision===null)throw new Error('Общая база ещё загружается. Повторите попытку.');
  const {data,error}=await withCloudTimeout(supabaseClient.rpc(name,{
    p_expected_revision:cloudRevision,
    p_object_id:ids.objId,
    p_block_id:ids.blockId,
    p_floor_id:ids.floorId,
    ...extra,
  }));
  if(error){
    const message=String(error.message||'');
    if(message.includes('TARIFF_REQUIRED'))throw new Error('Сначала задайте тариф за проём для этого этажа.');
    if(error.code==='40001'||message.includes('WORKSPACE_CONFLICT')){
      await readCloudState();
      throw new Error('Данные обновились. Проверьте этаж и повторите действие.');
    }
    if(message.includes(name)&&(message.includes('schema cache')||message.includes('does not exist')||message.includes('Could not find')))throw new Error('Для этого действия выполните новые SQL-файлы из папки js/data в Supabase (data-base-floor-status.sql и data-base-material-requests.sql).');
    throw error;
  }
  cloudRevision=Number(data);
  cloudStatus='Общая база подключена';cloudError='';
  await readCloudState();
  return true;
}

async function acceptOpeningWithAccrual(context){
  if(!cloudEnabled){
    if(!context.floor.brigadeId)throw new Error('Сначала назначьте бригаду на этот этаж.');
    const rate=Number(context.floor.ratePerOpening);
    if(!Number.isFinite(rate)||rate<=0)throw new Error('Сначала задайте тариф за проём для этого этажа.');
    const doorCount=(context.opening.doors||[]).length;
    const amount=rate+(doorCount===2?500:0);
    const acceptedAt=new Date().toISOString();
    context.opening.reviewStatus='accepted';
    context.opening.acceptedAt=acceptedAt;
    context.opening.doors.forEach(door=>{door.status='accepted';door.installedAt=door.installedAt||acceptedAt;});
    state.financeEntries=Array.isArray(state.financeEntries)?state.financeEntries:[];
    const localId=window.crypto.randomUUID();
    state.financeEntries.unshift({
      id:`accrual-${localId}`,
      brigade_id:context.floor.brigadeId,
      entry_type:'accrual',
      amount,
      occurred_on:new Date().toISOString().slice(0,10),
      floor_id:context.floor.id,
      opening_id:context.opening.id,
      rate_per_opening:rate,
      door_count:doorCount,
      note:context.opening.title||'Принятый проём',
      created_at:new Date().toISOString(),
    });
    await saveState();
    refreshBrigadeFinance();
    return true;
  }
  if(!supabaseClient||cloudRevision===null)throw new Error('Общая база ещё загружается. Повторите попытку.');
  const {data,error}=await withCloudTimeout(supabaseClient.rpc('accept_opening_with_accrual',{
    p_expected_revision:cloudRevision,
    p_object_id:context.obj.id,
    p_block_id:context.block.id,
    p_floor_id:context.floor.id,
    p_apartment_id:context.apt.id,
    p_opening_id:context.opening.id,
  }));
  if(error){
    if(String(error.message||'').includes('accept_opening_with_accrual'))throw new Error('Сначала выполните js/data/data-base-finance.sql в Supabase.');
    if(String(error.message||'').includes('TARIFF_REQUIRED'))throw new Error('Сначала задайте тариф за проём для этого этажа.');
    if(error.code==='40001'||String(error.message||'').includes('WORKSPACE_CONFLICT')){
      await readCloudState();
      if(typeof render==='function')render();
      throw new Error('Данные обновились. Проверьте проём и примите его ещё раз.');
    }
    throw error;
  }
  cloudRevision=Number(data);
  cloudStatus='Общая база подключена';cloudError='';cloudWriteBlocked=false;
  await readCloudState();
  return true;
}

// Бригадир не получает живых обновлений, поэтому перечитываем данные, когда он возвращается на вкладку.
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState!=='visible'||!cloudEnabled||cloudProfile?.role!=='foreman'||cloudSavePending||!supabaseClient)return;
  readCloudState().then(()=>{if(typeof render==='function')render();}).catch(()=>{});
});

if(cloudEnabled){
  state=null;
  dbReady=initializeCloud().catch(error=>{
    cloudError=error.message||'Ошибка подключения';cloudStatus='Ошибка подключения';cloudInitialized=true;
    if(typeof render==='function')render();
    return null;
  });
}else{
  state=normalizeOpeningState(loadLegacyState()||freshState());
  dbReady=openDatabase().then(async db=>{
    if(!db)return null;
    const stored=await readDatabase(db);
    if(stored)state=normalizeOpeningState(stored);
    else{
      const legacy=loadLegacyState();
      if(legacy)state=normalizeOpeningState(legacy);
      const tx=db.transaction('appState','readwrite');
      tx.objectStore('appState').put({id:'main',data:state,updatedAt:new Date().toISOString()});
    }
    if(typeof render==='function')render();
    return db;
  }).catch(e=>{console.warn('IndexedDB unavailable; using local storage',e);return null;});
  if(!loadLegacyState())saveState();
}

