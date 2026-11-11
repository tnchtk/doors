/* Заказы материалов: создание по этажам, приёмка, отмена и документы Excel/PDF. */

function orderAuthorLabel(){
  if(!cloudEnabled)return 'Менеджер';
  return (cloudProfile?.full_name||cloudProfile?.email||cloudUser?.email||'Менеджер').trim();
}

function nextOrderNumber(){
  return ordersList().reduce((max,order)=>Math.max(max,Number(order.number)||0),0)+1;
}

function floorGroupsForOrder(candidates){
  const groups=new Map();
  candidates.forEach(item=>{
    if(!groups.has(item.floor.id))groups.set(item.floor.id,{block:item.block,floor:item.floor,items:[]});
    groups.get(item.floor.id).items.push(item);
  });
  return [...groups.values()];
}

function openOrderBuilder(scope){
  if(!canOrderMaterials()){toast('Заказывать материалы может администратор или менеджер');return;}
  const obj=state.objects.find(item=>item.id===scope.objId);
  if(!obj)return;
  const candidates=orderableOpenings(obj,scope);
  if(!candidates.length){toast('Нет дверей, которые ещё не заказаны');return;}
  const groups=floorGroupsForOrder(candidates);
  const overlay=document.createElement('div');
  overlay.className='overlay';
  overlay.innerHTML=`<div class="modal order-modal" role="dialog" aria-modal="true" aria-labelledby="orderTitle">
    <h3 id="orderTitle">Заказ материалов · ${htmlEscape(obj.name)}</h3>
    <p class="hint">В заказ попадают двери, которые ещё не заказывали. Отметьте этажи, которые заказываем сейчас. Количества округлены вверх, их можно поправить. «Свободно» — остаток склада за вычетом материалов, уже закреплённых за заказанными дверями.</p>
    <div class="order-floors">${groups.map(group=>{
      const doors=group.items.reduce((sum,item)=>sum+(item.opening.doors||[]).length,0);
      return `<label class="order-floor"><input type="checkbox" checked data-order-floor="${htmlEscape(group.floor.id)}"><span><strong>${htmlEscape(group.block.name)} · ${htmlEscape(group.floor.num)} этаж</strong><span class="hint">${group.items.length} ${ruPlural(group.items.length,'проём','проёма','проёмов')} · ${doors} ${ruPlural(doors,'дверь','двери','дверей')}</span></span></label>`;
    }).join('')}</div>
    <div class="order-rows" data-order-rows></div>
    <label class="field"><span>Комментарий (необязательно)</span><textarea rows="2" maxlength="1000" data-order-comment></textarea></label>
    <div class="modal-actions"><button type="button" class="btn ghost" data-cancel>Отмена</button><button type="button" class="btn primary" data-confirm>Создать заказ</button></div>
  </div>`;
  document.body.appendChild(overlay);
  const close=()=>overlay.remove();
  overlay.querySelector('[data-cancel]').addEventListener('click',close);
  overlay.addEventListener('click',event=>{if(event.target===overlay)close();});

  const selectedItems=()=>{
    const ids=new Set([...overlay.querySelectorAll('[data-order-floor]:checked')].map(input=>input.dataset.orderFloor));
    return candidates.filter(item=>ids.has(item.floor.id));
  };
  const rowHtml=row=>`<div class="order-row"><span class="order-row-name">${htmlEscape(row.name)}</span><span class="order-row-num" data-label="Нужно">${row.need}</span><span class="order-row-num" data-label="Свободно">${row.stock===null?'—':row.stock}</span><input type="number" min="0" step="1" inputmode="numeric" value="${row.qty}" data-order-qty="${htmlEscape(row.key)}" aria-label="Заказать: ${htmlEscape(row.name)}"></div>`;
  const renderRows=()=>{
    const {doorRows,materialRows}=buildOrderRows(selectedItems());
    overlay.querySelector('[data-order-rows]').innerHTML=!doorRows.length&&!materialRows.length?'<div class="empty">Выберите хотя бы один этаж</div>':`
      <div class="order-row order-row-head"><span>Позиция</span><span>Нужно</span><span>Свободно</span><span>Заказать</span></div>
      ${doorRows.length?`<div class="order-section">Двери</div>${doorRows.map(rowHtml).join('')}`:''}
      ${materialRows.length?`<div class="order-section">Комплектующие</div>${materialRows.map(rowHtml).join('')}`:''}`;
    overlay.querySelector('[data-order-rows]')._rows=[...doorRows,...materialRows];
  };
  overlay.querySelectorAll('[data-order-floor]').forEach(input=>input.addEventListener('change',renderRows));
  renderRows();

  overlay.querySelector('[data-confirm]').addEventListener('click',async event=>{
    const selected=selectedItems();
    const rows=overlay.querySelector('[data-order-rows]')._rows||[];
    if(!selected.length){toast('Выберите хотя бы один этаж');return;}
    const items=[];
    for(const row of rows){
      const input=overlay.querySelector(`[data-order-qty="${CSS.escape(row.key)}"]`);
      const qty=Number(input?.value);
      if(!Number.isInteger(qty)||qty<0){toast(`Проверьте количество: ${row.name}`);return;}
      if(qty>0)items.push({...row,qty,receivedQty:0});
    }
    if(!items.length){toast('Нечего заказывать: везде нулевое количество');return;}
    const button=event.currentTarget;
    button.disabled=true;button.textContent='Сохраняем…';
    const previousState=JSON.parse(JSON.stringify(state));
    const now=new Date();
    const floorIds=[...new Set(selected.map(item=>item.floor.id))];
    const order={
      id:newRecordId('ord'),kind:'order',number:nextOrderNumber(),
      date:now.toISOString().slice(0,10),createdAt:now.toISOString(),createdBy:orderAuthorLabel(),
      objId:obj.id,objName:obj.name,
      scope:floorIds.map(id=>{const item=selected.find(entry=>entry.floor.id===id);return {blockId:item.block.id,blockName:item.block.name,floorId:id,floorNum:item.floor.num,openings:selected.filter(entry=>entry.floor.id===id).length};}),
      items,status:'created',comment:overlay.querySelector('[data-order-comment]').value.trim(),
      openingIds:selected.map(item=>item.opening.id),
    };
    state.purchases=Array.isArray(state.purchases)?state.purchases:[];
    state.purchases.unshift(order);
    selected.forEach(item=>{item.opening.orderId=order.id;});
    try{
      await saveManagerOpeningState();
      close();
      toast(`Заказ №${order.number} создан`);
      goto('purchases',{});
      offerOrderDownload(order);
    }catch(error){
      state=previousState;
      button.disabled=false;button.textContent='Создать заказ';
      toast(error.message||'Не удалось создать заказ');
      render();
    }
  });
}

