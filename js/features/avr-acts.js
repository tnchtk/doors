/* Акты выполненных работ (АВР): можно составлять по частям, не дожидаясь конца блока.
   В акт попадают только принятые проёмы, которых ещё нет в других актах. */

const AVR_TYPE_LABELS={
  large:'Монтаж дверей со стеклом · большие проёмы',kitchen:'Монтаж кухонных дверей со стеклом',
  toilet:'Монтаж туалетных дверей с коробкой и порогом',custom:'Монтаж нестандартных дверей',
  single_glass:'Монтаж одинарных дверей со стеклом',single_solid:'Монтаж одинарных глухих дверей',
  double_glass:'Монтаж двойных дверей со стеклом',double_solid:'Монтаж двойных глухих дверей',
  legacy:'Монтаж дверей · старая запись',
};

function isAvrAct(purchase){return purchase?.kind==='avr'&&Array.isArray(purchase.rows);}
function avrActsList(){return (state.purchases||[]).filter(isAvrAct);}
function nextAvrNumber(){return avrActsList().reduce((max,act)=>Math.max(max,Number(act.number)||0),0)+1;}

// Принятые проёмы, которые ещё не вошли ни в один акт.
function avrCandidates(obj,blockId=''){
  const out=[];
  (obj.blocks||[]).forEach(block=>{
    if(blockId&&block.id!==blockId)return;
    (block.floors||[]).forEach(floor=>(floor.apartments||[]).forEach(apt=>(apt.openings||[]).forEach(opening=>{
      if(!acceptedOpening(opening)||opening.avrId)return;
      out.push({block,floor,apt,opening});
    })));
  });
  return out;
}

function avrFloorGroups(candidates){
  const groups=new Map();
  candidates.forEach(item=>{
    if(!groups.has(item.floor.id))groups.set(item.floor.id,{block:item.block,floor:item.floor,items:[],doors:0});
    const group=groups.get(item.floor.id);
    group.items.push(item);group.doors+=openingDoorCount(item.opening);
  });
  return [...groups.values()];
}

function avrFloorsHtml(obj,blockId){
  const groups=avrFloorGroups(avrCandidates(obj,blockId));
  if(!groups.length)return '<div class="empty">Нет принятых этажей, которых ещё нет в актах. Акт можно составить, когда менеджер примет хотя бы один этаж.</div>';
  return groups.map(group=>`<label class="order-floor"><input type="checkbox" checked data-avr-floor="${htmlEscape(group.floor.id)}"><span><strong>${htmlEscape(group.block.name)} · ${htmlEscape(group.floor.num)} этаж</strong><span class="hint">${group.doors} ${ruPlural(group.doors,'дверь','двери','дверей')} приняты</span></span></label>`).join('');
}

function avrRowsFor(items,splitByBlock){
  const groups=new Map();
  items.forEach(({block,opening})=>{
    const type=opening.type||'legacy';
    const key=splitByBlock?`${block.id}|${type}`:type;
    const label=(AVR_TYPE_LABELS[type]||'Монтаж дверей')+(splitByBlock?` · ${block.name}`:'');
    const row=groups.get(key)||{label,type,count:0,openingCount:0};
    row.count+=openingDoorCount(opening);row.openingCount++;groups.set(key,row);
  });
  return [...groups.values()];
}

function avrMaterialsFor(items){
  const required={};
  items.forEach(({opening})=>Object.entries(openingMaterialNeeds(opening)).forEach(([id,qty])=>{required[id]=(required[id]||0)+qty;}));
  return MATERIALS.map(material=>({name:material.name,unit:material.unit,quantity:Number((required[material.id]||0).toFixed(2))})).filter(row=>row.quantity>0);
}

function avrPeriod(items){
  const dates=items.map(({opening})=>String(opening.acceptedAt||'').slice(0,10)).filter(value=>/^\d{4}-\d{2}-\d{2}$/.test(value)).sort();
  return dates.length?{from:dates[0],to:dates[dates.length-1]}:{from:'',to:''};
}

