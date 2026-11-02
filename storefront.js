/* Public settings only. Authentication and anti-abuse secrets stay in the Worker. */
window.FreshsoukStore = (() => {
  const apiUrl = 'https://freshsouk-shop-api.freshsouk.workers.dev';
  const sitekey = '0x4AAAAAAFp2ZZ69sg3BOgl1';
  let widget, token = '', loading;
  async function catalogue() {
    const response = await fetch(apiUrl + '/api/catalog', {cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(10000)});
    if (!response.ok) throw new Error('Catalogue indisponible · الكتالوج ما متوفرش دابا');
    const data = await response.json();
    if (!Array.isArray(data) || data.length > 10000 || data.some(p=>!p||!/^[a-z0-9][a-z0-9-]{0,79}$/.test(p.id)||typeof p.nameFr!=='string'||typeof p.nameAr!=='string'||!Number.isFinite(p.price)||p.price<=0)) throw new Error('Catalogue invalide');
    return data.map(p=>({...p,catalogSource:'live'}));
  }
  function payload(customer, items) {
    return {customer:{name:customer.name,phone:customer.phone,city:customer.city,address:[customer.neighborhood,customer.address].filter(Boolean).join(' — '),slot:customer.slot},
      items:items.map(p=>({productId:p.id,quantity:Number(p.quantity)})),note:customer.note||''};
  }
  function trackingUrl(receipt) {
    const link=receipt?.tracking;
    return link&&/^[A-Za-z0-9_-]{43}$/.test(link.token)&&Number.isFinite(Date.parse(link.expiresAt))&&Date.parse(link.expiresAt)>Date.now()
      ?'https://sifiabdessamad09-collab.github.io/freshsouk/track.html#'+link.token:null;
  }
  function showTracking(host,receipt) {
    const url=trackingUrl(receipt);if(!url)return;
    const section=document.createElement('section');section.style.cssText='display:grid;gap:12px;justify-items:center;margin:16px 0;';
    const title=document.createElement('p');title.textContent='Suivez votre commande avec votre lien personnel · تبع طلبك من الرابط الخاص ديالك';
    const link=document.createElement('a');link.className='btn-primary';link.href=url;link.rel='noreferrer';link.textContent='Suivre ma commande · تبع طلبي';
    const label=document.createElement('label');label.style.cssText='display:block;width:100%;min-width:0;';label.textContent='Lien de suivi à conserver · احتافظ برابط التتبع';
    const input=document.createElement('input');input.type='text';input.readOnly=true;input.value=url;input.setAttribute('aria-label','Lien de suivi personnel · رابط التتبع الخاص');input.style.cssText='display:block;width:100%;max-width:100%;box-sizing:border-box;font-size:16px;margin:12px 0;';label.append(input);
    const copy=document.createElement('button');copy.type='button';copy.className='btn-primary';copy.textContent='Copier le lien · نسخ الرابط';
    const message=document.createElement('p');message.setAttribute('aria-live','polite');
    copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(url);message.textContent='Lien copié · تنسخ الرابط';}catch{input.focus();input.select();message.textContent='Sélectionnez Copier pour conserver ce lien · اختار نسخ باش تحتافظ بالرابط';}});
    section.append(title,link,label,copy,message);host.append(section);
  }
  function whatsappUrl(customer,items,receipt,number) {
    if(!receipt?.id||!Number.isSafeInteger(receipt.totalCents)||!/^[1-9]\d{7,14}$/.test(number))throw new Error('Confirmation WhatsApp indisponible');
    const lines=items.map(p=>`${Number(p.quantity)} ${p.unit} — ${p.nameFr||p.name} / ${p.nameAr||''}`);
    const message=[
      'Bonjour FreshSOUK 👋 / السلام عليكم',
      'Commande déjà enregistrée / الطلب تسجل فالموقع : #'+receipt.id.slice(0,8).toUpperCase(),
      'Merci de traiter cette référence une seule fois / نفس الطلب، ماشي طلب جديد.',
      '',...lines,'',
      'Total / المجموع : '+(receipt.totalCents/100).toFixed(2)+' DH',
      'Paiement à la livraison / الخلاص عند التوصيل',
      'Nom / الاسم : '+customer.name,
      'Téléphone / الهاتف : '+customer.phone,
      'Ville / المدينة : '+customer.city,
      'Adresse / العنوان : '+[customer.neighborhood,customer.address].filter(Boolean).join(' — '),
      'Créneau / وقت التوصيل : '+customer.slot,
      ...(trackingUrl(receipt)?['Suivi de commande / تتبع الطلب : '+trackingUrl(receipt)]:[]),
      ...(customer.note?['Note / ملاحظة : '+customer.note]:[])
    ].join('\n');
    return 'https://wa.me/'+number+'?text='+encodeURIComponent(message);
  }
  function prepareChallenge() {
    const host=document.getElementById('orderChallenge');
    if (!host) return;
    if (!loading) loading=new Promise((resolve,reject)=>{
      if (window.turnstile) return resolve();
      const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;
      script.onload=resolve;script.onerror=()=>{loading=undefined;reject(new Error('Vérification indisponible · التحقق ما متوفرش'));};document.head.append(script);
    });
    return loading.then(()=>{
      if (widget!==undefined) {window.turnstile.reset(widget);token='';return;}
      widget=window.turnstile.render(host,{sitekey,action:'freshsouk-order',language:'fr',size:'flexible',callback:value=>{token=value;},'expired-callback':()=>{token='';},'error-callback':()=>{token='';}});
    });
  }
  async function save(customer,items,key) {
    const body=payload(customer,items);
    if(!token) throw new Error('Terminez la vérification de sécurité puis réessayez. · كمل التحقق الأمني وعاود.');
    const response=await fetch(apiUrl+'/api/orders',{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify({...body,turnstileToken:token}),signal:AbortSignal.timeout(20000)});
    const result=await response.json().catch(()=>({}));
    if(!response.ok||!result.ok||!result.order?.id||!Number.isSafeInteger(result.order.totalCents))throw new Error(result.error||'Enregistrement impossible · ما تسجلش الطلب');
    return result.order;
  }
  return {apiUrl,catalogue,payload,prepareChallenge,save,whatsappUrl,trackingUrl,showTracking};
})();
