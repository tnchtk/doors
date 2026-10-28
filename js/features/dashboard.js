function pageDashboard(){
  const doors=allDoors(state);
  const counts=countByStatus(doors);
  const total=totalCount(counts);
  const done=doneCount(counts);
  const pct=total?Math.round(done/total*100):0;
  const problemCount=counts.problem||0;
  const newRequests=state.requests.filter(r=>r.status==='new').length;
  const shortMaterials=materialsTable(doors).filter(m=>m.missing>0);
  const outstanding=Math.max(0,total-done);
  const activeObjects=state.objects.filter(o=>{
    const c=countByStatus(objDoors(state,o.id));
    return totalCount(c)>doneCount(c);
  }).length;

  const objRows=state.objects.map(o=>{
    const objectDoors=objDoors(state,o.id);
    const c=countByStatus(objectDoors);
    const objectTotal=totalCount(c);
    const objectDone=doneCount(c);
    return {o,total:objectTotal,done:objectDone,pct:objectTotal?Math.round(objectDone/objectTotal*100):0,problems:c.problem||0};
  });
  const statusRows=STATUS_ORDER.map(id=>({
    id,
    label:STATUS[id].label,
    cls:STATUS[id].cls,
    count:counts[id]||0,
    pct:total?Math.round((counts[id]||0)/total*100):0
  }));
  const maxStatus=Math.max(1,...statusRows.map(s=>s.count));
  const roadmap=[0,25,50,75,100];

  return `
    <section class="doors-dashboard" aria-label="Обзор монтажа">
      <header class="dash-head">
        <div>
          <div class="dash-kicker">ОБЗОР МОНТАЖА</div>
          <h2>Все объекты. Один обзор.</h2>
          <p>Ход установки дверей и вопросы, которым нужно внимание.</p>
        </div>
        <div class="dash-date"><span>СЕГОДНЯ</span><strong>${new Date().toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'})}</strong></div>
      </header>

      <nav class="dash-tabs" aria-label="Разделы дашборда">
        <a href="#dashboard-progress">Обзор</a>
        <a href="#dashboard-status">Статусы дверей</a>
        <a href="#dashboard-objects">Объекты</a>
        <a href="#dashboard-attention">Внимание</a>
      </nav>

      <div class="dash-roadmap" style="--dash-progress:${pct}%" aria-label="Общий план выполнен на ${pct}%">
        <div class="dash-roadmap-label"><span>План монтажа</span><strong>${done.toLocaleString('ru')} из ${total.toLocaleString('ru')} дверей</strong></div>
        <div class="dash-roadmap-track" aria-hidden="true">
          ${roadmap.map(mark=>`<span class="dash-milestone ${pct>=mark?'is-reached':''}" style="--mark:${mark}%"><i></i><small>${mark}%</small></span>`).join('')}
        </div>
      </div>

      <section class="dash-metrics" id="dashboard-progress" aria-label="Основные показатели">
        <article class="dash-metric dash-metric-progress">
          <div class="dash-metric-ring" style="--ring-progress:${pct}%" role="img" aria-label="Готово ${pct}%"><span>${pct}%</span></div>
          <div class="dash-metric-copy"><span class="dash-label">Установка дверей</span><strong>${done.toLocaleString('ru')}</strong><small>установлено и принято</small></div>
          <div class="dash-metric-foot"><span>Всего дверей</span><b>${total.toLocaleString('ru')}</b></div>
        </article>
        <article class="dash-metric">
          <span class="dash-label">Осталось завершить</span>
          <strong class="dash-metric-value">${outstanding.toLocaleString('ru')}</strong>
          <small>дверей на всех объектах</small>
          <div class="dash-metric-foot"><span>Объектов в работе</span><b>${activeObjects}</b></div>
        </article>
        <article class="dash-metric dash-metric-alert">
          <span class="dash-label">Замечания</span>
          <strong class="dash-metric-value">${problemCount.toLocaleString('ru')}</strong>
          <small>дверей требуют исправления</small>
          <div class="dash-metric-foot"><span>Новых заявок</span><b>${newRequests}</b></div>
        </article>
      </section>

      <div class="dash-workspace">
        <div class="dash-main-column">
          <section class="dash-installation" id="dashboard-status" aria-label="Двери по статусам">
            <div class="dash-installation-head">
              <div><span class="dash-chart-kicker">ХОД РАБОТ</span><h3>Статусы дверей</h3></div>
              <span class="dash-total-badge">${total.toLocaleString('ru')} всего</span>
            </div>
            <div class="dash-chart-summary"><strong>${pct}%</strong><span>общая готовность<br>${done.toLocaleString('ru')} дверей завершено</span></div>
            <div class="dash-bars" role="list" aria-label="Количество дверей по статусам">
              ${statusRows.map(s=>{
                const height=s.count?Math.max(12,Math.round(s.count/maxStatus*100)):4;
                return `<div class="dash-bar-column ${s.cls}" role="listitem" aria-label="${s.label}: ${s.count}">
                  <span class="dash-bar-count">${s.count}</span>
                  <div class="dash-bar-well"><i style="--bar-height:${height}%"></i></div>
                  <span class="dash-bar-label">${s.label}</span>
                </div>`;
              }).join('')}
            </div>
          </section>

          <section class="dash-objects" id="dashboard-objects" aria-label="Готовность по объектам">
            <div class="dash-section-head"><div><span class="dash-section-kicker">ОБЪЕКТЫ</span><h3>Готовность площадок</h3></div><span>${state.objects.length} объектов</span></div>
            ${objRows.length?`<div class="dash-object-list">${objRows.map(r=>`
              <button type="button" class="dash-object-row" data-open-obj="${r.o.id}" aria-label="Открыть объект ${r.o.name}">
                <span class="dash-object-main"><strong>${r.o.name}</strong><small>${r.done.toLocaleString('ru')} из ${r.total.toLocaleString('ru')} дверей${r.problems?` · ${r.problems} замечаний`:''}</small></span>
                <span class="dash-object-progress"><i><b style="width:${r.pct}%"></b></i><strong>${r.pct}%</strong></span>
              </button>`).join('')}</div>`:`<p class="dash-empty">Объекты пока не добавлены.</p>`}
          </section>
        </div>

        <aside class="dash-attention" id="dashboard-attention" aria-label="Требует внимания">
          <div class="dash-attention-head"><div><span class="dash-section-kicker">КОНТРОЛЬ</span><h3>Требует внимания</h3></div><span class="dash-attention-mark" aria-hidden="true"></span></div>
          <div class="dash-attention-list">
            <div class="dash-attention-item"><span class="dash-attention-dot is-red"></span><span><strong>Проблемные двери</strong><small>Нужно исправить на объекте</small></span><b>${problemCount}</b></div>
            <div class="dash-attention-item"><span class="dash-attention-dot is-lime"></span><span><strong>Заявки бригад</strong><small>Ожидают проверки менеджера</small></span><b>${newRequests}</b></div>
            <div class="dash-attention-item"><span class="dash-attention-dot is-gray"></span><span><strong>Дефицит материалов</strong><small>Позиции с остатком ниже потребности</small></span><b>${shortMaterials.length}</b></div>
          </div>
          <div class="dash-supply-note ${shortMaterials.length?'has-shortage':''}">
            <span class="dash-supply-title">Материалы</span>
            ${shortMaterials.length?`<p>Проверьте ${shortMaterials.length} ${shortMaterials.length===1?'позицию':'позиций'} с нехваткой на складе.</p><span class="dash-short-list">${shortMaterials.slice(0,3).map(m=>m.name).join(' · ')}</span>`:'<p>По текущему расчёту дефицита нет.</p>'}
          </div>
          <div class="dash-attention-foot"><span>Общая готовность</span><strong>${pct}%</strong></div>
        </aside>
      </div>
    </section>
  `;
}
