function brigadeStats(brigadeId){
  const doors = allDoors(state).filter(x=>x.floor.brigadeId===brigadeId);
  const c=countByStatus(doors);
  const done=doneCount(c);
  const today=installedTodayFor(brigadeId);
  const remaining = totalCount(c)-done-c.problem;
  const blocksServed = [...new Set(doors.map(x=>x.obj.name+' / '+x.block.name))];
  return {doors, c, done, today, remaining, blocksServed};
}

function pageBrigades(){
  if(route.brigadeId){
    const b=state.brigades.find(x=>x.id===route.brigadeId);
    if(b) return brigadeDetail(b);
  }
  return `
    <div class="panel-head"><div><h3>${state.brigades.length} бригад на объектах</h3><div class="hint">Добавляйте бригады и назначайте их на этажи</div></div><button class="btn primary sm" data-create-brigade>+ Новая бригада</button></div>
    <div class="tbl-wrap">
    <table>
      <thead><tr><th>Бригада</th><th>Руководитель</th><th>Установлено</th><th>Сегодня</th><th>Осталось</th><th>Проблем</th><th>Цена/дверь</th><th></th></tr></thead>
      <tbody>
        ${state.brigades.map(b=>{
          const s=brigadeStats(b.id);
          return `<tr class="clickable" data-open-brigade="${b.id}">
            <td><strong>${b.name}</strong></td>
            <td>${b.leader}</td>
            <td class="mono" style="color:var(--ok)">${s.done}</td>
            <td class="mono">+${s.today}</td>
            <td class="mono">${s.remaining}</td>
            <td class="mono" style="color:${s.c.problem?'var(--bad)':'var(--text-faint)'}">${s.c.problem}</td>
            <td class="mono">${b.pricePerDoor} сом</td>
            <td style="color:var(--text-faint)">→</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
    </div>
  `;
}

function brigadeDetail(b){
  const s=brigadeStats(b.id);
  const earned = s.done * b.pricePerDoor;
  const paid = Math.round(earned*0.7);
  const debt = earned-paid-b.advance>0 ? earned-paid-b.advance : 0;
  return `
    ${crumb([{label:'Бригады', click:{page:'brigades'}}, {label:b.name}])}
    <div class="two-col">
      <div class="panel">
        <div class="panel-head"><h3>${b.name}</h3><span class="pill info">${s.blocksServed.length} участка</span></div>
        <div style="font-size:13px;color:var(--text-dim);line-height:2;">
          Руководитель: <strong style="color:var(--text)">${b.leader}</strong><br>
          Телефон: <span class="mono">${b.phone}</span><br>
          Рабочих: ${b.workers} чел.<br>
          Обслуживает: ${s.blocksServed.join(', ')}
        </div>
        <div class="kpi-grid" style="margin-top:16px;">
          <div class="kpi ok"><div class="val">${s.done}</div><div class="lbl">Установлено всего</div></div>
          <div class="kpi accent"><div class="val">+${s.today}</div><div class="lbl">Сегодня</div></div>
          <div class="kpi warn"><div class="val">${s.remaining}</div><div class="lbl">Осталось</div></div>
          <div class="kpi bad"><div class="val">${s.c.problem}</div><div class="lbl">Проблемных</div></div>
        </div>
      </div>
      <div class="panel">
        <div class="panel-head"><h3>Оплата</h3></div>
        <div class="reqline"><span>Цена за дверь</span><strong class="mono">${b.pricePerDoor} сом</strong></div>
        <div class="reqline"><span>Установлено × цена</span><strong class="mono">${earned.toLocaleString('ru')} сом</strong></div>
        <div class="reqline"><span>Аванс выдан</span><strong class="mono">${b.advance.toLocaleString('ru')} сом</strong></div>
        <div class="reqline"><span>Выплачено</span><strong class="mono">${paid.toLocaleString('ru')} сом</strong></div>
        <div class="reqline"><span>Остаток к выплате</span><strong class="mono" style="color:var(--warn)">${debt.toLocaleString('ru')} сом</strong></div>
      </div>
    </div>
  `;
}

/* =========================================================================
   PAGE: SUPPLY (заявки + потребность объекта)
   ========================================================================= */
