// Загружает браузерные скрипты проекта в изолированный контекст, чтобы тестировать чистую логику без браузера.
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const FILES=[
  'js/core/constants.js',
  'js/data/opening-model.js',
  'js/data/demo-data.js',
  'js/features/objects.js',
  'js/features/warehouse.js',
  'js/features/supply.js',
  'js/features/purchases.js',
  'js/features/openings-ui.js',
  'js/features/avr-acts.js',
  'js/features/purchase-orders.js',
  'js/features/supply-requests.js',
];

function loadApp(){
  const toasts=[];
  const context={
    console,
    window:{crypto:{randomUUID:()=>'00000000-0000-4000-8000-'+String(Math.random()).slice(2,14).padEnd(12,'0')}},
    document:{addEventListener(){},getElementById(){return null;},querySelectorAll(){return [];}},
    location:{href:'http://localhost/'},
    setTimeout,clearTimeout,Intl,Date,Math,JSON,
    toast:message=>toasts.push(message),
    render(){},
    goto(){},
    confirm:()=>true,
    // Заглушки того, что в браузере даёт остальной код.
    registerPageBinder(){},
    NAV_ITEMS:[{id:'problems'}],
    cloudEnabled:false,
    isForemanWorkspaceUser:()=>false,
    canManageWorkspace:()=>true,
    saveState:async()=>{},
    newRecordId:prefix=>`${prefix}${Math.random().toString(36).slice(2,12)}`,
    htmlEscape:value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  };
  context.window.window=context.window;
  vm.createContext(context);
  vm.runInContext('let state=null;',context);
  for(const file of FILES){
    vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});
  }
  return {
    toasts,
    run:code=>vm.runInContext(code,context),
    set(name,value){context.__tmp=value;vm.runInContext(`${name}=__tmp;`,context);},
  };
}

module.exports={loadApp};
