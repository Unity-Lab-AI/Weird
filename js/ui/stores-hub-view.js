// DUNGEON MASTER: THE HUNT — Stores Hub. One top-header door to every storefront.
// Phase 1 of the stores overhaul: a single selectable list of all stores. Later phases split
// the Defilers' Bloc into themed storefronts, migrate the scattered buy points (dungeon
// facilities / wardrobe / milk / organ) in here, and enforce the inventory-first flow
// everywhere (buy → your inventory → then install to a hold / apply to a girl / use).

(function () {
  'use strict';

  // Every storefront, themed into one cohesive sexually-brutal naming universe. Each routes to
  // its functional destination. (Cards link to existing routes; the themed split + scattered-
  // point removal land in STORES-NEW / STORES-HUB later phases.)
  const STORES = [
    { emoji: '🏴', name: "The Defilers' Bloc", route: '#shop',
      desc: 'The black-market supply cell — kidnap chems, sedatives, restraints, chamber implements, food + supplies. Everything bought drops into YOUR inventory first; then you install it to a hold, apply it to a girl, or use it.' },
    { emoji: '🧵', name: 'The Carcass Closet', route: '#clothing-store',
      desc: 'Dress your meat — buy outfits into your inventory, then apply one to a captive from her wardrobe. Type-matched fits pay a sync premium.' },
    { emoji: '🧥', name: 'The Fitting Room', route: '#player-clothing-store',
      desc: 'Dress YOURSELF — buy clothes for your own character, then wear one. Whatever you have on renders on you in every image with the girls (Shot-with-me / POV).' },
    { emoji: '🧪', name: 'The Vein Garden', route: '#shop?sub=drugs',
      desc: 'The drug store — coke, weed, mdma, acid, whiskey. Buy your stash, then force it into a captive however you please.' },
    { emoji: '🧰', name: 'The Toy Chest', route: '#shop?sub=toys',
      desc: 'Chamber toys + implements. Buy them into inventory, then mount up to 3 in a captive\'s hold.' },
    { emoji: '⛓️', name: 'The Flesh Auction', route: '#slave-market',
      desc: 'Buy untrained captives cheap; sell your trained, high-Stockholm girls for a premium. Family blood + matched outfits fetch the most.' },
    { emoji: '🎬', name: 'The Cutting Room', route: '#market',
      desc: 'Your content market — recorded films auto-sell every tick; 💣 sell the negatives to kill a master for a one-time premium.' },
    { emoji: '🥛', name: 'The Dairy', route: '#dairy',
      desc: 'Tit Suckers + bottled girl-milk — buy a sucker, rig it to a lactating captive\'s hold, then sell or drink what it bottles.' },
    { emoji: '🩸', name: 'The Gristle Pimp', route: '#gristle',
      desc: 'Fence the limbs + organs you saw + knife off your captives. Parts sell passively each tick — or dump one instantly for cash.' },
    { emoji: '🏚️', name: 'Bloodland Holdings', route: '#property',
      desc: 'Deeds & turf — buy new hideouts (dungeons) to stuff with meat, buy private access to the hunting grounds, then BUY OUT the turf so the whole rotten town answers to you (fewer witnesses, less WANTED, better capture odds, a passive skim).' }
  ];

  function render(el) {
    el.innerHTML = `
      <div class="panel">
        <h2>🏬 Stores</h2>
        <p class="small muted">Every storefront in the operation, one door. Pick one. Whatever you buy lands in your inventory first — then you install it to a hold, apply it to a girl, or use it.</p>
        <div class="girl-grid">
          ${STORES.map(st => `
            <a class="model-card" href="${st.route}" data-tooltip="${st.desc.replace(/"/g, '&quot;')}">
              <div class="model-name">${st.emoji} ${st.name}</div>
              <div class="model-notes small">${st.desc}</div>
            </a>`).join('')}
        </div>
      </div>
    `;
  }

  window.DMTHRouter.register('stores', render);
})();
