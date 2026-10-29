'use strict';
(()=>{
 const apiBase='https://freshsouk-shop-api.freshsouk.workers.dev';
 const labels={pending:['À confirmer','باقي التأكيد'],confirmed:['Confirmée','تأكد الطلب'],preparing:['En préparation','كيتوجد'],out_for_delivery:['En livraison','فالتوصيل'],delivered:['Livrée','تسلّم'],cancelled:['Annulée','تلغى']};
 const sequence=['pending','confirmed','preparing','out_for_delivery','delivered'];
 const $=id=>document.getElementById(id),label=s=>labels[s].join(' · ');
 const date=value=>new Intl.DateTimeFormat('fr-MA',{dateStyle:'medium',timeStyle:'short',timeZone:'Africa/Casablanca'}).format(new Date(value));
 let controller,generation=0;
 function valid(data){return data&&/^[A-F0-9]{8}$/.test(data.reference)&&Object.hasOwn(labels,data.status)&&Number.isFinite(Date.parse(data.createdAt))&&Number.isFinite(Date.parse(data.updatedAt))&&Array.isArray(data.history)&&data.history.length<=101&&data.history.every(h=>Object.hasOwn(labels,h.status)&&Number.isFinite(Date.parse(h.at)));}
 function render(data){
  $('reference').textContent='#'+data.reference;$('currentStatus').textContent=label(data.status);
  for(const [id,value] of [['created',data.createdAt],['updated',data.updatedAt]]){$(id).textContent=date(value);$(id).dateTime=value;}
  const cancelled=data.status==='cancelled';$('cancelled').hidden=!cancelled;$('steps').hidden=cancelled;$('steps').replaceChildren();
  for(const [i,status] of sequence.entries()){
   const li=document.createElement('li');li.textContent=labels[status][0];const ar=document.createElement('span');ar.lang='ar';ar.dir='rtl';ar.textContent=labels[status][1];li.append(ar);
   if(i<sequence.indexOf(data.status))li.className='done';if(status===data.status)li.setAttribute('aria-current','step');$('steps').append(li);
  }
  $('history').replaceChildren();
  for(const event of data.history){const li=document.createElement('li');li.textContent=label(event.status);const time=document.createElement('time');time.dateTime=event.at;time.textContent=date(event.at);li.append(time);$('history').append(li);}
  $('order').hidden=false;$('feedback').hidden=true;
 }
 async function refresh(){
  const current=++generation;controller?.abort();controller=new AbortController();
  $('order').hidden=true;$('feedback').hidden=false;$('feedback').textContent='Chargement… · كنحدّثو الحالة…';$('refresh').disabled=true;
  const token=location.hash.slice(1);
  if(!/^[A-Za-z0-9_-]{43}$/.test(token)){$('feedback').textContent='Ouvrez le lien de suivi complet reçu de FreshSOUK. · حل رابط التتبع كامل اللي توصّلتي به.';$('refresh').disabled=false;return;}
  const activeController=controller,timeout=setTimeout(()=>activeController.abort(),10000);
  try{
   const response=await fetch(apiBase+'/api/track/'+encodeURIComponent(token),{credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',signal:controller.signal});
   if(!response.ok)throw new Error([404,410].includes(response.status)?'Ce lien est invalide, expiré ou révoqué. Demandez un nouveau lien à FreshSOUK. · هاد الرابط ما بقاتش فيه الصلاحية، طلب رابط جديد من FreshSOUK.':'Suivi indisponible. Réessayez dans une minute. · التتبع ما متوفرش دابا، عاود من بعد دقيقة.');
   const data=await response.json();if(!valid(data))throw new Error('Réponse de suivi invalide. · ما قدرناش نقراو حالة الطلب.');
   if(current===generation)render(data);
  }catch(error){if(current===generation){$('order').hidden=true;$('feedback').hidden=false;$('feedback').textContent=error.name==='AbortError'?'Connexion interrompue. Actualisez quand vous êtes en ligne. · تقطع الاتصال، عاود ملي يرجع الإنترنت.':error.message;}}
  finally{clearTimeout(timeout);if(current===generation)$('refresh').disabled=false;}
 }
 $('refresh').addEventListener('click',refresh);
 window.addEventListener('hashchange',refresh);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();else{generation++;controller?.abort();}});
 setInterval(()=>{if(!document.hidden)refresh();},30000);
 refresh();
})();
