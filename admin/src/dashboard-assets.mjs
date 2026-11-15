// Keep the existing private Worker authentication and headers around embedded UI.
export function dashboardEnvironment(env,assets) {
  return {...env,ASSETS:{async fetch(request) {
    const path=new URL(request.url).pathname;
    if(Object.hasOwn(assets,path)) {
      const {body,type}=assets[path];
      return new Response(body,{headers:{'content-type':type}});
    }
    return env.ASSETS?env.ASSETS.fetch(request):new Response('Not found',{status:404});
  }}};
}
