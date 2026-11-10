function pageDashboard(){
  if(isForemanWorkspaceUser())return foremanHome();
  const doors=allDoors(state);
  const c=countByStatus(doors);
  const total=totalCount(c);
  const done=doneCount(c);
  const pct=total?Math.round(done/total*100):0;
  const openingList=allOpenings(state);
  const returnedOpenings=openingList.filter(item=>item.opening.reviewStatus==='changes_requested').length;
  const pendingOpenings=pendingReviewCount(state);
  const problemCount=c.problem+returnedOpenings;
  const newRequests=activeRequests(state).filter(r=>r.status==='new').length;
  const shortMaterials = materialsTable(doors).filter(m=>m.missing>0);

  const objects=activeObjects(state);
  const objRows = objects.map(o=>{
    const od=objDoors(state,o.id);
    const oc=countByStatus(od);
    const ot=totalCount(oc);
    const odone=doneCount(oc);
    const opct= ot? Math.round(odone/ot*100):0;
    const reviewProblems=openingList.filter(item=>item.obj.id===o.id&&item.opening.reviewStatus==='changes_requested').length;
    return {o,ot,odone,opct,problem:oc.problem+reviewProblems};
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
    <section class="dashboard-summary" aria-label="Общий прогресс монтажа">
      <div class="readiness-ring" style="--progress:${pct}%" role="img" aria-label="Готово ${pct}%">
        <span><strong>${pct}%</strong><small>готово</small></span>
      </div>
      <div class="summary-copy">
        <div class="summary-label">Общий прогресс</div>
        <h3>Установлено ${done.toLocaleString('ru')} из ${total.toLocaleString('ru')} дверей</h3>
        <p>${pendingOpenings?`${pendingOpenings} проёмов ожидают ответа или проверки`:'Новых обращений на проверке нет'}${problemCount?` · ${problemCount} требуют доработки`:''}</p>
        <div class="summary-track" aria-hidden="true"><span style="width:${pct}%"></span></div>
      </div>
      <div class="summary-side">
        <div class="summary-stat"><span>Объектов</span><strong>${objects.length}</strong></div>
        <div class="summary-stat"><span>Бригад</span><strong>${state.brigades.length}</strong></div>
      </div>
    </section>
    ${foremanFinanceCard()}
    <div class="kpi-grid">
      <div class="kpi"><div class="val">${objects.length}</div><div class="lbl">Объектов</div></div>
      <div class="kpi"><div class="val">${objects.reduce((s,o)=>s+o.blocks.length,0)}</div><div class="lbl">Блоков</div></div>
      <div class="kpi"><div class="val">${state.brigades.length}</div><div class="lbl">Бригад</div></div>
      <div class="kpi accent"><div class="val">${total.toLocaleString('ru')}</div><div class="lbl">Всего дверей</div></div>
      <div class="kpi ok"><div class="val">${done.toLocaleString('ru')}</div><div class="lbl">Установлено</div></div>
      <div class="kpi warn"><div class="val">${(total-done-problemCount).toLocaleString('ru')}</div><div class="lbl">Осталось</div></div>
      <div class="kpi bad"><div class="val">${problemCount}</div><div class="lbl">Открытых замечаний</div></div>
      <div class="kpi"><div class="val">${pendingOpenings}</div><div class="lbl">На проверке</div></div>
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
                <td><strong>${htmlEscape(r.o.name)}</strong></td>
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
        <div class="panel-head"><div><h3>Сегодня</h3><span class="hint">По сохранённым датам установки</span></div></div>
        <div style="display:flex;flex-direction:column;gap:10px;">
          ${state.brigades.slice(0,6).map(b=>{
            const installedToday = installedTodayFor(b.id);
            return `<div class="reqline" style="padding:8px 0;">
              <span style="font-size:13px;">${htmlEscape(b.name)}</span>
              <span class="pill ok">+${installedToday}</span>
            </div>`;
          }).join('')}
        </div>
        <div class="panel-head" style="margin-top:18px;"><h3>Требует внимания</h3></div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          <div class="reqline"><span style="font-size:12.5px;color:var(--text-dim)"><span class="inline-dot bad" aria-hidden="true"></span>Новых заявок от бригад</span><span class="pill ${newRequests?'bad':'neutral'}">${newRequests}</span></div>
          <div class="reqline"><span style="font-size:12.5px;color:var(--text-dim)"><span class="inline-dot warn" aria-hidden="true"></span>Открытых замечаний</span><span class="pill ${problemCount?'bad':'neutral'}">${problemCount}</span></div>
          <div class="reqline"><span style="font-size:12.5px;color:var(--text-dim)"><span class="inline-dot warn" aria-hidden="true"></span>Критический остаток материалов</span><span class="pill ${shortMaterials.length?'warn':'neutral'}">${shortMaterials.length}</span></div>
        </div>
      </div>
    </div>
  `;
}

function installedTodayFor(brigadeId){
  const todayEnd=new Date();todayEnd.setHours(24,0,0,0);
  const todayStart=new Date(todayEnd);todayStart.setDate(todayStart.getDate()-1);
  return installedCountBetween(brigadeId,todayStart,todayEnd);
}

function installedLastSevenDaysFor(brigadeId){
  const end=new Date();end.setHours(24,0,0,0);
  const start=new Date(end);start.setDate(start.getDate()-7);
  return installedCountBetween(brigadeId,start,end);
}

function installedCountBetween(brigadeId,start,end){
  return allDoors(state).filter(({door,opening,floor})=>{
    if(floor.brigadeId!==brigadeId||!['installed','accepted'].includes(door.status))return false;
    const dateValue=door.installedAt||opening.submittedAt||(door.status==='accepted'?opening.acceptedAt:null);
    if(!dateValue)return false;
    const installedAt=new Date(dateValue);
    return !Number.isNaN(installedAt.getTime())&&installedAt>=start&&installedAt<end;
  }).length;
}

/* =========================================================================
   PAGE: OBJECTS (drill-down: object -> block -> floor -> apartment -> doors)
   ========================================================================= */
