const ICONS = {
  dashboard:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
  objects:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 21V7l8-4 8 4v14"/><path d="M9 21v-6h6v6"/><path d="M9 11h.01M15 11h.01M9 15h.01M15 15h.01"/></svg>',
  brigades:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="8" cy="8" r="3"/><circle cx="17" cy="9" r="2.6"/><path d="M2.5 20c0-3.3 2.6-6 5.5-6s5.5 2.7 5.5 6"/><path d="M14.5 20c0-2.6 1.9-4.7 4-4.7s4 2.1 4 4.7"/></svg>',
  supply:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/></svg>',
  warehouse:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 9.5 12 4l9 5.5V20H3z"/><path d="M9 20v-7h6v7"/></svg>',
  purchases:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2.5 3h2.6l2.7 12.6h10.4l2.3-8.6H6.5"/></svg>',
  problems:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10.3 3.6 2.6 17a1.8 1.8 0 0 0 1.6 2.7h15.6a1.8 1.8 0 0 0 1.6-2.7L13.7 3.6a1.8 1.8 0 0 0-3.4 0z"/><path d="M12 9.5v4"/><path d="M12 16.8h.01"/></svg>',
  reports:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20V10M11 20V4M18 20v-7"/></svg>',
  admin:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19 13a7 7 0 0 0 0-2l2-1.5-2-3.5-2.4 1a7 7 0 0 0-1.7-1L14.5 3h-4l-.4 3a7 7 0 0 0-1.7 1L6 6 4 9.5 6 11a7 7 0 0 0 0 2l-2 1.5L6 18l2.4-1a7 7 0 0 0 1.7 1l.4 3h4l.4-3a7 7 0 0 0 1.7-1l2.4 1 2-3.5z"/></svg>',
  money:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="3"/></svg>',
};

// ---- seeded RNG ----
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const rng = mulberry32(20260926);
function pick(arr){return arr[Math.floor(rng()*arr.length)];}
function randInt(a,b){return a+Math.floor(rng()*(b-a+1));}

const STATUS = {
  not_started:   {label:'Не начато',        cls:'neutral'},
  materials_ready:{label:'Материалы готовы', cls:'info'},
  in_progress:   {label:'В работе',         cls:'warn'},
  installed:     {label:'Установлено',      cls:'ok'},
  accepted:      {label:'Принято',          cls:'ok'},
  problem:       {label:'Проблема',         cls:'bad'},
};
const STATUS_ORDER = ['not_started','materials_ready','in_progress','installed','accepted','problem'];

const PROBLEM_TYPES = ['Нет полотна','Нет короба','Неправильный размер','Повреждена дверь','Поврежден короб','Нет фурнитуры','Проблема с проемом','Клиент не допускает','Требуется переделка'];

const MATERIALS = [
  {id:'polotno', name:'Дверное полотно', unit:'шт', perDoor:1},
  {id:'korob',   name:'Короб',           unit:'шт', perDoor:1},
  {id:'dobor',   name:'Добор',           unit:'шт', perDoor:2.5},
  {id:'nalich',  name:'Наличник',        unit:'шт', perDoor:5},
  {id:'petli',   name:'Петли',           unit:'шт', perDoor:2},
  {id:'zamok',   name:'Замок',           unit:'шт', perDoor:1},
  {id:'ruchka',  name:'Ручка',           unit:'шт', perDoor:1},
  {id:'planka',  name:'Ответная планка', unit:'шт', perDoor:1},
  {id:'porog',   name:'Порог',           unit:'шт', perDoor:1},
  {id:'krepezh', name:'Крепёж',          unit:'компл', perDoor:1},
  {id:'pena',    name:'Монтажная пена',  unit:'балл', perDoor:1},
  {id:'shpingalet',name:'Шпингалет',     unit:'шт', perDoor:0},
];
const MAT_BY_ID = Object.fromEntries(MATERIALS.map(m=>[m.id,m]));

const LEADER_NAMES = ['Азамат Токтогулов','Бакыт Сыдыков','Марат Джумабеков','Эркин Абдыраев','Тимур Осмонов','Нурлан Кадыров','Бекзат Айтматов','Руслан Малабеков','Данияр Уметов','Женишбек Орозов','Кубанычбек Асанов','Айбек Турсунов'];

// ---- build brigades ----
