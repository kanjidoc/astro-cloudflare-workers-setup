// On every gated page: a page restored from the back/forward cache after sign-out must not
// show private content (technical spec §6.5). Safari may keep no-store pages in bfcache.
window.addEventListener('pageshow', (event) => {
  if (!event.persisted) return;
  fetch('/auth/session', { credentials: 'same-origin', cache: 'no-store' })
    .then((res) => {
      if (res.status === 401) location.reload();
    })
    .catch(() => undefined);
});

export {};
