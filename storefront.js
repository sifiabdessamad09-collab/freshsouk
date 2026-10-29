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
  return {apiUrl,catalogue,payload,prepareChallenge,save};
})();
