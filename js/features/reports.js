function pageReports(){
  const doors=allDoors(state);
  const total=doors.length;
  const done=doneCount(countByStatus(doors));
  const weekPlan = Math.round(total*0.05);
  const weekFact = Math.round(weekPlan*0.926);

  return `
      ${canManageWorkspace()?avrGeneratorPanel():''}
    <div class="panel">
      <div class="panel-head"><h3>За сегодня</h3></div>
      <div style="font-size:13px;color:var(--text-dim);margin-bottom:10px;">Установлено: <strong class="mono" style="color:var(--text)">${state.brigades.reduce((s,b)=>s+installedTodayFor(b.id),0)}</strong> дверей</div>
      ${state.brigades.map(b=>`<div class="reqline"><span>${b.name}</span><strong class="mono">${installedTodayFor(b.id)}</strong></div>`).join('')}
    </div>

    <div class="panel">
      <div class="panel-head"><h3>За неделю</h3></div>
      <div class="reqline"><span>План</span><strong class="mono">${weekPlan}</strong></div>
      <div class="reqline"><span>Факт</span><strong class="mono">${weekFact}</strong></div>
      <div class="reqline"><span>Выполнение</span><strong class="mono" style="color:var(--ok)">${weekPlan?Math.round(weekFact/weekPlan*1000)/10:0}%</strong></div>
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

function avrGeneratorPanel(){
  const objects=activeObjects(state);
  const firstObject=objects[0];
  const initialBlocks=firstObject?.blocks||[];
  return `
    <section class="panel avr-generator" aria-label="Генерация акта выполненных работ">
      <div class="panel-head"><div><h3>Акт выполненных работ (АВР)</h3><span class="hint">Сформируйте акт по всему объекту или одному блоку</span></div></div>
      <form data-avr-form>
        <div class="avr-controls">
          <div class="field"><label for="avrObject">Объект</label><select id="avrObject" name="object_id" data-avr-object required ${objects.length?'':'disabled'}>
            ${objects.map(object=>`<option value="${htmlEscape(object.id)}">${htmlEscape(object.name)}</option>`).join('')||'<option value="">Сначала добавьте объект</option>'}
          </select></div>
          <div class="field"><label for="avrBlock">Блок</label><select id="avrBlock" name="block_id" data-avr-block ${objects.length?'':'disabled'}>
            <option value="">Весь объект</option>${initialBlocks.map(block=>`<option value="${htmlEscape(block.id)}">${htmlEscape(block.name)}</option>`).join('')}
          </select></div>
          <div class="field"><label for="avrUnitPrice">Цена монтажа одной двери</label><input id="avrUnitPrice" name="unit_price" type="number" min="0" step="0.01" inputmode="decimal" placeholder="По договору, необязательно"></div>
        </div>
        <div class="avr-form-foot"><p>В акт попадут только проёмы, принятые менеджером. Количество дверей будет сгруппировано по типу работ и блоку.</p><button class="btn primary" type="submit" ${objects.length?'':'disabled'}>Сформировать АВР</button></div>
      </form>
    </section>
  `;
}

function bindAvrEvents(container){
  if(!canManageWorkspace())return;
  const form=container.querySelector('[data-avr-form]');
  if(!form)return;
  const objectSelect=form.querySelector('[data-avr-object]');
  const blockSelect=form.querySelector('[data-avr-block]');

  objectSelect.addEventListener('change',()=>{
    const object=activeObjects(state).find(item=>item.id===objectSelect.value);
    blockSelect.innerHTML=`<option value="">Весь объект</option>${(object?.blocks||[]).map(block=>`<option value="${htmlEscape(block.id)}">${htmlEscape(block.name)}</option>`).join('')}`;
  });

  form.addEventListener('submit',event=>{
    event.preventDefault();
    const values=Object.fromEntries(new FormData(form).entries());
    const object=activeObjects(state).find(item=>item.id===values.object_id);
    if(!object){toast('Выберите объект');return;}
    const block=values.block_id?object.blocks.find(item=>item.id===values.block_id):null;
    if(values.block_id&&!block){toast('Выберите блок из этого объекта');return;}
    const rawPrice=String(values.unit_price||'').trim();
    const unitPrice=rawPrice===''?null:Number(rawPrice);
    if(unitPrice!==null&&(!Number.isFinite(unitPrice)||unitPrice<0)){toast('Проверьте цену за дверь');return;}

    const selectedBlocks=block?[block]:object.blocks;
    const rows=selectedBlocks.flatMap(item=>acceptedRowsForBlock(item)).filter(row=>row.count>0);
    if(!rows.length){toast('В выбранном разделе пока нет принятых проёмов');return;}
    const materialRows=acceptedMaterialRowsForBlocks(selectedBlocks);

    const printWindow=window.open('','_blank');
    if(!printWindow){toast('Разрешите всплывающие окна, чтобы открыть АВР для печати');return;}
    printWindow.document.open();
    printWindow.document.write(avrPrintDocument(object,block,rows,materialRows,unitPrice));
    printWindow.document.close();
  });
}

function acceptedOpeningsForBlock(block){
  const openings=[];
  (block.floors||[]).forEach(floor=>(floor.apartments||[]).forEach(apartment=>(apartment.openings||[]).forEach(opening=>{
    if(acceptedOpening(opening))openings.push(opening);
  })));
  return openings;
}

function acceptedRowsForBlock(block){
  const groups=new Map();
  acceptedOpeningsForBlock(block).forEach(opening=>{
    const type=opening.type||'legacy';
    const row=groups.get(type)||{block,type,count:0,openingCount:0};
    row.count+=openingDoorCount(opening);row.openingCount++;groups.set(type,row);
  });
  return [...groups.values()];
}

function acceptedMaterialRowsForBlocks(blocks){
  const required={};
  blocks.forEach(block=>acceptedOpeningsForBlock(block).forEach(opening=>{
    Object.entries(openingMaterialNeeds(opening)).forEach(([materialId,quantity])=>{
      required[materialId]=(required[materialId]||0)+quantity;
    });
  }));
  return MATERIALS
    .map(material=>({...material,quantity:Number((required[material.id]||0).toFixed(2))}))
    .filter(material=>material.quantity>0);
}

function avrPrintDocument(object,block,rows,materialRows,unitPrice){
  const total=rows.reduce((sum,row)=>sum+row.count,0);
  const date=new Date().toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'});
  const money=value=>new Intl.NumberFormat('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2}).format(value);
  const quantity=value=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(value);
  const bodyRows=rows.map((row,index)=>{
    const amount=unitPrice===null?'':money(row.count*unitPrice);
    const typeLabel={large:'Монтаж дверей со стеклом · большие проёмы',kitchen:'Монтаж кухонных дверей со стеклом',toilet:'Монтаж туалетных дверей с коробкой и порогом',custom:'Монтаж нестандартных дверей',legacy:'Монтаж дверей · старая запись'}[row.type]||'Монтаж дверей';
    const scope=block?`${typeLabel}`:`${htmlEscape(row.block.name)} · ${typeLabel}`;
    return `<tr><td>${index+1}</td><td>${scope}</td><td>шт.</td><td class="num">${row.count}</td><td class="num">${unitPrice===null?'':money(unitPrice)}</td><td class="num">${amount}</td></tr>`;
  }).join('');
  const materialBody=materialRows.map((material,index)=>`<tr><td>${index+1}</td><td>${htmlEscape(material.name)}</td><td>${htmlEscape(material.unit)}</td><td class="num">${quantity(material.quantity)}</td></tr>`).join('');
  const totalAmount=unitPrice===null?'':money(total*unitPrice);
  const blockLabel=block?htmlEscape(block.name):'Все блоки объекта';

  return `<!doctype html>
<html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>АВР · ${htmlEscape(object.name)}</title>
<style>
  *{box-sizing:border-box}body{margin:0;background:#f2f2f2;color:#202020;font-family:Arial,"Helvetica Neue",sans-serif;font-size:12pt;line-height:1.45}.sheet{width:min(210mm,100%);min-height:297mm;margin:24px auto;padding:18mm 17mm;background:#fff;box-shadow:0 5px 24px rgba(0,0,0,.12)}h1{margin:0;text-align:center;font-size:18pt;line-height:1.2;letter-spacing:.025em}h2{margin:22px 0 9px;font-size:12pt;line-height:1.3}.subtitle{text-align:center;margin:5px 0 20px;font-size:11pt}.act-date{text-align:right;margin-bottom:18px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:9px 24px;margin-bottom:18px}.meta p{margin:0}.meta .wide{grid-column:1/-1}.line{display:inline-block;min-width:85px;border-bottom:1px solid #777}.line.long{min-width:210px}.table-wrap{width:100%;overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:10pt}th,td{border:1px solid #777;padding:8px 7px;vertical-align:top}th{background:#f0f0f0;text-align:center;font-weight:600}td:first-child,td:nth-child(3){text-align:center}td.num{text-align:right;white-space:nowrap}tfoot td{font-weight:700}.materials-note{margin:7px 0;color:#555;font-size:9pt}.statement{margin:18px 0 28px}.signatures{display:grid;grid-template-columns:1fr 1fr;gap:36px}.signature{min-height:94px}.signature strong{display:block;margin-bottom:15px}.signature p{margin:8px 0}.note{margin-top:20px;color:#555;font-size:9pt}.toolbar{width:min(210mm,100%);margin:18px auto;display:flex;justify-content:flex-end;gap:8px}.toolbar button{border:0;border-radius:8px;padding:10px 16px;background:#202020;color:#fff;font-size:14px;cursor:pointer}.toolbar button:hover{background:#424242}@page{size:A4;margin:0}@media print{body{background:#fff}.sheet{width:210mm;min-height:297mm;margin:0;padding:18mm 17mm;box-shadow:none}.toolbar{display:none}}@media(max-width:640px){.sheet{margin:0;padding:20px 16px;min-height:100vh}.meta,.signatures{grid-template-columns:1fr}.meta .wide{grid-column:auto}.toolbar{padding:0 16px}.table-wrap{overflow-x:auto}}
</style></head><body>
<div class="toolbar"><button type="button" onclick="window.print()">Печать / Сохранить PDF</button></div>
<main class="sheet">
  <h1>АКТ ВЫПОЛНЕННЫХ РАБОТ</h1><p class="subtitle">по монтажу дверей</p>
  <div class="act-date">№ <span class="line"></span> от ${date}</div>
  <section class="meta">
    <p class="wide"><strong>Объект:</strong> ${htmlEscape(object.name)}</p>
    <p><strong>Раздел:</strong> ${blockLabel}</p>
    <p><strong>Договор №</strong> <span class="line"></span></p>
    <p class="wide"><strong>Период выполнения:</strong> с <span class="line"></span> по <span class="line"></span></p>
    <p class="wide"><strong>Заказчик:</strong> <span class="line long"></span></p>
    <p class="wide"><strong>Исполнитель:</strong> <span class="line long"></span></p>
  </section>
  <div class="table-wrap"><table><thead><tr><th>№</th><th>Наименование работ</th><th>Ед.</th><th>Кол-во</th><th>Цена</th><th>Сумма</th></tr></thead><tbody>${bodyRows}</tbody><tfoot><tr><td colspan="3">Итого</td><td class="num">${total}</td><td></td><td class="num">${totalAmount}</td></tr></tfoot></table></div>
  <h2>Материалы по принятым проёмам</h2>
  <p class="materials-note">Количество рассчитано по составу каждого принятого проёма и числу дверей в нём.</p>
  <div class="table-wrap"><table><thead><tr><th>№</th><th>Наименование материала</th><th>Ед.</th><th>Количество</th></tr></thead><tbody>${materialBody}</tbody></table></div>
  <p class="statement">Работы по монтажу дверей выполнены в указанном объёме. Настоящий акт составлен для подтверждения выполненных работ.</p>
  <section class="signatures">
    <div class="signature"><strong>Заказчик</strong><p>ФИО: <span class="line long"></span></p><p>Подпись: <span class="line"></span> &nbsp; Дата: <span class="line"></span></p></div>
    <div class="signature"><strong>Исполнитель</strong><p>ФИО: <span class="line long"></span></p><p>Подпись: <span class="line"></span> &nbsp; Дата: <span class="line"></span></p></div>
  </section>
  <p class="note">В документ включены только проёмы со статусом «Принято» в системе учёта.</p>
</main>
<script>window.addEventListener('load',()=>{window.focus();window.print();});<\/script></body></html>`;
}
