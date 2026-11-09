'use strict';
// Only appearance preferences are persisted. No customer, order or session data.
(()=>{
 let theme;try{theme=localStorage.getItem('freshsouk-admin-theme');}catch{}
 const system=matchMedia('(prefers-color-scheme: dark)');
 document.documentElement.dataset.theme=['light','dark'].includes(theme)?theme:(system.matches?'dark':'light');
 system.addEventListener('change',()=>{let saved;try{saved=localStorage.getItem('freshsouk-admin-theme');}catch{}if(!saved)document.documentElement.dataset.theme=system.matches?'dark':'light';});
})();
