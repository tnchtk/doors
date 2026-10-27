function warehouseStock(matId){
  let stock=0;
  state.movements.forEach(m=>{
    if(m.matId!==matId) return;
    if(m.type==='in') stock+=m.qty;
    if(m.type==='out') stock-=m.qty;
  });
  return stock;
}

function pageWarehouse(){
  return `
    <div class="panel">
      <div class="panel-head"><h3>Остатки на складе</h3></div>
      <div class="tbl-wrap">
      <table>
        <thead><tr><th>Материал</th><th>Остаток</th><th>Ед.</th></tr></thead>
        <tbody>
          ${MATERIALS.map(m=>{
            const stock=warehouseStock(m.id);
            return `<tr><td>${m.name}</td><td class="mono">${stock}</td><td class="mono" style="color:var(--text-faint)">${m.unit}</td></tr>`;
          }).join('')}
        </tbody>
      </table>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <h3>История движений</h3>
        <button class="btn sm" data-new-movement="1">+ Добавить движение</button>
      </div>
      <div class="tbl-wrap">
      <table>
        <thead><tr><th>Дата</th><th>Тип</th><th>Материал</th><th>Кол-во</th><th>Комментарий</th></tr></thead>
        <tbody>
          ${state.movements.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(m=>{
            const typeLabel = m.type==='in'?'Приход':m.type==='out'?'Выдача':'Перемещение';
            const typeCls = m.type==='in'?'ok':m.type==='out'?'warn':'info';
            return `<tr>
              <td class="mono" style="color:var(--text-faint)">${m.date}</td>
              <td><span class="pill ${typeCls}">${typeLabel}</span></td>
              <td>${MAT_BY_ID[m.matId].name}</td>
              <td class="mono">${m.qty}</td>
              <td style="color:var(--text-dim)">${m.note}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      </div>
    </div>
  `;
}

/* =========================================================================
   PAGE: PURCHASES
   ========================================================================= */
