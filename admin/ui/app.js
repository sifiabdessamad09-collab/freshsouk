'use strict';
const $=selector=>document.querySelector(selector);
const e=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=cents=>new Intl.NumberFormat('fr-MA',{maximumFractionDigits:2}).format(Number(cents)/100)+' DH';
const quantity=milli=>new Intl.NumberFormat('fr-MA',{maximumFractionDigits:3}).format(Number(milli)/1000);
const date=value=>new Intl.DateTimeFormat('fr-MA',{dateStyle:'medium',timeStyle:'short',timeZone:'Africa/Casablanca'}).format(new Date(value));
const statuses={pending:['À confirmer','جديد'],confirmed:['Confirmée','مؤكد'],preparing:['En préparation','كيتوجد'],out_for_delivery:['En livraison','فالتوصيل'],delivered:['Livrée','تسلّم'],cancelled:['Annulée','ملغي']};
const categories={legumes:'Légumes · الخضر',fruits:'Fruits · الفواكه',packs:'Paniers · السلال'};
const paths={dashboard:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',orders:'M8 4H5v17h14V4h-3M9 3h6v4H9zM8 12h8M8 16h5',products:'M4 7l8-4 8 4v10l-8 4-8-4zM4 7l8 4 8-4M12 11v10',lock:'M6 10h12v11H6zM8 10V7a4 4 0 0 1 8 0v3',logout:'M9 4H4v16h5M10 12h11M17 8l4 4-4 4',plus:'M12 4v16M4 12h16',refresh:'M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-1l2 2M4 16l2 2a7 7 0 0 0 12-1',download:'M12 3v12M7 10l5 5 5-5M4 16v5h16v-5',leaf:'M20 3C9 2 3 7 5 14c2 7 14 5 15-11ZM5 20l10-11',clock:'M12 8v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',money:'M3 6h18v12H3zM16 12h2M6 12h1M14 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0',alert:'M12 3L2 21h20zM12 9v5M12 17h.01'};
const icon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name]||paths.leaf}"/></svg>`;
document.querySelectorAll('[data-icon]').forEach(node=>node.innerHTML=icon(node.dataset.icon));
const state={session:null,products:[],images:[],orders:[],filters:{},page:1,route:'dashboard',generation:0,locked:false};
let toastTimer,expiryTimer,returnFocus;

function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,5500);}
async function api(path,options={}) {
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
  try {
    const response=await fetch(path,{...options,credentials:'same-origin',cache:'no-store',signal:controller.signal,headers:{Accept:'application/json',...(options.body?{'Content-Type':'application/json','X-Freshsouk-Admin':'1'}:{}),...options.headers}});
    if(response.status===401||response.status===403){lockSession();throw new Error('Session expirée ou compte non autorisé. Reconnectez-vous.');}
    if(state.locked)throw new Error('Session fermée.');
    if(!response.ok){const error=await response.json().catch(()=>({}));throw new Error(error.error||'La demande a échoué. Réessayez.');}
    return response;
  } catch(error) { if(error.name==='AbortError')throw new Error('Le serveur ne répond pas. Réessayez.');throw error; }
  finally {clearTimeout(timeout);}
}
function lockSession() {
  state.locked=true;state.generation++;state.session=null;state.orders=[];state.products=[];
  clearTimeout(expiryTimer);$('#editor').close();$('#dialogBody').replaceChildren();$('#identity').textContent='Session fermée';$('#navPending').textContent='';
  $('#content').innerHTML='<section class="error-panel"><h2>Votre session est fermée · سالات الجلسة</h2><p>Reconnectez-vous avec un compte administrateur autorisé.</p><a class="btn" href="/admin/">Se reconnecter · دخل من جديد</a></section>';
}
function openDialog(title,html){returnFocus=document.activeElement;$('#dialogTitle').textContent=title;$('#dialogBody').innerHTML=html;$('#editor').showModal();}
function closeDialog(){$('#editor').close();$('#dialogBody').replaceChildren();returnFocus?.focus();}
$('#closeDialog').addEventListener('click',closeDialog);
$('#editor').addEventListener('cancel',()=>{setTimeout(()=>{$('#dialogBody').replaceChildren();returnFocus?.focus();},0);});
$('#logout').addEventListener('click',()=>lockSession());
document.addEventListener('visibilitychange',()=>{if(state.session&&Date.now()>=Date.parse(state.session.expiresAt))lockSession();});
const badge=status=>`<span class="badge ${e(status)}">${e(statuses[status]?.[0]||status)}</span>`;
const arStatus=status=>statuses[status]?.[1]||'';
const empty=message=>`<div class="empty">${icon('leaf')}${e(message)}</div>`;
const button=(label,action,extra='',className='secondary')=>`<button type="button" class="btn ${className}" data-action="${action}" ${extra}>${label}</button>`;
function route(){const value=location.hash.slice(1);return ['dashboard','orders','products'].includes(value)?value:'dashboard';}
async function products(){const data=await(await api('/api/admin/products')).json();if(state.locked)return [];state.products=data.products;state.images=data.images;return data.products;}

