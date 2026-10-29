function findObj(id){return state.objects.find(o=>o.id===id);}
function findBlock(objId,blockId){return findObj(objId).blocks.find(b=>b.id===blockId);}
function findFloor(objId,blockId,floorId){return findBlock(objId,blockId).floors.find(f=>f.id===floorId);}
function findApt(objId,blockId,floorId,aptId){return findFloor(objId,blockId,floorId).apartments.find(a=>a.id===aptId);}

function pageObjects(){
  if(!route.objId) return objectsList();
  const obj=findObj(route.objId);
  if(!obj) return objectsList();
  if(!route.blockId) return blockList(obj);
  const block=findBlock(obj.id, route.blockId);
  if(!block) return blockList(obj);
  if(!route.floorId) return floorList(obj, block);
  const floor=findFloor(obj.id, block.id, route.floorId);
  if(!floor) return floorList(obj, block);
  if(!route.aptId) return apartmentList(obj, block, floor);
  const apt=findApt(obj.id, block.id, floor.id, route.aptId);
  if(!apt) return apartmentList(obj, block, floor);
  return doorList(obj, block, floor, apt);
}

function crumb(segments){
  return `<div class="tree-crumb">${segments.map((s,i)=>`
    ${i>0?'<span class="sep">/</span>':''}
    <span class="seg ${i===segments.length-1?'current':''}" ${s.click?`data-crumb-go='${JSON.stringify(s.click)}'`:''}>${s.label}</span>
  `).join('')}</div>`;
}

function objectsList(){
  return `
    <div class="panel-head"><div><h3>Объекты</h3><div class="hint">Откройте объект, чтобы вести двери по блокам и квартирам</div></div>${canManageWorkspace()?'<button class="btn primary sm" data-create-object>+ Новый объект</button>':''}</div>
    <div class="card-grid">
      ${state.objects.map(o=>{
        const od=objDoors(state,o.id); const oc=countByStatus(od); const ot=totalCount(oc); const done=doneCount(oc);
        const pct= ot?Math.round(done/ot*100):0;
        return `<div class="tile" data-open-obj="${o.id}">
          <div class="t-name">${o.name}</div>
          <div class="t-meta">${o.blocks.length} блоков · ${ot} дверей ${oc.problem?`· <span style="color:var(--bad)">${oc.problem} проблем</span>`:''}</div>
          <div class="t-progress">
            <div class="bar"><span style="width:${pct}%;background:${pct>75?'var(--ok)':pct>50?'var(--warn)':'var(--bad)'}"></span></div>
            <span class="t-pct">${pct}%</span>
          </div>
          ${canManageWorkspace()?`<div class="block-tile-actions"><button type="button" class="btn sm danger" data-delete-object="${htmlEscape(o.id)}">Удалить объект</button></div>`:''}
        </div>`;
      }).join('')}
    </div>
  `;
}

function blockList(obj){
  return `
    ${crumb([{label:'Объекты', click:{page:'objects'}}, {label:obj.name}])}
    <div class="panel-head"><h3>Блоки</h3>${canManageWorkspace()?`<button class="btn primary sm" data-create-block="${obj.id}">+ Новый блок</button>`:''}</div>
    <div class="card-grid">
      ${obj.blocks.map(b=>{
        const doors=[]; b.floors.forEach(f=>f.apartments.forEach(a=>apartmentDoors(a).forEach(item=>doors.push(item.door))));
        const c=countByStatus(doors.map(d=>({door:d}))); const ot=totalCount(c); const done=doneCount(c);
        const pct= ot?Math.round(done/ot*100):0;
        return `<div class="tile" data-open-block="${b.id}">
          <div class="t-name">${b.name}</div>
          <div class="t-meta">${b.floors.length} этажей · ${ot} дверей</div>
          <div class="t-progress">
            <div class="bar"><span style="width:${pct}%;background:${pct>75?'var(--ok)':pct>50?'var(--warn)':'var(--bad)'}"></span></div>
            <span class="t-pct">${pct}%</span>
          </div>
          ${canManageWorkspace()?`<div class="block-tile-actions"><button type="button" class="btn sm" data-edit-block='${JSON.stringify({objId:obj.id,blockId:b.id})}'>Изменить блок</button></div>`:''}
        </div>`;
      }).join('')}
    </div>
  `;
}

