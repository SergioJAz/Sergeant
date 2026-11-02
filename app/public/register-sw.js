// Production export supplies sw.js. Expo's development server must stay uncached.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    fetch('/sw.js', { cache: 'no-store' }).then((response) => {
      if (!response.ok || response.redirected || !response.headers.get('content-type')?.includes('javascript')) return;
      return navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
    }).catch((error) => console.warn('Sergeant offline support could not start:', error));
  });
}
