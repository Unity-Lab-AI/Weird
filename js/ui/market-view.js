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
    const bodyParts = (s.bodyParts || []).filter(p => p.listed);
    const bodyPartsTotal = bodyParts.reduce((t, p) => t + (p.value || 0), 0);
    const milk = window.DMTHGame.milk;
    const milkStock = milk ? milk.milkStock() : 0;
    const ownedSuckers = milk ? milk.ownedTitSuckers() : 0;
    const lactating = milk ? milk.lactatingCount() : 0;

    const totalPerTick = listed.reduce((t, f) => t + window.DMTHGame.market.estimatePerTick(f), 0);
    const totalLifetimePassive = listed.reduce((t, f) => t + (f.passiveEarnings || 0), 0);

    el.innerHTML = `
      <div class="panel">
        <h2>🎬 Content Market</h2>
        <p class="small muted">Films auto-sell every tick — passive infinite-copies model. Destroy a master via "💣 Sell negatives" for a one-time premium payout (much bigger than passive lifetime, but the film stops earning).</p>
        <div class="stat-row"><span>🔄 Auto-selling on tick</span><b class="ok">~$${totalPerTick.toLocaleString()} / tick (${listed.length} listed)</b></div>
        <div class="stat-row"><span>Lifetime passive earnings (still-listed)</span><b>$${totalLifetimePassive.toLocaleString()}</b></div>
        <div class="stat-row"><span>Demand multiplier</span><b>${window.DMTHGame.market.getDemand().overallBase.toFixed(2)}×</b></div>
      </div>

      <div class="panel">
        <h2>🥛 Milk Trade</h2>
        <p class="small muted">Buy a <b>Tit Sucker</b> machine and attach one per hold (in her room) to passively bottle that lactating girl's milk over time. A girl lactates while pregnant (2nd trimester+) or freshly postpartum; her tits refill slowly, so milk's only abundant once you keep several preggos going at once (a 🍈 Cow-Tits girl makes double). Bottled girl-milk auto-sells a little each tick to johns / black-market buyers — or sell / drink it here. A girl drinking it is soothed + made pliable; you drinking it tops Nut Reserve + satisfaction + buzz.</p>
        <div class="stat-row"><span>🍼 Tit Suckers (unattached)</span><b>${ownedSuckers}</b></div>
        <div class="stat-row"><span>🤰 Lactating captives</span><b>${lactating}</b></div>
        <div class="stat-row"><span>🥛 Girl-milk in stock</span><b class="gold">${milkStock}L</b></div>
        <div class="stat-row" style="gap:6px;flex-wrap:wrap">
          <button class="btn-small btn-primary" data-buy-titsucker data-tooltip="A Tit Sucker machine — attach one to a hold (her room) to bottle that girl's milk while she lactates. One per hold; buy as many as you have holds to rig.">Buy Tit Sucker — $${milk ? milk.TIT_SUCKER_COST : 600}</button>
          <button class="btn-small" data-sell-milk ${milkStock < 1 ? 'disabled' : ''} data-tooltip="Sell ALL girl-milk in stock instantly at the market for $${milk ? milk.MILK_PRICE : 18}/L.">Sell all milk — $${(milkStock * (milk ? milk.MILK_PRICE : 18)).toLocaleString()}</button>
          <button class="btn-small" data-drink-milk-player ${milkStock < 1 ? 'disabled' : ''} data-tooltip="You drink 1L — +satisfaction (feeds hunting bonus) + buzz + Nut Reserve.">🥛 Drink 1L (stat boost)</button>
        </div>
      </div>

      <div class="panel">
        <h2>🩸 The Offal Man — Organ Vendor (${bodyParts.length})</h2>
        <p class="small muted">The Offal Man buys whatever wet goods you cut off them. Stock him by taking limbs (🪚 Bone Saw → 🪓 Nugget) or cutting out organs (🔪 Harvest Knife → 🫀 Harvest) in a captive's hold, or via the 🪓 Dismember disposal path. Parts sell passively to him each tick — or fence one instantly below at a small discount. Moving meat is hot: each sale adds a little WANTED heat.</p>
        ${bodyParts.length === 0 ? `<p class="muted small">No parts on offer. Saw off her limbs or knife out her organs (in her hold), or Dismember a captive, to stock the Offal Man.</p>` :
          `<div class="stat-row"><span>Listed value (passive)</span><b class="gold">≈ $${bodyPartsTotal.toLocaleString()}</b></div>
           <ul class="film-list">${bodyParts.map(p => `
             <li class="film-item">
               <div><b>${p.emoji || '🦴'} ${escapeHtml(p.name)}</b> <span class="muted small">· ${escapeHtml(p.girlName || '?')} · ${escapeHtml(p.archetype || '')}</span></div>
               <div class="stat-row small"><span>market value</span><b class="gold">$${(p.value || 0).toLocaleString()}</b></div>
               <div class="stat-row small"><button class="btn-small btn-danger" data-sell-part="${p.id}" data-tooltip="Fence this part to a black-market buyer right now for ~80% of value. Adds a little WANTED heat.">Fence now — $${Math.round((p.value||0)*0.8).toLocaleString()}</button></div>
             </li>`).join('')}</ul>`
        }
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

    const milkBuy = el.querySelector('[data-buy-titsucker]');
    if (milkBuy) milkBuy.onclick = () => { const r = window.DMTHGame.milk.buyTitSucker(); if (!r.ok) alert(r.reason); window.DMTHRouter.handle(); };
    const milkSell = el.querySelector('[data-sell-milk]');
    if (milkSell) milkSell.onclick = () => { const r = window.DMTHGame.milk.sellMilk(window.DMTHGame.milk.milkStock()); if (!r.ok) { alert(r.reason); return; } alert(`🥛 Sold ${r.qty}L for $${r.price.toLocaleString()}.`); window.DMTHRouter.handle(); };
    const milkDrink = el.querySelector('[data-drink-milk-player]');
    if (milkDrink) milkDrink.onclick = () => { const r = window.DMTHGame.milk.drinkPlayer(); if (!r.ok) { alert(r.reason); return; } window.DMTHRouter.handle(); };
    el.querySelectorAll('[data-sell-part]').forEach(b => {
      b.onclick = () => {
        try {
          const r = window.DMTHGame.market.sellBodyPartNow(b.dataset.sellPart);
          alert(`🦴 Fenced for $${r.price.toLocaleString()}.`);
          window.DMTHRouter.handle();
        } catch (err) { alert(err.message); }
      };
    });
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
          <button class="btn-small" data-unlist="${f.id}" data-tooltip="Pull this film off the market temporarily. Goes to archive. Relist any time. No income while unlisted.">Unlist</button>
          <button class="btn-small btn-danger" data-sell-negatives="${f.id}" data-tooltip="Destroys the master copy for a one-time 3.5× premium payout. Film stops earning forever. +2 notoriety hit.">💣 Sell negatives — $${premium.toLocaleString()}</button>
        </div>
      </li>
    `;
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  window.DMTHRouter.register('market', render);
})();
