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
  };
}
function emptyState(){
  return {brigades:[],objects:[],requests:[],purchases:[],movements:[],problemsResolved:{},activityLog:[]};
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
  return {
    ...blank,...source,
    brigades:Array.isArray(source.brigades)?source.brigades:[],
    objects:Array.isArray(source.objects)?source.objects:[],
    requests:Array.isArray(source.requests)?source.requests:[],
    purchases:Array.isArray(source.purchases)?source.purchases:[],
    movements:Array.isArray(source.movements)?source.movements:[],
    problemsResolved:source.problemsResolved&&typeof source.problemsResolved==='object'?source.problemsResolved:{},
    activityLog:Array.isArray(source.activityLog)?source.activityLog:[],
  };
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
      const {data:profile,error:profileError}=await withCloudTimeout(supabaseClient.from('profiles').select('id,full_name,email,role,is_active,brigade_id').eq('id',user.id).maybeSingle());
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
      cloudRecoveryActive=false;cloudPasswordSetupMode='recovery';stopCloudSubscription();cloudUser=null;state=null;cloudRevision=null;cloudProfile=null;cloudWriteBlocked=false;
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
  if(cloudWriteBlocked||!cloudUser||cloudRevision===null)return;
  cloudSavePending=true;
  try{
    const {data,error}=await supabaseClient.rpc('save_app_state',{
      p_expected_revision:cloudRevision,
      p_state:snapshot,
    });
    if(error)throw error;
    cloudRevision=Number(data);
    cloudStatus='Общая база подключена';
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
    if(typeof toast==='function')toast('В этом шаге бригадиру доступен просмотр назначенных этажей.');
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

if(cloudEnabled){
  state=null;
  dbReady=initializeCloud().catch(error=>{
    cloudError=error.message||'Ошибка подключения';cloudStatus='Ошибка подключения';cloudInitialized=true;
    if(typeof render==='function')render();
    return null;
  });
}else{
  state=loadLegacyState()||freshState();
  dbReady=openDatabase().then(async db=>{
    if(!db)return null;
    const stored=await readDatabase(db);
    if(stored)state=stored;
    else{
      const legacy=loadLegacyState();
      if(legacy)state=legacy;
      const tx=db.transaction('appState','readwrite');
      tx.objectStore('appState').put({id:'main',data:state,updatedAt:new Date().toISOString()});
    }
    if(typeof render==='function')render();
    return db;
  }).catch(e=>{console.warn('IndexedDB unavailable; using local storage',e);return null;});
  if(!loadLegacyState())saveState();
}

/* =========================================================================
   ROUTER + APP SHELL
   ========================================================================= */
