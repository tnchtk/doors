function brigadeStats(brigadeId){
  const doors = allDoors(state).filter(x=>x.floor.brigadeId===brigadeId);
  const c=countByStatus(doors);
  const done=doneCount(c);
  const today=installedTodayFor(brigadeId);
  const remaining = totalCount(c)-done-c.problem;
  const blocksServed = [...new Set(doors.map(x=>x.obj.name+' / '+x.block.name))];
  return {doors, c, done, today, remaining, blocksServed};
}

function brigadeMoney(value){return Number(value||0).toLocaleString('ru-RU',{maximumFractionDigits:2});}
function brigadeEntries(){return cloudEnabled?brigadeFinanceEntries:(state?.financeEntries||[]);}
function brigadeFinanceTotals(brigadeId){
  const entries=brigadeEntries().filter(entry=>(entry.brigade_id||entry.brigadeId)===brigadeId);
  const total=type=>entries.filter(entry=>(entry.entry_type||entry.type)===type).reduce((sum,entry)=>sum+Number(entry.amount||0),0);
  const accrued=total('accrual'),advances=total('advance'),payouts=total('payout'),paid=advances+payouts,balance=accrued-paid;
  const workAfterAdvances=Math.max(accrued-advances,0);
  return {entries,accrued,advances,payouts,paid,balance,owed:Math.max(workAfterAdvances-payouts,0),advanceToWorkOff:Math.max(advances-accrued,0),overpaid:Math.max(payouts-workAfterAdvances,0)};
}
function brigadeTransactionLabel(entry){return ({accrual:'Начисление',advance:'Аванс',payout:'Выплата'}[entry.entry_type||entry.type]||'Операция');}
function brigadeTransactionDate(entry){
  const value=entry.occurred_on||entry.date||entry.created_at;
  if(!value)return '—';
  const date=new Date(`${String(value).slice(0,10)}T12:00:00`);
  return Number.isNaN(date.getTime())?'—':date.toLocaleDateString('ru-RU',{day:'numeric',month:'short',year:'numeric'});
}
function openingFinanceLabel(entry){
  const found=allFinanceOpenings(state).find(item=>item.opening.id===(entry.opening_id||entry.openingId));
  return found?`${found.obj.name} · ${found.block.name} · ${found.floor.num} этаж${found.apt.isFloorContainer?'':` · кв. ${found.apt.num}`}`:'';
}
function allFinanceOpenings(source){
  const rows=[];
  (source?.objects||[]).forEach(obj=>(obj.blocks||[]).forEach(block=>(block.floors||[]).forEach(floor=>(floor.apartments||[]).forEach(apt=>(apt.openings||[]).forEach(opening=>rows.push({opening,apt,floor,block,obj}))))));
  return rows;
}

