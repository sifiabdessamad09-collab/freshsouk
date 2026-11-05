/* Visual redesign: original order and cart functions remain in index.html. */
const fsAssetImages = {
  "tomates": "tomates",
  "carottes": "carottes",
  "oranges": "oranges",
  "oignons-rouges": "oignons",
  "herbes": "menthe",
  "pomme-de-terre": "pommes-de-terre",
  "oignons-blancs": "catalog-oignons-blancs",
  "concombres": "catalog-concombres",
  "poivrons": "catalog-poivrons",
  "courgettes": "catalog-courgettes",
  "courge-rouge": "catalog-courge-rouge",
  "navets": "catalog-navets",
  "chou": "catalog-chou",
  "brocoli": "catalog-brocoli",
  "chou-fleur": "catalog-chou-fleur",
  "aubergines": "catalog-aubergines",
  "haricots-verts": "catalog-haricots-verts",
  "petits-pois": "catalog-petits-pois",
  "pommes-rouges": "catalog-pommes-rouges",
  "bananes": "catalog-bananes",
  "kiwi": "catalog-kiwi",
  "mandarines": "catalog-mandarines",
  "fraises": "catalog-fraises",
  "raisins": "catalog-raisins",
  "poires": "catalog-poires",
  "peches-nectarines": "catalog-peches-nectarines",
  "pasteque": "catalog-pasteque",
  "melon": "catalog-melon",
  "grenades": "catalog-grenades"
};
const fsQoffas = [
 {id:'solo',fr:'Qoffa Solo',ar:'قفة فردية',description:'L’essentiel de la semaine pour une personne.',descriptionAr:'قفة فيها الأساسيات ديال السيمانة لشخص واحد.',items:[['pomme-de-terre',1],['tomates',.5],['oignons-rouges',.5],['carottes',.5],['courgettes',.5],['herbes',1]]},
 {id:'family',fr:'Qoffa Famille',ar:'قفة العائلة',description:'Une sélection généreuse pour toute la famille.',descriptionAr:'تشكيلة سخية من الخضر الطرية للعائلة كاملة.',items:[['pomme-de-terre',2],['tomates',1],['oignons-rouges',1],['carottes',1],['courgettes',1],['aubergines',.5],['poivrons',.5],['herbes',2]]},
 {id:'fruits',fr:'Qoffa Fruits',ar:'قفة الفواكه',description:'Des fruits frais et de saison pour faire le plein de vitamines.',descriptionAr:'فواكه طرية ومتنوعة باش تزيد الحيوية لنهارك.',items:[['oranges',1],['bananes',1],['pommes-rouges',1],['raisins',.5],['fraises',.5],['kiwi',.5]]}
];
function fsEscape(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function fsMoney(value){return new Intl.NumberFormat('fr-MA',{maximumFractionDigits:2}).format(value);}
const fsPackImages = {
 'pack-semaine-familial':'family',
 'pack-couscous-vendredi':'solo',
 'pack-jus-fruits':'fruits'
};
function fsImage(p){
 if(p.catalogSource==='live')return p.image;
 if(fsPackImages[p.id])return 'assets/'+fsPackImages[p.id]+'-transparent.webp';
 return fsAssetImages[p.id] ? 'assets/'+fsAssetImages[p.id]+'-transparent.webp' : p.image;
}
function fsIcons(){if(window.lucide) lucide.createIcons({attrs:{'stroke-width':1.6}});}
function fsCategory(category){
 searchQuery=''; document.getElementById('headerSearch').value='';
 setCategory(category==='herbes'?'all':category);
 if(category==='herbes'){searchQuery='herbes';renderProducts();}
 document.querySelectorAll('[data-category]').forEach(b=>b.classList.toggle('active',b.dataset.category===category));
}
function fsResetSearch(){fsCategory('all');}
function fsProductMarkup(p){
 return `<article class="product" data-product-id="${fsEscape(p.id)}">
 <div class="product-image"><img src="${fsEscape(fsImage(p))}" alt="${fsEscape(p.nameFr)} / ${fsEscape(p.nameAr)}" loading="lazy" decoding="async"></div>
 <div class="product-content"><div class="product-names"><h3>${fsEscape(p.nameFr)}</h3><span class="product-ar" lang="ar" dir="rtl">${fsEscape(p.nameAr)}</span></div>
 ${p.category==='packs'?`<details class="pack-details"><summary>Composition · شنو فيها</summary><p>${fsEscape(p.descriptionFr)}</p><p lang="ar" dir="rtl">${fsEscape(p.descriptionAr)}</p></details>`:''}
 <div class="product-bottom"><div class="product-price">${p.available===false?'<span>Indisponible · سالا المخزون</span><br>':''}${fsMoney(Number(p.price))} DH <small>/ ${fsEscape(p.unit==='Kg'?'kg':p.unit)}</small></div>
 <div class="product-purchase-row"><div class="quantity-picker" aria-label="Quantité / الكمية"><button type="button" aria-label="Diminuer / نقص" onclick="adjustProductQuantity(this,-1)"><i data-lucide="minus" aria-hidden="true"></i></button><output data-quantity-value data-quantity="1" data-unit="${fsEscape(p.unit)}" aria-live="polite">1</output><button type="button" aria-label="Augmenter / زيد" onclick="adjustProductQuantity(this,1)"><i data-lucide="plus" aria-hidden="true"></i></button></div><button class="fs-product-add" ${p.available===false?'disabled':''} onclick="addSelectedToCart('${fsEscape(p.id)}',this)" aria-label="Ajouter ${fsEscape(p.nameFr)} / زيد ${fsEscape(p.nameAr)}"><i data-lucide="plus" aria-hidden="true"></i></button></div></div></div></article>`;
}
function fsRenderQoffas(){
 const target=document.getElementById('qoffaGrid'); if(!target)return;
 const expanded=new Set([...target.querySelectorAll('details[open]')].map(d=>d.dataset.qoffa));
 target.innerHTML=fsQoffas.map(q=>{
 const available=q.items.every(([id])=>products.some(p=>p.id===id && p.active!==false && p.available!==false && p.inStock!==false));
 const total=q.items.reduce((sum,[id,qty])=>sum+(Number(products.find(p=>p.id===id)?.price)||0)*qty,0);
 return `<article class="fs-qoffa"><img class="fs-qoffa-image" src="assets/${q.id}-transparent.webp" alt="${q.fr} / ${q.ar}" ${q.id==='solo'?'fetchpriority="high"':'loading="lazy"'}><h2>${q.fr}<span lang="ar" dir="rtl">${q.ar}</span></h2><div class="fs-qoffa-description"><p>${q.description}</p><p lang="ary" dir="rtl">${q.descriptionAr}</p></div><p class="fs-qoffa-price">${available?'':'Indisponible · غير متوفرة · '}<strong>${fsMoney(total)} DH</strong></p><button class="fs-button fs-choose" onclick="fsAddQoffa('${q.id}')" ${available?'':'disabled'}>Choisir <i data-lucide="arrow-right" aria-hidden="true"></i><span lang="ar">اختار</span></button><details class="fs-qoffa-details" data-qoffa="${q.id}" ${expanded.has(q.id)?'open':''}><summary>Voir le contenu · شوف شنو فيها</summary><ul>${q.items.map(([id,quantity])=>{const p=products.find(p=>p.id===id);return `<li><span>${fsEscape(p?.nameFr||id)}<small lang="ar" dir="rtl">${fsEscape(p?.nameAr||'')}</small></span><b>${fsMoney(quantity)} ${p?.unit==='Kg'?'kg':fsEscape(p?.unit||'')}</b></li>`}).join('')}</ul></details></article>`;
 }).join('');
}
function fsAddQoffa(id){
 const q=fsQoffas.find(q=>q.id===id);if(!q)return;
 const lines=q.items.map(([productId,quantity])=>({product:products.find(p=>p.id===productId),quantity}));
 if(lines.some(l=>!l.product||l.product.available===false))return;
 for(const {product,quantity} of lines){const previous=cart.find(item=>item.id===product.id);if(previous)previous.quantity=Number((Number(previous.quantity)+quantity).toFixed(2));else cart.push({...product,quantity});}
 saveCart();openCart();fsIcons();
}
function fsRenderQuickProducts(){
 const host=document.getElementById('quickProducts');if(!host)return;
 host.innerHTML=['tomates','carottes','oranges','oignons-rouges','herbes','pomme-de-terre'].map(id=>{const p=products.find(p=>p.id===id);return p?`<button onclick="fsFindProduct('${id}')" aria-label="Voir ${fsEscape(p.nameFr)} / ${fsEscape(p.nameAr)}"><img src="${fsEscape(fsImage(p))}" alt="${fsEscape(p.nameFr)}" loading="lazy"><span>${fsEscape(p.nameFr.replace(' premium','').replace(' fraîches','').replace(' locales','').replace(' à jus','').replace('Herbes (coriandre, persil, céleri, menthe)','Herbes'))}</span><small lang="ar" dir="rtl">${fsEscape(p.nameAr)}</small></button>`:''}).join('');
}
function fsFindProduct(id){fsCategory('all');const card=document.querySelector(`[data-product-id="${id}"]`);if(card){card.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});card.classList.add('fs-highlight');setTimeout(()=>card.classList.remove('fs-highlight'),1600);}}
function fsInitHeroVideo(){
 const video=document.getElementById('fsHeroVideo'),toggle=document.getElementById('fsHeroVideoToggle');
 if(!video||!toggle)return;
 const hero=video.closest('.fs-video-hero'),reduced=matchMedia('(prefers-reduced-motion: reduce)');
 let wanted=!reduced.matches&&!navigator.connection?.saveData,inView=true;
 video.muted=true;video.defaultMuted=true;toggle.hidden=false;
 function label(){toggle.textContent=video.paused?'Lire la vidéo · شغّل الفيديو':'Pause vidéo · وقّف الفيديو';}
 function update(){
  if(!wanted||!inView||document.hidden){video.pause();label();return;}
  if(!video.getAttribute('src'))video.src=video.dataset.src;
  video.play().catch(()=>{if(!inView||document.hidden||!wanted)return;wanted=false;label();});
 }
 toggle.addEventListener('click',()=>{wanted=video.paused;update();});
 video.addEventListener('playing',()=>{hero.classList.add('fs-video-ready');label();});
 video.addEventListener('pause',label);
 video.addEventListener('error',()=>{wanted=false;video.pause();hero.classList.remove('fs-video-ready');label();});
 document.addEventListener('visibilitychange',update);
 reduced.addEventListener('change',()=>{if(reduced.matches){wanted=false;update();}});
 if('IntersectionObserver' in window)new IntersectionObserver(entries=>{
  inView=entries[0].isIntersecting;update();
 },{threshold:.05}).observe(hero);
 label();update();
}
/* Presentation only: the catalogue, cart and checkout keep their existing logic. */
function fsInitMotion(){
 const preference=matchMedia('(prefers-reduced-motion: reduce)');
 if(!('animate' in Element.prototype))return;
 const running=new Set(),seen=new Set();
 function play(element,frames,options={}){
  if(!element||preference.matches||document.hidden)return;
  const animation=element.animate(frames,{duration:560,easing:'cubic-bezier(.22,1,.36,1)',...options});
  running.add(animation);
  animation.finished.catch(()=>{}).finally(()=>running.delete(animation));
 }
 function stop(){for(const animation of running)animation.cancel();running.clear();}
 preference.addEventListener('change',()=>{if(preference.matches)stop();});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
 // Content stays visible without JS, observers or animation support.
 const observer='IntersectionObserver' in window?new IntersectionObserver(entries=>{
  for(const entry of entries){
   if(!entry.isIntersecting)continue;
   observer.unobserve(entry.target);
   const key=entry.target.dataset.productId||entry.target.querySelector('[data-qoffa]')?.dataset.qoffa||entry.target;
   if(seen.has(key))continue;
   seen.add(key);
   play(entry.target,[{opacity:.35,transform:'translateY(22px)'},{opacity:1,transform:'translateY(0)'}],{delay:Number(entry.target.dataset.motionDelay||0)});
  }
 },{threshold:.08}):null;
 function watch(container,selector){
  if(!container||!observer)return;
  function scan(){container.querySelectorAll(selector).forEach((element,index)=>{
   element.dataset.motionDelay=String((index%4)*55);
   observer.observe(element);
  });}
  scan();
  // Live catalogue refreshes replace cards; disconnect detached targets first.
  new MutationObserver(records=>{
   for(const record of records)for(const node of record.removedNodes){
    if(node.nodeType!==1)continue;
    observer.unobserve(node);
    node.querySelectorAll(selector).forEach(element=>observer.unobserve(element));
   }
   scan();
  }).observe(container,{childList:true});
 }
 watch(document.getElementById('productsContainer'),'.product');
 watch(document.getElementById('qoffaGrid'),'.fs-qoffa');
 document.querySelectorAll('.fs-additions-copy,.fs-catalog-heading,.fs-delivery').forEach(element=>observer?.observe(element));
 document.querySelectorAll('.fs-hero-copy > *').forEach((element,index)=>{
  play(element,[{opacity:0,transform:'translateY(16px)'},{opacity:1,transform:'translateY(0)'}],{delay:index*85,duration:680});
 });
 play(document.querySelector('.fs-hero-image'),[{transform:'scale(1.035)'},{transform:'scale(1)'}],{duration:1500});
 const count=document.getElementById('cartCount');
 if(count){
  let previous=Number(count.textContent)||0;
  new MutationObserver(()=>{
   const next=Number(count.textContent)||0;
   if(next>previous)play(count,[{transform:'scale(1)'},{transform:'scale(1.32)',offset:.4},{transform:'scale(1)'}],{duration:420});
   previous=next;
  }).observe(count,{childList:true,characterData:true,subtree:true});
 }
}
function fsSyncViewport(){
 const viewport=window.visualViewport;
 if(viewport&&viewport.scale!==1)return;
 const height=viewport?.height||window.innerHeight;
 if(!Number.isFinite(height)||height<=0)return;
 document.documentElement.style.setProperty('--fs-viewport-height',height+'px');
 document.documentElement.style.setProperty('--fs-viewport-top',(viewport?.offsetTop||0)+'px');
}
document.addEventListener('DOMContentLoaded',()=>{
 fsInitHeroVideo();
 fsInitMotion();
 fsSyncViewport();
 window.addEventListener('resize',fsSyncViewport,{passive:true});
 window.addEventListener('pageshow',fsSyncViewport,{passive:true});
 window.visualViewport?.addEventListener('resize',fsSyncViewport,{passive:true});
 window.visualViewport?.addEventListener('scroll',fsSyncViewport,{passive:true});
 fsIcons();
 document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){closeCart();closeCheckout();document.querySelector('.fs-cart')?.focus();}
  if(e.key==='Tab'){
   const dialog=document.querySelector('.cart-panel.active,.modal.active');if(!dialog)return;
   const controls=[...dialog.querySelectorAll('button:not([disabled]),input,select,textarea,a[href]')].filter(el=>el.getClientRects().length);
   const first=controls[0],last=controls[controls.length-1];
   if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
   else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
  }
 });
 const oldOpenCart=window.openCart;
 window.openCart=function(){oldOpenCart();fsIcons();document.querySelector('#cartPanel .close-btn')?.focus();};
 const oldOpenCheckout=window.openCheckout;
 window.openCheckout=function(){oldOpenCheckout();if(document.querySelector('#checkoutModal.active'))document.querySelector('#checkoutModal .close-btn')?.focus();};
 const oldCloseCart=window.closeCart;
 window.closeCart=function(){oldCloseCart();document.querySelector('.fs-cart')?.focus();};
 const oldCloseCheckout=window.closeCheckout;
 window.closeCheckout=function(){oldCloseCheckout();document.querySelector('.fs-cart')?.focus();};
 for(const [id,title] of [['cartPanel','fsCartTitle'],['checkoutModal','fsCheckoutTitle']]){
  const dialog=document.getElementById(id);dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');
  const heading=dialog.querySelector('h2');heading.id=title;dialog.setAttribute('aria-labelledby',title);
 }
});
