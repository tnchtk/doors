function pageReports(){
  const doors=allDoors(state);
  const total=doors.length;
  const done=doneCount(countByStatus(doors));
  const weekPlan = Math.round(total*0.05);
  const weekFact = Math.round(weekPlan*0.926);

  return `
    <div class="panel">
      <div class="panel-head"><h3>За сегодня</h3></div>
      <div style="font-size:13px;color:var(--text-dim);margin-bottom:10px;">Установлено: <strong class="mono" style="color:var(--text)">${state.brigades.reduce((s,b)=>s+installedTodayFor(b.id),0)}</strong> дверей</div>
      ${state.brigades.map(b=>`<div class="reqline"><span>${b.name}</span><strong class="mono">${installedTodayFor(b.id)}</strong></div>`).join('')}
    </div>

    <div class="panel">
      <div class="panel-head"><h3>За неделю</h3></div>
      <div class="reqline"><span>План</span><strong class="mono">${weekPlan}</strong></div>
      <div class="reqline"><span>Факт</span><strong class="mono">${weekFact}</strong></div>
      <div class="reqline"><span>Выполнение</span><strong class="mono" style="color:var(--ok)">${Math.round(weekFact/weekPlan*1000)/10}%</strong></div>
    </div>

    <div class="panel">
      <div class="panel-head"><h3>Экспорт</h3><span class="hint">демо-прототип — экспорт формирует файл на основе текущих данных</span></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <button class="btn" data-export="csv">⬇ Выгрузить CSV по объектам</button>
        <button class="btn" data-export="brigades">⬇ Выгрузить CSV по бригадам</button>
        <button class="btn" data-export="materials">⬇ Выгрузить CSV по материалам</button>
      </div>
    </div>
  `;
}

