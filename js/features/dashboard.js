function pageDashboard(){
  const doors=allDoors(state);
  const c=countByStatus(doors);
  const total=totalCount(c);
  const done=doneCount(c);
  const pct=total?Math.round(done/total*100):0;
  const problemCount=c.problem;
  const newRequests=state.requests.filter(r=>r.status==='new').length;
  const shortMaterials = materialsTable(doors).filter(m=>m.missing>0);

  const objRows = state.objects.map(o=>{
    const od=objDoors(state,o.id);
    const oc=countByStatus(od);
    const ot=totalCount(oc);
    const odone=doneCount(oc);
    const opct= ot? Math.round(odone/ot*100):0;
    return {o,ot,odone,opct,problem:oc.problem};
  });

  return `
    <div class="dashboard-heading">
      <div>
        <div class="dashboard-eyebrow">Оперативная сводка</div>
        <h2>Монтаж под контролем</h2>
        <p>Состояние объектов, дверей и материалов в одном месте.</p>
      </div>
      <div class="dashboard-date">${new Date().toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'})}</div>
    </div>
    <div class="kpi-grid">
      <div class="kpi"><div class="val">${state.objects.length}</div><div class="lbl">Объектов</div></div>
      <div class="kpi"><div class="val">${state.objects.reduce((s,o)=>s+o.blocks.length,0)}</div><div class="lbl">Блоков</div></div>
      <div class="kpi"><div class="val">${state.brigades.length}</div><div class="lbl">Бригад</div></div>
      <div class="kpi accent"><div class="val">${total.toLocaleString('ru')}</div><div class="lbl">Всего дверей</div></div>
      <div class="kpi ok"><div class="val">${done.toLocaleString('ru')}</div><div class="lbl">Установлено</div></div>
      <div class="kpi warn"><div class="val">${(total-done-problemCount).toLocaleString('ru')}</div><div class="lbl">Осталось</div></div>
      <div class="kpi bad"><div class="val">${problemCount}</div><div class="lbl">Проблемных дверей</div></div>
      <div class="kpi bad"><div class="val">${shortMaterials.length}</div><div class="lbl">Материалов не хватает</div></div>
    </div>

    <div class="two-col">
      <div class="panel">
        <div class="panel-head"><h3>Готовность по объектам</h3><span class="hint">клик открывает объект</span></div>
        <div class="tbl-wrap">
        <table>
          <thead><tr><th>Объект</th><th>Всего</th><th>Установлено</th><th>Осталось</th><th>Проблем</th><th>Готовность</th></tr></thead>
          <tbody>
            ${objRows.map(r=>`
              <tr class="clickable" data-open-obj="${r.o.id}">
                <td><strong>${r.o.name}</strong></td>
                <td class="mono">${r.ot}</td>
                <td class="mono" style="color:var(--ok)">${r.odone}</td>
                <td class="mono">${r.ot-r.odone-r.problem}</td>
                <td class="mono" style="color:${r.problem?'var(--bad)':'var(--text-faint)'}">${r.problem}</td>
                <td>
                  <div class="progress-row">
                    <div class="bar"><span style="width:${r.opct}%;background:${r.opct>75?'var(--ok)':r.opct>50?'var(--warn)':'var(--bad)'}"></span></div>
                    <span class="mono" style="width:38px;text-align:right;">${r.opct}%</span>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head"><h3>Сегодня</h3></div>
        <div style="display:flex;flex-direction:column;gap:10px;">
          ${state.brigades.slice(0,6).map(b=>{
            const installedToday = installedTodayFor(b.id);
            return `<div class="reqline" style="padding:8px 0;">
              <span style="font-size:13px;">${b.name}</span>
              <span class="pill ok">+${installedToday}</span>
            </div>`;
          }).join('')}
        </div>
        <div class="panel-head" style="margin-top:18px;"><h3>Требует внимания</h3></div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          <div class="reqline"><span style="font-size:12.5px;color:var(--text-dim)">🔴 Новых заявок от бригад</span><span class="pill ${newRequests?'bad':'neutral'}">${newRequests}</span></div>
          <div class="reqline"><span style="font-size:12.5px;color:var(--text-dim)">⚠️ Проблемных дверей</span><span class="pill ${problemCount?'bad':'neutral'}">${problemCount}</span></div>
          <div class="reqline"><span style="font-size:12.5px;color:var(--text-dim)">📦 Критический остаток материалов</span><span class="pill ${shortMaterials.length?'warn':'neutral'}">${shortMaterials.length}</span></div>
        </div>
      </div>
    </div>
  `;
}

function installedTodayFor(brigadeId){
  // deterministic pseudo "today" number derived from brigade id, for demo flavor
  const seed = brigadeId.charCodeAt(2)*13 % 23;
  return Math.max(6, seed);
}

/* =========================================================================
   PAGE: OBJECTS (drill-down: object -> block -> floor -> apartment -> doors)
   ========================================================================= */