function pageBrigades(){
  if(route.brigadeId){
    const b=state.brigades.find(x=>x.id===route.brigadeId);
    if(b) return brigadeDetail(b);
  }
  return `
    <div class="panel-head"><div><h3>${state.brigades.length} бригад на объектах</h3><div class="hint">Базовую цену задаёт администратор; для каждого этажа можно указать свою</div></div><button class="btn primary sm" data-create-brigade>+ Новая бригада</button></div>
    <div class="tbl-wrap">
    <table>
      <thead><tr><th>Бригада</th><th>Руководитель</th><th>Установлено</th><th>Сегодня</th><th>Осталось</th><th>Проблем</th><th>Начислено</th><th>Баланс</th><th></th></tr></thead>
      <tbody>
        ${state.brigades.map(b=>{
          const s=brigadeStats(b.id);
          const money=brigadeFinanceTotals(b.id);
          return `<tr class="clickable" data-open-brigade="${b.id}">
            <td><strong>${b.name}</strong></td>
            <td>${b.leader}</td>
            <td class="mono" style="color:var(--ok)">${s.done}</td>
            <td class="mono">+${s.today}</td>
            <td class="mono">${s.remaining}</td>
            <td class="mono" style="color:${s.c.problem?'var(--bad)':'var(--text-faint)'}">${s.c.problem}</td>
            <td class="mono">${brigadeMoney(money.accrued)} сом</td>
            <td class="mono" style="color:${money.owed?'var(--warn)':'var(--ok)'}">${brigadeMoney(money.owed)} сом</td>
            <td style="color:var(--text-faint)">→</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
    </div>
  `;
}

function brigadeDetail(b){
  const s=brigadeStats(b.id);
  const money=brigadeFinanceTotals(b.id);
  const isAdmin=isAdminWorkspaceUser();
  return `
    ${crumb([{label:'Бригады', click:{page:'brigades'}}, {label:b.name}])}
    <div class="two-col">
      <div class="panel">
        <div class="panel-head"><h3>${b.name}</h3><span class="pill info">${s.blocksServed.length} участка</span></div>
        <div style="font-size:13px;color:var(--text-dim);line-height:2;">
          Руководитель: <strong style="color:var(--text)">${b.leader}</strong><br>
          Телефон: <span class="mono">${b.phone}</span><br>
          Рабочих: ${b.workers} чел.<br>
          Обслуживает: ${s.blocksServed.join(', ')}
        </div>
        <div class="kpi-grid" style="margin-top:16px;">
          <div class="kpi ok"><div class="val">${s.done}</div><div class="lbl">Установлено всего</div></div>
          <div class="kpi accent"><div class="val">+${s.today}</div><div class="lbl">Сегодня</div></div>
          <div class="kpi warn"><div class="val">${s.remaining}</div><div class="lbl">Осталось</div></div>
          <div class="kpi bad"><div class="val">${s.c.problem}</div><div class="lbl">Проблемных</div></div>
        </div>
      </div>
    </div>
    <section class="panel brigade-finance-panel">
      <div class="panel-head"><div><h3>Денежный баланс</h3><span class="hint">Начисление появляется после приёмки каждого проёма</span></div>${isAdmin?`<div class="admin-actions"><button type="button" class="btn sm" data-add-financial-entry="advance" data-brigade-id="${htmlEscape(b.id)}">+ Аванс</button><button type="button" class="btn sm primary" data-add-financial-entry="payout" data-brigade-id="${htmlEscape(b.id)}">+ Выплата</button></div>`:''}</div>
      ${brigadeFinanceError?`<div class="admin-note admin-warning">Финансовый журнал пока не подключён. После обновления сайта выполните js/data/data-base-finance.sql в Supabase.</div>`:''}
      <div class="kpi-grid brigade-finance-kpis">
        <div class="kpi accent"><div class="val">${brigadeMoney(money.accrued)} сом</div><div class="lbl">Начислено за принятые проёмы</div></div>
        <div class="kpi"><div class="val">${brigadeMoney(money.advances)} сом</div><div class="lbl">Авансы</div></div>
        <div class="kpi"><div class="val">${brigadeMoney(money.payouts)} сом</div><div class="lbl">Выплаты</div></div>
        <div class="kpi ok"><div class="val">${brigadeMoney(money.owed)} сом</div><div class="lbl">Осталось выплатить</div></div>
        ${money.advanceToWorkOff?`<div class="kpi warn"><div class="val">${brigadeMoney(money.advanceToWorkOff)} сом</div><div class="lbl">Аванс ещё не отработан</div></div>`:''}
        ${money.overpaid?`<div class="kpi bad"><div class="val">${brigadeMoney(money.overpaid)} сом</div><div class="lbl">Выплачено сверх начислений</div></div>`:''}
      </div>
      <div class="panel-head brigade-ledger-head"><h3>История операций</h3><span class="hint">${money.entries.length} записей</span></div>
      <div class="tbl-wrap"><table><thead><tr><th>Дата</th><th>Операция</th><th>Основание</th><th>Тариф за проём</th><th>Комментарий</th><th>Сумма</th></tr></thead><tbody>
        ${money.entries.map(entry=>`<tr><td>${brigadeTransactionDate(entry)}</td><td><span class="pill ${entry.entry_type==='accrual'||entry.type==='accrual'?'ok':entry.entry_type==='advance'||entry.type==='advance'?'warn':'neutral'}">${brigadeTransactionLabel(entry)}</span></td><td>${htmlEscape(openingFinanceLabel(entry)||entry.note||'—')}${(entry.door_count||entry.doorCount)===2?'<div class="hint">Двойной проём · +500 сом</div>':''}</td><td class="mono">${entry.rate_per_opening||entry.ratePerOpening?`${brigadeMoney(entry.rate_per_opening||entry.ratePerOpening)} сом${(entry.door_count||entry.doorCount)===2?' + 500':''}`:'—'}</td><td>${htmlEscape(entry.note||'—')}</td><td class="mono">${brigadeMoney(entry.amount)} сом</td></tr>`).join('')||'<tr><td colspan="6"><div class="empty">Финансовых операций пока нет</div></td></tr>'}
      </tbody></table></div>
    </section>
  `;
}

function openFloorFinanceEditor(ids){
  if(!isAdminWorkspaceUser()){toast('Тарифы может менять только администратор');return;}
  const object=state.objects.find(item=>item.id===ids.objId),block=object?.blocks.find(item=>item.id===ids.blockId),floor=block?.floors.find(item=>item.id===ids.floorId);
  if(!object||!block||!floor)return;
  const overlay=openDataEntryModal(`Тариф · ${object.name}, ${block.name}, ${floor.num} этаж`,[
    {id:'brigadeId',label:'Бригада',options:[{value:'',label:'Не назначена'},...state.brigades.map(item=>({value:item.id,label:item.name}))],value:floor.brigadeId||''},
    {id:'ratePerOpening',label:'Цена за один проём, сом',type:'number',value:floor.ratePerOpening??'',min:0,step:'0.01'},
  ],async values=>{
    const brigadeId=values.brigadeId||null,rate=values.ratePerOpening===''?null:Number(values.ratePerOpening);
    if(brigadeId&&(!Number.isFinite(rate)||rate<=0)){toast('Для назначенной бригады укажите цену за проём');return false;}
    if(rate!==null&&(!Number.isFinite(rate)||rate<0)){toast('Укажите корректную цену');return false;}
    const previous={brigadeId:floor.brigadeId,ratePerOpening:floor.ratePerOpening};
    floor.brigadeId=brigadeId;floor.ratePerOpening=rate;
    await saveState();
    if(cloudEnabled&&cloudWriteBlocked){floor.brigadeId=previous.brigadeId;floor.ratePerOpening=previous.ratePerOpening;try{await readCloudState();}catch{}render();throw new Error('Тариф не сохранён. Обновите данные и повторите попытку.');}
    render();toast('Тариф этажа сохранён');return true;
  });
  const brigadeSelect=overlay.querySelector('#entry_brigadeId'),rateInput=overlay.querySelector('#entry_ratePerOpening');
  brigadeSelect?.addEventListener('change',()=>{
    const brigade=state.brigades.find(item=>item.id===brigadeSelect.value);
    rateInput.value=brigade?.defaultRatePerOpening??'';
  });
}

function brigadeFinanceAdminPanel(){
  if(!isAdminWorkspaceUser())return '';
  const floors=[];
  (state.objects||[]).forEach(object=>(object.blocks||[]).forEach(block=>(block.floors||[]).forEach(floor=>floors.push({object,block,floor}))));
  const entries=brigadeEntries();
  const accruedIds=new Set(entries.filter(entry=>(entry.entry_type||entry.type)==='accrual').map(entry=>entry.opening_id||entry.openingId));
  const accepted=allFinanceOpenings(state).filter(item=>acceptedOpening(item.opening));
  const missingHistory=accepted.filter(item=>!accruedIds.has(item.opening.id));
  const missingRates=missingHistory.filter(item=>!item.floor.brigadeId||!(Number(item.floor.ratePerOpening)>0)).length;
  return `<section class="panel brigade-finance-admin">
    <div class="panel-head"><div><h3>Тарифы по этажам и старая история</h3><span class="hint">Базовый тариф можно задать в бригаде; цену этажа можно изменить отдельно</span></div><span class="pill ${missingRates?'warn':'ok'}">${floors.filter(item=>item.floor.brigadeId&&!(Number(item.floor.ratePerOpening)>0)).length} без тарифа</span></div>
    ${brigadeFinanceError?`<div class="admin-note admin-warning">Финансовый журнал Supabase не подключён. Сначала обновите сайт, затем выполните js/data/data-base-finance.sql.</div>`:''}
    <div class="tbl-wrap"><table><thead><tr><th>Объект</th><th>Блок / этаж</th><th>Бригада</th><th>Цена за проём</th><th></th></tr></thead><tbody>
      ${floors.map(({object,block,floor})=>`<tr><td>${htmlEscape(object.name)}</td><td>${htmlEscape(block.name)} · ${floor.num} этаж</td><td>${htmlEscape(state.brigades.find(item=>item.id===floor.brigadeId)?.name||'Не назначена')}</td><td class="mono">${Number(floor.ratePerOpening)>0?`${brigadeMoney(floor.ratePerOpening)} сом`:'—'}</td><td><button type="button" class="btn sm" data-floor-rate='${htmlEscape(JSON.stringify({objId:object.id,blockId:block.id,floorId:floor.id}))}'>Настроить</button></td></tr>`).join('')||'<tr><td colspan="5"><div class="empty">Этажей пока нет</div></td></tr>'}
    </tbody></table></div>
    <div class="finance-history-action"><div><strong>Принятые проёмы без начисления: ${missingHistory.length}</strong><span>${missingRates?'Сначала задайте тариф и назначьте бригаду для каждого этажа.': 'После ввода тарифов можно добавить начисления в историю по текущим тарифам этажей.'}</span></div><div class="admin-actions"><button type="button" class="btn" data-finance-export>Скачать журнал</button><button type="button" class="btn ${missingRates?'':'primary'}" data-finance-backfill ${missingHistory.length===0||missingRates?'disabled':''}>Начислить историю</button></div></div>
    <p class="admin-note">Каждый двойной проём получает доплату 500 сом. Изменение тарифа не меняет уже начисленные суммы.</p>
  </section>`;
}

function foremanFinanceCard(){
  if(!isForemanWorkspaceUser())return '';
  const summary=foremanFinanceSummary;
  const brigade=summary?.brigadeId?state.brigades.find(item=>item.id===summary.brigadeId):null;
  if(brigadeFinanceError)return `<section class="panel foreman-finance-card"><h3>Баланс бригады</h3><p>Финансовый баланс пока не подключён. Попросите администратора обновить учёт.</p></section>`;
  if(!summary?.brigadeId)return `<section class="panel foreman-finance-card"><h3>Баланс бригады</h3><p>К вашей учётной записи пока не привязана бригада.</p></section>`;
  return `<section class="panel foreman-finance-card"><div class="panel-head"><div><h3>Баланс вашей бригады</h3><span class="hint">${htmlEscape(brigade?.name||'Назначенная бригада')}</span></div><button type="button" class="btn sm" data-refresh-finance>Обновить</button></div><div class="kpi-grid brigade-finance-kpis"><div class="kpi accent"><div class="val">${brigadeMoney(summary.accrued)} сом</div><div class="lbl">Начислено</div></div><div class="kpi"><div class="val">${brigadeMoney(summary.paid)} сом</div><div class="lbl">Получено авансами и выплатами</div></div><div class="kpi ok"><div class="val">${brigadeMoney(summary.owed)} сом</div><div class="lbl">Осталось получить</div></div>${Number(summary.advanceToWorkOff)>0?`<div class="kpi warn"><div class="val">${brigadeMoney(summary.advanceToWorkOff)} сом</div><div class="lbl">Аванс ещё не отработан</div></div>`:''}${Number(summary.overpaid)>0?`<div class="kpi bad"><div class="val">${brigadeMoney(summary.overpaid)} сом</div><div class="lbl">Выплачено сверх начислений</div></div>`:''}</div></section>`;
}

function bindBrigadeFinanceEvents(container){
  if(!container)return;
  container.querySelectorAll('[data-add-financial-entry]').forEach(button=>button.addEventListener('click',()=>openBrigadeFinancialEntry(button.dataset.brigadeId,button.dataset.addFinancialEntry)));
  container.querySelector('[data-finance-backfill]')?.addEventListener('click',runBrigadeFinanceBackfill);
  container.querySelector('[data-refresh-finance]')?.addEventListener('click',async event=>{
    const button=event.currentTarget;button.disabled=true;
    await refreshBrigadeFinance();render();
  });
  container.querySelector('[data-finance-export]')?.addEventListener('click',()=>{
    const backup={format:'doorscrm-finance-ledger',version:1,exportedAt:new Date().toISOString(),entries:brigadeEntries(),floors:(state.objects||[]).flatMap(object=>(object.blocks||[]).flatMap(block=>(block.floors||[]).map(floor=>({object:object.name,block:block.name,floor:floor.num,brigadeId:floor.brigadeId,ratePerOpening:floor.ratePerOpening}))))};
    adminSaveFile(`doorscrm-finance-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(backup,null,2),'application/json');
  });
}