function avrMoney(value){return new Intl.NumberFormat('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2}).format(value);}
function avrQty(value){return new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(value);}
function avrShortDate(value){
  if(!value)return '';
  const date=new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime())?'':date.toLocaleDateString('ru-RU');
}

function avrActsPanel(){
  const objects=activeObjects(state);
  const first=objects[0];
  const acts=avrActsList().slice().sort((a,b)=>Number(b.number)-Number(a.number));
  return `
    <section class="panel avr-generator" aria-label="Акт выполненных работ">
      <div class="panel-head"><div><h3>Акт выполненных работ (АВР)</h3><span class="hint">Акт можно составить, не дожидаясь конца блока: берутся только принятые этажи, которых ещё нет в других актах</span></div></div>
      <form data-avr-form>
        <div class="avr-controls">
          <div class="field"><label for="avrObject">Объект</label><select id="avrObject" name="object_id" data-avr-object required ${objects.length?'':'disabled'}>
            ${objects.map(object=>`<option value="${htmlEscape(object.id)}">${htmlEscape(object.name)}</option>`).join('')||'<option value="">Сначала добавьте объект</option>'}
          </select></div>
          <div class="field"><label for="avrBlock">Блок</label><select id="avrBlock" name="block_id" data-avr-block ${objects.length?'':'disabled'}>
            <option value="">Весь объект</option>${(first?.blocks||[]).map(block=>`<option value="${htmlEscape(block.id)}">${htmlEscape(block.name)}</option>`).join('')}
          </select></div>
          <div class="field"><label for="avrUnitPrice">Цена монтажа одной двери</label><input id="avrUnitPrice" name="unit_price" type="number" min="0" step="0.01" inputmode="decimal" placeholder="По договору, необязательно"></div>
        </div>
        <div class="avr-floors-title">Что включить в акт</div>
        <div class="order-floors" data-avr-floors>${first?avrFloorsHtml(first,''):''}</div>
        <div class="avr-controls avr-parties">
          <div class="field"><label for="avrContract">Договор №</label><input id="avrContract" name="contract_no" maxlength="80" placeholder="Необязательно"></div>
          <div class="field"><label for="avrCustomer">Заказчик</label><input id="avrCustomer" name="customer" maxlength="200" placeholder="Название организации"></div>
          <div class="field"><label for="avrContractor">Исполнитель</label><input id="avrContractor" name="contractor" maxlength="200" value="ИСНУР"></div>
        </div>
        <div class="avr-form-foot"><p>Период выполнения определяется по датам приёмки. Приложенные к акту проёмы больше не попадут в следующие акты.</p><button class="btn primary" type="submit" ${objects.length?'':'disabled'}>Создать акт</button></div>
      </form>
    </section>
    <section class="panel">
      <div class="panel-head"><div><h3>Составленные акты</h3><span class="hint">${acts.length} ${ruPlural(acts.length,'акт','акта','актов')}</span></div></div>
      <div class="order-list">${acts.map(avrActCard).join('')||'<div class="empty">Актов пока нет.</div>'}</div>
    </section>`;
}

function avrActCard(act){
  const id=htmlEscape(act.id);
  return `<article class="order-card">
    <header class="order-card-head"><div><h4>Акт №${htmlEscape(act.number)}</h4><span class="hint">${htmlEscape(orderDateLabel(act.date))} · ${htmlEscape(act.objName||'')}</span></div><span class="pill ok">${act.totalDoors} ${ruPlural(act.totalDoors,'дверь','двери','дверей')}</span></header>
    <p class="order-scope">${htmlEscape(orderScopeLabel(act))}</p>
    ${act.totalAmount!==null&&act.totalAmount!==undefined?`<p class="hint">Сумма: ${htmlEscape(avrMoney(act.totalAmount))}</p>`:''}
    <div class="order-actions">
      <button type="button" class="btn sm" data-avr-doc="pdf" data-avr-id="${id}">PDF</button>
      <button type="button" class="btn sm" data-avr-doc="xlsx" data-avr-id="${id}">Excel</button>
      <button type="button" class="btn sm danger" data-avr-cancel="${id}">Отменить акт</button>
    </div>
  </article>`;
}

function bindAvrEvents(container){
  if(!canManageWorkspace())return;
  const form=container.querySelector('[data-avr-form]');
  if(form){
    const objectSelect=form.querySelector('[data-avr-object]');
    const blockSelect=form.querySelector('[data-avr-block]');
    const floorsBox=form.querySelector('[data-avr-floors]');
    const currentObject=()=>activeObjects(state).find(item=>item.id===objectSelect.value);
    const refreshFloors=()=>{const obj=currentObject();floorsBox.innerHTML=obj?avrFloorsHtml(obj,blockSelect.value):'';};
    objectSelect.addEventListener('change',()=>{
      const obj=currentObject();
      blockSelect.innerHTML=`<option value="">Весь объект</option>${(obj?.blocks||[]).map(block=>`<option value="${htmlEscape(block.id)}">${htmlEscape(block.name)}</option>`).join('')}`;
      refreshFloors();
    });
    blockSelect.addEventListener('change',refreshFloors);
    form.addEventListener('submit',event=>{event.preventDefault();createAvrAct(form,currentObject());});
  }
  container.querySelectorAll('[data-avr-doc]').forEach(element=>element.addEventListener('click',()=>{
    const act=avrActsList().find(item=>item.id===element.dataset.avrId);
    if(act)downloadAvrDoc(act,element.dataset.avrDoc,element);
  }));
  container.querySelectorAll('[data-avr-cancel]').forEach(element=>element.addEventListener('click',()=>cancelAvrAct(element.dataset.avrCancel)));
}

async function createAvrAct(form,obj){
  if(!obj){toast('Выберите объект');return;}
  const values=Object.fromEntries(new FormData(form).entries());
  const rawPrice=String(values.unit_price||'').trim();
  const unitPrice=rawPrice===''?null:Number(rawPrice);
  if(unitPrice!==null&&(!Number.isFinite(unitPrice)||unitPrice<0)){toast('Проверьте цену за дверь');return;}
  const chosen=new Set([...form.querySelectorAll('[data-avr-floor]:checked')].map(input=>input.dataset.avrFloor));
  const items=avrCandidates(obj,values.block_id||'').filter(item=>chosen.has(item.floor.id));
  if(!items.length){toast('Отметьте хотя бы один принятый этаж');return;}
  const block=values.block_id?obj.blocks.find(item=>item.id===values.block_id):null;
  const splitByBlock=new Set(items.map(item=>item.block.id)).size>1;
  const rows=avrRowsFor(items,splitByBlock);
  const totalDoors=rows.reduce((sum,row)=>sum+row.count,0);
  const floorIds=[...new Set(items.map(item=>item.floor.id))];
  const period=avrPeriod(items);
  const now=new Date();
  const act={
    id:newRecordId('avr'),kind:'avr',number:nextAvrNumber(),date:now.toISOString().slice(0,10),createdAt:now.toISOString(),createdBy:orderAuthorLabel(),
    objId:obj.id,objName:obj.name,blockLabel:block?block.name:'Все блоки объекта',
    scope:floorIds.map(id=>{const item=items.find(entry=>entry.floor.id===id);return {blockId:item.block.id,blockName:item.block.name,floorId:id,floorNum:item.floor.num};}),
    rows,materials:avrMaterialsFor(items),unitPrice,totalDoors,totalAmount:unitPrice===null?null:Number((totalDoors*unitPrice).toFixed(2)),
    contractNo:String(values.contract_no||'').trim(),customer:String(values.customer||'').trim(),contractor:String(values.contractor||'').trim(),
    periodFrom:period.from,periodTo:period.to,openingIds:items.map(item=>item.opening.id),
  };
  const submit=form.querySelector('[type="submit"]');
  submit.disabled=true;submit.textContent='Сохраняем…';
  const previousState=JSON.parse(JSON.stringify(state));
  state.purchases=Array.isArray(state.purchases)?state.purchases:[];
  state.purchases.unshift(act);
  items.forEach(item=>{item.opening.avrId=act.id;});
  try{
    await saveManagerOpeningState();
    toast(`Акт №${act.number} создан`);
    render();
    offerAvrDownload(act);
  }catch(error){
    state=previousState;
    toast(error.message||'Не удалось создать акт');
    render();
  }
}

async function cancelAvrAct(actId){
  const act=avrActsList().find(item=>item.id===actId);
  if(!act)return;
  if(!confirm(`Отменить акт №${act.number}? Его проёмы снова можно будет включить в новый акт.`))return;
  const previousState=JSON.parse(JSON.stringify(state));
  (state.objects||[]).forEach(obj=>(obj.blocks||[]).forEach(block=>(block.floors||[]).forEach(floor=>(floor.apartments||[]).forEach(apt=>(apt.openings||[]).forEach(opening=>{
    if(opening.avrId===act.id)delete opening.avrId;
  })))));
  state.purchases=(state.purchases||[]).filter(item=>item.id!==act.id);
  try{await saveManagerOpeningState();toast('Акт отменён');}
  catch(error){state=previousState;toast(error.message||'Не удалось отменить акт');}
  render();
}

function offerAvrDownload(act){
  const overlay=document.createElement('div');
  overlay.className='overlay';
  overlay.innerHTML=`<div class="modal" role="dialog" aria-modal="true"><h3>Акт №${htmlEscape(act.number)} создан</h3><p class="hint">Скачайте документ. Он всегда доступен в списке составленных актов.</p>
    <div class="modal-actions"><button type="button" class="btn ghost" data-cancel>Закрыть</button><button type="button" class="btn" data-doc="xlsx">Скачать Excel</button><button type="button" class="btn primary" data-doc="pdf">Скачать PDF</button></div></div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click',event=>{if(event.target===overlay)overlay.remove();});
  overlay.querySelector('[data-cancel]').addEventListener('click',()=>overlay.remove());
  overlay.querySelectorAll('[data-doc]').forEach(button=>button.addEventListener('click',()=>downloadAvrDoc(act,button.dataset.doc,button)));
}

async function downloadAvrDoc(act,format,button){
  const original=button?.textContent;
  if(button){button.disabled=true;button.textContent='Готовим…';}
  try{
    if(format==='xlsx')await downloadAvrXlsx(act);else await downloadAvrPdf(act);
    toast(format==='xlsx'?'Excel сохранён':'PDF сохранён');
  }catch(error){toast(error.message||'Не удалось подготовить документ');}
  finally{if(button){button.disabled=false;button.textContent=original;}}
}

function avrFileName(act,extension){return `avr-${act.number}-${String(act.date).slice(0,10)}.${extension}`;}

function avrPeriodLabel(act){
  const from=avrShortDate(act.periodFrom),to=avrShortDate(act.periodTo);
  return from&&to?(from===to?from:`с ${from} по ${to}`):'—';
}

function avrPdfHtml(act){
  const hasPrice=act.unitPrice!==null&&act.unitPrice!==undefined;
  const worksRows=act.rows.map((row,index)=>`<tr><td class="c">${index+1}</td><td>${htmlEscape(row.label)}</td><td class="c">шт.</td><td class="c b">${row.count}</td>${hasPrice?`<td class="r">${avrMoney(act.unitPrice)}</td><td class="r b">${avrMoney(row.count*act.unitPrice)}</td>`:''}</tr>`).join('');
  const materialsRows=(act.materials||[]).map((row,index)=>`<tr><td class="c">${index+1}</td><td>${htmlEscape(row.name)}</td><td class="c">${htmlEscape(row.unit)}</td><td class="c b">${avrQty(row.quantity)}</td></tr>`).join('');
  const party=(label,value)=>`<dt>${label}</dt><dd>${value?htmlEscape(value):'<span class="blank"></span>'}</dd>`;
  return `<div class="avr-pdf" style="width:690px;font-family:'IBM Plex Sans',Arial,sans-serif;color:#1d2145;background:#fff">
    <style>
      .avr-pdf *{box-sizing:border-box}
      .avr-pdf .top{display:flex;align-items:center;justify-content:space-between;padding-bottom:14px}
      .avr-pdf .top img{height:40px;width:auto}
      .avr-pdf .top .num{text-align:right;font-size:12px;color:#5b647a}
      .avr-pdf .top .num b{display:block;font-size:13px;color:#1d2145}
      .avr-pdf .bar{height:5px;background:#b7ed55;border-radius:3px;margin-bottom:18px}
      .avr-pdf h1{margin:0;text-align:center;font-size:21px;letter-spacing:.02em}
      .avr-pdf .sub{margin:4px 0 18px;text-align:center;color:#5b647a;font-size:13px}
      .avr-pdf .info{display:grid;grid-template-columns:130px 1fr;row-gap:7px;font-size:12.5px;margin:0 0 6px}
      .avr-pdf .info dt{color:#5b647a;font-weight:600;margin:0}
      .avr-pdf .info dd{margin:0;overflow-wrap:anywhere}
      .avr-pdf .blank{display:inline-block;width:230px;border-bottom:1px solid #9aa3b5;height:14px}
      .avr-pdf h3{font-size:14px;margin:20px 0 8px}
      .avr-pdf table{width:100%;border-collapse:collapse;font-size:12px}
      .avr-pdf th{background:#1d2145;color:#fff;text-align:left;padding:8px 9px;font-weight:600}
      .avr-pdf td{padding:8px 9px;border-bottom:1px solid #dde3ec}
      .avr-pdf tbody tr:nth-child(even) td{background:#f3f6fb}
      .avr-pdf tfoot td{border-top:2px solid #1d2145;border-bottom:0;font-weight:700;background:#fff}
      .avr-pdf tr{page-break-inside:avoid}
      .avr-pdf .c{text-align:center}.avr-pdf .r{text-align:right}.avr-pdf .b{font-weight:700}
      .avr-pdf .statement{margin:18px 0 0;font-size:12.5px;line-height:1.55}
      .avr-pdf .sign{margin-top:34px;display:grid;grid-template-columns:1fr 1fr;gap:34px;page-break-inside:avoid}
      .avr-pdf .sign h4{margin:0 0 20px;font-size:13px}
      .avr-pdf .sign .line{border-top:1px solid #1d2145;margin-top:26px;padding-top:5px;font-size:11px;color:#5b647a}
      .avr-pdf .stamp{margin-top:14px;font-size:11px;color:#9aa3b5}
      .avr-pdf .note{margin-top:22px;font-size:10.5px;color:#7a8398}
    </style>
    <div class="top"><img src="${new URL('assets/isnur-logo.svg',location.href).href}" alt="ИСНУР"><div class="num"><b>Акт № ${htmlEscape(act.number)}</b>от ${htmlEscape(orderDateLabel(act.date))}</div></div>
    <div class="bar"></div>
    <h1>АКТ ВЫПОЛНЕННЫХ РАБОТ</h1><p class="sub">по монтажу дверей</p>
    <dl class="info">
      ${party('Объект',act.objName)}${party('Раздел',act.blockLabel)}${party('Этажи',orderScopeLabel(act))}
      ${party('Договор №',act.contractNo)}${party('Период выполнения',avrPeriodLabel(act))}
      ${party('Заказчик',act.customer)}${party('Исполнитель',act.contractor)}
    </dl>
    <h3>Выполненные работы</h3>
    <table><thead><tr><th class="c" style="width:34px">№</th><th>Наименование работ</th><th class="c" style="width:48px">Ед.</th><th class="c" style="width:62px">Кол-во</th>${hasPrice?'<th class="r" style="width:84px">Цена</th><th class="r" style="width:96px">Сумма</th>':''}</tr></thead>
      <tbody>${worksRows}</tbody>
      <tfoot><tr><td colspan="3">Итого</td><td class="c">${act.totalDoors}</td>${hasPrice?`<td></td><td class="r">${avrMoney(act.totalAmount)}</td>`:''}</tr></tfoot></table>
    ${materialsRows?`<h3>Материалы по принятым проёмам</h3><table><thead><tr><th class="c" style="width:34px">№</th><th>Наименование материала</th><th class="c" style="width:60px">Ед.</th><th class="c" style="width:90px">Количество</th></tr></thead><tbody>${materialsRows}</tbody></table>`:''}
    <p class="statement">Работы по монтажу дверей выполнены в указанном объёме, в установленные сроки и с надлежащим качеством. Стороны претензий друг к другу не имеют. Настоящий акт составлен в двух экземплярах для подтверждения выполненных работ.</p>
    <div class="sign">
      <div><h4>Заказчик</h4><div class="line">ФИО, подпись</div><div class="line">Дата</div><div class="stamp">М.П.</div></div>
      <div><h4>Исполнитель</h4><div class="line">ФИО, подпись</div><div class="line">Дата</div><div class="stamp">М.П.</div></div>
    </div>
    <p class="note">В акт включены только проёмы со статусом «Принято» в системе учёта. Составил: ${htmlEscape(act.createdBy||'')}.</p>
  </div>`;
}

async function downloadAvrPdf(act){
  const html2pdf=await loadLibraryOnce('https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js','html2pdf');
  if(document.fonts?.ready)await document.fonts.ready;
  const holder=document.createElement('div');
  holder.innerHTML=avrPdfHtml(act);
  await html2pdf().set({
    margin:[12,10,12,10],filename:avrFileName(act,'pdf'),image:{type:'jpeg',quality:.98},
    html2canvas:{scale:2,useCORS:true,backgroundColor:'#ffffff'},jsPDF:{unit:'mm',format:'a4',orientation:'portrait'},
    pagebreak:{mode:['css','legacy'],avoid:['tr','.sign']},
  }).from(holder.firstElementChild).save();
}

async function downloadAvrXlsx(act){
  const ExcelJS=await loadLibraryOnce('https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js','ExcelJS');
  const hasPrice=act.unitPrice!==null&&act.unitPrice!==undefined;
  const NAVY='FF1D2145',LIME='FFB7ED55',SOFT='FFF3F6FB',LINE='FFC9D1DD',GREY='FF5B647A';
  const columns=hasPrice?6:4,last=String.fromCharCode(64+columns);
  const workbook=new ExcelJS.Workbook();workbook.creator='ИСНУР';
  const sheet=workbook.addWorksheet('Акт выполненных работ',{pageSetup:{paperSize:9,orientation:'portrait',fitToPage:true,fitToWidth:1,fitToHeight:0,margins:{left:.5,right:.5,top:.6,bottom:.6,header:.3,footer:.3}},views:[{showGridLines:false}]});
  sheet.columns=hasPrice?[{width:6},{width:50},{width:8},{width:11},{width:14},{width:16}]:[{width:6},{width:58},{width:10},{width:14}];
  const border={top:{style:'thin',color:{argb:LINE}},left:{style:'thin',color:{argb:LINE}},bottom:{style:'thin',color:{argb:LINE}},right:{style:'thin',color:{argb:LINE}}};
  const fill=argb=>({type:'pattern',pattern:'solid',fgColor:{argb}});

  sheet.mergeCells(`A1:${last}1`);
  sheet.getCell('A1').value='ИСНУР · Инженерное строительство';sheet.getCell('A1').font={name:'Calibri',size:11,bold:true,color:{argb:NAVY}};
  sheet.mergeCells(`A2:${last}2`);
  const title=sheet.getCell('A2');title.value=`АКТ ВЫПОЛНЕННЫХ РАБОТ № ${act.number}`;title.font={name:'Calibri',size:20,bold:true,color:{argb:NAVY}};sheet.getRow(2).height=34;title.alignment={vertical:'middle'};
  sheet.mergeCells(`A3:${last}3`);sheet.getCell('A3').fill=fill(LIME);sheet.getRow(3).height=4;
  sheet.mergeCells(`A4:${last}4`);
  const sub=sheet.getCell('A4');sub.value=`по монтажу дверей · от ${orderDateLabel(act.date)}`;sub.font={name:'Calibri',size:11,color:{argb:GREY}};

  const info=[['Объект',act.objName],['Раздел',act.blockLabel],['Этажи',orderScopeLabel(act)],['Договор №',act.contractNo||'—'],['Период',avrPeriodLabel(act)],['Заказчик',act.customer||'—'],['Исполнитель',act.contractor||'—']];
  let row=6;
  info.forEach(([label,value])=>{
    sheet.mergeCells(`A${row}:B${row}`);
    const a=sheet.getCell(`A${row}`);a.value=label;a.font={name:'Calibri',size:10,bold:true,color:{argb:GREY}};
    sheet.mergeCells(`C${row}:${last}${row}`);
    const b=sheet.getCell(`C${row}`);b.value=value;b.font={name:'Calibri',size:11,color:{argb:NAVY}};b.alignment={wrapText:true,vertical:'top'};
    if(String(value).length>45)sheet.getRow(row).height=Math.ceil(String(value).length/45)*16;
    row++;
  });
  row++;

  const header=labels=>{
    labels.forEach((label,index)=>{
      const cell=sheet.getCell(row,index+1);cell.value=label;cell.font={name:'Calibri',size:10,bold:true,color:{argb:'FFFFFFFF'}};
      cell.fill=fill(NAVY);cell.border=border;cell.alignment={horizontal:index===1?'left':'center',vertical:'middle',indent:index===1?1:0};
    });
    sheet.getRow(row).height=22;row++;
  };
  const body=(values,index)=>{
    values.forEach((value,column)=>{
      const cell=sheet.getCell(row,column+1);cell.value=value;
      cell.font={name:'Calibri',size:11,bold:column===3,color:{argb:NAVY}};cell.border=border;
      if(index%2)cell.fill=fill(SOFT);
      cell.alignment={horizontal:column===1?'left':(column>=4?'right':'center'),vertical:'middle',wrapText:column===1,indent:column===1?1:0};
      if(column>=4)cell.numFmt='#,##0.00';
    });
    sheet.getRow(row).height=20;row++;
  };

  sheet.mergeCells(`A${row}:${last}${row}`);sheet.getCell(`A${row}`).value='Выполненные работы';sheet.getCell(`A${row}`).font={name:'Calibri',size:12,bold:true,color:{argb:NAVY}};row++;
  header(hasPrice?['№','Наименование работ','Ед.','Кол-во','Цена','Сумма']:['№','Наименование работ','Ед.','Кол-во']);
  act.rows.forEach((item,index)=>body(hasPrice?[index+1,item.label,'шт.',item.count,act.unitPrice,Number((item.count*act.unitPrice).toFixed(2))]:[index+1,item.label,'шт.',item.count],index));
  const totalValues=hasPrice?['','Итого','',act.totalDoors,'',act.totalAmount]:['','Итого','',act.totalDoors];
  totalValues.forEach((value,column)=>{
    const cell=sheet.getCell(row,column+1);cell.value=value;cell.font={name:'Calibri',size:11,bold:true,color:{argb:NAVY}};
    cell.border={top:{style:'medium',color:{argb:NAVY}}};cell.alignment={horizontal:column===1?'left':(column>=4?'right':'center'),indent:column===1?1:0};
    if(column>=4)cell.numFmt='#,##0.00';
  });
  row+=2;

  if((act.materials||[]).length){
    sheet.mergeCells(`A${row}:${last}${row}`);sheet.getCell(`A${row}`).value='Материалы по принятым проёмам';sheet.getCell(`A${row}`).font={name:'Calibri',size:12,bold:true,color:{argb:NAVY}};row++;
    header(['№','Наименование материала','Ед.','Количество']);
    act.materials.forEach((item,index)=>body([index+1,item.name,item.unit,item.quantity],index));
    row++;
  }
  sheet.mergeCells(`A${row}:${last}${row}`);
  const statement=sheet.getCell(`A${row}`);statement.value='Работы по монтажу дверей выполнены в указанном объёме, в установленные сроки и с надлежащим качеством. Стороны претензий друг к другу не имеют.';
  statement.font={name:'Calibri',size:10,italic:true,color:{argb:GREY}};statement.alignment={wrapText:true,vertical:'top'};sheet.getRow(row).height=32;row+=2;
  [['Заказчик'],['Исполнитель']].forEach(([who])=>{
    sheet.mergeCells(`A${row}:B${row}`);sheet.getCell(`A${row}`).value=`${who}: ______________________  /  ______________________ /`;sheet.getCell(`A${row}`).font={name:'Calibri',size:11,color:{argb:NAVY}};
    sheet.mergeCells(`C${row}:${last}${row}`);sheet.getCell(`C${row}`).value='Дата: ____________      М.П.';sheet.getCell(`C${row}`).font={name:'Calibri',size:11,color:{argb:NAVY}};
    sheet.getRow(row).height=30;row++;
  });
  const buffer=await workbook.xlsx.writeBuffer();
  downloadBlob(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),avrFileName(act,'xlsx'));
}
