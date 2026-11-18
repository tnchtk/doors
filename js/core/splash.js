/* Экран загрузки: показывается сразу, уходит «ирисом», когда приложение готово. */
const Splash=(()=>{
  const el=document.getElementById('splash');
  const textEl=el?.querySelector('[data-splash-text]');
  const MIN_VISIBLE_MS=2100; // чтобы вступление успело проиграться
  const startedAt=performance.now();
  let seen=false;
  try{seen=sessionStorage.getItem('splashSeen')==='1';}catch(_){}
  let status='visible'; // visible | leaving | hidden
  let hideTimer=null;

  if(seen&&el)el.classList.add('is-quick');

  function show(message){
    if(!el)return;
    if(message&&textEl)textEl.textContent=message;
    clearTimeout(hideTimer);hideTimer=null;
    if(status!=='visible'){
      status='visible';
      el.classList.remove('is-hidden','is-leaving');
      el.classList.add('is-quick'); // повторно показываем без длинного вступления
    }
  }

  function finish(){
    if(status==='hidden')return;
    status='hidden';
    el.classList.add('is-hidden');
    el.classList.remove('is-leaving');
    try{sessionStorage.setItem('splashSeen','1');}catch(_){}
  }

  function hide(){
    if(!el||status!=='visible'||hideTimer)return;
    const wait=el.classList.contains('is-quick')?0:Math.max(0,MIN_VISIBLE_MS-(performance.now()-startedAt));
    hideTimer=setTimeout(()=>{
      hideTimer=null;
      if(status!=='visible')return;
      status='leaving';
      el.classList.add('is-leaving');
      el.addEventListener('animationend',event=>{if(event.target===el)finish();});
      // Запасной таймер на случай, если событие анимации не придёт (длительность ухода: 0,8 с или 0,3 с).
      setTimeout(finish,el.classList.contains('is-quick')?450:950);
    },wait);
  }

  return {show,hide};
})();
