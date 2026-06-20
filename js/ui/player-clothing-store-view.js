// DUNGEON MASTER: THE HUNT — your OWN clothing store .
// A normal clothing store for the PLAYER: buy clothes for your created character; whatever you
// WEAR is what renders on you in every image you appear in with the girls (Shot-with-me / POV).
// Reads playerWardrobe.catalog() + buy/wear; the worn outfit's descriptor flows into
// playerCharacter.startClothing → imaging playerCharacterTokens/playerPovTokens.

(function () {
  'use strict';

  function render(el) {
    const s = window.DMTHGame.state.current;
    const pw = window.DMTHGame.playerWardrobe;
    if (!pw || !pw.catalog) { el.innerHTML = '<div class="panel"><p class="muted">Player wardrobe system unavailable.</p></div>'; return; }
    const money = s.wallet.money;
    const outfits = pw.catalog();
    const wornId = pw.currentId();
    const pc = window.DMTHGame.state.getPlayerCharacter();

    el.innerHTML = `
      <div class="panel">
        <h2>🧥 The Fitting Room — Your Clothes</h2>
        <p class="small muted">Dress YOURSELF. Buy clothes for your character, then WEAR one — whatever you've got on is what shows up on you in every image with the girls (🤳 Shot with me / 👁️ POV). Currently wearing: <b>${pc.clothingId ? (pw.getById(pc.clothingId)?.name || pc.clothingId) : 'your starting clothes'}</b> — <span class="small muted">"${(pc.startClothing || '').replace(/"/g, '&quot;')}"</span></p>
      </div>
      <div class="panel">
        <div class="girl-grid">
          ${outfits.map(o => {
            const have = pw.ownsOutfit(o.id);
            const worn = wornId === o.id;
            const canAfford = money >= o.price;
            const priceLabel = o.price === 0 ? 'free' : `$${o.price.toLocaleString()}`;
            const tip = `${o.emoji} ${o.name} — renders on you as: "${o.desc}"`.replace(/"/g, '&quot;');
            let btn;
            if (worn) {
              btn = `<button class="btn-small" disabled data-tooltip="You're wearing this right now.">✓ Wearing</button>`;
            } else if (have) {
              btn = `<button class="btn-small btn-primary" data-wear-outfit="${o.id}" data-tooltip="Put this on — it renders on you in images with the girls.">Wear it</button>`;
            } else if (canAfford) {
              btn = `<button class="btn-small btn-primary" data-buy-outfit="${o.id}" data-tooltip="Buy it into your wardrobe (${priceLabel}), then wear it.">Buy ${priceLabel}</button>`;
            } else {
              btn = `<button class="btn-small" disabled data-tooltip="Not enough money.">Too poor</button>`;
            }
            return `<div class="model-card${worn ? ' owned' : ''}" data-tooltip="${tip}">
              <div class="model-name">${o.emoji} ${o.name}${worn ? ' <span class="ok small">· on</span>' : have ? ' <span class="small muted">· owned</span>' : ''}</div>
              <div class="model-meta">
                <span data-tooltip="Price">${priceLabel}</span>
                <span data-tooltip="Tier">tier ${o.tier}</span>
              </div>
              <div class="model-notes small">Renders on you as: "${o.desc}"</div>
              ${btn}
            </div>`;
          }).join('')}
        </div>
      </div>
    `;

    el.querySelectorAll('[data-buy-outfit]').forEach(b => {
      b.onclick = () => {
        const r = pw.buy(b.dataset.buyOutfit);
        if (!r || !r.ok) { alert((r && r.reason) || 'could not buy'); return; }
        // Buying adds it to your wardrobe — it does NOT auto-equip. Put it on deliberately with the
        // "Wear it" button (the use-point action), per the no-equip-on-purchase rule.
        if (window.DMTHNotify) window.DMTHNotify.show('🧥 Added to your wardrobe — hit "Wear it" to put it on.', { type: 'success', durationMs: 3500 });
        window.DMTHRouter.handle();
      };
    });
    el.querySelectorAll('[data-wear-outfit]').forEach(b => {
      b.onclick = () => {
        const r = pw.wear(b.dataset.wearOutfit);
        if (!r || !r.ok) { alert((r && r.reason) || 'could not wear'); return; }
        window.DMTHRouter.handle();
      };
    });
  }

  window.DMTHRouter.register('player-clothing-store', render);
})();
