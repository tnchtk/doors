function findObj(id){return state.objects.find(o=>o.id===id);}
function findBlock(objId,blockId){return findObj(objId).blocks.find(b=>b.id===blockId);}
function findFloor(objId,blockId,floorId){return findBlock(objId,blockId).floors.find(f=>f.id===floorId);}
function findApt(objId,blockId,floorId,aptId){return findFloor(objId,blockId,floorId).apartments.find(a=>a.id===aptId);}

function pageObjects(){
  if(!route.objId) return objectsList();
  const obj=findObj(route.objId);
  if(!obj||obj.archivedAt) return objectsList();
  if(!route.blockId) return blockList(obj);
  const block=findBlock(obj.id, route.blockId);
  if(!block) return blockList(obj);
  if(!route.floorId) return floorList(obj, block);
  const floor=findFloor(obj.id, block.id, route.floorId);
  if(!floor) return floorList(obj, block);
  if(!route.aptId) return floorOpeningsList(obj, block, floor);
  const apt=findApt(obj.id, block.id, floor.id, route.aptId);
  if(!apt) return floorOpeningsList(obj, block, floor);
  if(apt.isFloorContainer) return floorOpeningsList(obj,block,floor);
  return doorList(obj, block, floor, apt);
}

function crumb(segments){
  return `<div class="tree-crumb">${segments.map((s,i)=>`
    ${i>0?'<span class="sep">/</span>':''}
    <span class="seg ${i===segments.length-1?'current':''}" ${s.click?`data-crumb-go='${htmlEscape(JSON.stringify(s.click))}'`:''}>${htmlEscape(s.label)}</span>
  `).join('')}</div>`;
}

function objectsList(){
  return `
    <div class="panel-head"><div><h3>Объекты</h3><div class="hint">Откройте объект, чтобы вести установку по блокам, этажам и дверям</div></div></div>
    <div class="card-grid">
      ${activeObjects(state).map(o=>{
        const od=objDoors(state,o.id); const oc=countByStatus(od); const ot=totalCount(oc); const done=doneCount(oc);
        const pct= ot?Math.round(done/ot*100):0;
        return `<div class="tile" data-open-obj="${o.id}">
          <div class="t-name">${htmlEscape(o.name)}</div>
          <div class="t-meta">${o.blocks.length} блоков · ${ot} дверей ${oc.problem?`· <span style="color:var(--bad)">${oc.problem} проблем</span>`:''}</div>
          <div class="t-progress">
            <div class="bar"><span style="width:${pct}%;background:${pct>75?'var(--ok)':pct>50?'var(--warn)':'var(--bad)'}"></span></div>
            <span class="t-pct">${pct}%</span>
          </div>
        </div>`;
      }).join('')}
    </div>
  `;
}

function blockList(obj){
  return `
    ${crumb([{label:'Объекты', click:{page:'objects'}}, {label:obj.name}])}
    <div class="panel-head"><h3>Блоки · ${htmlEscape(obj.name)}</h3>${canManageWorkspace()?`<button class="btn primary sm" data-create-block="${htmlEscape(obj.id)}">+ Добавить блок</button>`:''}</div>
    <div class="card-grid">
      ${(obj.blocks||[]).map(b=>{
        const doors=[]; b.floors.forEach(f=>f.apartments.forEach(a=>apartmentDoors(a).forEach(item=>doors.push(item.door))));
        const c=countByStatus(doors.map(d=>({door:d}))); const ot=totalCount(c); const done=doneCount(c);
        const pct= ot?Math.round(done/ot*100):0;
        return `<div class="tile" data-open-block="${b.id}">
          <div class="t-name">${htmlEscape(b.name)}</div>
          <div class="t-meta">${b.floors.length} этажей · ${ot} дверей</div>
          <div class="t-progress">
            <div class="bar"><span style="width:${pct}%;background:${pct>75?'var(--ok)':pct>50?'var(--warn)':'var(--bad)'}"></span></div>
            <span class="t-pct">${pct}%</span>
          </div>
        </div>`;
      }).join('')||'<div class="empty">Блоков пока нет. Добавьте первый блок для этого объекта.</div>'}
    </div>
  `;
}