function openBrigadeFinancialEntry(brigadeId,type){
  if(!isAdminWorkspaceUser()){toast('Авансы и выплаты записывает только администратор');return;}
  const brigade=state.brigades.find(item=>item.id===brigadeId);if(!brigade)return;
  const label=type==='advance'?'Аванс':'Выплата';
  openDataEntryModal(`${label} · ${brigade.name}`,[
    {id:'amount',label:'Сумма, сом',type:'number',min:0.01,step:'0.01',required:true},
    {id:'occurredOn',label:'Дата',type:'date',value:new Date().toISOString().slice(0,10),required:true},
    {id:'note',label:'Комментарий'},
  ],async values=>{
    const amount=Number(values.amount),occurredOn=values.occurredOn||new Date().toISOString().slice(0,10),note=values.note.trim();
    if(!Number.isFinite(amount)||amount<=0){toast('Сумма должна быть больше нуля');return false;}
    if(cloudEnabled){
      const {error}=await supabaseClient.from('brigade_financial_entries').insert({brigade_id:brigadeId,entry_type:type,amount,occurred_on:occurredOn,note});
      if(error){if(String(error.message||'').includes('brigade_financial_entries'))throw new Error('Сначала выполните js/data/data-base-finance.sql в Supabase.');throw error;}
      await refreshBrigadeFinance();
    }else{
      state.financeEntries=Array.isArray(state.financeEntries)?state.financeEntries:[];
      state.financeEntries.unshift({id:newRecordId('fe'),brigade_id:brigadeId,entry_type:type,amount,occurred_on:occurredOn,note,created_at:new Date().toISOString()});
      await saveState();await refreshBrigadeFinance();
    }
    render();toast(`${label} записан`);return true;
  });
}

