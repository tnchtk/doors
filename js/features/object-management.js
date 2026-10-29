function pageObjectManagement(){
  if(cloudEnabled&&cloudProfile?.role!=='manager')return '<div class="empty">Этот раздел доступен менеджеру.</div>';
  const objects=state.objects||[];
  return `
    <div class="section-title"><h2>Управление объектами</h2></div>
    <div class="subhead">Создавайте объекты, добавляйте блоки и архивируйте завершённые. Архив сохраняет данные и его можно восстановить.</div>
    <div class="panel">
      <div class="panel-head"><div><h3>Объекты и блоки</h3><span class="hint">Окончательно удалить объект может только администратор</span></div><button class="btn primary sm" data-create-object>+ Новый объект</button></div>
    </div>
    <div class="object-management-list">
      ${objects.map(object=>{
        const archived=Boolean(object.archivedAt);
        const blocks=object.blocks||[];
        const apartments=blocks.reduce((sum,block)=>sum+(block.floors||[]).reduce((floorSum,floor)=>floorSum+(floor.apartments||[]).length,0),0);
        const doors=blocks.reduce((sum,block)=>sum+(block.floors||[]).reduce((floorSum,floor)=>floorSum+(floor.apartments||[]).reduce((aptSum,apartment)=>aptSum+apartmentDoors(apartment).length,0),0),0);
        return `<article class="panel object-management-card ${archived?'is-archived':''}">
          <header class="object-management-head"><div><h3>${htmlEscape(object.name)}</h3>${object.address?`<p>${htmlEscape(object.address)}</p>`:''}</div><span class="pill ${archived?'neutral':'ok'}">${archived?'В архиве':'Активен'}</span></header>
          <div class="object-management-stats"><span>${blocks.length} блоков</span><span>${apartments} квартир</span><span>${doors} дверей</span></div>
          <div class="object-management-actions">
            ${archived?'':`<button class="btn sm" data-managed-object-edit="${htmlEscape(object.id)}">Изменить объект</button><button class="btn sm" data-managed-add-block="${htmlEscape(object.id)}">+ Добавить блок</button>`}
            <button class="btn sm ${archived?'primary':'danger'}" data-object-archive="${htmlEscape(object.id)}" data-archived="${archived?'1':'0'}">${archived?'Восстановить':'Архивировать'}</button>
          </div>
          ${blocks.length?`<div class="object-management-blocks"><strong>Блоки</strong>${blocks.map(block=>`<div class="object-management-block"><span>${htmlEscape(block.name)}</span>${archived?'':`<button type="button" class="btn sm" data-managed-block-edit='${htmlEscape(JSON.stringify({objId:object.id,blockId:block.id}))}'>Изменить</button>`}</div>`).join('')}</div>`:'<div class="object-management-empty">Блоков пока нет</div>'}
        </article>`;
      }).join('')||'<div class="panel empty">Объектов пока нет. Создайте первый объект.</div>'}
    </div>
  `;
}
