import worker from './worker.mjs';

// Public entry point has no Access/admin secrets or asset bindings.
// Only product information and protected order creation reach the shared database.
export default {
  fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (!['/api/catalog', '/api/orders', '/api/health'].includes(path)) {
      return Promise.resolve(Response.json({error:'Ressource introuvable.'}, {
        status:404, headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}
      }));
    }
    return worker.fetch(request, env);
  }
};
