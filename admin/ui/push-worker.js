'use strict';
// No fetch handler, no caches, no private data persisted or included on the lock screen.
self.addEventListener('push',event=>event.waitUntil(self.registration.showNotification('FreshSOUK',{
 body:'Nouvelle commande à consulter · طلب جديد خاصّك تشوفو',tag:'freshsouk-orders'
})));
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil((async()=>{const url=new URL('/admin/#orders',self.location.origin).href;
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const tab=windows.find(w=>new URL(w.url).pathname.startsWith('/admin/'));
  if(tab){await tab.navigate(url);return tab.focus();}return self.clients.openWindow(url);
 })());
});