async function runBrigadeFinanceBackfill(){
  if(!isAdminWorkspaceUser())return;
  const missing=allFinanceOpenings(state).filter(item=>acceptedOpening(item.opening)&&!brigadeEntries().some(entry=>(entry.opening_id||entry.openingId)===item.opening.id));
  if(!missing.length){toast('Все принятые проёмы уже начислены');return;}
  if(missing.some(item=>!item.floor.brigadeId||!(Number(item.floor.ratePerOpening)>0))){toast('Сначала задайте тариф и назначьте бригаду на каждый этаж с принятой работой');return;}
  if(!confirm(`Добавить в журнал начисления для ${missing.length} уже принятых проёмов по тарифам, указанным сейчас на этажах? После добавления суммы сохранятся в истории.`))return;
  try{
    if(cloudEnabled){
      const {data,error}=await supabaseClient.rpc('admin_backfill_opening_accruals');
      if(error){if(String(error.message||'').includes('admin_backfill_opening_accruals'))throw new Error('Сначала выполните js/data/data-base-finance.sql в Supabase.');if(String(error.message||'').includes('TARIFF_REQUIRED'))throw new Error('Сначала задайте тариф и назначьте бригаду на каждый этаж с принятой работой.');throw error;}
      await refreshBrigadeFinance();
      render();toast(`Исторические начисления добавлены: ${Number(data)||0}`);
    }else{
      for(const item of missing){
        const rate=Number(item.floor.ratePerOpening),doorCount=(item.opening.doors||[]).length;
        state.financeEntries.push({id:newRecordId('fe'),brigade_id:item.floor.brigadeId,entry_type:'accrual',amount:rate+(doorCount===2?500:0),occurred_on:String(item.opening.acceptedAt||new Date().toISOString()).slice(0,10),floor_id:item.floor.id,opening_id:item.opening.id,rate_per_opening:rate,door_count:doorCount,note:`${item.opening.title||'Принятый проём'} · Историческое начисление`,created_at:new Date().toISOString()});
      }
      await saveState();await refreshBrigadeFinance();render();toast(`Исторические начисления добавлены: ${missing.length}`);
    }
  }catch(error){toast(error.message||'Не удалось добавить исторические начисления');}
}

/* =========================================================================
   PAGE: SUPPLY (заявки + потребность объекта)
   ========================================================================= */
