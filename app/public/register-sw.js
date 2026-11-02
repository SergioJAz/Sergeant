// Production export supplies sw.js. Expo's development server must stay uncached.
if ('serviceWorker' in navigator) {
  // Resolve from this script, rather than the current page, so deep links share one worker scope.
  const base = new URL('./', document.currentScript.src);
  const worker = new URL('sw.js', base);
  window.addEventListener('load', () => {
    fetch(worker, { cache: 'no-store' }).then((response) => {
      if (!response.ok || response.redirected || !response.headers.get('content-type')?.includes('javascript')) return;
      return navigator.serviceWorker.register(worker.href, { scope: base.pathname, updateViaCache: 'none' });
    }).catch((error) => console.warn('Sergeant offline support could not start:', error));
  });
}
