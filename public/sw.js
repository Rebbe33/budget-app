// Service worker minimal : permet l'installation de l'appli sur l'écran d'accueil.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
