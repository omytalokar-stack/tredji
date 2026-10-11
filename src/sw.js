import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

precacheAndRoute(self.__WB_MANIFEST);
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')));

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (error) {
    console.error('Unable to parse push notification payload.', error);
  }

  const title = typeof payload.title === 'string' ? payload.title : 'TrapDetector AI alert';
  const options = {
    body: typeof payload.body === 'string' ? payload.body : 'A critical MTF trap signal was detected.',
    icon: '/icons/trapdetector-192.svg',
    badge: '/icons/trapdetector-192.svg',
    tag: typeof payload.tag === 'string' ? payload.tag : 'trapdetector-alert',
    data: { url: typeof payload.url === 'string' ? payload.url : '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existingClient = clients.find((client) => client.url === targetUrl);
      if (existingClient && 'focus' in existingClient) return existingClient.focus();
      return self.clients.openWindow(targetUrl);
    })
  );
});
