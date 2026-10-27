function buildBrigades(){
  const list=[];
  for(let i=1;i<=12;i++){
    list.push({
      id:'br'+i,
      name:'Бригада №'+i,
      leader:LEADER_NAMES[i-1],
      phone:'+996 5'+randInt(50,99)+' '+randInt(100,999)+' '+randInt(100,999),
      workers:randInt(3,6),
      pricePerDoor:pick([420,450,480,500]),
      advance:randInt(4,14)*5000,
      paid:0, // computed later
    });
  }
  return list;
}

// ---- build objects tree ----
function buildObjects(brigades){
  const configs=[
    {name:'ЖК «Ала-Тоо»', blocks:[5,6,4], target:0.81},
    {name:'ЖК «Восток»',  blocks:[8,7],   target:0.84},
    {name:'ЖК «Южный»',   blocks:[5,5,6,5], target:0.66},
  ];
  let floorCounter=0, doorSeq=1, aptSeq=1;
  const objects=configs.map((cfg,oi)=>{
    const blocks=cfg.blocks.map((floorsCount,bi)=>{
      const floors=[];
      for(let f=1;f<=floorsCount;f++){
        const brigade=brigades[floorCounter%brigades.length];
        floorCounter++;
        const aptCount=randInt(4,6);
        const apartments=[];
        for(let a=1;a<=aptCount;a++){
          const num=(bi+1)*100+f*10+a; // decorative apt number
          const doorCount=randInt(3,6);
          const doors=[];
          for(let d=1;d<=doorCount;d++){
            const roll=rng();
            let status;
            if(roll<cfg.target-0.05) status = rng()<0.5?'accepted':'installed';
            else if(roll<cfg.target) status='installed';
            else if(roll<cfg.target+0.03) status='problem';
            else if(roll<cfg.target+0.10) status='in_progress';
            else if(roll<cfg.target+0.16) status='materials_ready';
            else status='not_started';
            doors.push({
              id:'d'+(doorSeq++),
              n:d,
              status,
              problem: status==='problem' ? pick(PROBLEM_TYPES) : null,
              photo: status==='installed'||status==='accepted' ? true : false,
            });
          }
          apartments.push({id:'apt'+(aptSeq++), num, doors});
        }
        floors.push({id:'f'+oi+'-'+bi+'-'+f, num:f, brigadeId:brigade.id, apartments});
      }
      return {id:'b'+oi+'-'+bi, name:'Блок '+(bi+1), floors};
    });
    return {id:'o'+oi, name:cfg.name, blocks};
  });
  return objects;
}

/* ---- flatten helpers ---- */
function allDoors(state){
  const out=[];
  state.objects.forEach(o=>o.blocks.forEach(b=>b.floors.forEach(f=>f.apartments.forEach(a=>a.doors.forEach(d=>{
    out.push({door:d, apt:a, floor:f, block:b, obj:o});
  })))));
  return out;
}
function objDoors(state,objId){return allDoors(state).filter(x=>x.obj.id===objId);}
function countByStatus(doors){
  const c={not_started:0,materials_ready:0,in_progress:0,installed:0,accepted:0,problem:0};
  doors.forEach(x=>c[x.door.status]++);
  return c;
}
function doneCount(c){return c.installed+c.accepted;}
function totalCount(c){return c.not_started+c.materials_ready+c.in_progress+c.installed+c.accepted+c.problem;}

/* ---- materials need/stock ---- */
function materialsTable(doorsList){
  return MATERIALS.map(m=>{
    const needed = Math.ceil(doorsList.length * m.perDoor);
    // stock ratio varies per material for realistic shortages
    const seedRatio = ((m.id.charCodeAt(0)*7)%23)/100; // 0..0.22
    let ratio = 0.90 + seedRatio - (m.id==='dobor'?0.14:0) - (m.id==='korob'?0.06:0) - (m.id==='pena'?0.10:0);
    ratio = Math.max(0.55, Math.min(1.08, ratio));
    const have = Math.round(needed*ratio);
    const missing = Math.max(0, needed-have);
    return {...m, needed, have, missing};
  });
}

/* =========================================================================
   STATE INIT / PERSISTENCE
   ========================================================================= */
