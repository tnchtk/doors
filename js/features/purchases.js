const PUR_STATUS={created:'Создано', ordered:'Заказано', transit:'В пути', received:'Получено'};
const PUR_STATUS_ORDER=['created','ordered','transit','received'];

function pagePurchases(){
  const shortages=materialsTable(allOpenings(state).map(item=>item.opening)).filter(m=>m.missing>0);
  return `
    <div class="two-col">
      <div class="panel">
        <div class="panel-head"><h3>Активные закупки</h3></div>
        <div class="tbl-wrap">
        <table>
          <thead><tr><th>Материал</th><th>Кол-во</th><th>Поставщик</th><th>Сумма</th><th>Статус</th></tr></thead>
          <tbody>
            ${state.purchases.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(p=>`
              <tr>
                <td>${MAT_BY_ID[p.matId].name}</td>
                <td class="mono">${p.qty} ${MAT_BY_ID[p.matId].unit}</td>
                <td>${p.supplier}</td>
                <td class="mono">${(p.qty*p.price).toLocaleString('ru')} сом</td>
                <td>
                  <select class="req-status-select" data-pur-status="${p.id}">
                    ${PUR_STATUS_ORDER.map(s=>`<option value="${s}" ${s===p.status?'selected':''}>${PUR_STATUS[s]}</option>`).join('')}
                  </select>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        </div>
      </div>
      <div class="panel">
        <div class="panel-head"><h3>Требуют закупки</h3></div>
        ${shortages.length===0?`<div class="empty">Критических остатков нет</div>`:shortages.map(m=>`
          <div class="reqline">
            <div>
              <div style="font-size:13px;font-weight:600;">${m.name}</div>
              <div style="font-size:11.5px;color:var(--text-faint);">требуется ${m.missing} ${m.unit}</div>
            </div>
            <button class="btn sm primary" data-new-purchase='${JSON.stringify({matId:m.id, qty:m.missing})}'>Создать</button>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

/* =========================================================================
   PAGE: PROBLEMS
   ========================================================================= */
