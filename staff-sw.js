/* Staff-only PWA cache. Never cache staff RPC responses, PINs or tokens. */
const CACHE_NAME='hasnaria-staff-pwa-v5';
const STATIC_CACHE='hasnaria-staff-static-v1';
const CORE=['/staff/'];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys()
    .then(keys=>Promise.all(keys.filter(key=>key.startsWith('hasnaria-staff-pwa-')&&key!==CACHE_NAME).map(key=>caches.delete(key))))
    .then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;
  // The hashed version query changes automatically whenever the build changes.
  // Cache only immutable UI bundles, NEVER the Supabase API or dynamic pages.
  if((url.pathname==='/staff-runtime.bundle.js'||url.pathname==='/staff-styles.bundle.css')&&url.searchParams.has('v')){
    event.respondWith(caches.open(STATIC_CACHE).then(async cache=>{
      const hit=await cache.match(request);
      if(hit)return hit;
      const response=await fetch(request);
      if(response.ok&&response.type==='basic'){
        const copy=response.clone();
        const task=cache.keys().then(keys=>Promise.all(keys.filter(item=>
          new URL(item.url).pathname===url.pathname&&item.url!==request.url
        ).map(item=>cache.delete(item)))).then(()=>cache.put(request,copy));
        event.waitUntil(task.catch(()=>{}));
      }
      return response;
    }).catch(()=>fetch(request)));
    return;
  }
  if(request.mode==='navigate'&&url.pathname.startsWith('/staff')){
    event.respondWith(fetch(request).then(response=>{
      if(response.ok){
        const copy=response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.put('/staff/',copy)).catch(()=>{}));
      }
      return response;
    }).catch(()=>caches.match('/staff/')));
    return;
  }
  if(url.pathname==='/staff.webmanifest'||url.pathname.startsWith('/staff-icons/')){
    event.respondWith(caches.match(request).then(hit=>hit||fetch(request)));
  }
});
