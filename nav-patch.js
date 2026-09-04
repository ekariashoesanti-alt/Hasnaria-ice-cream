(function () {
  'use strict';
  var LABELS = { dashboard: 'Hari Ini', sales: 'Penjualan', ops: 'Keuangan', stok: 'Stok', shift: 'HR', social: 'Medsos' };

  function moveNav() {
    var app=document.getElementById('app'),header=app&&app.querySelector('header'),head=header&&header.querySelector('.head'),tabs=document.getElementById('tabs');
    if(!head||!tabs)return;
    if(tabs.parentElement!==head)head.insertBefore(tabs,head.querySelector('.user-box')||null);
    tabs.classList.add('hasnaria-header-nav');
  }

  function styleButtons(){
    var tabs=document.getElementById('tabs');
    if(!tabs)return;
    Array.prototype.forEach.call(tabs.querySelectorAll('.tab'),function(b){
      var id=b.getAttribute('data-tab'),label=LABELS[id];
      if(label){b.textContent=label;b.setAttribute('aria-label',label);b.style.display=''}
      else if(b.id!=='userSettingsTab')b.style.display='none'
    });
  }

  function syncGroupedContent(){
    var active=document.querySelector('#tabs .tab.on'),id=active&&active.getAttribute('data-tab'),team=document.getElementById('team'),approval=document.getElementById('approval');
    if(id==='shift'){if(team)team.classList.remove('hidden');if(approval)approval.classList.add('hidden')}
    else if(id==='ops'){if(approval)approval.classList.remove('hidden');if(team)team.classList.add('hidden')}
    else{if(approval)approval.classList.add('hidden');if(team)team.classList.add('hidden')}
  }

  function superAdmin(){
    var email='';
    var who=document.getElementById('whoMeta');
    if(who){
      var parts=(who.textContent||'').split('\u00b7').map(function(x){return x.trim()});
      for(var i=0;i<parts.length;i++){
        if(parts[i].indexOf('@')>=0){email=parts[i].toLowerCase();break}
      }
    }
    return email==='harisnu@gmail.com'||email==='ekariashoesanti@gmail.com';
  }

  function closeAccountMenu(){
    var menu=document.getElementById('hasnariaAccountMenu');
    var btn=document.getElementById('hasnariaAccountMenuBtn');
    if(menu){menu.classList.remove('open');menu.setAttribute('aria-hidden','true')}
    if(btn)btn.setAttribute('aria-expanded','false');
  }

  function getAccountEmail(){
    var meta=document.getElementById('whoMeta');
    if(!meta) return '';
    var parts=(meta.textContent||'').split('\u00b7').map(function(x){return x.trim()});
    for(var i=0;i<parts.length;i++){
      if(parts[i].indexOf('@')>=0) return parts[i];
    }
    return '';
  }

  function showAccountPage(mode){
    var page=document.getElementById('hasnariaAccountPage');
    if(!page){
      page=document.createElement('div');
      page.id='hasnariaAccountPage';
      page.className='hasnaria-account-page';
      page.innerHTML='LOADING';
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){});else ;
})();
