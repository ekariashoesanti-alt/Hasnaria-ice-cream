const CACHE_NAME='hasnaria-staff-pwa-v3';
const CORE=[
  '/staff/',
  '/staff.webmanifest',
  '/staff-icons/icon-192.png',
  '/staff-icons/icon.svg',
  '/staff-icons/icon-maskable.svg',
  '/staff-icons/apple-touch-icon.png'
];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key.startsWith('hasnaria-staff-pwa-')&&key!==CACHE_NAME).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;

  if(request.mode==='navigate' && url.pathname.startsWith('/staff')){
    event.respondWith(
      fetch(request)
        .then(response=>{
          const copy=response.clone();
          caches.open(CACHE_NAME).then(cache=>cache.put('/staff/',copy)).catch(()=>{});
          return response;
        })
        .catch(()=>caches.match('/staff/'))
    );
    return;
  }

  if(url.pathname==='/staff.webmanifest' || url.pathname.startsWith('/staff-icons/')){
    event.respondWith(caches.match(request).then(hit=>hit||fetch(request)));
  }
});