async function loadPage() {
  if(!state.session||state.locked)return;
  const generation=++state.generation;state.route=route();
  const title={dashboard:['Dashboard','نظرة عامة'],orders:['Commandes','الطلبات'],products:['Produits & stocks','المنتجات والمخزون']}[state.route];
  $('#pageTitle').innerHTML=e(title[0])+` <small lang="ar" dir="rtl">${e(title[1])}</small>`;
  document.querySelectorAll('[data-route]').forEach(a=>{if(a.dataset.route===state.route)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  $('#content').innerHTML='<div class="loading">Chargement… · كنحمّلو المعطيات</div>';
  try {
    let html,pending;
    if(state.route==='dashboard') {
      const [stats,recent]=await Promise.all([api('/api/admin/dashboard').then(r=>r.json()),api('/api/admin/orders').then(r=>r.json())]);
      html=dashboardPage(stats,recent.orders);pending=stats.statuses.pending;
    } else if(state.route==='orders') {
      const params=new URLSearchParams({...state.filters,page:String(state.page)});
      const [data,stats]=await Promise.all([api('/api/admin/orders?'+params).then(r=>r.json()),api('/api/admin/dashboard').then(r=>r.json())]);if(state.locked)return;state.orders=data.orders;html=ordersPage(data);pending=stats.statuses.pending;
    } else {const [,stats]=await Promise.all([products(),api('/api/admin/dashboard').then(r=>r.json())]);html=productsPage();pending=stats.statuses.pending;}
    if(generation!==state.generation||state.locked)return;
    $('#navPending').textContent=pending||'';
    $('#content').innerHTML=html;
  } catch(error){if(generation===state.generation&&!state.locked)$('#content').innerHTML=`<div class="error-panel"><strong>Chargement impossible · ما قدرناش نحمّلو المعطيات</strong><p>${e(error.message)}</p>${button('Réessayer · عاود','reload')}</div>`;}
}
function metric(label,value,note,symbol,feature=false){return `<article class="metric ${feature?'feature':''}"><div class="metric-label">${e(label)}${icon(symbol)}</div><strong>${e(value)}</strong><small>${e(note)}</small></article>`;}
function orderRows(orders,compact=false) {
  if(!orders.length)return `<tr><td colspan="${compact?5:7}">${empty('Aucune commande pour le moment · ما كاين حتى طلب')}</td></tr>`;
  return orders.map(o=>`<tr><td><strong>#${e(o.id.slice(0,8).toUpperCase())}</strong><small>${e(date(o.created_at))}</small></td><td><strong>${e(o.customer_name)}</strong>${compact?'':`<small>${e(o.phone)}</small>`}</td>${compact?'':`<td>${e(o.delivery_slot)}<small>Casablanca</small></td>`}<td class="nowrap"><strong>${money(o.total_cents)}</strong></td><td>${badge(o.status)}<small lang="ar" dir="rtl">${e(arStatus(o.status))}</small></td>${compact?'':`<td><span class="badge">${o.source==='admin'?'Saisie admin':'Site'}</span></td>`}<td>${button('Détails','order-detail',`data-id="${e(o.id)}"`)}</td></tr>`).join('');
}
function dashboardPage(stats,recent) {
  return `<section class="page-intro"><div><h2>Votre marché, en un regard.</h2><p>Les commandes et les stocks de votre équipe.<br><span lang="ar" dir="rtl">نظرة على الطلبات والمخزون ديالك</span></p></div>${button(icon('refresh')+' Actualiser','reload')}</section>
    <section class="metrics" aria-label="Indicateurs">
    ${metric('Commandes du jour',stats.today,'الجديد اليوم · Journée à Casablanca','orders')}
    ${metric('Chiffre d’affaires livré',money(stats.revenueCents),'المداخيل · Commandes livrées uniquement','money',true)}
    ${metric('Panier moyen livré',money(stats.averageCents),'متوسط السلة · Commandes livrées','products')}
    ${metric('Alertes de stock',stats.lowStock,'المخزون ناقص · Produits actifs suivis','alert')}</section>
    <div class="split"><section class="panel"><div class="panel-header"><div><h3>Suivi des commandes · تتبع الطلبات</h3><p>Chaque étape reste enregistrée dans l’historique.</p></div><a href="#orders">Tout voir ↗</a></div><div class="status-grid">${Object.entries(statuses).map(([s,label])=>`<div class="status-box"><strong>${stats.statuses[s]||0}</strong>${badge(s)}<small lang="ar" dir="rtl">${e(label[1])}</small></div>`).join('')}</div></section>
    <section class="panel"><div class="panel-header"><div><h3>Les plus demandés</h3><p>Quantités des commandes livrées · الأكثر طلباً</p></div>${icon('leaf')}</div><div class="popular">${stats.popular.length?stats.popular.map((p,i)=>`<div class="popular-line"><b>0${i+1}</b><span>${e(p.name)}</span><small>${e(p.quantity)} ${e(p.unit)}</small></div>`).join(''):empty('Les premiers produits apparaîtront après livraison.')}</div></section></div>
    <section class="panel"><div class="panel-header"><div><h3>Dernières commandes · آخر الطلبات</h3><p>Les cinq demandes les plus récentes</p></div><a href="#orders">Toutes les commandes ↗</a></div><div class="table-wrap"><table><thead><tr><th>Commande</th><th>Client</th><th>Total</th><th>Statut</th><th></th></tr></thead><tbody>${orderRows(recent.slice(0,5),true)}</tbody></table></div></section>`;
}
function ordersPage(data) {
  return `<section class="page-intro"><div><h2>Chaque commande, au bon endroit.</h2><p>Recherchez, consultez et suivez vos livraisons.<br><span lang="ar" dir="rtl">قلّب على الطلبات وتبع التوصيل</span></p></div>${button(icon('plus')+' Nouvelle commande','new-order','','gold')}</section>
  <section class="panel"><form class="toolbar" id="orderFilters"><label class="search">Rechercher · قلب<input name="q" type="search" maxlength="100" value="${e(state.filters.q||'')}" placeholder="Nom, téléphone, numéro…"></label><label>Du · من<input type="date" name="from" value="${e(state.filters.from||'')}"></label><label>Au · حتى<input type="date" name="to" value="${e(state.filters.to||'')}"></label><label>Statut · الحالة<select name="status"><option value="">Tous les statuts</option>${Object.entries(statuses).map(([id,label])=>`<option value="${id}" ${state.filters.status===id?'selected':''}>${e(label[0])} · ${e(label[1])}</option>`).join('')}</select></label><button class="btn secondary" type="submit">Filtrer</button>${button(icon('download')+' CSV (5 000 max.)','export','aria-label="Exporter les commandes filtrées en CSV, 5000 maximum"')}</form>
  <div class="table-wrap"><table><thead><tr><th>Commande</th><th>Client · الزبون</th><th>Livraison</th><th>Total</th><th>Statut</th><th>Origine</th><th></th></tr></thead><tbody>${orderRows(data.orders)}</tbody></table></div><div class="pagination"><span>${data.total} commande(s) · Page ${data.page} sur ${Math.max(1,Math.ceil(data.total/data.pageSize))}</span><div>${button('← Précédente','previous',data.page<=1?'disabled':'')}${button('Suivante →','next',data.page*data.pageSize>=data.total?'disabled':'')}</div></div></section><p class="muted">Les exports contiennent des informations clients. Conservez-les dans un espace privé. · ملفات الزبناء خاصها تبقى خاصة</p>`;
}
function productRows(list) {
  if(!list.length)return `<tr><td colspan="6">${empty('Aucun produit correspondant · ما لقينا حتى منتوج')}</td></tr>`;
  return list.map(p=>`<tr><td><div class="product-name">${p.imageKey==='leaf'?`<span class="leaf-placeholder">${icon('leaf')}</span>`:`<img src="/admin/media/${e(p.imageKey)}.webp" alt="" width="54" height="48">`}<div><strong>${e(p.nameFr)}</strong><small lang="ar" dir="rtl">${e(p.nameAr)}</small></div></div></td><td>${e(categories[p.category])}<small>${e(p.unit)}</small></td><td class="nowrap"><strong>${money(p.priceCents)}</strong><small>par ${e(p.unit)}</small></td><td>${p.trackStock?`<strong class="${p.stockMilli<=p.lowStockMilli?'stock-low':''}">${quantity(p.stockMilli)} ${e(p.unit)}</strong><small>Seuil : ${quantity(p.lowStockMilli)}</small>`:'<span class="muted">Non suivi · ما كيتتبعش</span>'}</td><td><span class="badge ${p.active?'confirmed':'cancelled'}">${p.active?'Actif · خدام':'Archivé · موقوف'}</span></td><td class="nowrap">${button('Modifier','edit-product',`data-id="${e(p.id)}"`)}<button type="button" class="icon-button" data-action="product-history" data-id="${e(p.id)}" aria-label="Historique de ${e(p.nameFr)}">${icon('clock')}</button></td></tr>`).join('');
}
function productsPage() {
  return `<section class="page-intro"><div><h2>Du frais, toujours bien suivi.</h2><p>${state.products.length} produits dans votre catalogue privé.<br><span lang="ar" dir="rtl">سيّر المنتجات والثمن والمخزون</span></p></div>${button(icon('plus')+' Ajouter un produit','new-product','','gold')}</section><aside class="notice"><strong>Le site public conserve son catalogue actuel.</strong><p>Vos changements sont enregistrés dans cet espace. La synchronisation avec la boutique sera activée après validation. · التغييرات كيتحفظو هنا، الربط مع الموقع باقي خاصو الموافقة.</p></aside>
  <section class="panel"><form class="toolbar" id="productFilters"><label class="search">Rechercher · قلب<input name="q" type="search" placeholder="Nom français ou arabe…"></label><label>Catégorie<select name="category"><option value="">Toutes</option>${Object.entries(categories).map(([id,label])=>`<option value="${id}">${e(label)}</option>`).join('')}</select></label><label>Stock<select name="stock"><option value="">Tous les produits</option><option value="low">Stock bas</option><option value="untracked">Non suivi</option><option value="archived">Archivés</option></select></label></form><div class="table-wrap"><table><thead><tr><th>Produit · المنتوج</th><th>Catégorie</th><th>Prix</th><th>Stock · المخزون</th><th>Visibilité</th><th></th></tr></thead><tbody id="productRows">${productRows(state.products)}</tbody></table></div></section>`;
}
function field(label,name,type='text',value='',attrs='',full=false){return `<label class="field ${full?'full':''}">${label}<input name="${name}" type="${type}" value="${e(value)}" ${attrs}></label>`;}
async function editProduct(id) {
  if(!state.products.length)await products();
  const current=id?state.products.find(p=>p.id===id):null;
  if(id&&!current)throw new Error('Produit introuvable. Actualisez.');
  const p=current||{id:'',nameFr:'',nameAr:'',category:'legumes',unit:'kg',priceCents:100,stockMilli:0,lowStockMilli:5000,trackStock:false,active:true,imageKey:'leaf',descriptionFr:'',descriptionAr:''};
  openDialog(current?'Modifier le produit · بدّل المنتوج':'Nouveau produit · منتوج جديد',`<form id="productForm" data-id="${e(id||'')}"><div class="form-grid">
    ${field('Nom français · الاسم بالفرنسية','nameFr','text',p.nameFr,'required maxlength="160"')}${field('Nom arabe · الاسم بالعربية','nameAr','text',p.nameAr,'required maxlength="160" dir="rtl"')}
    ${field('Identifiant · المرجع','id','text',p.id,`required maxlength="80" pattern="[a-z0-9][a-z0-9-]{0,79}" ${current?'readonly':''}`)}
    <label class="field">Catégorie<select name="category">${Object.entries(categories).map(([key,label])=>`<option value="${key}" ${p.category===key?'selected':''}>${e(label)}</option>`).join('')}</select></label>
    ${field('Prix en DH · الثمن بالدرهم','price','number',p.priceCents/100,'required min="0.01" max="100000" step="0.01"')}
    <label class="field">Unité · الوحدة<select name="unit" ${current?'disabled':''}>${['kg','botte','unité','pack'].map(u=>`<option ${p.unit===u?'selected':''}>${u}</option>`).join('')}</select><small>Une unité existante est conservée pour protéger les commandes.</small></label>
    <div class="checks"><label><input type="checkbox" name="active" ${p.active?'checked':''}> Actif · خدام</label><label><input type="checkbox" name="trackStock" ${p.trackStock?'checked':''}> Suivre le stock · تتبع المخزون</label></div>
    ${field('Stock disponible · الكمية المتوفرة','stock','number',p.stockMilli/1000,`required min="0" max="100000" step="${p.unit==='kg'?'.5':'1'}" ${p.trackStock?'':'disabled'}`)}
    ${field('Alerte en dessous de · عتبة التنبيه','threshold','number',p.lowStockMilli/1000,`required min="0" max="100000" step="${p.unit==='kg'?'.5':'1'}"`)}
    <label class="field full">Photo du catalogue · الصورة<select name="imageKey">${state.images.map(key=>`<option value="${e(key)}" ${p.imageKey===key?'selected':''}>${e(key==='leaf'?'Sans photo · بلا صورة':key)}</option>`).join('')}</select></label>
    <label class="field full">Description française<textarea name="descriptionFr" maxlength="1000">${e(p.descriptionFr)}</textarea></label>
    <label class="field full">الوصف بالعربية<textarea name="descriptionAr" maxlength="1000" dir="rtl">${e(p.descriptionAr)}</textarea></label>
    ${field('Motif du changement · علاش التغيير','reason','text','','required minlength="3" maxlength="240" placeholder="Réception fournisseur, correction…"',true)}</div>
    <p class="form-error" role="status"></p><div class="form-actions">${button('Annuler · رجع','close')}<button class="btn gold" type="submit">Enregistrer · حفظ</button></div></form>`);
  const form=$('#productForm');
  form.elements.trackStock.addEventListener('change',()=>form.elements.stock.disabled=!form.elements.trackStock.checked);
  form.elements.unit.addEventListener('change',()=>{for(const key of ['stock','threshold'])form.elements[key].step=form.elements.unit.value==='kg'?'.5':'1';});
  if(!current)form.elements.nameFr.addEventListener('input',()=>{if(!form.elements.id.dataset.edited)form.elements.id.value=form.elements.nameFr.value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80);});
  form.elements.id.addEventListener('input',()=>form.elements.id.dataset.edited='true');
  form.addEventListener('submit',event=>submitForm(event,async()=>{
    const values=new FormData(form),body={id:values.get('id'),nameFr:values.get('nameFr'),nameAr:values.get('nameAr'),category:values.get('category'),unit:current?.unit||values.get('unit'),priceCents:Math.round(Number(values.get('price'))*100),active:form.elements.active.checked,trackStock:form.elements.trackStock.checked,stockMilli:Math.round(Number(form.elements.stock.value)*1000),lowStockMilli:Math.round(Number(values.get('threshold'))*1000),imageKey:values.get('imageKey'),descriptionFr:values.get('descriptionFr'),descriptionAr:values.get('descriptionAr'),reason:values.get('reason'),...(current?{version:current.version}:{})};
    await api('/api/admin/products'+(current?'/'+encodeURIComponent(current.id):''),{method:current?'PATCH':'POST',body:JSON.stringify(body)});
    closeDialog();toast('Produit enregistré · تحفظ المنتوج');await loadPage();
  }));
}
async function submitForm(event,action){event.preventDefault();const form=event.currentTarget,submit=form.querySelector('[type=submit]');submit.disabled=true;form.querySelector('.form-error').textContent='';try{await action();}catch(error){if(!state.locked&&form.isConnected)form.querySelector('.form-error').textContent=error.message;}finally{submit.disabled=false;}}

async function orderDetail(id) {
  const data=await(await api('/api/admin/orders/'+encodeURIComponent(id))).json(),o=data.order;
  openDialog('Commande #'+o.id.slice(0,8).toUpperCase(),`<div class="detail-grid"><div><label>Client · الزبون</label><p>${e(o.customer_name)}</p></div><div><label>Téléphone · الهاتف</label><p>${e(o.phone)}</p></div><div class="full"><label>Adresse · العنوان</label><p>${e(o.address)}<br>Casablanca</p></div><div><label>Créneau · وقت التوصيل</label><p>${e(o.delivery_slot)}</p></div><div><label>Statut · الحالة</label>${badge(o.status)}</div>${o.note?`<div class="full"><label>Note · ملاحظة</label><p>${e(o.note)}</p></div>`:''}</div><div class="table-wrap"><table><thead><tr><th>Produit</th><th>Quantité</th><th>Total</th></tr></thead><tbody>${data.items.map(i=>`<tr><td>${e(i.name_fr)}<small lang="ar" dir="rtl">${e(i.name_ar)}</small></td><td>${quantity(i.quantity_milli)} ${e(i.unit)}</td><td>${money(i.line_cents)}</td></tr>`).join('')}</tbody></table></div><div class="totals"><div><span>Produits · المنتجات</span><span>${money(o.subtotal_cents)}</span></div><div><span>Livraison · التوصيل</span><span>${money(o.delivery_cents)}</span></div><div><span>Total · المجموع</span><span>${money(o.total_cents)}</span></div></div>
  ${data.allowedStatuses.length?`<form id="statusForm"><label class="field">Prochaine étape · المرحلة الجاية<select name="status">${data.allowedStatuses.map(s=>`<option value="${s}">${e(statuses[s][0])} · ${e(statuses[s][1])}</option>`).join('')}</select></label><div id="cancelNotice" class="notice" hidden><label><input type="checkbox" name="confirmCancel"> Je confirme l’annulation et la restitution du stock réservé. · كنأكد إلغاء الطلب وإرجاع المخزون المحجوز.</label></div><p class="form-error" role="status"></p><div class="form-actions"><button class="btn" type="submit">Enregistrer le statut · حفظ الحالة</button></div></form>`:'<div class="notice">Cette commande est terminée. Son historique est conservé. · هاد الطلب سالا والتاريخ ديالو باقي محفوظ.</div>'}
  <section class="history"><h3>Historique · تاريخ الطلب</h3>${data.history.map(h=>{const detail=JSON.parse(h.details);return `<div class="history-item">${h.action==='created'?'Commande enregistrée':e(statuses[detail.from]?.[0]||detail.from)+' → '+e(statuses[detail.to]?.[0]||detail.to)}<small>${e(date(h.created_at))} · ${e(h.actor)}</small></div>`;}).join('')}</section>`);
  const form=$('#statusForm');
  if(form)form.elements.status.addEventListener('change',()=>{const cancel=form.elements.status.value==='cancelled';$('#cancelNotice').hidden=!cancel;form.elements.confirmCancel.required=cancel;form.elements.confirmCancel.checked=false;});
  if(form)form.addEventListener('submit',event=>submitForm(event,async()=>{
    const status=form.elements.status.value;
    if(status==='cancelled'&&!form.elements.confirmCancel.checked)throw new Error('Confirmez l’annulation avant d’enregistrer.');
    await api(`/api/admin/orders/${encodeURIComponent(id)}/status`,{method:'PATCH',body:JSON.stringify({status,version:o.version})});
    closeDialog();toast('Statut enregistré · تحفظات الحالة');await loadPage();await orderDetail(id);
  }));
}
async function productHistory(id){const data=await(await api(`/api/admin/products/${encodeURIComponent(id)}/history`)).json();openDialog('Historique produit · تاريخ المنتوج',data.history.length?`<div>${data.history.map(h=>{const d=JSON.parse(h.details);return `<div class="history-item"><strong>${e(h.action==='created'?'Création du produit':d.reason||'Mise à jour')}</strong>${d.old_stock_milli!==undefined?`<div>Stock : ${quantity(d.old_stock_milli)} → ${quantity(d.stock_milli)}</div>`:''}${d.old_price_cents!==undefined&&d.old_price_cents!==d.price_cents?`<div>Prix : ${money(d.old_price_cents)} → ${money(d.price_cents)}</div>`:''}<small>${e(date(h.created_at))} · ${e(h.actor)}</small></div>`;}).join('')}</div>`:empty('Aucun changement enregistré.'));}

function orderLine(){const options=state.products.filter(p=>p.active&&(!p.trackStock||p.stockMilli>0));return `<div class="order-line"><select name="product" aria-label="Produit">${options.map(p=>`<option value="${e(p.id)}">${e(p.nameFr)} — ${money(p.priceCents)} / ${e(p.unit)}</option>`).join('')}</select><input name="quantity" type="number" min="0.5" max="100" step="0.5" value="1" aria-label="Quantité" required><button type="button" class="icon-button" data-action="remove-line" aria-label="Retirer cette ligne">×</button></div>`;}
async function newOrder(){await products();if(!state.products.some(p=>p.active&&(!p.trackStock||p.stockMilli>0)))throw new Error('Ajoutez un produit disponible avant de créer une commande.');
  openDialog('Nouvelle commande · طلب جديد',`<form id="newOrderForm"><div class="form-grid">${field('Client · الاسم','name','text','','required minlength="2" maxlength="160"')}${field('Téléphone marocain · الهاتف','phone','tel','','required pattern="(0[567][0-9]{8}|\\+212[567][0-9]{8})" placeholder="06XXXXXXXX"')}${field('Adresse à Casablanca · العنوان','address','text','','required minlength="5" maxlength="500"',true)}<label class="field full">Créneau souhaité · الوقت<select name="slot">${['09h00 - 12h00','12h00 - 15h00','15h00 - 18h00','18h00 - 21h00'].map(s=>`<option>${s}</option>`).join('')}</select></label><div class="order-lines"><h3 class="section-label">Produits · المنتجات</h3><div id="orderLines">${orderLine()}</div>${button('+ Ajouter une ligne','add-line')}</div><label class="field full">Note facultative · ملاحظة<textarea name="note" maxlength="1000"></textarea></label></div><div class="notice">Les prix et les frais de livraison sont calculés au moment de l’enregistrement. Paiement à la livraison. · الثمن والتوصيل كيتحسبو ملي كيتسجل الطلب.</div><p class="form-error" role="status"></p><div class="form-actions">${button('Annuler','close')}<button type="submit" class="btn gold">Enregistrer la commande · سجّل الطلب</button></div></form>`);
  const form=$('#newOrderForm'),key=crypto.randomUUID();
  form.addEventListener('change',event=>{if(event.target.name==='product'){const p=state.products.find(p=>p.id===event.target.value),input=event.target.closest('.order-line').querySelector('input');input.min=input.step=p.unit==='kg'?'0.5':'1';if(p.unit!=='kg'&&!Number.isInteger(Number(input.value)))input.value='1';}});
  form.addEventListener('submit',event=>submitForm(event,async()=>{
    const items=[...form.querySelectorAll('.order-line')].map(line=>({productId:line.querySelector('select').value,quantity:Number(line.querySelector('input').value)}));
    if(!items.length)throw new Error('Ajoutez au moins un produit.');if(new Set(items.map(i=>i.productId)).size!==items.length)throw new Error('Chaque produit ne doit apparaître qu’une seule fois.');
    const body={customer:{name:form.elements.name.value,phone:form.elements.phone.value,address:form.elements.address.value,city:'Casablanca',slot:form.elements.slot.value},items,note:form.elements.note.value};
    const data=await(await api('/api/admin/orders',{method:'POST',headers:{'Idempotency-Key':key},body:JSON.stringify(body)})).json();
    closeDialog();toast('Commande enregistrée · تسجّل الطلب');state.page=1;state.filters={};if(location.hash!=='#orders')location.hash='orders';else await loadPage();await orderDetail(data.order.id);
  }));
}

document.addEventListener('click',async event=>{
  const target=event.target.closest('[data-action]');if(!target||target.disabled)return;
  try{
    switch(target.dataset.action){
      case 'reload':await loadPage();break;
      case 'close':closeDialog();break;
      case 'previous':state.page=Math.max(1,state.page-1);await loadPage();break;
      case 'next':state.page++;await loadPage();break;
      case 'export':{const params=new URLSearchParams(state.filters);location.assign('/api/admin/orders/export.csv?'+params);break;}
      case 'edit-product':await editProduct(target.dataset.id);break;
      case 'new-product':await editProduct();break;
      case 'product-history':await productHistory(target.dataset.id);break;
      case 'order-detail':await orderDetail(target.dataset.id);break;
      case 'new-order':await newOrder();break;
      case 'add-line':if($('#orderLines').children.length<32)$('#orderLines').insertAdjacentHTML('beforeend',orderLine());break;
      case 'remove-line':target.closest('.order-line').remove();break;
    }
  }catch(error){if(!state.locked)toast(error.message);}
});
document.addEventListener('submit',event=>{if(event.target.id==='orderFilters'){event.preventDefault();state.filters=Object.fromEntries([...new FormData(event.target)].filter(([,v])=>v));state.page=1;loadPage();}else if(event.target.id==='productFilters')event.preventDefault();});
document.addEventListener('input',event=>{const form=event.target.closest('#productFilters');if(form){const q=form.elements.q.value.toLocaleLowerCase(),category=form.elements.category.value,stock=form.elements.stock.value;const list=state.products.filter(p=>(!q||(p.nameFr+' '+p.nameAr).toLocaleLowerCase().includes(q))&&(!category||p.category===category)&&(!stock||(stock==='low'?p.active&&p.trackStock&&p.stockMilli<=p.lowStockMilli:stock==='untracked'?!p.trackStock:!p.active)));$('#productRows').innerHTML=productRows(list);}});
window.addEventListener('hashchange',loadPage);
async function start(){
  $('#demoBanner').hidden=!['127.0.0.1','localhost'].includes(location.hostname);
  $('#todayLabel').textContent=new Intl.DateTimeFormat('fr-MA',{dateStyle:'full',timeZone:'Africa/Casablanca'}).format(new Date());
  try{
    state.session=await(await api('/api/admin/session')).json();$('#identity').textContent=state.session.email;
    expiryTimer=setTimeout(lockSession,Math.max(0,Date.parse(state.session.expiresAt)-Date.now()));await loadPage();
  }catch(error){if(!state.locked)$('#content').innerHTML=`<section class="error-panel"><h2>Administration indisponible</h2><p>${e(error.message)}</p><p>Vérifiez la configuration du service et de l’accès privé. · تأكد من إعداد الولوج الخاص.</p></section>`;}
}
start();
