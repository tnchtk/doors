const REQ_STATUS = {new:'Новая', in_progress:'В обработке', collected:'Собрано', delivered:'Передано', received:'Получено'};
const REQ_STATUS_ORDER = ['new','in_progress','collected','delivered','received'];

function pageSupply(){
  const shortageByObj = state.objects.map(o=>{
    const od=openingsForObject(state,o.id).map(item=>item.opening);
    const mt=materialsTable(od).filter(m=>m.missing>0);
    return {o, mt};
  });

  return `
    <div class="two-col">
      <div class="panel">
        <div class="panel-head"><h3>Заявки от бригад</h3><span class="hint">${state.requests.length} заявок</span></div>
        ${state.requests.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(r=>{
          const brigade=state.brigades.find(x=>x.id===r.brigadeId);
          const obj=findObj(r.objId);
          return `<div class="reqline" style="flex-direction:column;align-items:stretch;gap:6px;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <strong style="font-size:13px;">${r.status==='new'?'<span class="inline-dot bad" aria-hidden="true"></span>':''}Заявка №${r.id.replace('req','')} — ${obj?obj.name:''}, ${r.blockName}, ${r.floor} эт., кв. ${r.apt}</strong>
              <select class="req-status-select" data-req-status="${r.id}">
                ${REQ_STATUS_ORDER.map(s=>`<option value="${s}" ${s===r.status?'selected':''}>${REQ_STATUS[s]}</option>`).join('')}
              </select>
            </div>
            <div style="font-size:12px;color:var(--text-dim);">
              ${brigade?brigade.name:''} · ${r.items.map(it=>`${MAT_BY_ID[it.matId].name} ${it.qty} ${MAT_BY_ID[it.matId].unit}`).join(', ')}
              ${r.comment?`<div style="margin-top:3px;font-style:italic;color:var(--text-faint);">«${r.comment}»</div>`:''}
            </div>
          </div>`;
        }).join('')}
      </div>

      <div class="panel">
        <div class="panel-head"><h3>Потребность по объектам</h3></div>
        ${shortageByObj.map(({o,mt})=>`
          <div style="margin-bottom:16px;">
            <div style="font-size:13px;font-weight:600;margin-bottom:8px;">${o.name}</div>
            ${mt.length===0 ? `<div style="font-size:12px;color:var(--ok);"><span class="inline-dot ok" aria-hidden="true"></span>Материалов хватает</div>` :
              mt.map(m=>`<div class="reqline" style="padding:6px 0;">
                <span style="font-size:12px;color:var(--text-dim)">${m.name}</span>
                <span class="pill bad"><span class="inline-dot bad" aria-hidden="true"></span>Не хватает ${m.missing} ${m.unit}</span>
              </div>`).join('')
            }
          </div>
        `).join('')}
      </div>
    </div>

    <div class="panel">
      <div class="panel-head"><h3>Сводная таблица материалов (все объекты)</h3></div>
      <div class="tbl-wrap">
      <table>
        <thead><tr><th>Материал</th><th>Нужно</th><th>Есть</th><th>Не хватает</th><th>Статус</th></tr></thead>
        <tbody>
          ${materialsTable(allOpenings(state).map(item=>item.opening)).map(m=>`
            <tr>
              <td>${m.name}</td>
              <td class="mono">${m.needed}</td>
              <td class="mono">${m.have}</td>
              <td class="mono">${m.missing||'—'}</td>
              <td>${m.missing>0?'<span class="pill bad"><span class="inline-dot bad" aria-hidden="true"></span>Нехватка</span>':'<span class="pill ok"><span class="inline-dot ok" aria-hidden="true"></span>Достаточно</span>'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      </div>
    </div>
  `;
}

/* =========================================================================
   PAGE: WAREHOUSE
   ========================================================================= */
