// DUNGEON MASTER: THE HUNT — toast notifications.

(function () {
  'use strict';

  let container = null;

  function ensureContainer() {
    if (container) return container;
    container = document.createElement('div');
    container.id = 'ssd-notify-container';
    Object.assign(container.style, {
      position: 'fixed', bottom: '20px', right: '20px',
      zIndex: '1000', display: 'flex', flexDirection: 'column', gap: '8px', pointerEvents: 'none'
    });
    document.body.appendChild(container);
    return container;
  }

  // opts:
  //   type       'info' | 'success' | 'warn' | 'error' | 'danger'
  //   durationMs  auto-dismiss delay (ignored when sticky)
  //   action      { label, href } — : renders a clickable button that navigates to a
  //               route (e.g. her hold) so a warning can be ACTED on, not just read.
  //   sticky      true → no auto-dismiss; adds a × close button. For warnings the player must act on.
  function show(text, { type = 'info', durationMs = 5000, action = null, sticky = false } = {}) {
    ensureContainer();
    const toast = document.createElement('div');
    toast.className = `ssd-toast ${type}`;
    Object.assign(toast.style, {
      padding: '12px 16px', borderRadius: '8px',
      background: type === 'error' || type === 'danger' ? '#3a1a14' : type === 'success' ? '#1a3a22' : type === 'warn' ? '#3a2e14' : '#22182c',
      border: `1px solid ${type === 'error' || type === 'danger' ? '#e14b3f' : type === 'success' ? '#53d68a' : type === 'warn' ? '#d6a853' : '#3a2a4a'}`,
      color: '#eee2f2', fontSize: '0.9rem', maxWidth: '340px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.5)', pointerEvents: 'auto',
      animation: 'ssd-toast-in 0.3s ease-out'
    });
    // Message line (textContent — never HTML, no injection).
    const msg = document.createElement('div');
    msg.textContent = text;
    toast.appendChild(msg);
    // optional action button (navigates via the hash router).
    if (action && action.label && action.href) {
      const btn = document.createElement('a');
      btn.href = action.href;
      btn.textContent = action.label;
      Object.assign(btn.style, {
        display: 'inline-block', marginTop: '8px', padding: '5px 10px', borderRadius: '6px',
        background: '#53203a', border: '1px solid #b0436f', color: '#ffd9ea',
        fontSize: '0.85rem', textDecoration: 'none', cursor: 'pointer', fontWeight: '600'
      });
      btn.onclick = () => { try { toast.remove(); } catch (e) { /* gone */ } };
      toast.appendChild(btn);
    }
    if (sticky) {
      const x = document.createElement('button');
      x.textContent = '✕';
      Object.assign(x.style, {
        position: 'absolute', top: '4px', right: '8px', background: 'transparent',
        border: 'none', color: '#aaa', cursor: 'pointer', fontSize: '0.85rem'
      });
      x.onclick = () => { try { toast.remove(); } catch (e) { /* gone */ } };
      toast.style.position = 'relative';
      toast.style.paddingRight = '26px';
      toast.appendChild(x);
    }
    container.appendChild(toast);
    if (!sticky) {
      setTimeout(() => {
        toast.style.transition = 'opacity 0.3s, transform 0.3s';
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(20px)';
        setTimeout(() => toast.remove(), 300);
      }, durationMs);
    }
  }

  window.DMTHNotify = Object.freeze({ show });
})();
