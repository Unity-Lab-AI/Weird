// DUNGEON MASTER: THE HUNT — The Gristle Pimp (organ/limb vendor). Moved off the film page so
// the Cutting Room shows ONLY films. Reached from the 🏬 Stores hub. Fence harvested wet goods.

(function () {
  'use strict';

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function render(el) {
    const s = window.DMTHGame.state.current;
    const bodyParts = (s.bodyParts || []).filter(p => p.listed);
    const bodyPartsTotal = bodyParts.reduce((t, p) => t + (p.value || 0), 0);

    el.innerHTML = `
      <div class="panel">
        <h2>🩸 The Gristle Pimp — Organ Vendor (${bodyParts.length})</h2>
        <p class="small muted">The Gristle Pimp buys whatever wet goods you cut off them. Stock him by taking limbs (🪚 Bone Saw → 🪓 Nugget) or cutting out organs (🔪 Harvest Knife → 🫀 Harvest) in a captive's hold, or via the 🪓 Dismember disposal path. Parts sell passively to him each tick — or fence one instantly below at a small discount. Moving meat is hot: each sale adds a little WANTED heat.</p>
        ${bodyParts.length === 0 ? `<p class="muted small">No parts on offer. Saw off her limbs or knife out her organs (in her hold), or Dismember a captive, to stock the Gristle Pimp.</p>` :
          `<div class="stat-row"><span>Listed value (passive)</span><b class="gold">≈ $${bodyPartsTotal.toLocaleString()}</b></div>
           <ul class="film-list">${bodyParts.map(p => `
             <li class="film-item">
               <div><b>${p.emoji || '🦴'} ${escapeHtml(p.name)}</b> <span class="muted small">· ${escapeHtml(p.girlName || '?')} · ${escapeHtml(p.archetype || '')}</span></div>
               <div class="stat-row small"><span>market value</span><b class="gold">$${(p.value || 0).toLocaleString()}</b></div>
               <div class="stat-row small"><button class="btn-small btn-danger" data-sell-part="${p.id}" data-tooltip="Fence this part to a black-market buyer right now for ~80% of value. Adds a little WANTED heat.">Fence now — $${Math.round((p.value || 0) * 0.8).toLocaleString()}</button></div>
             </li>`).join('')}</ul>`
        }
      </div>
    `;

    el.querySelectorAll('[data-sell-part]').forEach(b => {
      b.onclick = () => {
        try {
          const r = window.DMTHGame.market.sellBodyPartNow(b.dataset.sellPart);
          alert(`🦴 Fenced for $${r.price.toLocaleString()}.`);
          window.DMTHRouter.handle();
        } catch (err) { alert(err.message); }
      };
    });
  }

  window.DMTHRouter.register('gristle', render);
})();
