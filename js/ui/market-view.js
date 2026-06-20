// DUNGEON MASTER: THE HUNT — content market page (films).
//
// Films auto-sell on the tick.js schedule (no manual "sales pass" button).
// Per-film passive-earnings ticker + "Sell negatives" premium button.
// Legacy 'sold' films (one-shot consumables from before the rewrite) still render in the
// Sales history section for back-compat.

(function () {
  'use strict';

  function render(el) {
    const s = window.DMTHGame.state.current;
    const listed = s.films.filter(f => f.status === 'listed');
    const sold = s.films.filter(f => f.status === 'sold').slice(-20).reverse();
    const destroyed = s.films.filter(f => f.status === 'destroyed').slice(-20).reverse();
    const archived = s.films.filter(f => f.status === 'archived');

    const totalPerTick = listed.reduce((t, f) => t + window.DMTHGame.market.estimatePerTick(f), 0);
    const totalLifetimePassive = listed.reduce((t, f) => t + (f.passiveEarnings || 0), 0);

    el.innerHTML = `
      <div class="panel">
        <h2>🎬 The Cutting Room — Content Market</h2>
        <p class="small muted">Films auto-sell every tick — passive infinite-copies model. Destroy a master via "💣 Sell negatives" for a one-time premium payout (much bigger than passive lifetime, but the film stops earning).</p>
        <div class="stat-row"><span>🔄 Auto-selling on tick</span><b class="ok">~$${totalPerTick.toLocaleString()} / tick (${listed.length} listed)</b></div>
        <div class="stat-row"><span>Lifetime passive earnings (still-listed)</span><b>$${totalLifetimePassive.toLocaleString()}</b></div>
        <div class="stat-row"><span>Demand multiplier</span><b>${window.DMTHGame.market.getDemand().overallBase.toFixed(2)}×</b></div>
      </div>

      <div class="panel">
        <h2>Listed films — generating passive income (${listed.length})</h2>
        ${listed.length === 0 ? `<p class="muted small">No films listed. Record some in a captive's hold.</p>` :
          `<ul class="film-list">${listed.map(renderListedRow).join('')}</ul>`
        }
      </div>

      <div class="panel">
        <h2>Negatives sold (${destroyed.length})</h2>
        ${destroyed.length === 0 ? `<p class="muted small">No negatives destroyed yet.</p>` :
          `<ul class="film-list">${destroyed.map(f => `
            <li class="film-item">
              <div>
                <b>${escapeHtml(f.title)}</b>
                <span class="muted small">· ${f.girlNameAtRecording}</span>
              </div>
              <div class="stat-row small">
                <span>💣 negatives premium</span>
                <b class="gold">$${(f.negativesSalePrice || 0).toLocaleString()}</b>
              </div>
              <div class="stat-row small">
                <span>(lifetime passive before destruction)</span>
                <b>$${(f.passiveEarnings || 0).toLocaleString()}</b>
              </div>
            </li>
          `).join('')}</ul>`
        }
      </div>

      <div class="panel">
        <h2>Sales history — legacy single-shot (${sold.length})</h2>
        ${sold.length === 0 ? `<p class="muted small">No legacy sales recorded. Films are infinite-copy assets now — old saves' "sold" rows still appear here for history.</p>` :
          `<ul class="film-list">${sold.map(f => `
            <li class="film-item">
              <div>
                <b>${escapeHtml(f.title)}</b>
                <span class="muted small">· ${f.girlNameAtRecording}</span>
              </div>
              <div>
                <span>$${(f.saleRecord?.price || 0).toLocaleString()}</span>
                <span class="muted small">· ${f.saleRecord?.buyer || '?'}</span>
              </div>
            </li>
          `).join('')}</ul>`
        }
      </div>

      <div class="panel">
        <h2>Archived (${archived.length})</h2>
        ${archived.length === 0 ? `<p class="muted small">Nothing archived.</p>` :
          `<ul class="small">${archived.map(f => `<li>${escapeHtml(f.title)} — <a href="#" data-relist="${f.id}">relist</a></li>`).join('')}</ul>`
        }
      </div>
    `;

    el.querySelectorAll('[data-unlist]').forEach(b => { b.onclick = () => { window.DMTHGame.market.unlist(b.dataset.unlist); window.DMTHRouter.handle(); }; });
    el.querySelectorAll('[data-relist]').forEach(a => { a.onclick = e => { e.preventDefault(); window.DMTHGame.market.relist(a.dataset.relist); window.DMTHRouter.handle(); }; });
    el.querySelectorAll('[data-sell-negatives]').forEach(b => {
      b.onclick = () => {
        const filmId = b.dataset.sellNegatives;
        const film = s.films.find(f => f.id === filmId);
        const estimate = window.DMTHGame.market.estimateNegativesPayout(film);
        if (!confirm(`Sell the negatives for "${film.title}"?\n\nDestroys the master copy. One-time payout ≈ $${estimate.toLocaleString()}.\nThe film stops generating passive income forever.`)) return;
        try {
          const r = window.DMTHGame.market.sellNegatives(filmId);
          alert(`💣 Negatives sold for $${r.premiumPayout.toLocaleString()}.`);
          window.DMTHRouter.handle();
        } catch (err) { alert(err.message); }
      };
    });
  }

  function renderListedRow(f) {
    const perTick = window.DMTHGame.market.estimatePerTick(f);
    const lifetime = f.passiveEarnings || 0;
    const lastTick = f.lastTickEarnings || 0;
    const premium = window.DMTHGame.market.estimateNegativesPayout(f);
    return `
      <li class="film-item">
        <div>
          <b>${escapeHtml(f.title)}</b>
          <span class="muted small">· ${f.girlNameAtRecording} · ${f.durationMinutes}min · ${(f.tags || []).join(' ') || '—'}</span>
        </div>
        ${f.summary ? `<details class="film-summary">
          <summary class="small muted" style="cursor:pointer">📄 View summary${typeof f.contentMultiplier === 'number' ? ` · content value ×${f.contentMultiplier.toFixed(2)}` : ''}</summary>
          ${Array.isArray(f.contentEvents) && f.contentEvents.length ? `<div class="small" style="margin:4px 0">${f.contentEvents.map(e => `<span class="tag-chip" style="display:inline-block;margin:1px 3px;padding:1px 6px;border:1px solid #444;border-radius:8px">${escapeHtml(e.label)} <b class="${e.value >= 0 ? 'ok' : 'warn'}">${e.value >= 0 ? '+' : ''}${(e.value * 100).toFixed(0)}%</b></span>`).join('')}</div>` : ''}
          <pre class="film-summary-text" style="max-height:240px;overflow:auto;white-space:pre-wrap;font-size:12px;line-height:1.45;background:#0d0d10;padding:8px;border-radius:6px;margin:4px 0">${escapeHtml(f.summary)}</pre>
        </details>` : ''}
        <div class="stat-row small">
          <span>≈ per tick</span>
          <b class="ok">$${perTick.toLocaleString()}</b>
        </div>
        <div class="stat-row small">
          <span>last tick earnings</span>
          <b>${lastTick > 0 ? '$' + lastTick.toLocaleString() : '—'}</b>
        </div>
        <div class="stat-row small">
          <span>lifetime passive</span>
          <b>$${lifetime.toLocaleString()}</b>
        </div>
        <div class="stat-row small">
          <button class="btn-small" data-unlist="${f.id}" data-tooltip="Yank this filth off the market for now — shelved in the archive, earns nothing while it sits, relist the depravity whenever you want the cash flowing again.">Unlist</button>
          <button class="btn-small btn-danger" data-sell-negatives="${f.id}" data-tooltip="Burn the master copy for a one-time 3.5× premium — buyers pay a fortune for the ONLY copy of her ruin, but this filth never earns again after. +2 notoriety.">💣 Sell negatives — $${premium.toLocaleString()}</button>
        </div>
      </li>
    `;
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  window.DMTHRouter.register('market', render);
})();
