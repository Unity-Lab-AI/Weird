// DUNGEON MASTER: THE HUNT — hash-based SPA router for the game page.

(function () {
  'use strict';

  const routes = {};
  let mountEl = null;
  let currentCleanup = null;

  // Register a view renderer for a hash route.
  //
  // DISPOSER CONTRACT: a renderFn MAY return a cleanup function. Any view that attaches
  // listeners to `document` / `window`, starts a `setInterval` / `setTimeout`, subscribes to
  // `state.onChange`, or listens for a custom event MUST return a disposer that tears all of
  // that down. The router calls the previous view's disposer before mounting the next view
  // (see handle() below). Listeners bound to elements INSIDE mountEl are GC'd with the DOM on
  // re-render and don't need manual removal — but anything bound OUTSIDE mountEl will leak
  // across navigations without a disposer.
  function register(path, renderFn) { routes[path] = renderFn; }

  function mount(el) { mountEl = el; }

  function go(path, params) {
    const newHash = '#' + path + (params ? '?' + new URLSearchParams(params).toString() : '');
    if (location.hash !== newHash) location.hash = newHash;
    else handle();
  }

  function handle() {
    const hash = (location.hash || '#dashboard').replace(/^#/, '');
    const [path, qs] = hash.split('?');
    const params = Object.fromEntries(new URLSearchParams(qs || ''));
    const render = routes[path] || routes['dashboard'] || (() => { mountEl.textContent = 'not found'; });
    if (currentCleanup) { try { currentCleanup(); } catch (e) { console.debug('[router] view cleanup threw', e); } currentCleanup = null; }
    mountEl.innerHTML = '';
    const cleanup = render(mountEl, params);
    if (typeof cleanup === 'function') currentCleanup = cleanup;
    // highlight active nav
    document.querySelectorAll('[data-route]').forEach(a => {
      a.classList.toggle('active', a.dataset.route === path);
    });
  }

  window.addEventListener('hashchange', handle);
  document.addEventListener('DOMContentLoaded', () => { if (mountEl) handle(); });

  window.DMTHRouter = Object.freeze({ register, mount, go, handle });
})();
