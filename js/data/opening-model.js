const OPENING_TYPE_LABELS={
  large:'Большой проём',
  kitchen:'Кухонный проём',
  toilet:'Проём туалета',
  custom:'Нестандартный проём',
  legacy:'Старая запись двери',
};

function openingId(prefix='op'){
  const id=window.crypto?.randomUUID?.().replaceAll('-','')||`${Date.now().toString(36)}${Math.random().toString(36).slice(2,10)}`;
  return `${prefix}${id}`;
}

function makeDoorLeaf(n,glass=false,existing={}){
  return {
    ...existing,
    id:existing.id||openingId('d'),
    n:Number(existing.n)||n,
    glass:existing.glass??glass,
    status:STATUS[existing.status]?existing.status:'not_started',
    photos:Array.isArray(existing.photos)?existing.photos:[],
    problem:existing.problem||null,
  };
}

function makeOpening(type,n=1){
  const doorCount=type==='large'?2:1;
  const glass=type==='large'||type==='kitchen';
  return {
    id:openingId(),
    type:OPENING_TYPE_LABELS[type]?type:'custom',
    n,
    title:`${OPENING_TYPE_LABELS[type]||OPENING_TYPE_LABELS.custom} ${n}`,
    doors:Array.from({length:doorCount},(_,i)=>makeDoorLeaf(i+1,glass)),
    reviewStatus:'not_submitted',
    foremanNote:'',
    managerNote:'',
    submittedAt:null,
    acceptedAt:null,
  };
}

function apartmentFromTemplate(num,largeCount,toiletCount){
  const openings=[];
  for(let i=1;i<=largeCount;i++)openings.push(makeOpening('large',i));
  openings.push(makeOpening('kitchen',1));
  for(let i=1;i<=toiletCount;i++)openings.push(makeOpening('toilet',i));
  return {id:openingId('apt'),num,openings};
}

function normalizeOpeningState(value){
  const source=value&&typeof value==='object'?value:{};
  (source.objects||[]).forEach(object=>(object.blocks||[]).forEach(block=>(block.floors||[]).forEach(floor=>(floor.apartments||[]).forEach(apartment=>{
    if(!Array.isArray(apartment.openings)){
      const oldDoors=Array.isArray(apartment.doors)?apartment.doors:[];
      apartment.openings=oldDoors.map((door,index)=>({
        id:`legacy-${door.id||`${apartment.id||'apt'}-${index+1}`}`,type:'legacy',n:index+1,title:`Старая дверь №${door.n||index+1}`,
        doors:[makeDoorLeaf(index+1,false,door)],reviewStatus:door.status==='accepted'?'accepted':'not_submitted',
        foremanNote:'',managerNote:'',submittedAt:null,acceptedAt:null,
      }));
      delete apartment.doors;
    }else apartment.openings=apartment.openings.map((opening,index)=>{
      opening.type=OPENING_TYPE_LABELS[opening.type]?opening.type:'legacy';
      opening.n=Number(opening.n)||index+1;
      opening.title=opening.title||`${OPENING_TYPE_LABELS[opening.type]} ${opening.n}`;
      opening.doors=(Array.isArray(opening.doors)?opening.doors:[]).map((door,doorIndex)=>makeDoorLeaf(doorIndex+1,opening.type==='large'||opening.type==='kitchen',door));
      opening.reviewStatus=['not_submitted','issue_reported','pending','accepted','changes_requested'].includes(opening.reviewStatus)?opening.reviewStatus:(opening.doors.length&&opening.doors.every(door=>door.status==='accepted')?'accepted':'not_submitted');
      opening.foremanNote=String(opening.foremanNote||'');
      opening.managerNote=String(opening.managerNote||'');
      opening.submittedAt=opening.submittedAt||null;
      opening.acceptedAt=opening.acceptedAt||null;
      return opening;
    });
  }))));
  return source;
}

function apartmentDoors(apartment){
  return (apartment?.openings||[]).flatMap(opening=>(opening.doors||[]).map(door=>({door,opening})));
}

function activeObjects(source){return (source?.objects||[]).filter(object=>!object.archivedAt);}
function activeRequests(source){
  const objects=new Map((source?.objects||[]).map(object=>[object.id,object]));
  return (source?.requests||[]).filter(request=>{const object=objects.get(request.objId);return object&&!object.archivedAt;});
}
function allOpenings(source){
  const out=[];
  activeObjects(source).forEach(obj=>(obj.blocks||[]).forEach(block=>(block.floors||[]).forEach(floor=>(floor.apartments||[]).forEach(apt=>(apt.openings||[]).forEach(opening=>out.push({opening,apt,floor,block,obj}))))));
  return out;
}

function allDoors(source){
  const out=[];
  allOpenings(source).forEach(context=>(context.opening.doors||[]).forEach(door=>out.push({...context,door})));
  return out;
}

function openingsForObject(source,objectId){return allOpenings(source).filter(item=>item.obj.id===objectId);}
function acceptedOpening(opening){return opening?.reviewStatus==='accepted'||(opening?.type==='legacy'&&opening?.doors?.length&&opening.doors.every(door=>door.status==='accepted'));}
function openingDoorCount(opening){return (opening?.doors||[]).length;}

function openingMaterialNeeds(opening){
  const doors=opening.doors||[];
  const count=doors.length;
  if(opening.type==='legacy')return MATERIALS.reduce((needs,material)=>({...needs,[material.id]:(needs[material.id]||0)+count*material.perDoor}),{});
  const needs={
    polotno:count,
    korob:opening.type==='toilet'?1:0,
    dobor:2.5,
    nalich:5,
    petli:count*2,
    zamok:count,
    ruchka:1,
    planka:count,
    porog:opening.type==='toilet'?1:0,
    krepezh:count,
    pena:count,
    shpingalet:opening.type==='large'?1:0,
  };
  return needs;
}

function materialsTable(items){
  let openings=[];
  if(items?.length&&items[0]?.opening)openings=[...new Map(items.map(item=>[item.opening.id,item.opening])).values()];
  else if(items?.length&&items[0]?.doors)openings=items;
  else if(items?.length&&items[0]?.door)openings=[...new Map(items.map(item=>[item.opening?.id,item.opening]).filter(([id])=>id)).values()];
  const required={};
  openings.forEach(opening=>Object.entries(openingMaterialNeeds(opening)).forEach(([id,qty])=>required[id]=(required[id]||0)+qty));
  return MATERIALS.map(material=>{
    const needed=Number((required[material.id]||0).toFixed(2));
    const seedRatio=((material.id.charCodeAt(0)*7)%23)/100;
    let ratio=.90+seedRatio-(material.id==='dobor'?.14:0)-(material.id==='korob'?.06:0)-(material.id==='pena'?.10:0);
    ratio=Math.max(.55,Math.min(1.08,ratio));
    const have=Number((needed*ratio).toFixed(2));
    return {...material,needed,have,missing:Number(Math.max(0,needed-have).toFixed(2))};
  });
}
