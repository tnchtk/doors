function pageProblems(){
  const problems = allDoors(state).filter(x=>x.door.status==='problem');
  const byType={};
  problems.forEach(x=>{byType[x.door.problem]=(byType[x.door.problem]||0)+1;});

  return `
    <div class="kpi-grid" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr));">
      ${Object.entries(byType).sort((a,b)=>b[1]-a[1]).map(([type,n])=>`
        <div class="kpi bad"><div class="val">${n}</div><div class="lbl">${type}</div></div>
      `).join('')}
    </div>
    <div class="panel">
      <div class="panel-head"><h3>Список проблемных дверей</h3><span class="hint">${problems.length} шт.</span></div>
      <div class="tbl-wrap">
      <table>
        <thead><tr><th>Объект</th><th>Блок</th><th>Этаж</th><th>Квартира</th><th>Дверь</th><th>Проблема</th><th>Бригада</th><th></th></tr></thead>
        <tbody>
          ${problems.map(x=>{
            const brigade=state.brigades.find(b=>b.id===x.floor.brigadeId);
            return `<tr>
              <td>${x.obj.name}</td>
              <td>${x.block.name}</td>
              <td>${x.floor.num}</td>
              <td>${x.apt.num}</td>
              <td>№${x.door.n}</td>
              <td><span class="pill bad">${x.door.problem}</span></td>
              <td>${brigade?brigade.name:'—'}</td>
              <td><button class="btn sm" data-resolve-problem='${JSON.stringify({objId:x.obj.id, blockId:x.block.id, floorId:x.floor.id, aptId:x.apt.id, doorId:x.door.id})}'>Решено</button></td>
            </tr>`;
          }).join('')}
          ${problems.length===0?`<tr><td colspan="8"><div class="empty">Проблем не зафиксировано 🎉</div></td></tr>`:''}
        </tbody>
      </table>
      </div>
    </div>
  `;
}

/* =========================================================================
   PAGE: REPORTS
   ========================================================================= */