function floorList(obj, block){
  return `
    ${crumb([{label:'Объекты', click:{page:'objects'}}, {label:obj.name, click:{page:'objects', objId:obj.id}}, {label:block.name}])}
    <div class="panel-head"><h3>Этажи · ${block.name}</h3>${canManageWorkspace()?`<button class="btn primary sm" data-create-floor='${JSON.stringify({objId:obj.id,blockId:block.id})}'>+ Новый этаж</button>`:''}</div>
    <div class="card-grid">
      ${block.floors.map(f=>{
        const doors=[]; f.apartments.forEach(a=>apartmentDoors(a).forEach(item=>doors.push(item.door)));
        const c=countByStatus(doors.map(d=>({door:d}))); const ot=totalCount(c); const done=doneCount(c);
        const pct= ot?Math.round(done/ot*100):0;
        const brigade=state.brigades.find(b=>b.id===f.brigadeId);
        return `<div class="tile" data-open-floor="${f.id}">
          <div class="t-name">${f.num} этаж</div>
          <div class="t-meta">${brigade?brigade.name:'—'} · ${ot} дверей</div>
          <div class="t-progress">
            <div class="bar"><span style="width:${pct}%;background:${pct>75?'var(--ok)':pct>50?'var(--warn)':'var(--bad)'}"></span></div>
            <span class="t-pct">${pct}%</span>
          </div>
        </div>`;
      }).join('')}
    </div>
  `;
}

function apartmentList(obj, block, floor){
  const brigade=state.brigades.find(b=>b.id===floor.brigadeId);
  return `
    ${crumb([{label:'Объекты', click:{page:'objects'}}, {label:obj.name, click:{page:'objects', objId:obj.id}}, {label:block.name, click:{page:'objects', objId:obj.id, blockId:block.id}}, {label:floor.num+' этаж'}])}
    <div class="panel" style="margin-bottom:16px;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
      <div style="font-size:13px;color:var(--text-dim)">Бригада на этаже: <strong style="color:var(--text)">${brigade?brigade.name:'—'}</strong></div>
      ${canManageWorkspace()?`<button class="btn primary sm" data-create-apartment='${JSON.stringify({objId:obj.id,blockId:block.id,floorId:floor.id})}'>+ Новая квартира</button>`:''}
    </div>
    <div class="card-grid">
      ${floor.apartments.map(a=>{
        const c=countByStatus(apartmentDoors(a).map(item=>({door:item.door}))); const ot=totalCount(c); const done=doneCount(c);
        const pct= ot?Math.round(done/ot*100):0;
        return `<div class="tile" data-open-apt="${a.id}">
          <div class="t-name">кв. ${a.num}</div>
          <div class="t-meta">${ot} дверей ${c.problem?`· <span style="color:var(--bad)">${c.problem} проблем</span>`:''}</div>
          <div class="t-progress">
            <div class="bar"><span style="width:${pct}%;background:${pct>75?'var(--ok)':pct>50?'var(--warn)':'var(--bad)'}"></span></div>
            <span class="t-pct">${pct}%</span>
          </div>
        </div>`;
      }).join('')}
    </div>
  `;
}

function doorList(obj, block, floor, apt){
  return `
    ${crumb([{label:'Объекты', click:{page:'objects'}}, {label:obj.name, click:{page:'objects', objId:obj.id}}, {label:block.name, click:{page:'objects', objId:obj.id, blockId:block.id}}, {label:floor.num+' этаж', click:{page:'objects', objId:obj.id, blockId:block.id, floorId:floor.id}}, {label:'кв. '+apt.num}])}
    <div class="panel-head" style="margin-bottom:14px;">
      <h3>Двери — квартира ${apt.num}</h3>
      ${canManageWorkspace()?`<button class="btn sm" data-create-door='${JSON.stringify({objId:obj.id,blockId:block.id,floorId:floor.id,aptId:apt.id})}'>+ Добавить дверь</button><button class="btn primary sm" data-new-request='${JSON.stringify({objId:obj.id, blockName:block.name, floor:floor.num, apt:apt.num, brigadeId:floor.brigadeId})}'>+ Заявка на материалы</button>`:''}
    </div>
    <div class="door-grid">
      ${apartmentDoors(apt).map(({door:d})=>{
        const st=STATUS[d.status];
        return `<div class="door-card" ${canManageWorkspace()?`data-door-status='${JSON.stringify({objId:obj.id, blockId:block.id, floorId:floor.id, aptId:apt.id, doorId:d.id})}'`:"style='cursor:default'"}>
          <div class="d-top"><span class="d-name">Дверь №${d.n}</span>${d.photo?'<span class="photo-indicator" title="Есть фото"><svg aria-hidden="true" viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="15" rx="3"/><circle cx="12" cy="13.5" r="3.5"/><path d="m8 6 1.2-2h5.6L16 6"/></svg></span>':''}</div>
          <span class="pill ${st.cls}"><span class="dot ${st.cls}"></span>${st.label}</span>
          ${d.problem?`<div style="font-size:11px;color:var(--bad);margin-top:6px;">${d.problem}</div>`:''}
        </div>`;
      }).join('')}
    </div>
  `;
}

/* =========================================================================
   PAGE: BRIGADES
   ========================================================================= */
