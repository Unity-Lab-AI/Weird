// DUNGEON MASTER: THE HUNT — The Dairy (girl-milk trade). Moved off the film page so the
// Cutting Room shows ONLY films. Reached from the 🏬 Stores hub. Tit Sucker buy + milk sell/drink.

(function () {
  'use strict';

  function render(el) {
    const milk = window.DMTHGame.milk;
    const milkStock = milk ? milk.milkStock() : 0;
    const ownedSuckers = milk ? milk.ownedTitSuckers() : 0;
    const lactating = milk ? milk.lactatingCount() : 0;

    el.innerHTML = `
      <div class="panel">
        <h2>🥛 The Dairy — Milk Trade</h2>
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
    `;

    const milkBuy = el.querySelector('[data-buy-titsucker]');
    if (milkBuy) milkBuy.onclick = () => { const r = window.DMTHGame.milk.buyTitSucker(); if (!r.ok) alert(r.reason); window.DMTHRouter.handle(); };
    const milkSell = el.querySelector('[data-sell-milk]');
    if (milkSell) milkSell.onclick = () => { const r = window.DMTHGame.milk.sellMilk(window.DMTHGame.milk.milkStock()); if (!r.ok) { alert(r.reason); return; } alert(`🥛 Sold ${r.qty}L for $${r.price.toLocaleString()}.`); window.DMTHRouter.handle(); };
    const milkDrink = el.querySelector('[data-drink-milk-player]');
    if (milkDrink) milkDrink.onclick = () => { const r = window.DMTHGame.milk.drinkPlayer(); if (!r.ok) { alert(r.reason); return; } window.DMTHRouter.handle(); };
  }

  window.DMTHRouter.register('dairy', render);
})();