// После создания сразу предлагаем скачать документ.
function offerOrderDownload(order){
  const overlay=document.createElement('div');
  overlay.className='overlay';
  overlay.innerHTML=`<div class="modal" role="dialog" aria-modal="true"><h3>Заказ №${htmlEscape(order.number)} создан</h3><p class="hint">Скачайте документ на закуп. Он всегда доступен в карточке заказа.</p>
    <div class="modal-actions"><button type="button" class="btn ghost" data-cancel>Закрыть</button><button type="button" class="btn" data-doc="xlsx">Скачать Excel</button><button type="button" class="btn primary" data-doc="pdf">Скачать PDF</button></div></div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click',event=>{if(event.target===overlay)overlay.remove();});
  overlay.querySelector('[data-cancel]').addEventListener('click',()=>overlay.remove());
  overlay.querySelectorAll('[data-doc]').forEach(button=>button.addEventListener('click',()=>downloadOrderDoc(order,button.dataset.doc,button)));
}

function openOrderReceive(orderId){
  const order=ordersList().find(item=>item.id===orderId);
  if(!order)return;
  const overlay=document.createElement('div');
  overlay.className='overlay';
  overlay.innerHTML=`<div class="modal order-modal" role="dialog" aria-modal="true"><h3>Приёмка · заказ №${htmlEscape(order.number)}</h3>
    <p class="hint">Укажите, сколько фактически привезли. Принятое сразу попадает на склад. Остаток можно принять позже.</p>
    <div class="order-rows">
      <div class="order-row order-row-head order-receive-head"><span>Позиция</span><span>Заказано</span><span>Осталось</span><span>Принять</span></div>
      ${order.items.map((item,index)=>{
        const left=Math.max(0,Number(item.qty)-Number(item.receivedQty||0));
        return `<div class="order-row"><span class="order-row-name">${htmlEscape(item.name)}</span><span class="order-row-num" data-label="Заказано">${htmlEscape(item.qty)}</span><span class="order-row-num" data-label="Осталось">${left}</span><input type="number" min="0" step="1" inputmode="numeric" value="${left}" data-receive-index="${index}" aria-label="Принять: ${htmlEscape(item.name)}"></div>`;
      }).join('')}
    </div>
    <div class="modal-actions"><button type="button" class="btn ghost" data-cancel>Отмена</button><button type="button" class="btn primary" data-confirm>Принять на склад</button></div></div>`;
  document.body.appendChild(overlay);
  const close=()=>overlay.remove();
  overlay.querySelector('[data-cancel]').addEventListener('click',close);
  overlay.addEventListener('click',event=>{if(event.target===overlay)close();});
  overlay.querySelector('[data-confirm]').addEventListener('click',async event=>{
    const adds=[...overlay.querySelectorAll('[data-receive-index]')].map(input=>({index:Number(input.dataset.receiveIndex),qty:Number(input.value)}));
    if(adds.some(add=>!Number.isInteger(add.qty)||add.qty<0)){toast('Количество должно быть целым числом от нуля');return;}
    const received=adds.filter(add=>add.qty>0);
    if(!received.length){toast('Укажите, сколько принято');return;}
    const button=event.currentTarget;
    button.disabled=true;button.textContent='Сохраняем…';
    const previousState=JSON.parse(JSON.stringify(state));
    const today=new Date().toISOString().slice(0,10);
    state.movements=Array.isArray(state.movements)?state.movements:[];
    received.forEach(add=>{
      const item=order.items[add.index];
      item.receivedQty=Number(item.receivedQty||0)+add.qty;
      state.movements.unshift({
        id:newRecordId('m'),type:'in',matId:item.kind==='door'?'polotno':item.matId,qty:add.qty,
        note:`Приёмка заказа №${order.number}${item.kind==='door'?` · ${item.name}`:''}`,date:today,orderId:order.id,
      });
    });
    order.status=order.items.every(item=>Number(item.receivedQty||0)>=Number(item.qty))?'received':'partial';
    try{
      await saveManagerOpeningState();
      close();
      toast(order.status==='received'?'Заказ принят полностью, склад обновлён':'Принято частично, склад обновлён');
      render();
    }catch(error){
      state=previousState;
      button.disabled=false;button.textContent='Принять на склад';
      toast(error.message||'Не удалось сохранить приёмку');
      render();
    }
  });
}

async function setOrderStatus(orderId,status){
  const order=ordersList().find(item=>item.id===orderId);
  if(!order||!ORDER_MANUAL_STATUSES.includes(status))return;
  const previousState=JSON.parse(JSON.stringify(state));
  order.status=status;
  try{await saveManagerOpeningState();toast('Статус заказа обновлён');}
  catch(error){state=previousState;toast(error.message||'Не удалось обновить статус');}
  render();
}

async function cancelOrder(orderId){
  const order=ordersList().find(item=>item.id===orderId);
  if(!order)return;
  if(orderTotals(order).received>0){toast('По заказу уже есть приёмка, отменить его нельзя');return;}
  if(!confirm(`Отменить заказ №${order.number}? Двери из него снова появятся в списке «К заказу».`))return;
  const previousState=JSON.parse(JSON.stringify(state));
  (state.objects||[]).forEach(obj=>(obj.blocks||[]).forEach(block=>(block.floors||[]).forEach(floor=>(floor.apartments||[]).forEach(apt=>(apt.openings||[]).forEach(opening=>{
    if(opening.orderId===order.id)delete opening.orderId;
  })))));
  order.status='cancelled';
  try{await saveManagerOpeningState();toast('Заказ отменён');}
  catch(error){state=previousState;toast(error.message||'Не удалось отменить заказ');}
  render();
}

/* ---------- Документы ---------- */

function downloadBlob(blob,name){
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');
  link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
}

function loadLibraryOnce(url,globalName){
  return new Promise((resolve,reject)=>{
    if(window[globalName])return resolve(window[globalName]);
    const script=document.createElement('script');
    script.src=url;
    script.onload=()=>window[globalName]?resolve(window[globalName]):reject(new Error('Библиотека не запустилась'));
    script.onerror=()=>reject(new Error('Не удалось загрузить библиотеку для документа. Проверьте интернет.'));
    document.head.appendChild(script);
  });
}

function orderFileName(order,extension){
  return `zayavka-na-zakup-${order.number}-${String(order.date).slice(0,10)}.${extension}`;
}

function orderDocModel(order){
  return {
    number:order.number,
    date:orderDateLabel(order.date),
    object:order.objName||'',
    scope:orderScopeLabel(order),
    author:order.createdBy||'',
    comment:order.comment||'',
    doors:order.items.filter(item=>item.kind==='door'),
    materials:order.items.filter(item=>item.kind!=='door'),
  };
}

async function downloadOrderDoc(order,format,button){
  const original=button?.textContent;
  if(button){button.disabled=true;button.textContent='Готовим…';}
  try{
    if(format==='xlsx')await downloadOrderXlsx(order);
    else await downloadOrderPdf(order);
    toast(format==='xlsx'?'Excel сохранён':'PDF сохранён');
  }catch(error){
    toast(error.message||'Не удалось подготовить документ');
  }finally{
    if(button){button.disabled=false;button.textContent=original;}
  }
}

async function downloadOrderXlsx(order){
  const ExcelJS=await loadLibraryOnce('https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js','ExcelJS');
  const doc=orderDocModel(order);
  const NAVY='FF1D2145',LIME='FFB7ED55',SOFT='FFF3F6FB',LINE='FFC9D1DD';
  const workbook=new ExcelJS.Workbook();
  workbook.creator='ИСНУР';
  const sheet=workbook.addWorksheet('Заявка на закуп',{pageSetup:{paperSize:9,orientation:'portrait',fitToPage:true,fitToWidth:1,fitToHeight:0,margins:{left:.5,right:.5,top:.6,bottom:.6,header:.3,footer:.3}},views:[{showGridLines:false}]});
  sheet.columns=[{width:6},{width:56},{width:11},{width:16}];
  const border={top:{style:'thin',color:{argb:LINE}},left:{style:'thin',color:{argb:LINE}},bottom:{style:'thin',color:{argb:LINE}},right:{style:'thin',color:{argb:LINE}}};

  sheet.mergeCells('A1:D1');
  const brand=sheet.getCell('A1');brand.value='ИСНУР · Инженерное строительство';brand.font={name:'Calibri',size:11,bold:true,color:{argb:NAVY}};
  sheet.getRow(1).height=20;
  sheet.mergeCells('A2:D2');
  const title=sheet.getCell('A2');title.value=`ЗАЯВКА НА ЗАКУП № ${doc.number}`;title.font={name:'Calibri',size:20,bold:true,color:{argb:NAVY}};
  title.alignment={vertical:'middle'};sheet.getRow(2).height=34;
  sheet.mergeCells('A3:D3');
  sheet.getCell('A3').fill={type:'pattern',pattern:'solid',fgColor:{argb:LIME}};sheet.getRow(3).height=4;

  const info=[['Дата',doc.date],['Объект',doc.object],['Этажи',doc.scope],['Составил',doc.author]];
  info.forEach(([label,value],index)=>{
    const rowNumber=5+index;
    sheet.mergeCells(`B${rowNumber}:D${rowNumber}`);
    const a=sheet.getCell(`A${rowNumber}`);a.value=label;a.font={name:'Calibri',size:10,bold:true,color:{argb:'FF5B647A'}};
    const b=sheet.getCell(`B${rowNumber}`);b.value=value;b.font={name:'Calibri',size:11,color:{argb:NAVY}};b.alignment={wrapText:true,vertical:'top'};
    if(label==='Этажи')sheet.getRow(rowNumber).height=Math.max(18,Math.ceil(String(value).length/60)*16);
  });
  sheet.getColumn(1).width=10;

  let row=10;
  const section=(titleText,items)=>{
    if(!items.length)return;
    sheet.mergeCells(`A${row}:D${row}`);
    const head=sheet.getCell(`A${row}`);head.value=titleText;head.font={name:'Calibri',size:12,bold:true,color:{argb:NAVY}};
    sheet.getRow(row).height=22;row++;
    ['№','Наименование','Ед. изм.','Количество'].forEach((label,index)=>{
      const cell=sheet.getCell(row,index+1);cell.value=label;
      cell.font={name:'Calibri',size:10,bold:true,color:{argb:'FFFFFFFF'}};
      cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:NAVY}};cell.border=border;
      cell.alignment={horizontal:index===1?'left':'center',vertical:'middle',indent:index===1?1:0};
    });
    sheet.getRow(row).height=22;row++;
    items.forEach((item,index)=>{
      const values=[index+1,item.name,item.unit,Number(item.qty)];
      values.forEach((value,column)=>{
        const cell=sheet.getCell(row,column+1);cell.value=value;
        cell.font={name:'Calibri',size:11,bold:column===3,color:{argb:NAVY}};cell.border=border;
        if(index%2)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:SOFT}};
        cell.alignment={horizontal:column===1?'left':'center',vertical:'middle',indent:column===1?1:0};
      });
      sheet.getRow(row).height=20;row++;
    });
    row++;
  };
  section('Двери',doc.doors);
  section('Комплектующие',doc.materials);

  if(doc.comment){
    sheet.mergeCells(`A${row}:D${row}`);
    const c=sheet.getCell(`A${row}`);c.value=`Комментарий: ${doc.comment}`;c.font={name:'Calibri',size:10,italic:true,color:{argb:'FF5B647A'}};c.alignment={wrapText:true,vertical:'top'};
    sheet.getRow(row).height=Math.max(18,Math.ceil(doc.comment.length/80)*15);row+=2;
  }
  row++;
  [['Составил','Дата'],['Утвердил','Дата']].forEach(([who,when])=>{
    sheet.mergeCells(`A${row}:B${row}`);
    const a=sheet.getCell(`A${row}`);a.value=`${who}: ______________________  /  ______________________ /`;a.font={name:'Calibri',size:11,color:{argb:NAVY}};
    sheet.mergeCells(`C${row}:D${row}`);
    const b=sheet.getCell(`C${row}`);b.value=`${when}: ____________`;b.font={name:'Calibri',size:11,color:{argb:NAVY}};
    sheet.getRow(row).height=30;row++;
  });
  const buffer=await workbook.xlsx.writeBuffer();
  downloadBlob(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),orderFileName(order,'xlsx'));
}

function orderPdfHtml(order){
  const doc=orderDocModel(order);
  const table=(heading,items)=>items.length?`<h3>${htmlEscape(heading)}</h3><table><thead><tr><th class="c" style="width:36px">№</th><th>Наименование</th><th class="c" style="width:70px">Ед. изм.</th><th class="c" style="width:90px">Количество</th></tr></thead><tbody>${items.map((item,index)=>`<tr><td class="c">${index+1}</td><td>${htmlEscape(item.name)}</td><td class="c">${htmlEscape(item.unit)}</td><td class="c b">${htmlEscape(item.qty)}</td></tr>`).join('')}</tbody></table>`:'';
  return `<div class="order-pdf" style="width:690px;font-family:'IBM Plex Sans',Arial,sans-serif;color:#1d2145;background:#fff;padding:0">
    <style>
      .order-pdf *{box-sizing:border-box}
      .order-pdf .top{display:flex;align-items:center;justify-content:space-between;padding-bottom:14px}
      .order-pdf .top img{height:40px;width:auto}
      .order-pdf .top .num{text-align:right}
      .order-pdf .top .num b{display:block;font-size:20px;letter-spacing:-.01em}
      .order-pdf .top .num span{font-size:12px;color:#5b647a}
      .order-pdf .bar{height:5px;background:#b7ed55;border-radius:3px;margin-bottom:16px}
      .order-pdf .info{display:grid;grid-template-columns:90px 1fr;row-gap:7px;font-size:13px;margin-bottom:6px}
      .order-pdf .info dt{color:#5b647a;font-weight:600;margin:0}
      .order-pdf .info dd{margin:0}
      .order-pdf h3{font-size:14px;margin:20px 0 8px}
      .order-pdf table{width:100%;border-collapse:collapse;font-size:12.5px}
      .order-pdf th{background:#1d2145;color:#fff;text-align:left;padding:8px 10px;font-weight:600}
      .order-pdf td{padding:8px 10px;border-bottom:1px solid #dde3ec}
      .order-pdf tr:nth-child(even) td{background:#f3f6fb}
      .order-pdf tr{page-break-inside:avoid}
      .order-pdf .c{text-align:center}
      .order-pdf .b{font-weight:700}
      .order-pdf .note{margin-top:16px;font-size:12px;color:#5b647a;font-style:italic}
      .order-pdf .sign{margin-top:46px;display:grid;grid-template-columns:1fr 1fr;gap:34px 40px;font-size:12.5px;page-break-inside:avoid}
      .order-pdf .sign div{border-top:1px solid #1d2145;padding-top:6px;color:#5b647a;font-size:11.5px}
    </style>
    <div class="top"><img src="${new URL('assets/isnur-logo.svg',location.href).href}" alt="ИСНУР"><div class="num"><b>Заявка на закуп № ${htmlEscape(doc.number)}</b><span>от ${htmlEscape(doc.date)}</span></div></div>
    <div class="bar"></div>
    <dl class="info"><dt>Объект</dt><dd>${htmlEscape(doc.object)}</dd><dt>Этажи</dt><dd>${htmlEscape(doc.scope)}</dd><dt>Составил</dt><dd>${htmlEscape(doc.author)}</dd></dl>
    ${table('Двери',doc.doors)}
    ${table('Комплектующие',doc.materials)}
    ${doc.comment?`<p class="note">Комментарий: ${htmlEscape(doc.comment)}</p>`:''}
    <div class="sign"><div>Составил (подпись, ФИО)</div><div>Дата</div><div>Утвердил (подпись, ФИО)</div><div>Дата</div></div>
  </div>`;
}

async function downloadOrderPdf(order){
  const html2pdf=await loadLibraryOnce('https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js','html2pdf');
  if(document.fonts?.ready)await document.fonts.ready;
  const holder=document.createElement('div');
  holder.innerHTML=orderPdfHtml(order);
  const element=holder.firstElementChild;
  await html2pdf().set({
    margin:[12,10,12,10],
    filename:orderFileName(order,'pdf'),
    image:{type:'jpeg',quality:.98},
    html2canvas:{scale:2,useCORS:true,backgroundColor:'#ffffff'},
    jsPDF:{unit:'mm',format:'a4',orientation:'portrait'},
    pagebreak:{mode:['css','legacy'],avoid:['tr','.sign']},
  }).from(element).save();
}

/* ---------- События ---------- */

const bindPageEventsBeforePurchases=bindPageEvents;
bindPageEvents=function(){
  bindPageEventsBeforePurchases();
  const container=document.getElementById('content');
  if(!container)return;
  container.querySelectorAll('[data-order-scope]').forEach(element=>element.addEventListener('click',()=>openOrderBuilder(JSON.parse(element.dataset.orderScope))));
  container.querySelectorAll('[data-order-status]').forEach(element=>element.addEventListener('change',()=>setOrderStatus(element.dataset.orderStatus,element.value)));
  container.querySelectorAll('[data-order-receive]').forEach(element=>element.addEventListener('click',()=>openOrderReceive(element.dataset.orderReceive)));
  container.querySelectorAll('[data-order-cancel]').forEach(element=>element.addEventListener('click',()=>cancelOrder(element.dataset.orderCancel)));
  container.querySelectorAll('[data-order-doc]').forEach(element=>element.addEventListener('click',()=>{
    const order=ordersList().find(item=>item.id===element.dataset.orderId);
    if(order)downloadOrderDoc(order,element.dataset.orderDoc,element);
  }));
};
