function exportCSV(kind){
  let rows=[];
  if(kind==='csv'){
    rows.push(['Объект','Всего','Установлено','Осталось','Проблем','Готовность %']);
    state.objects.forEach(o=>{
      const od=objDoors(state,o.id); const c=countByStatus(od); const t=totalCount(c); const d=doneCount(c);
      rows.push([o.name, t, d, t-d-c.problem, c.problem, t?Math.round(d/t*100):0]);
    });
  } else if(kind==='brigades'){
    rows.push(['Бригада','Руководитель','Установлено','Осталось','Проблем','Цена/дверь']);
    state.brigades.forEach(b=>{const s=brigadeStats(b.id); rows.push([b.name,b.leader,s.done,s.remaining,s.c.problem,b.pricePerDoor]);});
  } else {
    rows.push(['Материал','Нужно','Есть','Не хватает','Ед.']);
    materialsTable(allDoors(state).map(x=>x.door)).forEach(m=>rows.push([m.name,m.needed,m.have,m.missing,m.unit]));
  }
  const csv = rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(';')).join('\n');
  const blob = new Blob(['\uFEFF'+csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download = kind+'_export.csv';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  toast('Файл выгружен');
}

