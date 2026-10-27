/* Installable FRESHSOUK. Installation is always initiated by the visitor. */
(()=>{
 let installPrompt=null;
 let registration=null;
 let lastFocus=null;
 let refreshing=false;
 const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
 const bar=()=>document.getElementById('pwaInstallBar');
 const dialog=()=>document.getElementById('pwaInstallDialog');
 const dismissed=()=>{try{return Date.now()-Number(localStorage.getItem('freshsouk_install_dismissed')||0)<7*86400000}catch{return false}};
 const dismiss=()=>{if(bar())bar().hidden=true;try{localStorage.setItem('freshsouk_install_dismissed',String(Date.now()))}catch{}};
 const updateInstalledUI=()=>{
  const installed=standalone();
  document.documentElement.dataset.pwaDisplay=installed?'standalone':'browser';
  document.querySelectorAll('[data-pwa-install]').forEach(button=>button.hidden=installed);
  if(installed&&bar())bar().hidden=true;
 };
 function showInstructions(){
  lastFocus=document.activeElement;
  if(typeof dialog().showModal==='function')dialog().showModal();else dialog().setAttribute('open','');
 }
 function closeInstructions(){
  if(typeof dialog().close==='function')dialog().close();else dialog().removeAttribute('open');
  lastFocus?.focus();
 }
 async function install(){
  if(standalone())return;
  if(!installPrompt){showInstructions();return;}
  const prompt=installPrompt;installPrompt=null;
  try{await prompt.prompt();const choice=await prompt.userChoice;if(choice.outcome==='accepted'&&bar())bar().hidden=true;}
  catch{showInstructions();}
 }
 function connection(){
  const offline=navigator.onLine===false;
  document.body.classList.toggle('is-offline',offline);
  document.getElementById('pwaConnection').hidden=!offline;
  document.documentElement.style.setProperty('--pwa-notice-height',offline?`${document.getElementById('pwaConnection').offsetHeight}px`:'0px');
  document.querySelectorAll('#cartPanel .cart-footer .btn-primary,#checkoutForm button[type="submit"]').forEach(button=>{
   button.dataset.pwaOrder='';
   if(offline){button.setAttribute('aria-disabled','true');button.setAttribute('aria-describedby','pwaConnection');}
   else{button.removeAttribute('aria-disabled');button.removeAttribute('aria-describedby');}
  });
 }
 function requireConnection(event){
  if(navigator.onLine!==false)return;
  const checkout=event.type==='submit'?event.target.id==='checkoutForm':event.target.closest?.('[data-pwa-order]');
  if(!checkout)return;
  event.preventDefault();event.stopImmediatePropagation();
  const notice=document.getElementById('pwaConnection');notice.hidden=false;notice.focus();
 }
 function offerUpdate(){if(registration?.waiting)document.getElementById('pwaUpdateBar').hidden=false;}
 window.addEventListener('beforeinstallprompt',event=>{
  event.preventDefault();installPrompt=event;
  if(bar()&&!standalone()&&!dismissed())bar().hidden=false;
 });
 window.addEventListener('appinstalled',()=>{
  installPrompt=null;if(bar())bar().hidden=true;
  document.querySelectorAll('[data-pwa-install]').forEach(button=>button.hidden=true);
  document.documentElement.dataset.pwaInstalled='true';
 });
 document.addEventListener('DOMContentLoaded',()=>{
  updateInstalledUI();connection();
  document.querySelectorAll('[data-pwa-install]').forEach(button=>button.addEventListener('click',install));
  document.getElementById('pwaDismiss').addEventListener('click',dismiss);
  document.getElementById('pwaDialogClose').addEventListener('click',closeInstructions);
  dialog().addEventListener('click',event=>{if(event.target===dialog()){const r=dialog().getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeInstructions();}});
  document.getElementById('pwaUpdate').addEventListener('click',()=>registration?.waiting?.postMessage({type:'SKIP_WAITING'}));
  window.addEventListener('online',connection);window.addEventListener('offline',connection);
  window.addEventListener('resize',connection);
  document.addEventListener('click',requireConnection,true);document.addEventListener('submit',requireConnection,true);
  if(typeof fsIcons==='function')fsIcons();
  if('serviceWorker' in navigator&&window.isSecureContext){
   navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'}).then(reg=>{
    registration=reg;document.documentElement.dataset.pwaServiceWorker='registered';offerUpdate();
    reg.addEventListener('updatefound',()=>{
     const worker=reg.installing;
     worker?.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller)offerUpdate();});
    });
    return navigator.serviceWorker.ready;
   }).then(()=>{document.documentElement.dataset.pwaServiceWorker='ready';}).catch(()=>{document.documentElement.dataset.pwaServiceWorker='unavailable';});
   navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(refreshing||!document.getElementById('pwaUpdateBar')||document.getElementById('pwaUpdateBar').hidden)return;
    refreshing=true;window.location.reload();
   });
  }
 });
})();
