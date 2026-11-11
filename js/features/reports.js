function pageReports(){
  return `
      ${canManageWorkspace()?avrActsPanel():''}
    <div class="panel">
      <div class="panel-head"><h3>За сегодня</h3></div>
      <div style="font-size:13px;color:var(--text-dim);margin-bottom:10px;">Установлено: <strong class="mono" style="color:var(--text)">${state.brigades.reduce((s,b)=>s+installedTodayFor(b.id),0)}</strong> дверей</div>
      <p class="hint">Считаются реальные даты установки. У старых записей дата может отсутствовать.</p>
      ${state.brigades.map(b=>`<div class="reqline"><span>${htmlEscape(b.name)}</span><strong class="mono">${installedTodayFor(b.id)}</strong></div>`).join('')}
    </div>

    <div class="panel">
      <div class="panel-head"><h3>За последние 7 дней</h3></div>
      <div class="reqline"><span>Установлено</span><strong class="mono">${state.brigades.reduce((sum,brigade)=>sum+installedLastSevenDaysFor(brigade.id),0)} дверей</strong></div>
      <p class="hint">Показываются даты, сохранённые при отметке установки или отправке проёма на проверку.</p>
      ${state.brigades.map(brigade=>`<div class="reqline"><span>${htmlEscape(brigade.name)}</span><strong class="mono">${installedLastSevenDaysFor(brigade.id)}</strong></div>`).join('')}
    </div>

    <div class="panel">
      <div class="panel-head"><h3>Экспорт</h3><span class="hint">Экспорт формирует файл на основе текущих данных</span></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <button class="btn" data-export="csv">Выгрузить CSV по объектам</button>
        <button class="btn" data-export="brigades">Выгрузить CSV по бригадам</button>
        <button class="btn" data-export="materials">Выгрузить CSV по материалам</button>
      </div>
    </div>
  `;
}
