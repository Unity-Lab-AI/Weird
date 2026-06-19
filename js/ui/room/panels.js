// DUNGEON MASTER: THE HUNT — extracted room panels (pure HTML builders).
// These are the self-contained captive-interaction panels lifted out of the monolithic
// js/ui/room.js render() to cut its bulk. Each is a PURE function of `girl` (+ globals on
// window.DMTHGame.*) returning an HTML string, or '' when not applicable. They own NO event
// handlers — room.js still binds every data-* control after it sets innerHTML, so the
// data-attribute contract between these templates and room.js's handlers is unchanged.

(function () {
  'use strict';

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // 🚚 Transfer / corpse-move.
  function transfer(girl) {
    if (!((girl.encounterState === 'captive' || girl.encounterState === 'dead') && window.DMTHGame.transport)) return '';
    const T = window.DMTHGame.transport;
    const isCorpse = girl.encounterState === 'dead';
    const dests = T.destinationsFor(girl);
    // Nowhere to move her → don't render the panel at all (it was just a wall of text). It returns
    // the moment you have a second dungeon / a free hold.
    if (!dests.length) return '';
    const methods = Object.entries(T.TRANSPORT_METHODS);
    return `<details class="sect" style="margin-top:8px"><summary>🚚 ${isCorpse ? 'Move the body' : 'Transfer to another dungeon'}</summary><div class="sect-body">
      <p class="small muted">${isCorpse
        ? `Haul ${escapeHtml(girl.name)}'s corpse to another hold (same or different dungeon). No risk — she's already dead — just the cash cost + a little WANTED for moving a body. Her decay timer keeps running.`
        : `Move ${escapeHtml(girl.name)} between your dungeons. Every method is a gamble: rough ones are cheap but can hurt her, draw heat, let her bolt — or suffocate her; discreet ones cost real money and arrive clean. Higher tier = better perks, less risk. Some need a sedative.`}</p>
      <div class="stat-row"><span>Destination</span>
        <select id="transfer-dest" class="inline-select">
          ${dests.map(d => `<option value="${d.id}">${escapeHtml(d.displayName)} (${d.openHolds} open hold${d.openHolds === 1 ? '' : 's'})</option>`).join('')}
        </select>
      </div>
      <div class="stat-row"><span>Method</span>
        <select id="transfer-method" class="inline-select">
          ${methods.map(([id, m]) => {
            const unlocked = T.isMethodUnlocked(id);
            return `<option value="${id}" ${unlocked ? '' : 'disabled'}>${m.emoji} ${escapeHtml(m.displayName)} — T${m.tier}${m.cost ? ` · $${m.cost}` : ' · free'}${unlocked ? '' : ` 🔒 L${m.levelReq}`}</option>`;
          }).join('')}
        </select>
      </div>
      <div id="transfer-note" class="small muted" style="margin:4px 0"></div>
      <div class="btn-row"><button id="transfer-btn" class="btn-small btn-danger" data-tooltip="Move her via the selected method. Resolves a risk roll — she could arrive clean, battered, escape in transit, or die. Frees her current hold and fills one in the destination.">🚚 Transfer her</button></div>
    </div></details>`;
  }

  // ☠️ Snuff.
  function snuff(girl) {
    if (!(girl.encounterState === 'captive' && window.DMTHGame.progression && window.DMTHGame.lifespan?.SNUFF_METHODS)) return '';
    const unlocked = window.DMTHGame.progression.isUnlocked('snuff');
    if (!unlocked) return `<details class="sect" style="margin-top:8px"><summary>☠️ Snuff 🔒</summary><div class="sect-body"><p class="sect-stub">Locked — reach DEPRAVITY level ${window.DMTHGame.progression.requiredLevel('snuff')} to make corpses on command.</p></div></details>`;
    const methods = window.DMTHGame.lifespan.SNUFF_METHODS;
    return `<details class="sect" style="margin-top:8px;border-color:#b00"><summary>☠️ Snuff — make her a corpse</summary><div class="sect-body">
      <p class="small muted">Kill her (irreversible). The body stays in her hold for postmortem use until you dispose of it. Pick HOW — quick or slow + methodical. Filming it lists a premium snuff film.</p>
      <select id="snuff-method" class="inline-select">
        ${Object.entries(methods).map(([id, m]) => `<option value="${id}">${m.emoji} ${escapeHtml(m.displayName)} — ${m.speed}</option>`).join('')}
      </select>
      <div id="snuff-method-note" class="small muted" style="margin:4px 0"></div>
      <div class="btn-row">
        <button id="snuff-film-btn" class="btn-small btn-danger" data-tooltip="Kill her with the selected method ON CAMERA — lists a premium snuff film, then leaves a corpse in the hold for postmortem use. Irreversible.">🎬 Snuff + Film</button>
        <button id="snuff-btn" class="btn-small btn-danger" data-tooltip="Kill her with the selected method — no film, just a corpse for postmortem use until disposal. Irreversible.">☠️ Snuff (no film)</button>
      </div>
    </div></details>`;
  }

  // 🧰 Toys & implements.
  function toys(girl) {
    if (!(girl.encounterState === 'captive' && window.DMTHGame.toys)) return '';
    const T = window.DMTHGame.toys;
    const inv = window.DMTHGame.state.current.inventory || {};
    const attached = T.holdToys(girl);
    const cap = T.MAX_TOYS_PER_HOLD || 5;
    // Thorough fx-split tooltip per toy (her body/bond fx + the player's gains) — falls back to notes.
    const rowFor = (id, t) => {
      const isAtt = attached.includes(id);
      const have = inv[id] || 0;
      const lvlOk = T.levelOk(id);
      const buyLocked = T.buyStatus ? T.buyStatus(id).locked : false;
      const buyReason = T.buyLockReason ? T.buyLockReason(id) : '';
      const tip = (T.toyTooltip ? T.toyTooltip(id) : `${t.notes}${t.gore ? ' · ⚠ gore/mutilation' : ''}${t.masoFlips ? ' · a masochist craves this' : ''}`).replace(/"/g, '&quot;');
      const lock = lvlOk ? '' : ` <span class="muted">🔒 L${t.levelReq}</span>`;
      let btns;
      if (isAtt) {
        btns = `<button class="btn-small btn-danger" data-toy-use="${id}" ${lvlOk ? '' : 'disabled'} data-tooltip="${tip}">Use</button>
                <button class="btn-small" data-toy-detach="${id}" data-tooltip="Unmount it from this hold (back to inventory).">Detach</button>`;
      } else if (have > 0) {
        btns = `<button class="btn-small btn-primary" data-toy-attach="${id}" ${attached.length >= cap ? 'disabled' : ''} data-tooltip="Mount it in this hold (${attached.length}/${cap}). Then it can be used on her.">Mount (have ${have})</button>`;
      } else if (buyLocked) {
        btns = `<button class="btn-small" disabled data-tooltip="Locked — needs ${escapeHtml(buyReason)}. Buy goes into your inventory, then you mount it in a hold.">🔒 ${escapeHtml(buyReason)}</button>`;
      } else {
        btns = `<button class="btn-small" data-toy-buy="${id}" data-tooltip="Buy 1 into your inventory ($${t.cost.toLocaleString()}). Then mount it in a hold to use it — you can stockpile more than one.">Buy $${t.cost.toLocaleString()}</button>`;
      }
      return `<div class="stat-row small" data-tooltip="${tip}"><span>${isAtt ? '📌 ' : ''}${t.emoji} ${escapeHtml(t.name)}${lock}</span><span style="display:inline-flex;gap:4px">${btns}</span></div>`;
    };
    const entries = Object.entries(T.TOYS);
    // Mounted + already-owned toys are shown directly; the full BUY catalog is tucked behind a
    // collapsed toggle so it's not a permanent wall on the screen.
    const ownedRows = entries.filter(([id]) => attached.includes(id) || (inv[id] || 0) > 0).map(([id, t]) => rowFor(id, t)).join('');
    const buyRows = entries.filter(([id]) => !attached.includes(id) && !(inv[id] || 0)).map(([id, t]) => rowFor(id, t)).join('');
    return `<div class="panel" style="margin-top:8px">
      <h3>🧰 Toys &amp; Implements <span class="sub small">(${attached.length}/${cap} mounted in this hold)</span></h3>
      ${ownedRows || '<p class="sect-stub">No toys owned yet — open the shop below to buy one.</p>'}
      <details class="sect"><summary>🛒 Shop toys (${buyRows ? entries.filter(([id]) => !attached.includes(id) && !(inv[id] || 0)).length : 0})</summary>
        <div class="sect-body">
          <p class="small muted">Buy here, or loot / find them in the world. MOUNT a toy in this hold (up to ${cap}) to use it on her — it only works on this hold's girl and shows on her image while in use. The gorier ones unlock with DEPRAVITY level.</p>
          ${buyRows}
        </div>
      </details>
    </div>`;
  }

  // 🎈 Condoms.
  function condoms(girl) {
    const C = window.DMTHGame.condoms;
    if (!C) return '';
    const inv = window.DMTHGame.state.current.inventory || {};
    const wearing = girl.currentOutfit === 'condom-on' ? (C.spec(girl.condomType) || { displayName: 'condom', emoji: '🎈' }) : null;
    const rows = Object.entries(C.CONDOM_TYPES).map(([id, t]) => {
      const unlocked = C.isLevelUnlocked(id);
      const have = inv[id] || 0;
      if (!unlocked) return `<div class="stat-row small" data-tooltip="🔒 ${t.notes.replace(/"/g, '&quot;')} — reach DEPRAVITY level ${t.levelReq}"><span>${t.emoji} ${t.displayName} 🔒</span><b>L${t.levelReq}</b></div>`;
      const tip = `${t.notes}${t.blocks === false ? ' · ⚠️ does NOT block pregnancy' : ' · blocks pregnancy'}${t.pleasure ? ` · +${t.pleasure} her arousal/use` : ''}${t.indoctrination ? ` · +${t.indoctrination} indoctrination/use` : ''}`;
      return `<div class="stat-row small" data-tooltip="${tip.replace(/"/g, '&quot;')}">
        <span>${t.emoji} ${t.displayName}${have ? ` (have ${have})` : ''}</span>
        <button class="btn-small" data-condom-buy="${id}">Buy $${t.cost}</button>
        <button class="btn-small ${have ? 'btn-primary' : ''}" data-condom-equip="${id}" ${have ? '' : 'disabled'}>Equip</button>
      </div>`;
    }).join('');
    return `<details class="sect" style="margin-top:8px"><summary>🎈 Condoms${wearing ? ` <span class="ok small">· on</span>` : ''}</summary><div class="sect-body">
      <p class="small muted">Different rubbers, different stats — and a condom is a TIMED effect: it protects for ~${Math.round((C.CONDOM_DURATION_MIN || 240) / 60)} game hours, then wears off. A french tickler pleases her + nudges indoctrination; a sabotaged holed one does NOT block pregnancy — one vaginal load breeds her on the spot. ${wearing ? (() => {
        const left = (girl.condomActiveUntil != null && window.DMTHGame.gameClock) ? Math.max(0, girl.condomActiveUntil - window.DMTHGame.gameClock.now()) : null;
        return `Currently on: <b>${wearing.emoji} ${escapeHtml(wearing.displayName)}</b>${left != null ? ` · ⏳ wears off in ${window.DMTHGame.gameClock.formatDuration(left)}` : ''}.`;
      })() : 'No condom — raw.'}</p>
      ${rows}
      ${wearing ? `<div class="btn-row" style="margin-top:4px"><button class="btn-small btn-danger" id="condom-remove" data-tooltip="Take the condom off — back to raw (and her real outfit).">Remove condom</button></div>` : ''}
    </div></details>`;
  }

  // 🏪 Dungeon pool.
  function dungeonPool(girl) {
    if (!(girl.encounterState === 'captive' && window.DMTHGame.supply)) return '';
    const pool = window.DMTHGame.supply.poolOf(girl.assignedDungeonId);
    const inv = window.DMTHGame.state.current.inventory || {};
    const has = id => (inv[id] || 0) > 0;
    const isOnBC = window.DMTHGame.pregnancy?.isOnBirthControl ? window.DMTHGame.pregnancy.isOnBirthControl(girl) : false;
    const drugCount = Object.values(pool.drugs || {}).reduce((a, b) => a + b, 0);
    const drugBtns = ['coke-bumps', 'weed', 'mdma', 'acid', 'wine'].filter(has)
      .map(id => `<button class="btn-small" data-pool-drug="${id}" data-tooltip="Move 1× ${escapeHtml(id.replace(/-/g, ' '))} into the dungeon drug pool — addicted girls self-dose from it to stave off withdrawal (they never OD themselves).">+1 ${escapeHtml(id.replace(/-/g, ' '))}</button>`).join('');
    return `<details class="sect" style="margin-top:8px"><summary>🏪 Dungeon Pool (shared by every hold)</summary><div class="sect-body">
      <p class="small muted">Stock a shared pool any captive in this dungeon draws from when her own hold runs dry — no real cap, filtered evenly across holds. Stock condoms here (or in a hold) so johns can glove up; stock drugs so addicted girls self-medicate to stay alive.</p>
      <div class="stat-row small" data-tooltip="Shared food + water units. A hungry/thirsty girl pulls from her hold first, then this pool."><span>🍱 Food / 💧 Water</span><b>${pool.food} / ${pool.water}</b></div>
      <div class="stat-row small" data-tooltip="Condoms johns will use (if you set condom-required or the john complies). One consumed per gloved john. No stock = johns go raw."><span>🎈 Condoms</span><b>${pool.condoms}</b></div>
      <div class="stat-row small" data-tooltip="Birth-control pills. While any are stocked, EVERY captive in this dungeon auto-takes one the moment she isn't covered — one pill = two game-days off the breeding track, re-taken the instant it lapses, so there's no gap to knock her up. One pill per girl per two days.${isOnBC ? ` ${girl.name} is covered now.` : (pool.birthControl > 0 ? ` ${girl.name} will take one on the next tick.` : '')}"><span>💊 Birth-control pills${isOnBC ? ' <span class="ok">· on the pill</span>' : ''}</span><b>${pool.birthControl}</b></div>
      <div class="stat-row small" data-tooltip="Drug doses captives self-serve from to stave off withdrawal — they never OD themselves."><span>💊 Drug doses</span><b>${drugCount}</b></div>
      <div class="btn-row" style="margin-top:4px">
        <button class="btn-small ${has('basic-meal') ? 'btn-primary' : ''}" data-pool-stock="food:basic-meal:3" ${has('basic-meal') ? '' : 'disabled'} data-tooltip="Convert 1 basic meal → +3 shared food.">+3 food</button>
        <button class="btn-small ${has('bottled-water') ? 'btn-primary' : ''}" data-pool-stock="water:bottled-water:6" ${has('bottled-water') ? '' : 'disabled'} data-tooltip="Convert 1 24-pack → +6 shared water.">+6 water</button>
        <button class="btn-small ${has('condom-standard') ? 'btn-primary' : ''}" data-pool-stock="condoms:condom-standard:3" ${has('condom-standard') ? '' : 'disabled'} data-tooltip="Convert 1 standard condom → +3 pooled condoms for johns.">+3 condoms</button>
        <button class="btn-small ${has('birth-control-pill') ? 'btn-primary' : ''}" data-pool-stock="birthControl:birth-control-pill:5" ${has('birth-control-pill') ? '' : 'disabled'} data-tooltip="Convert 1 pack → +5 pooled birth-control pills. Captives auto-take them to stay off the breeding track.">+5 pills</button>
      </div>
      <div class="btn-row">${drugBtns || '<span class="small muted">no drug items in inventory to stock</span>'}</div>
    </div></details>`;
  }

  window.DMTHRoomPanels = Object.freeze({ transfer, snuff, toys, condoms, dungeonPool });
})();