function floorList(obj, block){
  return `
    ${crumb([{label:'Объекты', click:{page:'objects'}}, {label:obj.name, click:{page:'objects', objId:obj.id}}, {label:block.name}])}
    <div class="panel-head"><h3>Этажи · ${htmlEscape(block.name)}</h3>${canManageWorkspace()?`<button class="btn primary sm" data-create-floor='${JSON.stringify({objId:obj.id,blockId:block.id})}'>+ Новый этаж</button>`:''}</div>
    <div class="card-grid">
      ${block.floors.map(f=>{
        const doors=[]; f.apartments.forEach(a=>apartmentDoors(a).forEach(item=>doors.push(item.door)));
        const c=countByStatus(doors.map(d=>({door:d}))); const ot=totalCount(c); const done=doneCount(c);
        const pct= ot?Math.round(done/ot*100):0;
        const brigade=state.brigades.find(b=>b.id===f.brigadeId);
        return `<div class="floor-tile-wrap"><div class="tile" data-open-floor="${htmlEscape(f.id)}">
          <div class="t-head"><div class="t-name">${f.num} этаж</div><span class="pill ${FLOOR_STATUS_LABELS[floorStatus(f)].cls}">${FLOOR_STATUS_LABELS[floorStatus(f)].label}</span></div>
          <div class="t-meta">${brigade?htmlEscape(brigade.name):'—'} · ${ot} ${ruPlural(ot,'дверь','двери','дверей')}</div>
          ${isAdminWorkspaceUser()?`<div class="floor-rate-control"><span>${Number(f.ratePerOpening)>0?`${Number(f.ratePerOpening).toLocaleString('ru-RU')} сом/проём`:'Тариф не задан'}</span><button type="button" class="btn sm" data-floor-rate='${htmlEscape(JSON.stringify({objId:obj.id,blockId:block.id,floorId:f.id}))}'>Тариф</button></div>`:''}
          <div class="t-progress">
            <div class="bar"><span style="width:${pct}%;background:${pct>75?'var(--ok)':pct>50?'var(--warn)':'var(--bad)'}"></span></div>
            <span class="t-pct">${pct}%</span>
          </div>
        </div>${canManageWorkspace()?`<button type="button" class="btn sm floor-copy-button" aria-label="Скопировать этаж ${htmlEscape(f.num)}" data-copy-floor='${htmlEscape(JSON.stringify({objId:obj.id,blockId:block.id,floorId:f.id}))}'>Копировать этаж</button>`:''}</div>`;
      }).join('')}
    </div>
  `;
}

function doorList(obj, block, floor, apt){
  return `
    ${crumb([{label:'Объекты', click:{page:'objects'}}, {label:obj.name, click:{page:'objects', objId:obj.id}}, {label:block.name, click:{page:'objects', objId:obj.id, blockId:block.id}}, {label:floor.num+' этаж', click:{page:'objects', objId:obj.id, blockId:block.id, floorId:floor.id}}, {label:'кв. '+apt.num}])}
    <div class="panel-head" style="margin-bottom:14px;">
      <h3>Двери — квартира ${apt.num}</h3>
      ${canManageWorkspace()?`<button class="btn sm" data-create-door='${JSON.stringify({objId:obj.id,blockId:block.id,floorId:floor.id,aptId:apt.id})}'>+ Добавить дверь</button><button class="btn primary sm" data-new-request='${htmlEscape(JSON.stringify({objId:obj.id, blockName:block.name, floor:floor.num, apt:apt.num, brigadeId:floor.brigadeId}))}'>+ Заявка на материалы</button>`:''}
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
