// DUNGEON MASTER: THE HUNT — individual girl's room (the core interaction view).

(function () {
  'use strict';

  // Module-scoped per-girl in-memory caches that survive state.onChange re-renders of
  // the room template. Without these, typing in the Custom Pose textarea or the result
  // image were both wiped every time the 30-second tick fired and triggered a re-render.
  const customPoseDrafts = new Map();    // girlId → draft text
  const customPoseResults = new Map();   // girlId → { url, staging, ts }
  // EPIC X — the named men from the last voiced gangbang/scene for this girl, so the NPC-DIRECT box
  // can target the SAME men (each carries {name, handle, tone, isFriend, archetype}). Persists across
  // state.onChange re-renders of the room template (module-scoped, like the pose caches).
  const lastSceneNpcs = new Map();       // girlId → [{name, handle, tone, isFriend, archetype}]
  const autoVoiceAt = new Map();         // girlId → game-min of her last unprompted in-hold line (throttle)
  //  (watch-her-visitors) — the single live 'dmth:npc-visit' listener for the open room.
  // Module-scoped + replaced each render so exactly one is attached (no leak across route re-renders).
  let npcVisitHandler = null;

  // how many OTHER captives can be pulled into the active girl's room for a
  // true multi-speaker scene (host + this many partners). Each present girl answers in her
  // own voice in sequence. Kept small so a single turn doesn't fan out into many Ollama calls.
  const MAX_SCENE_PARTNERS = 2;

  // Button-action-ID mapping for drug/feed/water handlers so they route through
  // applyAction. The 11 ACTIONS entries (drug-coke, drug-weed, drug-mdma, drug-acid,
  // drug-whiskey, drug-ketamine, drug-tranquilizer, feed-basic, feed-gourmet, water-bottled,
  // water-filtered) were previously dead code because the handlers bypassed applyAction
  // and mutated state directly.
  const DRUG_ACTION_MAP = {
    coke:        'drug-coke',
    weed:        'drug-weed',
    mdma:        'drug-mdma',
    acid:        'drug-acid',
    whiskey:     'drug-whiskey',
    ketamine:    'drug-ketamine',
    tranquilizer:'drug-tranquilizer'
  };
  const FEED_ACTION_MAP = {
    'basic-meal':   'feed-basic',
    'gourmet-meal': 'feed-gourmet'
  };
  const WATER_ACTION_MAP = {
    'bottled-water': 'water-bottled',
    'filtered-water':'water-filtered'
  };

  function render(el, params) {
    const girlId = params.girl || window.DMTHGame.state.current?.settings?.activeGirlId;
    const girl = window.DMTHGame.state.getGirl(girlId);
    if (!girl) {
      el.innerHTML = `<div class="panel"><h2>No captive selected</h2><a href="#roster" class="btn-small">Roster</a></div>`;
      return;
    }
    const dungeon = window.DMTHGame.state.getDungeon(girl.assignedDungeonId);
    const dungeonTpl = dungeon && window.DMTHAssets.getById('dungeon', dungeon.templateId);

    const activeDrugs = window.DMTHGame.drugs.summarize(girl);
    const currentOutfit = (girl.wardrobe || []).find(w => w.id === girl.currentOutfit);
    // Tranquilizer state. While she's tranquilized: chat / feed /
    // water / sex / derobe / strip-everything buttons disabled; live mm:ss countdown
    // surfaced; auto-wakeup logged when timer hits 0.
    const tranqEntry = window.DMTHGame.drugs.isUnconscious ? window.DMTHGame.drugs.isUnconscious(girl) : null;
    const isUnconscious = !!tranqEntry;
    // Postmortem state — encounterState === 'dead' means body persists in the hold for
    // postmortem use. Chat stays available (Ollama returns narration-only output per
    // room_postmortem scene), sex acts continue, drugs/feed/water/heal are disabled.
    const isDead = girl.encounterState === 'dead';
    const decayMinutes = girl.body?.decayedMinutes || 0;
    const decayDays = decayMinutes / 1440;
    function fmtCountdown(ms) {
      const secs = Math.max(0, Math.floor(ms / 1000));
      const m = Math.floor(secs / 60), s = secs % 60;
      return `${m}:${s < 10 ? '0' : ''}${s}`;
    }

    // Body stat bars + stamina/health + stress band + drug HUD + tranq banner.
    // Lives in #body-stats-panel so the state.onChange listener can refresh it on every
    // mutation without rebuilding the entire room. Reads fresh state every call so
    // applyAction body deltas (arousal / wetness / cumLoad / bruises / high / stamina /
    // health) reflect immediately in the bars. Pure display markup — no event handlers
    // in here, safe to innerHTML-replace.
    function renderBodyStatsHTML() {
      const g = window.DMTHGame.state.getGirl(girlId);
      if (!g) return '';
      // Defensive null-safe reads — old saves pre-date several body fields. Migration
      // in state.js load() backfills these, but the renderer also guards on every access
      // so a pre-migration crash doesn't take the whole room view down.
      g.body = g.body || {};
      const drugsNow = window.DMTHGame.drugs?.summarize ? window.DMTHGame.drugs.summarize(g) : [];
      const tranqNow = window.DMTHGame.drugs?.isUnconscious ? window.DMTHGame.drugs.isUnconscious(g) : null;
      const isUnc = !!tranqNow;
      const arousal = g.body.arousal ?? 0;
      const wetness = g.body.wetness ?? 0;
      const cumLoad = Number(g.body.cumLoad) || 0;
      const bruises = g.body.bruises ?? 0;
      const high    = g.body.high ?? 0;
      const stam = g.body.stamina ?? 70;
      const hp = g.body.health ?? 100;
      // show value/capacity.  cum capacity +  max-health ceiling.
      const cumCap = (window.DMTHGame.cumtool && window.DMTHGame.cumtool.effectiveCap) ? window.DMTHGame.cumtool.effectiveCap(g.body) : (g.body.cumLoadCap ?? 10);
      const maxH = (window.DMTHGame.actionEffects && window.DMTHGame.actionEffects.maxHealthFor) ? window.DMTHGame.actionEffects.maxHealthFor(g) : 100;
      const stamClass = stam >= 60 ? '' : stam >= 30 ? 'warn' : 'danger';
      const hpClass = hp >= 60 ? '' : hp >= 30 ? 'warn' : 'danger';
      const streakMin = g.body?.stressStreakMin || 0;
      const sTier = g.bonuses?.stressBonusTier || 0;
      const sMul = g.bonuses?.stressFilmMultiplier || 1.0;
      const streakDays = streakMin / 1440;
      const inBand = (g.body?.health ?? 100) >= 25 && (g.body?.health ?? 100) <= 55;
      const T1 = 5, T2 = 15;
      let stressLine;
      if (sTier === 2) {
        stressLine = `<span class="gold">⚡ Super stress bonus unlocked · ${sMul}× film multiplier permanent</span>`;
      } else if (sTier === 1) {
        stressLine = `<span class="gold">💢 Stress bonus tier 1 unlocked · ${sMul}× film multiplier · ${(T2 - streakDays).toFixed(1)} more days in band → super bonus</span>`;
      } else if (inBand) {
        stressLine = `💢 In stress band · streak ${streakDays.toFixed(1)}d / ${T1}d (tier 1) → ${(T1 - streakDays).toFixed(1)}d to bonus`;
      } else {
        stressLine = `<span class="muted">Stress band 25-55 Health · keep her here ${T1}d for tier-1 bonus (+$500 + 1.15× film mul), ${T2}d for super (+$2000 + 1.35×)</span>`;
      }
      return `
          <h3>Body</h3>
          <div class="bar-row" data-tooltip="How wet-hot and aching she is, 0-100 — stoked by foreplay, the secret kinks she hates that you love, and how broken-in she's gotten. The higher it climbs, the harder her body betrays her."><label>Arousal</label><div class="bar"><div class="bar-fill" style="width:${arousal}%"></div></div><b>${arousal}</b></div>
          <div class="bar-row" data-tooltip="How slick and dripping her cunt is, 0-100 — her body greasing up to take it whether she wants to or not. High = she slides open easy; bone-dry = it tears going in."><label>Wetness</label><div class="bar"><div class="bar-fill" style="width:${wetness}%"></div></div><b>${wetness}</b></div>
          <div class="bar-row" data-tooltip="Cum load / her trained storage capacity. Near-cap = john pay premium, but staying stuffed drains mood/health + nudges escape. Train capacity with Ben Wa balls / plugs."><label>Cum Load</label><div class="bar"><div class="bar-fill" style="width:${Math.min(100, (cumLoad/cumCap)*100)}%"></div></div><b>${cumLoad.toFixed(1)}/${cumCap}</b></div>
          <div class="bar-row" data-tooltip="How marked-up and battered her body is, 0-99 — purple her past 15 and the chronic pain bleeds her health every tick. Heal her to wipe the canvas clean for fresh marks."><label>Bruises</label><div class="bar"><div class="bar-fill danger" style="width:${Math.min(100, bruises*5)}%"></div></div><b>${bruises}</b></div>
          <div class="bar-row" data-tooltip="How fucked-up and floating she is on whatever you've pumped into her, 0-100 — bleeds off on its own as the high burns out of her blood."><label>High</label><div class="bar"><div class="bar-fill highgreen" style="width:${high}%"></div></div><b>${high}</b></div>
          <div class="bar-row" data-tooltip="How much fight + fuck-energy she's got left in her, 0-100 — drained by being used (sex/violence/johns/drugs), rebuilt by rest + feed/water/heal. Below ${window.DMTHGame.actionEffects.STAMINA_THRESHOLD_FOR_STRAIN} she's strained: every act tears her up worse + craters her mood. Drives how much johns pay to ride her."><label>Stamina</label><div class="bar"><div class="bar-fill ${stamClass}" style="width:${stam}%"></div></div><b>${stam}</b></div>
          <div class="bar-row" data-tooltip="How close to broken-meat she is (max-health on the right) — wrecked by bruises ≥ 15 / starving / dehydrating / violence; patched up by heal + feed/water. Higher Stockholm makes her hardier (ceiling climbs past 100). Under 30 she's circling the drain — keep her breathing if you still want to use her."><label>Health</label><div class="bar"><div class="bar-fill ${hpClass}" style="width:${Math.min(100, (hp/maxH)*100)}%"></div></div><b>${hp}/${maxH}</b></div>
          <div class="stat-row small" data-tooltip="Maintain body.health in the 25-55 range to accumulate the stress streak. Tier 1 awards $500 + 1.15× permanent film multiplier at 5 game days; tier 2 awards $2000 + 1.35× at 15 game days. Streak resets when she leaves the band.">${stressLine}</div>
          ${(g.body?.extremeStreak || 0) >= 1 ? (() => {
            const lim = window.DMTHGame.actionEffects?.XTOL_LIMIT || 10;
            const st = Math.floor(g.body.extremeStreak);
            return `<div class="stat-row small" data-tooltip="Extreme-act tolerance — she absorbs about ${lim} extreme acts before she's spent and starts taking extra health/stamina damage per extreme act. Heal / caress / love / feed / rest her to walk it back down."><span>⚠️ Extreme wear</span><b class="${g.body.extremeStreak >= lim ? 'danger' : 'warn'}">${st}/${lim}${g.body.extremeStreak >= lim ? ' · SPENT' : ''}</b></div>`;
          })() : ''}
          ${drugsNow.length > 0 ? `<div class="drug-hud small">${drugsNow.map(d => `<span class="drug-pill">💊 ${d.name} · mag ${d.mag} · ${d.remainingMin}m left</span>`).join(' ')}</div>` : ''}
          ${isUnc ? `<div class="tranq-banner panel" style="border:1px solid #b00;background:rgba(180,0,0,.08);padding:8px;margin:8px 0">
            <b>💉 TRANQUILIZED — OUT COLD</b>
            <span class="muted small">· countdown</span>
            <b id="tranq-countdown" data-wear-off="${Date.now() + (window.DMTHGame.drugs.unconsciousRemainingMs ? window.DMTHGame.drugs.unconsciousRemainingMs(g) : 0)}">${fmtCountdown(window.DMTHGame.drugs.unconsciousRemainingMs ? window.DMTHGame.drugs.unconsciousRemainingMs(g) : 0)}</b>
            <div class="small muted">She's limp, eyes closed, deeply sedated. Chat / feed / water / sex / wardrobe actions disabled until wake-up. Image prompts render her unconscious automatically.</div>
          </div>` : ''}
          ${(() => {
            // Postmortem (dead) banner. Replaces normal Body display intent — body is
            // inert, decay tracked in game days since death, forced disposal threshold
            // at POSTMORTEM_DECAY_LIMIT (7 game days). Chat still works (narration-only
            // via room_postmortem scene); drugs/feed/water/heal disabled in main render
            // flow. Sex acts continue and accrue cumLoad.
            if (g.encounterState !== 'dead') return '';
            const dMin = g.body?.decayedMinutes || 0;
            const dDays = (dMin / 1440).toFixed(1);
            const limit = window.DMTHGame.lifespan?.POSTMORTEM_DECAY_LIMIT || 10080;
            const limitDays = limit / 1440;
            const overdue = dMin >= limit;
            return `<div class="dead-banner panel" style="border:1px solid #444;background:rgba(80,80,80,.25);padding:8px;margin:8px 0">
              <b>☠️ DECEASED — POSTMORTEM USE</b>
              <span class="muted small">· decay</span>
              <b>${dDays} / ${limitDays.toFixed(0)} game days</b>
              ${overdue ? '<span class="danger" style="margin-left:8px"><b>· OVERDUE — DISPOSE NOW</b></span>' : ''}
              <div class="small muted">Body preserved in the hold. Chat returns narration-only (no spoken dialogue — she can\\'t speak). Sex acts still apply and accrue cumLoad. Drugs / feed / water / heal disabled. Whore-out continues with postmortem-john archetype (premium niche pay, declining as decay advances). Forced disposal nudge at ${limitDays.toFixed(0)} game days.</div>
              <div class="btn-row" style="margin-top:6px">
                <a class="btn-small btn-danger" href="#dispose?girl=${g.id}" data-tooltip="Dispose of the body. Bury / lose-at-sea / incinerate / finalization-film — frees the hold and removes her from the dungeon.">⚱️ Dispose now</a>
              </div>
            </div>`;
          })()}
      `;
    }

    // Multi-girl scene roster . The host girl carries `sceneGirlIds` (an array
    // of partner captive ids). Legacy saves used a single `multiGirlPartnerId`  —
    // read that as a one-element fallback so old scenes still resolve.
    function sceneGirlIdsOf(host) {
      let ids = Array.isArray(host?.sceneGirlIds) ? host.sceneGirlIds.slice() : [];
      if (!ids.length && host?.multiGirlPartnerId) ids = [host.multiGirlPartnerId];
      return ids;
    }
    // Resolve scene partner ids → live captive girls in the SAME dungeon as the host
    // (you can only team up captives held in the same location). A partner who's
    // been disposed / escaped / sold / transported to another dungeon silently drops out.
    function liveSceneGirls(host) {
      return sceneGirlIdsOf(host)
        .map(id => window.DMTHGame.state.getGirl(id))
        .filter(g => g && g.encounterState === 'captive' && g.assignedDungeonId === host.assignedDungeonId);
    }

    el.innerHTML = `
      <div class="grid-2">

        <section class="panel">
          <h2>${girl.mood.moodEmoji} ${escapeHtml(girl.captiveName || girl.name)} <button id="rename-girl" class="btn-small" data-tooltip="Rename her — she's no longer her own person; she answers only to what you call her." style="font-size:0.7rem;padding:1px 6px;vertical-align:middle;">✏️</button> <span class="muted small">(${girl.archetypeTemplate}, ${girl.age}${girl.captiveName && girl.captiveName !== girl.name ? `, was ${escapeHtml(girl.name)}` : ''})</span></h2>
          <p class="small muted">${girl.backstoryFragment}</p>
          <p class="small">📍 ${dungeonTpl?.displayName || 'Unknown'} · hold ${(girl.assignedHoldIdx ?? 0) + 1}</p>
          <div class="room-profile-img" id="profile-img-slot">
            <div class="small muted">generating profile image…</div>
          </div>
          <div class="stat-row"><span>Mood</span><b>${girl.mood.mood}</b></div>
          ${girl.captiveAffect ? `<div class="stat-row"><span>Captive-affect</span><b>${girl.captiveAffect}</b></div>` : ''}
          ${girl.kink && (girl.kink.likeFound || girl.kink.dislikeFound) ? `<div class="stat-row small" data-tooltip="Her discovered kink (KINKDISC). A LIKE buffs that category of act (mood/arousal/bond); a DISLIKE debuffs it (mood + bond-debt). Found by performing the act on her."><span>Kinks</span><b>${girl.kink.likeFound ? `💖 loves ${girl.kink.like}` : ''}${girl.kink.likeFound && girl.kink.dislikeFound ? ' · ' : ''}${girl.kink.dislikeFound ? `💢 hates ${girl.kink.dislike}` : ''}</b></div>` : ''}
          <div class="stat-row"><span>Stockholm rating</span><b>${(girl.bond.bondLevel || 0) + 1}/10</b> <span class="muted small">(${['terrified','wary','acclimating','curious','ambivalent','reciprocated','dependent','partner','devoted','fully-bonded'][girl.bond.bondLevel]} · xp ${girl.bond.bondXP}, debt ${girl.bond.bondDebt})</span></div>
          ${(() => {
            const er = Math.round((girl.escape?.currentRisk || 0) * 100);
            const col = er >= 80 ? '#c0392b' : er >= 50 ? '#e67e22' : er >= 25 ? '#f1c40f' : '#27ae60';
            return `<div class="bar-row" data-tooltip="Escape-risk bar. Rises over time — faster when she's defiant/terrified/carrying bond-debt, slower with high Stockholm + containment. LOWER it with care/love acts (they heal her + break her fighting spirit + indoctrinate) or tighten containment (locks / guard dog / sedation collar). At 100% she breaks for it — containment decides caught vs gone."><label>🏃 Escape risk</label><div class="bar"><div class="bar-fill" style="width:${er}%;background:${col}"></div></div><b>${er}%</b></div>`;
          })()}
          ${window.DMTHGame.lifespan ? (() => {
            const ls = window.DMTHGame.lifespan.describeLifespan(girl);
            return `<div class="stat-row"><span>Lifespan</span><b>${ls.label}</b></div>
                    <div class="stat-row small"><span>Days held / age</span><b>${ls.daysCaptive} days · age ${ls.currentAge}</b></div>
                    <div class="bar-row"><label>Life meter</label><div class="bar"><div class="bar-fill ${ls.score < 30 ? 'danger' : ''}" style="width:${ls.score}%"></div></div><b>${ls.score}</b></div>`;
          })() : ''}
          <div class="stat-row"><span>Wearing</span><b>${currentOutfit?.displayName || 'default'}</b> <a href="#wardrobe?girl=${girl.id}" class="btn-small">👗 Wardrobe</a></div>
          ${currentOutfit?.source === 'captured-with' && currentOutfit?.description ? `<div class="small muted" style="padding-left:8px">Captured wearing: ${currentOutfit.description}</div>` : ''}
          <div class="stat-row">
            <span>Voice</span>
            <select id="voice-picker" class="inline-select">
              ${window.DMTHVoices.VOICES.map(v =>
                `<option value="${v.id}" ${v.id === girl.voiceId ? 'selected' : ''}>${v.displayName} — ${v.timbre}</option>`
              ).join('')}
            </select>
            <button id="voice-preview" class="btn-small" data-tooltip="Hear a sample in this voice">🔊</button>
          </div>
          <div id="body-stats-panel">${renderBodyStatsHTML()}</div>
          <h3>Stats</h3>
          <div class="stat-grid">
            ${Object.entries(girl.stats || {}).map(([k, v]) =>
              `<div class="stat-pill"><span>${k}</span><b>${v}</b></div>`
            ).join('')}
          </div>

          ${(() => {
            // LIVE per-girl activity history. A running list of every act done to/by her
            // + her current buffs/debuffs/perks, on the fly (no waiting for a trophy). Auto-scrolls to
            // newest unless the user scrolls up (then it pauses until they scroll back to the bottom).
            // Populated + scroll-managed in JS (renderActivity / activityStick).
            return `<h3>📜 Activity history <span class="muted small">(live)</span></h3>
              <div id="activity-buffs" class="small" style="margin-bottom:4px"></div>
              <div id="activity-log" class="log" style="max-height:220px;overflow-y:auto"></div>`;
          })()}
          <h3>Hold supplies</h3>
          ${(() => {
            // Supplies live in the HOLD (not the
            // girl). Player drops food/water into the hold reserve; the captive
            // self-serves from the reserve on tick when she gets hungry/thirsty.
            // Player can pickup reserve back into inventory (lossy bulk conversion)
            // to starve her on purpose. Plumbed holds (toilet ≥ 2 or waterSupply
            // ≥ 2) auto-supply water — no reserve needed.
            const dungeon = window.DMTHGame.state.getDungeon(girl.assignedDungeonId);
            const holdIdx = girl.assignedHoldIdx ?? 0;
            const hold = dungeon?.holds?.[holdIdx];
            const foodReserve = hold?.foodReserve ?? 0;
            const waterReserve = hold?.waterReserve ?? 0;
            const toiletTier = hold?.upgrades?.toilet ?? 0;
            const waterSupplyTier = hold?.upgrades?.waterSupply ?? 0;
            const waterPlumbed = toiletTier >= 2 || waterSupplyTier >= 2;
            const clock = window.DMTHGame.gameClock;
            const dSinceFed = clock ? clock.daysSince(girl.body?.lastFedAt) : 0;
            const dSinceWat = clock ? clock.daysSince(girl.body?.lastWateredAt) : 0;
            const daysToStarve = Math.max(0, 5 - dSinceFed);
            const daysToDehydrate = waterPlumbed ? '∞' : Math.max(0, 3 - dSinceWat).toFixed(1);
            const inv = window.DMTHGame.state.current.inventory || {};
            const has = id => (inv[id] || 0) > 0;
            return `
              <div class="stat-row" data-tooltip="Scraps stocked in her hold — she scrabbles for one when the hunger gnaws at her. Pile more in to keep your meat breathing; yank it out to watch her waste away thin and desperate.">
                <span>🍱 Food reserve</span><b>${foodReserve} units</b>
                <span class="small muted" style="margin-left:8px">· ${daysToStarve.toFixed(1)} game days until starvation</span>
              </div>
              <div class="bar-row" data-tooltip="Visual food reserve. Each unit feeds her once."><div class="bar"><div class="bar-fill" style="width:${Math.min(100, foodReserve * 5)}%; background: linear-gradient(90deg, var(--warn), #ffd166);"></div></div></div>
              <div class="btn-row" style="margin: 4px 0 10px">
                <button class="btn-small ${has('basic-meal') ? 'btn-primary' : ''}" data-drop-food="basic-meal" ${has('basic-meal') ? '' : 'disabled'} data-tooltip="Toss her a basic slop tray — +3 food units. She'll claw it down when the cramps get bad enough.">+3 (basic-meal)</button>
                <button class="btn-small ${has('gourmet-meal') ? 'btn-primary' : ''}" data-drop-food="gourmet-meal" ${has('gourmet-meal') ? '' : 'disabled'} data-tooltip="Spoil your favorite with a gourmet tray — +7 food units. A well-fed pet bonds to her keeper quicker.">+7 (gourmet)</button>
                <button class="btn-small btn-danger" data-pickup-food ${foodReserve >= 3 ? '' : 'disabled'} data-tooltip="Snatch the food back out of her reach — pulls 3 units to 1 meal in your inventory. Starve the bitch hollow and pliant when you want her begging for it.">Pickup −3</button>
              </div>

              <div class="stat-row" data-tooltip="${waterPlumbed ? 'Plumbed hold — water runs itself, her throat never goes dry. No reserve needed.' : 'Water stocked in her hold — she gulps it down when her throat goes raw and cracked.'}">
                <span>💧 Water reserve</span>
                ${waterPlumbed ? `<b class="gold">∞ plumbed</b>` : `<b>${waterReserve} units</b>`}
                <span class="small muted" style="margin-left:8px">· ${daysToDehydrate} game days until dehydration</span>
              </div>
              ${waterPlumbed ? '' : `
                <div class="bar-row" data-tooltip="Visual water reserve. Each unit hydrates her once."><div class="bar"><div class="bar-fill" style="width:${Math.min(100, waterReserve * 3)}%; background: linear-gradient(90deg, #6ad1ff, #aae8ff);"></div></div></div>
                <div class="btn-row" style="margin: 4px 0 10px">
                  <button class="btn-small ${has('bottled-water') ? 'btn-primary' : ''}" data-drop-water="bottled-water" ${has('bottled-water') ? '' : 'disabled'} data-tooltip="Crack a 24-pack into her hold — +6 water units to keep her throat working for you.">+6 (bottled)</button>
                  <button class="btn-small ${has('filtered-water') ? 'btn-primary' : ''}" data-drop-water="filtered-water" ${has('filtered-water') ? '' : 'disabled'} data-tooltip="Hump a filtered jug into her hold — +12 water units, the good shit for a favorite.">+12 (filtered)</button>
                  <button class="btn-small btn-danger" data-pickup-water ${waterReserve >= 6 ? '' : 'disabled'} data-tooltip="Rip the water back out of her reach — pulls 6 units to 1 bottle in your inventory. Let her tongue swell and her lips crack when you want her broken and compliant.">Pickup −6</button>
                </div>
              `}
            `;
          })()}

          ${(() => {
            // Whore-out panel. Toggle + rate + condom-required +
            // session totals + recent ledger + cashout button.
            if (!window.DMTHGame.whoreOut) return '';
            const wo = window.DMTHGame.whoreOut.getWhoreOut(girl);
            const totals = wo.sessionTotals || {};
            const ledger = (wo.johnLedger || []).slice(-5).reverse();
            const happy = window.DMTHGame.actionEffects?.johnHappinessForGirl
              ? window.DMTHGame.actionEffects.johnHappinessForGirl(girl)
              : null;
            const happyPct = happy ? Math.round(happy.multiplier * 100) : 100;
            return `<details class="sect"${wo.enabled ? ' open' : ''}><summary>💸 Whore-out${wo.enabled ? ' <span class="ok small">· ON</span>' : ''}</summary><div class="sect-body">
              <div class="stat-row" data-tooltip="Passive john arrivals per tick at the selected rate. Cash accrues in unclaimedEarnings until you cash out.">
                <span>Enabled</span>
                <b>${wo.enabled ? '✅ ON' : '⛔ off'}</b>
                <button class="btn-small ${wo.enabled ? 'btn-danger' : 'btn-primary'}" data-whore-toggle data-tooltip="${wo.enabled ? 'Stop john arrivals.' : 'Open her up to john arrivals. Each tick rolls per the rate setting.'}">${wo.enabled ? 'Disable' : 'Enable'}</button>
              </div>
              ${wo.enabled ? (() => {
                // Game-time cadence. Replaces the old low/standard/premium/all-comers
                // %-per-tick enum — explicit "1 john / Nm game time" options + a visible
                // countdown so the player always knows when the next one's coming.
                const minutesToNext = window.DMTHGame.whoreOut.gameMinutesToNextArrival(window.DMTHGame.state.getGirl(girl.id));
                const perTick = window.DMTHGame.whoreOut.expectedArrivalsPerTick(wo.rate);
                const buzzMul = window.DMTHGame.whoreOut.buzzMultiplier();
                const countdownTxt = (wo.rate === 'off' || !Number.isFinite(minutesToNext))
                  ? '— no arrivals while off'
                  : window.DMTHGame.gameClock.formatDuration(minutesToNext);
                const buzzNow = Math.round((window.DMTHGame.state.getBuzz?.() || 0));
                return `
                <div class="stat-row" data-tooltip="Cadence of john arrivals in GAME time. rapid = 1 every 10 game min · steady = 1 every 30 game min · casual = 1 every 60 game min · trickle = 1 every 120 game min · off = none. Each tick is 30 game min. BUZZ multiplier folds in on top — at BUZZ 100, arrivals double.">
                  <span>Cadence</span>
                  <select id="whore-rate" class="inline-select">
                    ${(window.DMTHGame.whoreOut.CADENCE_ORDER || ['off','trickle','casual','steady','rapid']).map(r => {
                      const params = window.DMTHGame.whoreOut.RATE_PARAMS[r];
                      return `<option value="${r}" ${wo.rate === r ? 'selected' : ''}>${r} (${params.displayName})</option>`;
                    }).join('')}
                  </select>
                </div>
                ${(() => {
                  // per-cadence timing forecast: for each option, the in-game CLOCK
                  // TIME her stamina bottoms out (factoring regen + upkeep + drugs + hold comfort),
                  // and — only if friends are allowed — the clock time she'd become a fresh corpse.
                  const wn = window.DMTHGame.whoreOut;
                  if (!wn.johnTimingProjection) return '';
                  const liveG = window.DMTHGame.state.getGirl(girl.id);
                  const liveStam = Math.round(liveG.body?.stamina ?? 70);
                  const rows = (wn.CADENCE_ORDER || []).filter(r => r !== 'off').map(r => {
                    const p = wn.johnTimingProjection(liveG, r);
                    const stam = p.staminaBottomClock
                      ? `spent (0% stamina) by <b>${p.staminaBottomClock}</b>`
                      : 'holds — her regen keeps up';
                    const corpse = p.friendsAllowed
                      ? (p.corpseClock ? ` · 🩸 fresh corpse by <b class="danger">${p.corpseClock}</b>` : ' · 🩸 survives the friends at this pace')
                      : '';
                    const hot = (wo.rate === r) ? ' style="color:#ffd36a"' : '';
                    return `<li${hot}><b>${r}</b> — ${stam}${corpse}</li>`;
                  }).join('');
                  return `<div class="stat-row small" data-tooltip="JOHN TIMING FORECAST — for each cadence, the in-game CLOCK TIME ${escapeHtml(girl.name)}'s stamina hits 0% (factoring her natural regen, upkeep, any active drugs, and her hold's comfort), and — only if you've let friends in — the clock time she'd become a FRESH CORPSE at that pace. Dial the timing with your eyes open."><span>⏱️ Timing forecast</span><span class="muted">stamina now ${liveStam}%${wo.friendsAllowed ? ' · 🩸 friends ON' : ''}</span></div>
                <ul class="small muted" style="margin:2px 0 6px 16px">${rows}</ul>`;
                })()}
                <div class="stat-row" data-tooltip="Countdown to the next expected john arrival, in GAME time. Cadence × BUZZ multiplier determines this. Fractional arrivals carry forward — at 'rapid' BUZZ 100 you'll see ~6 johns per real-time tick (30 game min)."><span>Next john in</span><b>${countdownTxt}</b><span class="muted small" style="margin-left:8px">· ~${perTick.toFixed(2)} johns/tick · BUZZ×${buzzMul.toFixed(2)} (🐝 ${buzzNow})</span></div>
                <div class="stat-row" data-tooltip="Condoms are a real item — this only works if the hold/dungeon is STOCKED with condoms (one is drawn PER john, ~$9 each). No stock = he goes raw = pregnancy risk. Stock condoms via supply to keep a girl off the breeding track.">
                  <span>Condom required (needs stock)</span>
                  <label><input type="checkbox" id="whore-condom" ${wo.condomRequired ? 'checked' : ''}/> enforce</label>
                </div>
                <div class="stat-row" data-tooltip="Let your extreme 'friends' visit THIS girl — they arrive on their own and wreck her (~40-60 Health) for a fortune, no direction needed (they never use condoms). The per-girl toggle is how you pick which girls they're allowed at. For a 🎭 gangbang you choose which friends take part; two+ together can finish her. Every visit logs to her history.">
                  <span>🩸 Let friends in</span>
                  <label><input type="checkbox" id="whore-friends" ${wo.friendsAllowed ? 'checked' : ''}/> allow</label>
                </div>
                ${isDead ? `<div class="stat-row" data-tooltip="She's a corpse — toggle this ON to keep the body in service. Johns keep coming (postmortem), and with 'Let friends in' also on, your friends use the body too. Pay scales DOWN as she rots (a fresh corpse pays well; a rotting mass / skeleton pays scraps), and corpse content draws the worst WANTED heat. The body decays all the way to a skeleton.">
                  <span>🪦 Allow corpse use</span>
                  <label><input type="checkbox" id="whore-corpse" ${wo.corpseUseAllowed ? 'checked' : ''}/> allow</label>
                </div>` : ''}
                <div class="btn-row" style="margin-top:4px">
                  <button class="btn-small" data-whore-gangbang data-tooltip="Throw her a gangbang right now — several johns take turns back-to-back. Stacks pay + cum-fill with a heavy stamina/health toll; ends early if she's too spent.">💦 Throw a gangbang</button>
                </div>`;
              })() + `
                <div class="stat-row" data-tooltip="Pay multiplier from her current stats (bond × stamina × health × mood × outfit). Higher = bigger payouts per john. Better-trained girls earn more.">
                  <span>John happiness multiplier</span>
                  <b class="${happyPct > 110 ? 'gold' : happyPct < 80 ? 'danger' : ''}">${(happy?.multiplier || 1).toFixed(2)}×</b>
                </div>
              ` : ''}
              ${totals.encounters > 0 ? `
                <div class="stat-row small" data-tooltip="Cumulative session count of johns this girl has serviced"><span>Total encounters</span><b>${totals.encounters}</b></div>
                <div class="stat-row small" data-tooltip="Cumulative gross + tips this session"><span>Lifetime earnings</span><b>$${((totals.gross||0) + (totals.tips||0)).toLocaleString()}</b></div>
              ` : ''}
              ${wo.unclaimedEarnings > 0 ? `
                <div class="stat-row" data-tooltip="Cash that has accrued but hasn't been moved to treasury yet. Click cashout to claim.">
                  <span>💰 Unclaimed earnings</span>
                  <b class="gold">$${wo.unclaimedEarnings.toLocaleString()}</b>
                  <button class="btn-small btn-primary" data-whore-cashout data-tooltip="Move all unclaimed earnings to your wallet. Resets the unclaimed counter to 0.">💰 Cashout</button>
                </div>
              ` : ''}
              ${ledger.length > 0 ? `
                <div class="small muted" style="margin-top:6px"><b>Recent johns (last ${ledger.length}):</b></div>
                <ul class="small muted">
                  ${ledger.map(e => {
                    const ago = Math.max(0, Math.round((Date.now() - e.ts) / 60000));
                    return `<li data-tooltip="${(e.notes || '').replace(/"/g, '&quot;')}">${ago}min ago · ${e.johnDescription} · $${e.totalPaid}${e.tip > 0 ? ` (+$${e.tip} tip)` : ''}${e.condomUsed ? ' · 🎈' : ' · 🚫'} · ${e.acts.join(', ')}</li>`;
                  }).join('')}
                </ul>
              ` : ''}</div></details>`;
          })()}

          ${(() => {
            // Pregnancy panel — always visible so the player can see her current
            // reproductive state. Shows NOT PREGNANT explicitly when status is 'none',
            // never hides. Status icon + tooltip explain what the icon means.
            const preg = girl.pregnancy || { status: 'none' };
            const methods = window.DMTHGame.pregnancy
              ? window.DMTHGame.pregnancy.allAbortionMethodsForDisplay(girl)
              : [];
            const statusEmoji = {
              none: '🚫', pregnant: '🤰', aborted: '⚪', miscarried: '🩸',
              'stillbirth-trash': '🩸', 'firestation-drop': '🚒',
              'sold-to-black-market': '💸', 'abandoned-trash': '🗑️',
              'lost-to-authorities': '🚨', birthed: '🍼', lost: '🚨'
            }[preg.status] || '·';
            const statusLabel = preg.status === 'none' ? 'NOT PREGNANT' : preg.status.toUpperCase().replace(/-/g, ' ');
            const statusTip = {
              none: 'Not currently pregnant. Vaginal cum + no condom + bond < L9 fires a conception roll at 30% base chance.',
              pregnant: 'Pregnant. Gestation advances ~1 game day per trimester (3 game days = full term).',
              aborted: 'Pregnancy terminated by abortion method.',
              miscarried: 'Pregnancy lost — back-alley complication or other adverse outcome.',
              'stillbirth-trash': 'Stillborn at full term. Body disposed quietly. +1 notoriety, mild bond debt.',
              'firestation-drop': 'Newborn dropped off anonymously at a firestation. No paper trail.',
              'sold-to-black-market': 'Newborn sold to a black-market broker. Real money, moderate notoriety.',
              'abandoned-trash': 'Newborn dumped — river, dumpster, shallow grave. Small chance of being found.',
              'lost-to-authorities': 'Delivery reported. Heavy notoriety hit. She talked or someone saw.',
              birthed: 'Delivered.',
              lost: 'Pregnancy lost.'
            }[preg.status] || 'Pregnancy state.';
            return `<details class="sect"${preg.status === 'pregnant' ? ' open' : ''}><summary>${statusEmoji} Pregnancy: ${statusLabel}</summary><div class="sect-body" data-tooltip="${statusTip}">
              <div class="stat-row" data-tooltip="${statusTip}"><span>Status</span><b>${statusEmoji} ${statusLabel}</b></div>
              ${preg.status !== 'pregnant' && window.DMTHGame.pregnancy && window.DMTHGame.pregnancy.PREGGO_FILL_MIN != null ? (() => {
                const vc = girl.body?.vaginalCum || 0;
                const maint = girl.body?.preggoFillMaintained || 0;
                const min = window.DMTHGame.pregnancy.PREGGO_FILL_MIN;
                const need = window.DMTHGame.pregnancy.PREGGO_MAINTAIN_TICKS;
                const inZone = vc >= min;
                return `<div class="bar-row" data-tooltip="Vaginal cum-fill — ONLY cum left in her pussy with NO condom raises this, and it leaks over time. Keep it at/above ${min} to sit in 'breeding territory'. Anal / oral / ass-rape do NOT fill it (so a john ass-raping her can't knock her up).">
                    <label>💦 Cum-fill</label><div class="bar"><div class="bar-fill" style="width:${Math.min(100, Math.round(vc / 10 * 100))}%;background:${inZone ? '#8e44ad' : '#5a6'}"></div></div><b>${vc.toFixed(1)}</b></div>
                  ${inZone
                    ? `<div class="stat-row small" data-tooltip="She's in breeding territory — keep her topped above ${min} and she conceives in ${need} ticks of sustained fill. Let it drop below and the timer unwinds."><span>🤰 Breeding timer</span><b class="gold">${maint}/${need}</b></div>`
                    : `<div class="stat-row small muted">Keep her cum-filled above ${min} (no condom) to start the breeding timer.</div>`}`;
              })() : ''}
              ${preg.status === 'pregnant' ? `
                <div class="stat-row"><span>Gestation</span><b>day ${preg.gestationDays}/280 · trimester ${preg.trimester}</b></div>
                <div class="bar-row"><label>Term</label><div class="bar"><div class="bar-fill" style="width:${Math.min(100, Math.round((preg.gestationDays/280)*100))}%"></div></div><b>${Math.round((preg.gestationDays/280)*100)}%</b></div>
                <div class="small muted">Source: ${preg.conceptionSource || 'organic'}${preg.johnEncounterId ? ' · john ledger: ' + preg.johnEncounterId : ''}</div>
                <div class="btn-row" style="margin-top:6px">
                  ${methods.map(m => `<button class="btn-small ${m.inWindow && m.inStock ? 'btn-danger' : ''}" data-abort="${m.id}" ${m.inWindow && m.inStock ? '' : 'disabled'} data-tooltip="${escapeHtml(`${m.label}${!m.inStock ? ' — none in inventory' : ''}${!m.inWindow ? ' — outside window (' + m.windowDays[0] + '-' + m.windowDays[1] + ')' : ''} · ${Math.round(m.complications*100)}% complication · +${m.notorietyHit} notoriety`)}">${m.emoji} ${m.label}${m.owned > 0 ? ` (${m.owned})` : ''}</button>`).join('')}
                </div>
              ` : ''}
              ${preg.status === 'delivered' && preg.pendingNewbornDisposal && window.DMTHGame.pregnancy?.availableNewbornMethods ? (() => {
                const methods = window.DMTHGame.pregnancy.availableNewbornMethods(girl);
                return `<div class="panel" style="border:1px solid #b00;background:rgba(180,0,0,.06);padding:8px;margin-top:6px">
                  <b>🍼 NEWBORN — dispose of the mass</b>
                  <p class="small muted">She delivered. It can't join the harem — pick a method (each has different cash / heat / DEPRAVITY / toll on her). Ignore it and it gets dumpstered automatically.</p>
                  <div class="btn-row" style="flex-wrap:wrap">
                    ${methods.map(m => {
                      const moneyTxt = m.money && m.money[1] > 0 ? ` · $${m.money[0]}-${m.money[1]}` : '';
                      const tip = `${m.notes}${moneyTxt} · WANTED ${m.wanted >= 0 ? '+' : ''}${m.wanted} · DEPRAVITY +${m.xp}${m.locked ? ` · 🔒 ${m.reason}` : ''}`;
                      return `<button class="btn-small ${m.locked ? '' : 'btn-danger'}" data-newborn="${m.id}" ${m.locked ? 'disabled' : ''} data-tooltip="${tip.replace(/"/g, '&quot;')}">${m.emoji} ${escapeHtml(m.displayName)}${m.locked ? ' 🔒' : ''}</button>`;
                    }).join('')}
                  </div>
                </div>`;
              })() : ''}
              ${preg.outcomeHistory && preg.outcomeHistory.length ? `
                <div class="small muted" style="margin-top:6px"><b>History:</b></div>
                <ul class="small muted">
                  ${preg.outcomeHistory.slice(-5).map(h => `<li>${h.status}${h.method ? ' via ' + h.method : ''} · day ${h.day}${h.notes ? ' — ' + h.notes : ''}</li>`).join('')}
                </ul>
              ` : ''}</div></details>`;
          })()}

          ${(() => {
            // 🍼  / lactation panel: breast-fill bar, Tit Sucker rig
            // (one per hold), and the warm-milk buff timer. The suck-her-milk act itself lives
            // in the Love quick-actions tab.
            const milk = window.DMTHGame.milk;
            if (!milk) return '';
            const lactating = milk.isLactating(girl);
            const fill = milk.breastFill(girl);
            const cap = milk.breastCapFor(girl);
            const pct = cap > 0 ? Math.round((fill / cap) * 100) : 0;
            const rigged = milk.holdHasTitSucker(girl);
            const owned = milk.ownedTitSuckers();
            const hMilk = milk.holdMilk ? milk.holdMilk(girl) : 0;
            const hCap = milk.holdMilkCap ? milk.holdMilkCap(girl) : 5;
            const hAuto = milk.holdMilkAuto ? milk.holdMilkAuto(girl) : false;
            const suckerN = milk.holdSuckerCount ? milk.holdSuckerCount(girl) : (rigged ? 1 : 0);
            const maxSuck = milk.MAX_SUCKERS_PER_HOLD || 2;
            const bigTits = !!(window.DMTHGame.specialize && window.DMTHGame.specialize.has(girl, 'big-tits'));
            return `<details class="sect"><summary>🍼 Lactation${lactating ? ' <span class="ok small">· lactating</span>' : ''}</summary><div class="sect-body">
              <div class="stat-row" data-tooltip="A captive lactates while pregnant (2nd trimester+) or freshly postpartum — otherwise her breasts are dry."><span>Status</span><b>${lactating ? '🤱 lactating' : '— dry'}</b></div>
              ${lactating ? `
                <div class="bar-row" data-tooltip="Her breast-milk fill — refills slowly over ~1 game day. Suck her dry (Love → suck her milk, needs ≥75% full) for a timed warm-milk buff, or rig a Tit Sucker to bottle it.${bigTits ? ' 🍈 Cow Tits: double capacity + output.' : ''}">
                  <label>🥛 Breast fill</label><div class="bar"><div class="bar-fill" style="width:${pct}%;background:#e8d8a0"></div></div><b>${fill.toFixed(1)}/${cap}L</b></div>
              ` : ''}
              <div class="stat-row" data-tooltip="Tit Suckers bottle her milk into this hold's store over time — up to two (one per tit) for DOUBLE output. Buy them at the 🥛 Dairy (Stores hub) or loot them.">
                <span>🍼 Tit Suckers</span><b>${suckerN}/${maxSuck} rigged</b>
                ${suckerN < maxSuck ? `<button class="btn-small btn-primary" data-titsucker-attach ${owned < 1 ? 'disabled' : ''} data-tooltip="${owned < 1 ? 'None in inventory — buy at the 🥛 Dairy or loot one.' : `Rig another (${owned} in inventory). Two = double the milk, one per tit.`}">Attach (${owned})</button>` : ''}
                ${suckerN > 0 ? `<button class="btn-small" data-titsucker-detach data-tooltip="Pull one Tit Sucker off this hold, back to inventory.">Detach</button>` : ''}
              </div>
              ${rigged ? `
                <div class="stat-row" data-tooltip="Her milk pools in THIS hold until you collect it. Without the auto-supply upgrade, bottling PAUSES when the hold hits its cap.">
                  <span>🥛 Hold milk store</span><b class="gold">${hMilk.toFixed(0)} / ${hCap}L</b>
                  <button class="btn-small btn-primary" data-milk-collect ${hMilk < 1 ? 'disabled' : ''} data-tooltip="Collect the pooled milk into your inventory.">Collect ${hMilk.toFixed(0)}L</button>
                </div>
                <div class="stat-row small" data-tooltip="How much milk this hold pools before bottling pauses (no upgrade) or overflows to inventory (with auto-supply).">
                  <span>Hold cap</span>
                  <input type="range" min="1" max="30" value="${hCap}" data-milk-cap style="flex:1">
                  <b>${hCap}L</b>
                </div>
                <div class="stat-row small" data-tooltip="${hAuto ? 'Auto-supply ON — milk past the cap auto-flows to your inventory.' : 'Buy per-hold auto-supply so milk past the cap auto-flows to your inventory instead of pausing at the cap.'}">
                  <span>🔁 Auto-supply</span>
                  ${hAuto ? `<b class="ok">✅ on (overflow → inventory)</b>` : `<button class="btn-small" data-milk-auto-buy data-tooltip="Buy auto-supply for this hold — $${milk.MILK_AUTO_COST}.">Buy — $${milk.MILK_AUTO_COST.toLocaleString()}</button>`}
                </div>
              ` : ''}
              ${milk.buffActive() ? `<div class="stat-row small" data-tooltip="The warm-milk high from sucking a tit dry — Nut Reserve regen + satisfaction trickle each tick. Fades soon; suck another full tit to keep it going."><span>🥛 Warm-milk high</span><b class="gold">${milk.buffTicksLeft()} ticks left</b></div>` : ''}</div></details>`;
          })()}

          ${(() => {
            // 🩸 menstrual cycle status + bloody-fuck acts. The acts only appear while
            // she's RAGGING (on the rag / menstruating — "rag ing", not rage). A pregnant girl
            // doesn't cycle. The acts route through applyAction (balanced premium) + a chat turn so
            // Ollama narrates her reaction (no hardcoded responses).
            const period = window.DMTHGame.period;
            if (!period) return '';
            const onRag = period.isOnPeriod(girl);
            const isPreg = girl.pregnancy?.status === 'pregnant';
            return `<details class="sect"${onRag ? ' open' : ''}><summary>🩸 Cycle${onRag ? ' <span class="ok small">· ON THE RAG</span>' : ''}</summary><div class="sect-body">
              <div class="stat-row" data-tooltip="Each girl is on the rag ~1 game day every ~5 game days (paused while pregnant). Bloody-fucking her while she's ragging is premium taboo content — the option only shows up while she's on her period.">
                <span>Status</span><b>${isPreg ? '🤰 paused (pregnant)' : onRag ? '🩸 ON THE RAG (ragging)' : '— ' + escapeHtml(period.describe(girl))}</b>
              </div>
              ${onRag ? `<div class="btn-row">
                <button class="btn-small btn-danger" data-period-act="period-fuck" data-tooltip="Fuck her bloody while she's on the rag — depraved premium, strong satisfaction, she's sore + humiliated. No health wreck.">🩸 Bloody fuck</button>
                <button class="btn-small btn-danger" data-period-act="period-oral" data-tooltip="Make her clean you off bloody with her mouth — degrading period oral.">🩸 Make her clean it</button>
                <button class="btn-small btn-danger" data-period-act="period-creampie" data-tooltip="Breed her bloody — cum deep inside her on the rag. Filthiest premium; fires the conception hook.">🩸 Breed her bloody</button>
                <button class="btn-small btn-danger" data-period-act="period-finger" data-tooltip="Finger her bloody and smear it up her belly + tits — degrading, marks her red.">🩸 Finger + smear</button>
              </div>` : ''}</div></details>`;
          })()}

          ${(() => {
            // 🥒 Insertable hold-in cum-capacity plug on a per-level timer. Plug her, leave it
            // buried, and every ~2.5 real minutes (game-time) her cum-load capacity jumps a level;
            // 3 levels = +100% over base. Live "level X of 3 · next in mm:ss" readout below.
            const ct = window.DMTHGame.cumtool;
            if (!ct) return '';
            const owned = window.DMTHGame.state.current?.inventory?.['pussy-wrecker'] || 0;
            const prog = ct.progress(girl);
            const lvl = ct.plugLevel(girl);
            const maxLvl = ct.PLUG_MAX_LEVEL;
            const capMaxed = lvl >= maxLvl || (girl.body?.cumLoadCap ?? 10) >= ct.CUMTOOL_CAP_CEILING;
            if (!owned && prog == null && !capMaxed) return '';
            const fmtSec = s => { const m = Math.floor(s / 60), ss = Math.round(s % 60); return `${m}:${String(ss).padStart(2, '0')}`; };
            return `<details class="sect"${prog != null ? ' open' : ''}><summary>🥒 Cum-capacity plug — level ${lvl}/${maxLvl}</summary><div class="sect-body">
              ${prog != null ? `
                <div class="stat-row small" data-tooltip="Each level buried wrenches her cunt wider — 3 levels takes her cum-load capacity to +100% over base. She's on level ${prog.level} of ${prog.maxLevel} right now.">
                  <span>🥒 Plug level</span><b>${prog.level} / ${prog.maxLevel}</b></div>
                <div class="bar-row" data-tooltip="Progress toward the NEXT level. Leave the plug buried until it fills and her cum-load capacity jumps. Pull it early and only the in-progress level resets — levels already earned stay.">
                  <label>Next level</label><div class="bar"><div class="bar-fill" style="width:${Math.round(prog.frac * 100)}%;background:#b06"></div></div>
                  <b id="cumplug-countdown" data-cp-end="${Date.now() + prog.remainingRealSec * 1000}">next in ${fmtSec(prog.remainingRealSec)}</b></div>
                <div class="btn-row"><button class="btn-small" data-cumplug-remove data-tooltip="Pull the plug out early — levels already earned stay, but the level she's mid-way through resets.">Pull it out</button></div>
              ` : capMaxed ? `<div class="stat-row small muted">Her cunt's wrecked to the max — level ${lvl}/${maxLvl}, no more capacity to gain.</div>`
                : `<div class="stat-row" data-tooltip="Bury the massive plug in her and leave it; every ~2.5 minutes her cum-load capacity jumps a level (3 levels = +100%, toward a 60 ceiling). You'll watch the Cum cap number climb.">
                    <span>🥒 Pussy Wrecker</span><b>have ×${owned}</b>
                    <button class="btn-small btn-primary" data-cumplug-insert ${owned < 1 ? 'disabled' : ''}>Plug her + leave it buried</button>
                  </div>`}</div></details>`;
          })()}

          ${(() => {
            // 🧬 per-girl permanent specialization upgrades.
            const sp = window.DMTHGame.specialize;
            if (!sp) return '';
            const ownedSpecs = sp.list(girl);
            const money = window.DMTHGame.state.current?.wallet?.money || 0;
            return `<details class="sect"><summary>🧬 Specializations</summary><div class="sect-body">
              <p class="small muted">Permanent fucked-up upgrades that specialize her for a role. Bought once, never removed.</p>
              ${ownedSpecs.length ? `<div class="stat-row small"><span>Installed</span><b>${ownedSpecs.map(s => `${s.emoji} ${escapeHtml(s.displayName)}`).join(' · ')}</b></div>` : ''}
              <div class="btn-row" style="flex-wrap:wrap">
                ${sp.all().map(s => {
                  const has = sp.has(girl, s.id);
                  const afford = money >= s.cost;
                  return `<button class="btn-small ${has ? '' : 'btn-primary'}" data-specialize="${s.id}" ${has || !afford ? 'disabled' : ''} data-tooltip="${escapeHtml(s.notes)}">${s.emoji} ${escapeHtml(s.displayName)} ${has ? '✅' : `— $${s.cost.toLocaleString()}`}</button>`;
                }).join('')}
              </div></div></details>`;
          })()}

          <h3>Drugs</h3>
          <div class="btn-row">
            ${(() => {
              // Drug buttons. Tooltip =  thorough builder — descriptive text +
              // the drug's full modifiers (👤 HER line) + the player's gains/cost (🎮 YOU line)
              // so the player sees exactly what the drug does before clicking.
              const at = window.DMTHGame.actionEffects?.actionTooltip;
              const dt = (id, label) => at ? at(id, label) : label;
              return `
                <button class="btn-small" data-drug="coke" data-tooltip="${escapeHtml(dt('drug-coke', 'Line of coke. Rapid-fire chatter, jaw clench, dilated pupils. 45-min curve.'))}">❄️ Line of coke</button>
                <button class="btn-small" data-drug="weed" data-tooltip="${escapeHtml(dt('drug-weed', 'Roll her a joint. Slow blinks, drifty word choice, relaxed posture. 2-hour curve.'))}">🌿 Roll a joint</button>
                <button class="btn-small" data-drug="mdma" data-tooltip="${escapeHtml(dt('drug-mdma', "Share a molly. Emotional flooding, 'i love you' leak, glowing skin. 4-hour curve."))}">💊 Share molly</button>
                <button class="btn-small" data-drug="acid" data-tooltip="${escapeHtml(dt('drug-acid', "Tab of acid. Things-aren't-real perception, blown pupils, time dilation. 10-hour curve."))}">🧪 Tab of acid</button>
                <button class="btn-small" data-drug="whiskey" data-tooltip="${escapeHtml(dt('drug-whiskey', 'Pour whiskey. Slurred, looser-tongued, more honest. 90-min curve.'))}">🥃 Pour whiskey</button>
                <button class="btn-small" data-drug="ketamine" data-tooltip="${escapeHtml(dt('drug-ketamine', 'Bump of K. Dissociated stare, slack jaw, limp posture. 40-min curve. NOT a knockout.'))}">🐴 Bump of K</button>
                <button class="btn-small btn-danger" data-drug="tranquilizer" data-tooltip="${escapeHtml(dt('drug-tranquilizer', 'Tranquilizer dart. FULL knockout — eyes closed, limp, unresponsive. 4-min unconscious window. Consumes 1 from inventory.'))}">🎯 Tranquilizer (4-min knockout)</button>
              `;
            })()}
          </div>

          <h3>Actions</h3>
          <div class="btn-row">
            <button id="record-toggle" class="btn-small" data-tooltip="${window.DMTHGame.film.isRecording() && window.DMTHGame.film.activeSession().girlId === girl.id ? 'Stop the recording. Film gets cover-image generated and listed on the market.' : 'Start recording this session. Every turn captured; sells passive on tick.'}">${window.DMTHGame.film.isRecording() && window.DMTHGame.film.activeSession().girlId === girl.id ? '⏹ Stop recording' : '🎬 Start recording'}</button>
            <button id="selfie-btn" class="btn-small" data-tooltip="Pull out your phone and snap a photo of her in her current state + location. Uses her locked face seed.">📸 Snap a pic of her</button>
            <button id="selfie-withme-btn" class="btn-small" data-tooltip="Generate an image with YOU in the frame with her (your created character — sex/build/race/hair/clothing). Third-person shot of the two of you.">🤳 Shot with me</button>
            <button id="selfie-pov-btn" class="btn-small" data-tooltip="Generate a first-person POV shot from your point of view — your own arms/hands in frame (e.g. washing her, taking her). Uses your created character.">👁️ POV shot</button>
            <button id="derobe-btn" class="btn-small ${girl.currentOutfit === 'nude' ? 'btn-primary' : ''}" data-tooltip="${girl.currentOutfit === 'nude' ? 'Currently nude — click to put her captured-at outfit back on.' : 'Strip her nude. Front-loads nudity in image prompts. Accessories still allowed if equipped.'}">🍑 ${girl.currentOutfit === 'nude' ? 'Re-dress' : 'Derobe (nude)'}</button>
            <button id="strip-all-btn" class="btn-small ${girl.currentOutfit === 'none' ? 'btn-primary' : ''}" data-tooltip="${girl.currentOutfit === 'none' ? 'Currently stripped of everything — click to put her captured-at outfit back on.' : 'Strip EVERYTHING — no garments, no accessories, no jewelry, no collar, no restraints. Raw nakedness.'}">🚫 ${girl.currentOutfit === 'none' ? 'Re-dress' : 'Strip everything'}</button>
            <button id="heal-btn" class="btn-small" data-tooltip="Heal her bruises + reset mood to baseline. Sometimes you patch them up before they break.">❤️‍🩹 Heal (reset damage)</button>
            <button class="btn-small" data-mode="sexy" data-tooltip="Sexy mode — default register. Sex acts emphasized in Ollama replies.">Mode: Sexy</button>
            <button class="btn-small" data-mode="hurtme" data-tooltip="Hurt Me mode — violence register. Bruises accumulate; pain emphasized.">Mode: Hurt Me</button>
            <a class="btn-small" href="#dispose?girl=${girl.id}" data-tooltip="End the relationship. Bury / lose-at-sea / incinerate / release / final film / trade-away. Each method has different notoriety + premium-content tradeoffs.">⚱️ Dispose / trade</a>
            <button id="list-sale" class="btn-small" data-tooltip="List her on the slave market. Buyers tick in over time. Price scales with Stockholm rating + training.">⛓️ List on slave market</button>
            <a class="btn-small" href="#timeline?girl=${girl.id}" data-tooltip="Her full history — every turn, every drug, every milestone.">📖 Timeline</a>
            <a class="btn-small" href="#gallery?girl=${girl.id}" data-tooltip="Her Spank Bank — every filthy image of her ever made, persisted: view, download, open fullscreen.">🍆 Spank Bank</a>
          </div>
          <div id="selfie-slot"></div>

          ${(() => {
            // Multi-girl scene  — gather up to MAX_SCENE_PARTNERS other captives
            // into the active girl's room for a TRUE multi-speaker scene. Every girl present
            // answers her own Ollama turn in her own voice, in sequence. A target selector
            // picks whether an action hits everyone or just one girl. Partners go back to
            // their own holds when sent back. Generalizes 's single-partner lite mode.
            const host = girl;
            const sceneIds = sceneGirlIdsOf(host);
            const sceneGirls = sceneIds.map(id => window.DMTHGame.state.getGirl(id)).filter(g => g && g.encounterState === 'captive' && g.assignedDungeonId === host.assignedDungeonId);
            // only captives held in the SAME dungeon (location) can be teamed up.
            // Girls in other dungeons must be transported in first (see the 🚚 Transfer panel).
            const available = window.DMTHGame.state.current.roster.filter(g => g.id !== host.id && g.encounterState === 'captive' && !sceneIds.includes(g.id) && g.assignedDungeonId === host.assignedDungeonId);
            const elsewhere = window.DMTHGame.state.current.roster.filter(g => g.id !== host.id && g.encounterState === 'captive' && g.assignedDungeonId !== host.assignedDungeonId).length;
            const full = sceneGirls.length >= MAX_SCENE_PARTNERS;
            // Don't show the multi-girl wall at all when there's nothing to do (no partners in the
            // scene AND none available to bring in) — that's just noise. It returns the moment you
            // hold a second captive in this dungeon.
            if (!sceneGirls.length && !available.length) return '';
            return `<div class="panel" style="margin-top:8px">
              <h3>👯 Multi-girl scene</h3>
              <p class="small muted">Team up any captives held in THIS dungeon — pull up to ${MAX_SCENE_PARTNERS} more into ${escapeHtml(host.name)}'s room for a true multi-speaker scene. Every girl present answers in her OWN voice, in turn. Pick who an action targets below. They go back to their own holds when you send them back.${elsewhere ? ` <span class="muted">(${elsewhere} more captive${elsewhere === 1 ? '' : 's'} held in other dungeons — 🚚 transfer one here to add her.)</span>` : ''}</p>
              ${sceneGirls.length ? `
                <div class="stat-row"><span>In the scene</span><b>${escapeHtml(host.name)} <span class="muted small">(host)</span>${sceneGirls.map(p => `, ${p.mood?.moodEmoji || ''} ${escapeHtml(p.name)}`).join('')}</b></div>
                ${sceneGirls.map(p => `<div class="stat-row small"><span>${p.mood?.moodEmoji || ''} ${escapeHtml(p.name)} <span class="muted">(${escapeHtml(p.archetypeTemplate)})</span></span><button class="btn-small btn-danger" data-scene-remove="${p.id}" data-tooltip="Send ${escapeHtml(p.name)} back to her own hold.">Send back</button></div>`).join('')}
                <div class="stat-row" data-tooltip="Who your next action + typed line targets. 'Everyone present' makes every girl in the room answer in turn (each in her own voice). Pick one name and only she answers — the others just witness and take a share of the scene.">
                  <span>🎯 Acting on</span>
                  <select id="scene-target" class="inline-select">
                    <option value="all">Everyone present (all answer)</option>
                    ${[host, ...sceneGirls].map(g => `<option value="${g.id}">${escapeHtml(g.name)} only</option>`).join('')}
                  </select>
                </div>
              ` : `<p class="small muted">Just ${escapeHtml(host.name)} in here right now. Bring someone in below.</p>`}
              ${!full && available.length ? `
                <div class="stat-row">
                  <select id="scene-pick" class="inline-select">
                    <option value="">— pick a captive to bring in —</option>
                    ${available.map(p => `<option value="${p.id}">${escapeHtml(p.name)} (${escapeHtml(p.archetypeTemplate)})</option>`).join('')}
                  </select>
                  <button class="btn-small" id="scene-add" data-tooltip="Pull this captive into the scene. She answers in her own voice alongside ${escapeHtml(host.name)}.">👯 Bring her in</button>
                </div>
              ` : full ? `<p class="small muted">Scene full (${MAX_SCENE_PARTNERS} partners max). Send one back to swap.</p>` : (!available.length ? `<p class="small muted">${elsewhere ? `No other captives in THIS dungeon. 🚚 Transfer one of your ${elsewhere} captive${elsewhere === 1 ? '' : 's'} held elsewhere into this dungeon to team her up.` : 'No other captives available — capture more to run multi-girl scenes.'}</p>` : '')}
            </div>`;
          })()}

          ${(() => {
            // EPIC X — voiced gangbang + NPC-DIRECT (GANGSEL / MULTISPEAK / GANGVOICE / NPC-DIRECT).
            // Only for an alive, whored-out captive. The crowd selector + run button live here; the
            // NPC-DIRECT box is populated by renderNpcDirect() after a scene runs. The scene itself
            // plays out in the main chat log (per-speaker name-tagged), girl-only TTS.
            if (!window.DMTHGame.whoreOut) return '';
            const wo = window.DMTHGame.whoreOut.getWhoreOut(girl);
            if (!wo.enabled || girl.encounterState !== 'captive') return '';
            return `<div class="panel" style="margin-top:8px">
              <h3>🎭 Voiced gangbang</h3>
              <p class="small muted">Throw a gangbang that PLAYS OUT in the chat log — each named man speaks in his OWN voice, ${escapeHtml(girl.name)} reacts to each BY NAME (only SHE is voiced aloud). Pays + cum-fills + bukkakes for real. Then direct any man to a specific act below.</p>
              <div class="stat-row" data-tooltip="How many men pile in. Capped by your dungeon's size + how many captives you hold (a bigger operation draws a bigger crowd).">
                <span>🎯 Crowd size</span>
                <select id="vgang-size" class="inline-select">${[2,3,4,5,6,8,10].map(n => `<option value="${n}"${n === 4 ? ' selected' : ''}>${n} johns</option>`).join('')}</select>
                ${wo.friendsAllowed ? `<span style="margin-left:8px" data-tooltip="How many of your extreme 'friends' join the gangbang. Each wrecks her (near-kill, fortune pay) — and their damage STACKS: 2+ friends together can easily KILL her by chance + stat rolls. They never use condoms.">🩸 <select id="vgang-friends" class="inline-select">${[0,1,2,3].map(n => `<option value="${n}"${n === 0 ? ' selected' : ''}>${n} friend${n === 1 ? '' : 's'}</option>`).join('')}</select></span>` : ''}
              </div>
              <div class="btn-row" style="margin-top:4px">
                <button id="vgang-run" class="btn-small btn-primary" data-tooltip="Resolves the real gangbang (pay / stamina / health / cum-fill / bukkake) AND voices it in the chat log. Each man talks in character; only ${escapeHtml(girl.name)} is read aloud by Kokoro.">🎭 Throw a voiced gangbang</button>
              </div>
              <div id="npc-direct-panel" style="margin-top:8px"></div>
            </div>`;
          })()}

          ${window.DMTHRoomPanels ? window.DMTHRoomPanels.transfer(girl) : ''}

          ${window.DMTHRoomPanels ? window.DMTHRoomPanels.snuff(girl) : ''}

          ${window.DMTHRoomPanels ? window.DMTHRoomPanels.toys(girl) : ''}

          ${window.DMTHRoomPanels ? window.DMTHRoomPanels.condoms(girl) : ''}

          ${window.DMTHRoomPanels ? window.DMTHRoomPanels.dungeonPool(girl) : ''}

          ${(() => {
            // Custom image-prompt input. User types a free-form scene description; Ollama
            // composes a full prompt with all the existing guardrails (8-position canonical
            // ordering, full-body framing, nudity / pregnancy / drug markers);
            // Pollinations fires. Draft text + last result image restore from module-scoped
            // per-girl caches so state.onChange re-renders don't wipe them.
            const draft = customPoseDrafts.get(girl.id) || '';
            const lastResult = customPoseResults.get(girl.id);
            const lastResultHtml = lastResult && lastResult.url ? `
              <div class="panel">
                <img src="${lastResult.url}" alt="${girl.name} custom pose" class="gen-img" onerror="this.outerHTML='<a href=\\'${lastResult.url}\\' target=\\'_blank\\' class=\\'img-link-fallback\\'>🔗 ${girl.name}</a>'" />
                <p class="small muted">${girl.name} · custom pose: "${escapeHtml(lastResult.staging || '')}"</p>
                <p class="small"><a href="${lastResult.url}" target="_blank" rel="noopener">🔗 open in tab</a> · <a href="#gallery?girl=${girl.id}">🍆 view her Spank Bank</a></p>
              </div>` : '';
            return `<div class="panel" style="margin-top:8px">
              <h3>🎨 Custom pose / scene</h3>
              <p class="small muted">Describe the scene + pose you want. Ollama composes a valid image prompt with all guardrails — you stage her how you want.</p>
              <textarea id="custom-pose-in" rows="3" placeholder="e.g. 'kneeling on the bed, looking up at the camera with submissive eyes, biting her lower lip, hands clasped between her thighs, soft warm bedroom lighting'">${draft.replace(/</g, '&lt;')}</textarea>
              <div class="btn-row" style="margin-top:6px">
                <button id="custom-pose-fire" class="btn-small btn-primary" data-tooltip="Send your description to Ollama → composed prompt → Pollinations generation. Image appears below + saves to her Spank Bank.">🎨 Generate custom pose</button>
                <button id="custom-pose-clear" class="btn-small" data-tooltip="Clear the input box.">Clear</button>
                <span class="small muted" id="custom-pose-status"></span>
              </div>
              <div id="custom-pose-slot">${lastResultHtml}</div>
            </div>`;
          })()}
        </section>

        <section class="panel">
          <h2>Log
            <span style="float:right;display:inline-flex;gap:6px;font-weight:normal;">
              <button id="log-voice-toggle" class="btn-small" data-tooltip="Toggle Kokoro TTS voice playback for this session. Same toggle as the 🔊 in the top chrome bar.">🔊</button>
              <button id="log-clear-chat" class="btn-small btn-danger" data-tooltip="Clear this captive's chat log. Affects only her — other captives' logs are untouched.">🗑️ Clear chat</button>
            </span>
          </h2>
          <div id="log" class="log"></div>
          <div id="quick-actions"></div>
          <div class="input-row">
            <textarea id="user-in" rows="2" placeholder="optional — or just click an action above"></textarea>
            <button id="send" class="btn-primary">Send</button>
          </div>
          <div class="small muted" id="stream-status"></div>
        </section>

      </div>
    `;

    // Log renderer — selection-safe + incremental append:
    //  1. Every state.onChange (john arrivals, drug curves, achievements, lifespan ticks)
    //     used to blast `logEl.innerHTML = ...` which killed any in-flight text selection.
    //     Now we skip re-render while the user is actively selecting text inside the log.
    //  2. Full-DOM-rebuild on every state change is gone — incremental append only. We
    //     track `lastRenderedTurnCount` so subsequent renders only push NEW turns to the
    //     end. Full repaint only when turn-count shrinks (history trimmed / save loaded).
    const logEl = el.querySelector('#log');
    let lastRenderedTurnCount = 0;
    function renderLog() {
      // If the user has an active selection inside the log, defer this render so we don't
      // wipe their selection. The next state.onChange will retry.
      const sel = (typeof window.getSelection === 'function') ? window.getSelection() : null;
      if (sel && !sel.isCollapsed && sel.anchorNode && logEl.contains(sel.anchorNode)) {
        return;
      }
      // Speaker label: `t.speaker` is set for partner-captive lines mirrored into this host
      // girl's shared log by a multi-girl scene . Otherwise user → "Master",
      // assistant → the active girl's name.
      const speakerOf = t => t.speaker || (t.role === 'user' ? 'Master' : (girl.captiveName || girl.name));
      const turns = window.DMTHGame.state.getTurns(girl.id, 50);
      if (turns.length < lastRenderedTurnCount) {
        // History shrank (cleared / replaced) — full repaint
        logEl.innerHTML = turns.map(t =>
          `<div class="log-entry ${t.role}"><b>${escapeHtml(speakerOf(t))}:</b> ${escapeHtml(t.text)}</div>`
        ).join('');
      } else if (turns.length > lastRenderedTurnCount) {
        // Append only the new turns since last render
        const frag = document.createDocumentFragment();
        for (const t of turns.slice(lastRenderedTurnCount)) {
          const div = document.createElement('div');
          div.className = `log-entry ${t.role}`;
          div.innerHTML = `<b>${escapeHtml(speakerOf(t))}:</b> ${escapeHtml(t.text)}`;
          frag.appendChild(div);
        }
        logEl.appendChild(frag);
      }
      lastRenderedTurnCount = turns.length;
      logEl.scrollTop = logEl.scrollHeight;
    }
    renderLog();

    // Per-girl chat clear — other captives' logs untouched. Resets the incremental-append
    // counter so the next renderLog starts from zero.
    const clearChatBtn = el.querySelector('#log-clear-chat');
    if (clearChatBtn) {
      clearChatBtn.onclick = () => {
        if (!confirm(`Clear ${girl.name}'s chat log? Her turns will be gone — other captives' logs are untouched.`)) return;
        window.DMTHGame.state.clearTurns(girl.id);
        lastRenderedTurnCount = 0;
        logEl.innerHTML = '';
      };
    }

    // the captor renames her; she's no longer an individual and answers only to
    // what he calls her (the chosen name flows into her chat template + her hold header).
    const renameBtn = el.querySelector('#rename-girl');
    if (renameBtn) {
      renameBtn.onclick = () => {
        const cur = girl.captiveName || girl.name;
        const next = (prompt("Rename her. She's no longer her own person — she answers only to what you name her:", cur) || '').trim();
        if (!next || next === cur) return;
        window.DMTHGame.state.updateGirl(girl.id, { captiveName: next.slice(0, 40) });
        window.DMTHRouter.go('room', { girl: girl.id });
      };
    }

    // In-room TTS mute/unmute — same VOICE_KEY storage as the chrome-bar toggle in
    // game.html, so flipping it here also updates the chrome button on next sync.
    const VOICE_KEY = 'dmth_voice_on';
    const voiceBtn = el.querySelector('#log-voice-toggle');
    function syncVoiceBtn() {
      if (!voiceBtn) return;
      const on = localStorage.getItem(VOICE_KEY) !== 'off';
      voiceBtn.textContent = on ? '🔊' : '🔇';
      voiceBtn.setAttribute('data-tooltip', on ? 'Voice ON — click to mute' : 'Voice OFF — click to unmute');
    }
    syncVoiceBtn();
    if (voiceBtn) {
      voiceBtn.onclick = () => {
        const wasOn = localStorage.getItem(VOICE_KEY) !== 'off';
        localStorage.setItem(VOICE_KEY, wasOn ? 'off' : 'on');
        // Mid-response mute — kill any in-flight TTS immediately
        if (wasOn && window.DMTHVoiceQueue) window.DMTHVoiceQueue.cancel();
        syncVoiceBtn();
        // Mirror to chrome button so it updates without reload
        const chromeBtn = document.getElementById('chrome-voice');
        if (chromeBtn) {
          chromeBtn.textContent = wasOn ? '🔇' : '🔊';
          chromeBtn.setAttribute('data-tooltip', wasOn ? 'Voice OFF — click to enable' : 'Voice ON — click to mute');
        }
      };
    }

    // Quick actions — one-click sends preset user turns.
    const qaEl = el.querySelector('#quick-actions');
    if (qaEl) {
      const mode = window.DMTHGame.state.current.settings.mode || 'sexy';
      window.DMTHQuickActions.render(qaEl, girl, mode, (text) => {
        sendTurn(text);
      });
    }

    // In-flight lock — only ONE Ollama turn at a time
    let inFlight = false;

    function setInFlight(on) {
      inFlight = on;
      el.classList.toggle('inflight', on);
      const sendBtn = el.querySelector('#send');
      if (sendBtn) sendBtn.disabled = on;
      el.querySelectorAll('.qa-btn, [data-drug], [data-feed], [data-water], #selfie-btn, #selfie-withme-btn, #selfie-pov-btn, #heal-btn, [data-mode], #record-toggle, #list-sale, #scene-add, [data-scene-remove], #scene-target')
        .forEach(b => { b.disabled = on; });
      const status = el.querySelector('#stream-status');
      if (status) status.textContent = on ? '⏳ waiting for her to finish…' : '';
    }

    // Shared send path used by both the typed input and the quick-action clicks.
    // opts.detectAction (typed path only) runs the commonality engine on the typed line to register
    // a real action . Quick-actions pass nothing — they already carry their own effect.
    async function sendTurn(text, opts = {}) {
      if (!text) return;
      // Block chat while tranquilized. She can't speak.
      const tranqNow = window.DMTHGame.drugs.isUnconscious && window.DMTHGame.drugs.isUnconscious(
        window.DMTHGame.state.getGirl(girl.id)
      );
      if (tranqNow) {
        const status = el.querySelector('#stream-status');
        if (status) {
          status.textContent = '💉 she\'s tranquilized — out cold. Wait for wake-up.';
          setTimeout(() => { if (status) status.textContent = ''; }, 2000);
        }
        return;
      }
      if (inFlight) {
        // Drop the click silently — user is already waiting on a response
        const status = el.querySelector('#stream-status');
        if (status) {
          status.textContent = '⏳ wait — she\'s still answering…';
          setTimeout(() => { if (!inFlight && status) status.textContent = ''; }, 1500);
        }
        return;
      }
      // Cancel any in-flight TTS from the previous response — new turn,
      // old audio shouldn't keep talking over the user.
      if (window.DMTHVoiceQueue) window.DMTHVoiceQueue.cancel();
      el.querySelector('#user-in').value = '';
      window.DMTHGame.state.appendTurn(girl.id, 'user', text);

      // Heal verb check
      if (window.DMTHGame.damage.shouldHeal(text)) {
        window.DMTHGame.damage.heal(girl.id);
        renderLog();
        window.DMTHRouter.handle();
        return;
      }

      // the COMMONALITY ENGINE picks up a typed player ACTION ("let me wash you" →
      // love-bathe-her) and REGISTERS it: applies its stat spec (which logs to her activity history),
      // so the typed line is actually DONE, not just narrated. Gated on a STRONG match (score ≥ 3,
      // an id-token hit) so plain dialogue ("you look pretty") never fires an action. Not run during a
      // multi-girl scene (that path targets multiple girls). Ollama still narrates her reaction below.
      if (opts.detectAction && window.DMTHGame.actionEffects?.matchDirectedAction
          && !liveSceneGirls(window.DMTHGame.state.getGirl(girl.id)).length) {
        try {
          const m = window.DMTHGame.actionEffects.matchDirectedAction(text, { includeCare: true });
          if (m && m.matched && m.score >= 3 && window.DMTHGame.actionEffects.applyAction) {
            window.DMTHGame.actionEffects.applyAction(girl.id, m.actionId);
            if (window.DMTHNotify) {
              const lbl = String(m.action?.notes || m.actionId).split(/[—.]/)[0].trim();
              window.DMTHNotify.show(`✋ Registered: ${lbl}`, { type: 'info', durationMs: 1800 });
            }
          }
        } catch (e) { /* non-fatal — detection never blocks the chat turn */ }
      }

      renderLog();
      setInFlight(true);
      try {
        // Multi-girl scene  — if any partner captives are present, every girl in
        // the room takes her own turn (multi-speaker loop). Otherwise the classic single path.
        if (liveSceneGirls(window.DMTHGame.state.getGirl(girl.id)).length) {
          await runSceneTurn(text);
        } else {
          await streamOllamaResponse(text);
        }
      } finally {
        setInFlight(false);
      }
    }

    async function streamOllamaResponse(text) {
      const statusEl = el.querySelector('#stream-status');
      statusEl.textContent = 'calling Ollama…';

      const streamDiv = document.createElement('div');
      streamDiv.className = 'log-entry assistant streaming';
      streamDiv.innerHTML = `<b>${girl.name}:</b> <span id="stream-txt"></span>`;
      logEl.appendChild(streamDiv);
      const txtEl = streamDiv.querySelector('#stream-txt');

      try {
        const mode = window.DMTHGame.state.current.settings.mode || 'sexy';
        // Postmortem branch — dead captive uses the narration-only scene so the model
        // emits asterisk-action only (no spoken dialogue, no mood, no bond). TTS still
        // plays the narration aloud per the asterisk-strip path established in .
        const isDead = girl.encounterState === 'dead';
        const sceneKey = isDead ? 'room_postmortem' : 'room_regular';
        const decayMinutes = girl.body?.decayedMinutes || 0;
        const decayDays = (decayMinutes / 1440).toFixed(1);
        const sceneVars = isDead ? {
          ROOM_AMBIENCE: `${dungeonTpl?.displayName || 'hideout'}, ${dungeonTpl?.plotTokens || 'bare'}`,
          DECAY_DAYS: decayDays,
          BOND_LEVEL: girl.bond.bondLevel,
          BOND_NAME: 'deceased',
          BODY_SUMMARY: `deceased — ${decayDays} game days since death`,
          MOOD: 'deceased'
        } : {
          ROOM_AMBIENCE: `${dungeonTpl?.displayName || 'hideout'}, ${dungeonTpl?.plotTokens || 'bare'}`,
          BOND_LEVEL: girl.bond.bondLevel,
          BOND_NAME: ['terrified','wary','acclimating','curious','ambivalent','reciprocated','dependent','partner','devoted','fully-bonded'][girl.bond.bondLevel],
          BODY_SUMMARY: `arousal=${girl.body.arousal}, wetness=${girl.body.wetness}, bruises=${girl.body.bruises}, high=${girl.body.high}`,
          MOOD: girl.mood.mood
        };
        // Single-speaker path — no scene partners present (if any were, sendTurn routes to
        // runSceneTurn instead, so the multi-girl branch never lands here).
        const { raw, parsed } = await window.DMTHGame.ollama.runTurn({
          girl, mode, sceneKey, sceneVars,
          userText: text,
          room: { ambience: dungeonTpl?.plotTokens || '', upgrades: {} },
          onChunk: (chunk, full) => {
            // Strip delta block + any XML scaffolding the model hallucinates while streaming.
            // Also scrub system-prompt rule-text leakage and third-person Master-action
            // asterisk narration mid-stream so the leak never lands visibly before the
            // final cleanup replaces it.
            let view = full
              .replace(/<delta>[\s\S]*?<\/delta>/g, '')
              .replace(/<delta>[\s\S]*$/g, '')   // delta still being written
              .replace(/<\/?(sentence|asterisk-action|action|response|reply|narration)[^>]*>/gi, '')
              .replace(/```[a-z]*\n?|```/gi, '')
              .trim();
            if (window.DMTHTemplates?.scrubSystemPromptLeakage) {
              view = window.DMTHTemplates.scrubSystemPromptLeakage(view);
            }
            if (window.DMTHTemplates?.scrubMasterAsteriskNarration) {
              view = window.DMTHTemplates.scrubMasterAsteriskNarration(view);
            }
            if (window.DMTHTemplates?.scrubPlaintextDeltaTail) {
              // Strip plaintext delta tails (arousal:+10; wetness:-25; ...) the model
              // sometimes emits instead of the <delta>...</delta> envelope. Final-pass
              // extractDelta also parses + strips, but doing it streaming keeps the
              // leak from rendering visibly mid-bubble.
              view = window.DMTHTemplates.scrubPlaintextDeltaTail(view);
            }
            txtEl.textContent = view;
            logEl.scrollTop = logEl.scrollHeight;
          }
        });
        const clean = (parsed.cleanText || raw).trim();
        // Stream finished cleanly — remove the transient streaming bubble. state.appendTurn
        // below fires state.onChange which triggers renderLog's incremental append, drawing
        // the canonical .log-entry for this assistant turn. Keeping the streamDiv around
        // would result in TWO bubbles (streamDiv + the new appended entry). Error path
        // below intentionally keeps streamDiv to display the error + repair button.
        streamDiv.remove();
        window.DMTHGame.state.appendTurn(girl.id, 'assistant', clean || '*…*');
        if (parsed.delta) window.DMTHGame.delta.applyDelta(girl.id, parsed.delta);
        if (mode === 'hurtme') window.DMTHGame.damage.accumulateFromText(girl.id, clean);

        // Auto-regenerate room-scene image when state-hash shifts meaningfully
        if (window.DMTHGame.imaging && window.DMTHGame.imaging.isAvailable()) {
          const refreshed = window.DMTHGame.state.getGirl(girl.id);
          const hashNow = roomStateHash(refreshed);
          const prev = refreshed._lastRoomStateHash;
          if (prev !== hashNow) {
            window.DMTHGame.state.updateGirl(girl.id, { _lastRoomStateHash: hashNow });
            window.DMTHGame.imaging.roomScene(girl.id).then(url => {
              if (url) {
                const slot = el.querySelector('#profile-img-slot');
                if (slot) slot.innerHTML = `<img src="${url}" alt="${girl.name}" class="gen-img profile-img" />`;
              }
            }).catch(() => {});
          }
        }

        // Voice — speak ONLY if toggle is on AND Kokoro finished loading
        {
          const voiceToggleOn = !window.DMTHIsVoiceOn || window.DMTHIsVoiceOn();
          if (voiceToggleOn && window.DMTHKokoro && window.DMTHKokoro.isReady()) {
            // Keep asterisk-action content (read it aloud as narration), just strip the
            // wrapping asterisk characters so Kokoro doesn't pronounce them. The action
            // text fills audible space between short spoken fragments, producing one
            // continuous longer clip instead of a stop-start "yes Master." …silence…
            // "I don't want this" rhythm. Net result: a single Kokoro call for the
            // whole turn that actually carries the scene.
            const speakable = clean.replace(/\*([^*]+)\*/g, '$1').replace(/\s+/g, ' ').trim();
            // Lonely-yes-Master detector — if the spoken portion after asterisk-stripping
            // is <= 3 words, the model violated the SPEECH-FIRST RULE (asterisk action led,
            // spoken line was a single trailing "Yes Master"). Surface a NotifyToast so the
            // user knows TTS got starved instead of silently mumbling.
            const speakableWords = speakable.split(/\s+/).filter(w => w.length > 0);
            if (speakableWords.length > 0 && speakableWords.length <= 3) {
              console.warn('[tts] lonely-yes-Master detected — spoken portion <= 3 words after asterisk strip:', JSON.stringify(speakable));
              if (window.DMTHNotify) {
                window.DMTHNotify.show(`🔇 TTS only got ${speakableWords.length} word${speakableWords.length === 1 ? '' : 's'} — model violated SPEECH-FIRST RULE (asterisk action led). Try /unity or a better-tuned model.`, { type: 'warn', durationMs: 4500 });
              }
            }
            if (speakable.length > 0) {
              // Validate voiceId against the live catalog — legacy saves may have an invalid voiceId
              // (e.g., af_jadzia which was removed when we discovered it's not a real Kokoro voice).
              const validIds = new Set(window.DMTHVoices.VOICES.map(v => v.id));
              let voice = girl.voiceId;
              if (!voice || !validIds.has(voice)) {
                voice = 'af_nicole';   // safe default for unity-ish / adult-female default
                if (girl.id) window.DMTHGame.state.updateGirl(girl.id, { voiceId: voice });
              }
              const emo = window.DMTHVoices.pickEmotion({ ...girl, mode, bondLevel: girl.bond.bondLevel, activeDrugs: (girl.body.activeDrugs || []).map(d => d.name || d) });
              const profile = window.DMTHVoices.getEmotionProfile(emo);
              const spoken = profile ? profile.preprocess(speakable) : speakable;
              // Sentence-aware queued playback — splits on . ! ? … and plays
              // each clip in order with the next one pipelined-generating
              // behind it.  Avoids Kokoro's long-input truncation problem and
              // lets us cancel cleanly mid-response.  Fire-and-forget; the
              // queue runs to completion on its own.  Cancel triggers on next
              // sendTurn (top of this function) or voice toggle off (chrome).
              if (window.DMTHVoiceQueue) {
                window.DMTHVoiceQueue.enqueue(spoken, voice, profile?.speed)
                  .catch(err => console.debug('[voice] queue error:', err));
              } else {
                // Defensive fallback — voice-queue module not loaded
                try {
                  const url = await window.DMTHKokoro.speak(spoken, voice, profile?.speed);
                  const audio = new Audio(url);
                  audio.play().catch(err => console.debug('[voice] autoplay blocked:', err));
                } catch (err) { console.debug('[voice] speak error:', err); }
              }
            }
          }
        }

        statusEl.textContent = 'done';
        setTimeout(() => { statusEl.textContent = ''; }, 2000);
      } catch (err) {
        streamDiv.classList.remove('streaming');
        const cls = err.classification;
        const isCorrupt = cls && (cls.code === 'corrupt' || cls.code === 'missing');
        // Real message — no more bare "HTTP 400". If we have a classification,
        // show the human label + a repair button right inside the chat bubble.
        const friendly = cls ? `[${cls.label}] ${cls.detail || err.message}` : `[ollama error: ${err.message}]`;
        txtEl.innerHTML = '';
        const span = document.createElement('span');
        span.textContent = friendly;
        txtEl.appendChild(span);
        if (isCorrupt && window.DMTHOllamaRepairOverlay) {
          const repairBtn = document.createElement('button');
          repairBtn.className = 'btn-small btn-primary';
          repairBtn.style.marginLeft = '8px';
          repairBtn.textContent = `🔧 Repair ${cls.modelId || 'model'}`;
          repairBtn.onclick = async () => {
            const result = await window.DMTHOllamaRepairOverlay.show({
              diagnosis: cls,
              modelId: cls.modelId,
              reason: 'corruption detected on chat call'
            });
            if (result && result.repaired) {
              // Re-fire the original turn — user shouldn't have to retype.
              sendTurn(text);
            }
          };
          txtEl.appendChild(repairBtn);
          // Also auto-open the overlay so user doesn't have to find the button
          (async () => {
            const result = await window.DMTHOllamaRepairOverlay.show({
              diagnosis: cls,
              modelId: cls.modelId,
              reason: 'corruption detected on chat call'
            });
            if (result && result.repaired) sendTurn(text);
          })();
        }
        statusEl.textContent = cls ? `${cls.label}` : `error: ${err.message}`;
      }
    }

    // ---- true multi-speaker scene engine ----

    // Speak one girl's finished line in HER own Kokoro voice. Enqueues (doesn't cancel), so
    // sequential speakers in a scene play back in turn, each in her own voice. Mirrors the
    // single-path voice block but keyed to an arbitrary girl.
    function speakLine(sg, clean, mode) {
      const voiceToggleOn = !window.DMTHIsVoiceOn || window.DMTHIsVoiceOn();
      if (!(voiceToggleOn && window.DMTHKokoro && window.DMTHKokoro.isReady())) return;
      const speakable = clean.replace(/\*([^*]+)\*/g, '$1').replace(/\s+/g, ' ').trim();
      if (!speakable) return;
      const validIds = new Set(window.DMTHVoices.VOICES.map(v => v.id));
      let voice = sg.voiceId;
      if (!voice || !validIds.has(voice)) { voice = 'af_nicole'; if (sg.id) window.DMTHGame.state.updateGirl(sg.id, { voiceId: voice }); }
      const emo = window.DMTHVoices.pickEmotion({ ...sg, mode, bondLevel: sg.bond.bondLevel, activeDrugs: (sg.body.activeDrugs || []).map(d => d.name || d) });
      const profile = window.DMTHVoices.getEmotionProfile(emo);
      const spoken = profile ? profile.preprocess(speakable) : speakable;
      if (window.DMTHVoiceQueue) {
        window.DMTHVoiceQueue.enqueue(spoken, voice, profile?.speed).catch(err => console.debug('[voice] queue error:', err));
      }
    }

    // A non-speaking present girl still takes a share of the scene this turn — used, aroused,
    // bond-debt up, stamina down, fresh "used" aftermath on her next image.
    function applyPassiveShare(pid) {
      try {
        const p = window.DMTHGame.state.getGirl(pid);
        if (!p || !p.body) return;
        const pb = { ...p.body,
          arousal: Math.min(100, (p.body.arousal || 0) + 6),
          stamina: Math.max(0, (p.body.stamina ?? 70) - 4),
          recentActTag: 'used'
        };
        if (window.DMTHGame.gameClock) pb.recentActAt = window.DMTHGame.gameClock.now();
        window.DMTHGame.state.updateGirl(pid, { body: pb, bond: { ...p.bond, bondDebt: (p.bond?.bondDebt || 0) + 2 } });
      } catch (e) { /* non-fatal */ }
    }

    // Regenerate the host's room-scene image if her quantized state shifted (same gate as the
    // single path). Partners aren't shown in the room's single image slot, so only the host regens.
    function regenHostImageIfChanged(opts = {}) {
      if (!(window.DMTHGame.imaging && window.DMTHGame.imaging.isAvailable())) return;
      const refreshed = window.DMTHGame.state.getGirl(girl.id);
      const hashNow = roomStateHash(refreshed);
      if (refreshed._lastRoomStateHash === hashNow) return;
      window.DMTHGame.state.updateGirl(girl.id, { _lastRoomStateHash: hashNow });
      // a voiced scene passes the man using her so the regen pic shows her WITH him.
      window.DMTHGame.imaging.roomScene(girl.id, { npc: opts.npc || null }).then(url => {
        if (url) { const slot = el.querySelector('#profile-img-slot'); if (slot) slot.innerHTML = `<img src="${url}" alt="${girl.name}" class="gen-img profile-img" />`; }
      }).catch(() => {});
    }

    //  (watch-her-visitors) — when a PASSIVE john/friend visits THIS open girl in the
    // background tick AND the "watch her visitors" toggle is on, pop her room image showing her WITH
    // the man using her (the recurring friend's persistent build or a random john). whore-out's
    // runJohnTick dispatches 'dmth:npc-visit' on every passive arrival; we refresh here. A fresh man
    // in frame IS the change, so we clear the quantized-state gate to force the regen.
    if (npcVisitHandler) { document.removeEventListener('dmth:npc-visit', npcVisitHandler); npcVisitHandler = null; }
    npcVisitHandler = (ev) => {
      const d = (ev && ev.detail) || {};
      if (d.girlId !== girl.id || !d.npc) return;
      const tog = window.DMTHGame.state.getSceneToggles ? window.DMTHGame.state.getSceneToggles() : {};
      if (!tog.watchVisitors) return;
      window.DMTHGame.state.updateGirl(girl.id, { _lastRoomStateHash: null });
      regenHostImageIfChanged({ npc: d.npc });
    };
    document.addEventListener('dmth:npc-visit', npcVisitHandler);

    // Stream ONE girl's Ollama turn into her own labeled bubble. Her reply lands in HER own
    // log speaker-less (so her future context stays first-person + clean); a partner's reply
    // is ALSO mirrored into the host's shared log tagged with her name so the room shows the
    // whole conversation. Each girl uses her own dungeon ambience + alive/dead scene.
    async function streamOneSpeaker(sg, effUserText, { isHost }) {
      const streamDiv = document.createElement('div');
      streamDiv.className = 'log-entry assistant streaming';
      streamDiv.innerHTML = `<b>${escapeHtml(sg.name)}:</b> <span class="stream-txt"></span>`;
      logEl.appendChild(streamDiv);
      const txtEl = streamDiv.querySelector('.stream-txt');
      logEl.scrollTop = logEl.scrollHeight;

      const mode = window.DMTHGame.state.current.settings.mode || 'sexy';
      const dgn = window.DMTHGame.state.getDungeon(sg.assignedDungeonId);
      const dTpl = dgn && window.DMTHAssets.getById('dungeon', dgn.templateId);
      const sgDead = sg.encounterState === 'dead';
      const sceneKey = sgDead ? 'room_postmortem' : 'room_regular';
      const decayDays = ((sg.body?.decayedMinutes || 0) / 1440).toFixed(1);
      const sceneVars = sgDead ? {
        ROOM_AMBIENCE: `${dTpl?.displayName || 'hideout'}, ${dTpl?.plotTokens || 'bare'}`,
        DECAY_DAYS: decayDays, BOND_LEVEL: sg.bond.bondLevel, BOND_NAME: 'deceased',
        BODY_SUMMARY: `deceased — ${decayDays} game days since death`, MOOD: 'deceased'
      } : {
        ROOM_AMBIENCE: `${dTpl?.displayName || 'hideout'}, ${dTpl?.plotTokens || 'bare'}`,
        BOND_LEVEL: sg.bond.bondLevel,
        BOND_NAME: ['terrified','wary','acclimating','curious','ambivalent','reciprocated','dependent','partner','devoted','fully-bonded'][sg.bond.bondLevel],
        BODY_SUMMARY: `arousal=${sg.body.arousal}, wetness=${sg.body.wetness}, bruises=${sg.body.bruises}, high=${sg.body.high}`,
        MOOD: sg.mood.mood
      };
      try {
        const { raw, parsed } = await window.DMTHGame.ollama.runTurn({
          girl: sg, mode, sceneKey, sceneVars, userText: effUserText,
          room: { ambience: dTpl?.plotTokens || '', upgrades: {} },
          onChunk: (chunk, full) => {
            let view = full
              .replace(/<delta>[\s\S]*?<\/delta>/g, '')
              .replace(/<delta>[\s\S]*$/g, '')
              .replace(/<\/?(sentence|asterisk-action|action|response|reply|narration)[^>]*>/gi, '')
              .replace(/```[a-z]*\n?|```/gi, '')
              .trim();
            if (window.DMTHTemplates?.scrubSystemPromptLeakage) view = window.DMTHTemplates.scrubSystemPromptLeakage(view);
            if (window.DMTHTemplates?.scrubMasterAsteriskNarration) view = window.DMTHTemplates.scrubMasterAsteriskNarration(view);
            if (window.DMTHTemplates?.scrubPlaintextDeltaTail) view = window.DMTHTemplates.scrubPlaintextDeltaTail(view);
            txtEl.textContent = view;
            logEl.scrollTop = logEl.scrollHeight;
          }
        });
        const clean = (parsed.cleanText || raw).trim();
        streamDiv.remove();
        // her OWN log — speaker-less so her context stays first-person
        window.DMTHGame.state.appendTurn(sg.id, 'assistant', clean || '*…*');
        // a partner's line ALSO mirrors into the host's shared log, tagged with her name
        if (!isHost) window.DMTHGame.state.appendTurn(girl.id, 'assistant', clean || '*…*', sg.name);
        if (parsed.delta) window.DMTHGame.delta.applyDelta(sg.id, parsed.delta);
        if (mode === 'hurtme') window.DMTHGame.damage.accumulateFromText(sg.id, clean);
        speakLine(sg, clean, mode);
        return { ok: true };
      } catch (err) {
        streamDiv.classList.remove('streaming');
        const cls = err.classification;
        const friendly = cls ? `[${cls.label}] ${cls.detail || err.message}` : `[ollama error: ${err.message}]`;
        txtEl.textContent = `${sg.name}: ${friendly}`;
        return { ok: false, err };
      }
    }

    // Run a full multi-speaker scene turn. Every present girl (host + scene partners) the
    // action targets answers her own turn in sequence, each in her own voice; non-targeted
    // present girls take a passive share. The user action is logged once in the host's shared
    // log and mirrored into each partner's own log so everyone reacts in-context.
    async function runSceneTurn(text) {
      const statusEl = el.querySelector('#stream-status');
      const host = window.DMTHGame.state.getGirl(girl.id);
      const partners = liveSceneGirls(host);
      const present = [host, ...partners];
      const targetSel = el.querySelector('#scene-target');
      const target = targetSel ? targetSel.value : 'all';

      // Scene-aware augmentation per responder — name the OTHER girls present so she reacts
      // to them being used alongside her.
      const augment = (forGirl) => {
        const others = present.filter(g => g.id !== forGirl.id);
        const list = others.map(o => `${o.name} (a ${o.archetypeTemplate}${o.captiveAffect ? ', ' + o.captiveAffect : ''})`).join(', ');
        return `[MULTI-GIRL SCENE — also here, used in this same forced scene: ${list}. React to them being present and to what is being done to all of you.] ${text}`;
      };

      // User action → each partner's own log (host already got it in sendTurn) for context.
      for (const p of partners) window.DMTHGame.state.appendTurn(p.id, 'user', text);

      // Responders: everyone, or just the targeted girl. Skip any who are tranquilized.
      let responders = (target === 'all') ? present : present.filter(g => g.id === target);
      responders = responders.filter(g => !(window.DMTHGame.drugs.isUnconscious && window.DMTHGame.drugs.isUnconscious(window.DMTHGame.state.getGirl(g.id))));

      // Sequential turns — each girl answers, in her own voice, one after another.
      for (const sg of responders) {
        const live = window.DMTHGame.state.getGirl(sg.id);
        if (!live) continue;
        await streamOneSpeaker(live, augment(live), { isHost: live.id === host.id });
      }

      // Present-but-not-answering girls take a passive share of the scene.
      const responderIds = new Set(responders.map(g => g.id));
      for (const g of present) if (!responderIds.has(g.id)) applyPassiveShare(g.id);

      regenHostImageIfChanged();
      if (statusEl) { statusEl.textContent = 'done'; setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 2000); }
    }

    // ---- EPIC X — voiced multi-party scene engine (gangbang + NPC-DIRECT) ----

    // MULTISPEAK — parse a `Name: line` multi-speaker transcript into ordered {speaker, text}.
    // Strips the delta block + code-fence scaffolding first; a line with no `Name:` prefix is
    // appended to the previous speaker's text as a continuation.
    function parseSpeakerLines(raw) {
      let body = String(raw || '')
        .replace(/<delta>[\s\S]*?<\/delta>/g, '')
        .replace(/<delta>[\s\S]*$/g, '')
        .replace(/```[a-z]*\n?|```/gi, '')
        .trim();
      const out = [];
      let cur = null;
      for (const ln of body.split('\n')) {
        const m = ln.match(/^\s*([^:]{1,40}?):\s*(.*)$/);
        if (m && m[2] !== undefined) {
          out.push({ speaker: m[1].trim(), text: m[2].trim() });
          cur = out[out.length - 1];
        } else if (cur && ln.trim()) {
          cur.text += ' ' + ln.trim();
        }
      }
      return out.filter(e => e.text);
    }

    // Enrich a minted NPC identity into the npcSpeakerBlock shape {name, handle, tone, isFriend,
    // archetype}, pulling his archetype's dialogueTone so each man keeps his own distinct voice.
    function npcForScene(npc) {
      const arc = npc.isFriend
        ? window.DMTHJohnArchetypes.FRIEND_ARCHETYPES[npc.archetype]
        : window.DMTHJohnArchetypes.JOHN_ARCHETYPES[npc.archetype];
      return { name: npc.name, handle: npc.handle, tone: arc && arc.dialogueTone || null, isFriend: !!npc.isFriend, archetype: npc.archetype, pronouns: npc.pronouns };
    }

    const BOND_NAMES = ['terrified','wary','acclimating','curious','ambivalent','reciprocated','dependent','partner','devoted','fully-bonded'];

    // Run a VOICED multi-party scene through Ollama (NOT hardcoded — jailbreak-grade template).
    // Renders each parsed line into the chat log: the men's lines are TEXT-ONLY, name-tagged; only
    // the girl's lines are spoken aloud by Kokoro (girls only in TTS, johns/friends text-chat
    // only). Her lines persist speaker-less in her own log so her future context stays first-person.
    async function runVoicedScene(sceneKey, sceneNpcs, kickText) {
      const statusEl = el.querySelector('#stream-status');
      if (statusEl) statusEl.textContent = 'the room fills… (Ollama)';
      const live = window.DMTHGame.state.getGirl(girl.id);
      if (!live) return;
      const mode = window.DMTHGame.state.current.settings.mode || 'sexy';
      const dgn = window.DMTHGame.state.getDungeon(live.assignedDungeonId);
      const dTpl = dgn && window.DMTHAssets.getById('dungeon', dgn.templateId);
      const sceneVars = {
        GIRLNAME: live.name,
        NPC_NAME: (sceneNpcs[0] && sceneNpcs[0].name) || 'he',
        NPC_ROSTER: sceneNpcs.map(n => n.handle).join(', '),
        ROOM_AMBIENCE: `${dTpl?.displayName || 'hideout'}, ${dTpl?.plotTokens || 'bare'}`,
        BOND_LEVEL: live.bond.bondLevel,
        BOND_NAME: BOND_NAMES[live.bond.bondLevel] || 'wary',
        BODY_SUMMARY: `arousal=${live.body.arousal}, wetness=${live.body.wetness}, bruises=${live.body.bruises}, high=${live.body.high}`,
        MOOD: live.mood.mood
      };
      const streamDiv = document.createElement('div');
      streamDiv.className = 'log-entry assistant streaming';
      streamDiv.innerHTML = `<b>scene:</b> <span class="stream-txt"></span>`;
      logEl.appendChild(streamDiv);
      const txtEl = streamDiv.querySelector('.stream-txt');
      logEl.scrollTop = logEl.scrollHeight;
      try {
        const { raw, parsed } = await window.DMTHGame.ollama.runScene({
          girl: live, mode, sceneKey, sceneVars, opts: { npcs: sceneNpcs },
          kickText, room: { ambience: dTpl?.plotTokens || '', upgrades: {} },
          onChunk: (chunk, full) => {
            let view = full
              .replace(/<delta>[\s\S]*?<\/delta>/g, '')
              .replace(/<delta>[\s\S]*$/g, '')
              .replace(/```[a-z]*\n?|```/gi, '')
              .trim();
            txtEl.textContent = view;
            logEl.scrollTop = logEl.scrollHeight;
          }
        });
        streamDiv.remove();
        const entries = parseSpeakerLines(raw);
        const girlLower = live.name.toLowerCase();
        const girlLines = [];
        for (const e of entries) {
          const isGirl = e.speaker.toLowerCase().includes(girlLower);
          if (isGirl) {
            // Her line — speaker-less in her own log (renders as her name, feeds her context).
            window.DMTHGame.state.appendTurn(live.id, 'assistant', e.text);
            girlLines.push(e.text);
          } else {
            // A man's line — TEXT-ONLY, name-tagged so the log shows who said it. Never spoken.
            window.DMTHGame.state.appendTurn(live.id, 'assistant', e.text, e.speaker);
          }
        }
        if (parsed.delta) window.DMTHGame.delta.applyDelta(live.id, parsed.delta);
        if (mode === 'hurtme') window.DMTHGame.damage.accumulateFromText(live.id, girlLines.join(' '));
        // Girl-only TTS — ONLY her lines feed Kokoro; the men are text-chat only .
        const herVoice = girlLines.join(' ').trim();
        if (herVoice) speakLine(live, herVoice, mode);
        renderLog();
        regenHostImageIfChanged({ npc: (sceneNpcs && sceneNpcs[0]) || null });   // show the man using her
        if (statusEl) { statusEl.textContent = 'done'; setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 2000); }
      } catch (err) {
        streamDiv.classList.remove('streaming');
        const cls = err.classification;
        txtEl.textContent = cls ? `[${cls.label}] ${cls.detail || err.message}` : `[ollama error: ${err.message}]`;
        if (statusEl) statusEl.textContent = cls ? cls.label : `error: ${err.message}`;
      }
    }

    // GANGSEL / MULTIFRIENDGANG — throw a voiced gangbang: resolve the REAL mechanics (pay/health/
    // cum-fill/bukkake via resolveGangbang) for the johns, then add `friendCount` FRIENDS resolved
    // SEQUENTIALLY — each re-reads her freshly-lowered health, so their damage STACKS and 2+ friends
    // can finish her by chance + stat rolls (a single one stays ≤50%/visit). Then play it out voiced.
    async function runVoicedGangbang(size, friendCount) {
      if (inFlight) return;
      if (window.DMTHVoiceQueue) window.DMTHVoiceQueue.cancel();
      setInFlight(true);
      try {
        const statusEl = el.querySelector('#stream-status');
        const g = window.DMTHGame.state.getGirl(girl.id);
        const hp = g?.body?.health ?? 100;
        const nF = Math.max(0, friendCount | 0);
        if ((hp <= 35 || nF >= 2) && !confirm(`${girl.name} is at ${Math.round(hp)} Health${nF >= 2 ? ` and you're sending ${nF} FRIENDS` : ''}. ${nF >= 2 ? 'Multiple friends stack damage — this can easily KILL her.' : 'A gangbang could finish her.'} Let the pack have her anyway?`)) return;
        const r = window.DMTHGame.whoreOut.resolveGangbang(girl.id, size);
        if (!r.ok) { alert(r.reason || 'gangbang failed'); return; }
        let sceneNpcs = (r.npcs || []).map(npcForScene);
        // GANGSAMEDUNGEON — resolveGangbang only draws this girl's own arrivals, so every man is
        // bound to her active dungeon by construction (no cross-dungeon crowd).
        // resolve each friend in turn; each reads her CURRENT (already-lowered)
        // health, so stacked friend damage crosses her remaining HP → kill by chance + stat rolls.
        for (let fi = 0; fi < nF && window.DMTHJohnArchetypes.rollFriendArchetype; fi++) {
          const live = window.DMTHGame.state.getGirl(girl.id);
          if (!live || live.encounterState !== 'captive') break;   // she died to a prior friend — stop
          const fid = window.DMTHJohnArchetypes.rollFriendArchetype(Math.random);
          const fnpc = window.DMTHJohnArchetypes.mintNpcIdentity(fid, { isFriend: true });
          const fe = window.DMTHGame.whoreOut.resolveFriendEncounter(live, fid, { npc: fnpc });
          if (fe) sceneNpcs.push(npcForScene(fnpc));   // refused (kink/dislike) → fe null → skip him
        }
        if (!sceneNpcs.length) { if (statusEl) statusEl.textContent = 'no johns showed — raise her buzz / cadence and try again'; return; }
        lastSceneNpcs.set(girl.id, sceneNpcs);
        window.DMTHGame.state.appendTurn(girl.id, 'user', `*throws ${girl.name} to ${sceneNpcs.length} of them: ${sceneNpcs.map(n => n.handle).join(', ')}*`);
        renderLog();
        // She may have died in the resolved mechanics (low HP + the crowd / an added friend) — a corpse
        // can't be voiced, so skip the scene and re-render to the postmortem room.
        if ((window.DMTHGame.state.getGirl(girl.id)?.encounterState) === 'dead') { window.DMTHRouter.handle(); return; }
        await runVoicedScene('gangbang_scene', sceneNpcs, `${sceneNpcs.map(n => n.handle).join(', ')} are all using ${girl.name} at once — they take turns, egg each other on, and order her around.`);
        if ((window.DMTHGame.state.getGirl(girl.id)?.encounterState) === 'dead') { window.DMTHRouter.handle(); return; }
        renderNpcDirect();
      } finally { setInFlight(false); }
    }

    // NPC-DIRECT — render the "direct a man" box from the last scene's men. Re-callable after a
    // re-render (men persist in lastSceneNpcs). Empties itself when there's no remembered crowd.
    function renderNpcDirect() {
      const panel = el.querySelector('#npc-direct-panel');
      if (!panel) return;
      const sceneNpcs = lastSceneNpcs.get(girl.id) || [];
      const g = window.DMTHGame.state.getGirl(girl.id);
      if (!sceneNpcs.length || !g || g.encounterState !== 'captive') { panel.innerHTML = ''; return; }
      panel.innerHTML = `
        <h3>🎯 Direct a man</h3>
        <p class="small muted">Type an order at one of the men in the room — he DOES it (paid on completion, her stats shift, logged to her history), then the scene voices her reaction. e.g. "face fuck her", "stick it in her ass", "choke her out".</p>
        <div class="stat-row">
          <span>Order</span>
          <select id="npc-direct-who" class="inline-select">${sceneNpcs.map((n, i) => `<option value="${i}">${escapeHtml(n.handle)}${n.isFriend ? ' 🩸' : ''}</option>`).join('')}</select>
        </div>
        <div class="input-row">
          <textarea id="npc-direct-in" rows="2" placeholder="e.g. face fuck her / stick it in her ass / choke her out"></textarea>
          <button id="npc-direct-send" class="btn-primary">Order him</button>
        </div>`;
      const sendBtn = panel.querySelector('#npc-direct-send');
      const inEl = panel.querySelector('#npc-direct-in');
      sendBtn.onclick = () => {
        const idx = parseInt(panel.querySelector('#npc-direct-who').value, 10) || 0;
        const directive = (inEl.value || '').trim();
        if (!directive) return;
        inEl.value = '';
        directNpc(sceneNpcs[idx], directive);
      };
      inEl.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); sendBtn.click(); }
      });
    }

    // Resolve a player-directed NPC act : he performs it for REAL (paid, stats hit
    // her, logged as a history event via resolveDirectedEncounter + the commonality engine), then a
    // focused voiced scene plays out her reaction (girl-only TTS).
    async function directNpc(npc, directive) {
      if (inFlight) return;
      if (window.DMTHVoiceQueue) window.DMTHVoiceQueue.cancel();
      setInFlight(true);
      try {
        const statusEl = el.querySelector('#stream-status');
        const r = window.DMTHGame.whoreOut.resolveDirectedEncounter(girl.id, { npc, directive });
        if (!r.ok) { if (statusEl) { statusEl.textContent = r.reason; setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 2500); } return; }
        window.DMTHGame.state.appendTurn(girl.id, 'user', `*orders ${npc.handle}:* ${directive}`);
        renderLog();
        if (window.DMTHNotify) {
          window.DMTHNotify.show(`🎯 ${npc.handle} ${r.killed ? 'FINISHED' : 'did'} "${directive}" — paid $${r.paid}${r.killed ? ' (she\'s a corpse)' : ''}.`, { type: r.killed ? 'error' : 'success', durationMs: 5000 });
        }
        // If the directed act killed her, she can't react — skip the voiced reaction, re-render to corpse state.
        if (r.killed || (window.DMTHGame.state.getGirl(girl.id)?.encounterState) === 'dead') { window.DMTHRouter.handle(); return; }
        const sceneKey = npc.isFriend ? 'friend_scene' : 'gangbang_scene';
        await runVoicedScene(sceneKey, [npc], `Master orders ${npc.handle}: "${directive}". He does EXACTLY that to ${girl.name} right now while she reacts.`);
        if ((window.DMTHGame.state.getGirl(girl.id)?.encounterState) === 'dead') { window.DMTHRouter.handle(); return; }
        renderNpcDirect();
      } finally { setInFlight(false); }
    }

    // Wire the voiced-gangbang run button + restore the NPC-DIRECT box if a scene's men persist.
    const vgangBtn = el.querySelector('#vgang-run');
    if (vgangBtn) {
      vgangBtn.onclick = () => {
        const size = parseInt(el.querySelector('#vgang-size')?.value, 10) || 4;
        const friendCount = parseInt(el.querySelector('#vgang-friends')?.value, 10) || 0;
        runVoicedGangbang(size, friendCount);
      };
    }
    renderNpcDirect();

    // Typed-input send button delegates to the shared path WITH typed-action detection .
    el.querySelector('#send').onclick = () => {
      const text = el.querySelector('#user-in').value.trim();
      sendTurn(text, { detectAction: true });
    };

    // Also: Enter-to-send in the textarea (shift-enter newlines), still one-hand friendly
    el.querySelector('#user-in').addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && !ev.shiftKey) {
        ev.preventDefault();
        el.querySelector('#send').click();
      }
    });

    // Record toggle
    el.querySelector('#record-toggle').onclick = () => {
      if (window.DMTHGame.film.isRecording() && window.DMTHGame.film.activeSession().girlId === girl.id) {
        const film = window.DMTHGame.film.stopRecording();
        alert(`Film recorded: ${film.title}\nList price: $${film.currentListPrice}\nListed in market.`);
      } else {
        const tags = [];
        if (!window.DMTHGame.state.current.films.some(f => f.girlId === girl.id)) tags.push('first-capture');
        window.DMTHGame.film.startRecording(girl.id, tags);
      }
      window.DMTHRouter.handle();
    };

    // Mode buttons
    el.querySelectorAll('[data-mode]').forEach(b => {
      b.onclick = () => {
        window.DMTHGame.state.current.settings.mode = b.dataset.mode;
        window.DMTHGame.state.save();
        window.DMTHRouter.handle();
      };
    });

    // Feed buttons. applyAction fires FIRST for spec-driven stamina/health/mood/
    // arousal/bondXP deltas; legacy stock+tier bump follows.
    //
    // Drop-into-hold + pickup-from-hold handlers:
    //   Drop  — consume 1 inventory item → add N units to hold reserve (per-item ratio).
    //   Pickup — consume N units from hold reserve → add 1 basic-meal / bottled-water
    //            back to inventory (intentionally lossy — bulk gets converted back to
    //            the cheapest stack format, with leftover units forfeit).
    const DROP_FOOD_RATIOS = { 'basic-meal': 3, 'gourmet-meal': 7 };
    const DROP_WATER_RATIOS = { 'bottled-water': 6, 'filtered-water': 12 };
    function holdRef() {
      const dungeon = window.DMTHGame.state.getDungeon(girl.assignedDungeonId);
      if (!dungeon) return null;
      const idx = girl.assignedHoldIdx ?? 0;
      return { dungeon, idx, hold: dungeon.holds[idx] };
    }
    function patchHold(patch) {
      const ref = holdRef();
      if (!ref) return;
      const newHolds = ref.dungeon.holds.map((h, i) => i === ref.idx ? { ...h, ...patch } : h);
      window.DMTHGame.state.updateDungeon(ref.dungeon.id, { holds: newHolds });
    }
    el.querySelectorAll('[data-drop-food]').forEach(b => {
      b.onclick = () => {
        const itemId = b.dataset.dropFood;
        const units = DROP_FOOD_RATIOS[itemId] || 1;
        const inv = window.DMTHGame.state.current.inventory || {};
        if (!inv[itemId] || inv[itemId] <= 0) { alert('out of ' + itemId); return; }
        window.DMTHGame.state.consumeItem(itemId, 1);
        const ref = holdRef();
        if (!ref) return;
        patchHold({ foodReserve: (ref.hold.foodReserve || 0) + units });
        window.DMTHRouter.handle();
      };
    });
    el.querySelectorAll('[data-pickup-food]').forEach(b => {
      b.onclick = () => {
        const ref = holdRef();
        if (!ref) return;
        const reserve = ref.hold.foodReserve || 0;
        if (reserve < 3) { alert('need at least 3 food units in the reserve to pick up'); return; }
        patchHold({ foodReserve: reserve - 3 });
        window.DMTHGame.state.addItem('basic-meal', 1);
        window.DMTHRouter.handle();
      };
    });
    el.querySelectorAll('[data-drop-water]').forEach(b => {
      b.onclick = () => {
        const itemId = b.dataset.dropWater;
        const units = DROP_WATER_RATIOS[itemId] || 1;
        const inv = window.DMTHGame.state.current.inventory || {};
        if (!inv[itemId] || inv[itemId] <= 0) { alert('out of ' + itemId); return; }
        window.DMTHGame.state.consumeItem(itemId, 1);
        const ref = holdRef();
        if (!ref) return;
        patchHold({ waterReserve: (ref.hold.waterReserve || 0) + units });
        window.DMTHRouter.handle();
      };
    });
    el.querySelectorAll('[data-pickup-water]').forEach(b => {
      b.onclick = () => {
        const ref = holdRef();
        if (!ref) return;
        const reserve = ref.hold.waterReserve || 0;
        if (reserve < 6) { alert('need at least 6 water units in the reserve to pick up'); return; }
        patchHold({ waterReserve: reserve - 6 });
        window.DMTHGame.state.addItem('bottled-water', 1);
        window.DMTHRouter.handle();
      };
    });

    el.querySelectorAll('[data-feed]').forEach(b => {
      b.onclick = () => {
        const itemId = b.dataset.feed;
        try {
          window.DMTHGame.shop.use(itemId, { girlId: girl.id, action: 'feed' });
          const actionId = FEED_ACTION_MAP[itemId];
          if (actionId && window.DMTHGame.actionEffects?.applyAction) {
            window.DMTHGame.actionEffects.applyAction(girl.id, actionId);
          }
          const refreshed = window.DMTHGame.state.getGirl(girl.id);
          const cs = { ...refreshed.consumables };
          cs.food.stock = (cs.food.stock || 0) + (itemId === 'gourmet-meal' ? 7 : 3);
          cs.food.tier = Math.max(cs.food.tier || 0, itemId === 'gourmet-meal' ? 3 : 1);
          window.DMTHGame.state.updateGirl(girl.id, { consumables: cs });
        } catch (e) { alert(e.message); }
      };
    });

    // Water buttons — mirror the feed pattern. Bottled water = 6 stock + 1 bondXP at tier 1;
    // filtered water = 12 stock + 2 bondXP at tier 2. Water decay is gated by the hold's
    // toilet/waterSupply tier so plumbed holds (toilet >= 2) stop consuming this entirely
    // — but the buttons stay available for manual top-ups regardless.
    el.querySelectorAll('[data-water]').forEach(b => {
      b.onclick = () => {
        const itemId = b.dataset.water;
        try {
          window.DMTHGame.shop.use(itemId, { girlId: girl.id, action: 'water' });
          // applyAction first for spec deltas
          const actionId = WATER_ACTION_MAP[itemId];
          if (actionId && window.DMTHGame.actionEffects?.applyAction) {
            window.DMTHGame.actionEffects.applyAction(girl.id, actionId);
          }
          const refreshed = window.DMTHGame.state.getGirl(girl.id);
          const cs = { ...refreshed.consumables };
          if (!cs.water) cs.water = { tier: 0, stock: 0, decayPerTick: 1, unitCost: 1 };
          cs.water.stock = (cs.water.stock || 0) + (itemId === 'filtered-water' ? 12 : 6);
          cs.water.tier = Math.max(cs.water.tier || 0, itemId === 'filtered-water' ? 2 : 1);
          window.DMTHGame.state.updateGirl(girl.id, { consumables: cs });
        } catch (e) { alert(e.message); }
      };
    });

    // Whore-out controls.
    const toggleBtn = el.querySelector('[data-whore-toggle]');
    if (toggleBtn) {
      toggleBtn.onclick = () => {
        const wo = window.DMTHGame.whoreOut.getWhoreOut(girl);
        const next = !wo.enabled;
        if (next && !confirm(`Open ${girl.name} up to john arrivals? Johns drain her stamina + accrue passive income.`)) return;
        window.DMTHGame.whoreOut.toggle(girl.id, next);
        window.DMTHRouter.handle();
      };
    }
    const rateSel = el.querySelector('#whore-rate');
    if (rateSel) {
      rateSel.onchange = () => {
        window.DMTHGame.whoreOut.updateSettings(girl.id, { rate: rateSel.value });
      };
    }
    const condomChk = el.querySelector('#whore-condom');
    if (condomChk) {
      condomChk.onchange = () => {
        window.DMTHGame.whoreOut.updateSettings(girl.id, { condomRequired: condomChk.checked });
      };
    }
    // toggle whether extreme "friends" can come for this girl. Friends arrive
    // passively and can't be confirmed per-visit, so  warns at opt-in instead.
    const friendsChk = el.querySelector('#whore-friends');
    if (friendsChk) {
      friendsChk.onchange = () => {
        if (friendsChk.checked && !confirm(`Let your extreme "friends" visit ${girl.name} — they'll come on their own and leave her wrecked at the edge of death for the money (no condoms, ever), and in a gangbang two+ together can be her last night. Allow friends here?`)) {
          friendsChk.checked = false;
          return;
        }
        window.DMTHGame.whoreOut.updateSettings(girl.id, { friendsAllowed: friendsChk.checked });
      };
    }
    // toggle corpse-use for a dead girl: johns keep coming (postmortem) and,
    // with friends also allowed, friends use the body too; pay scales down as she rots to a skeleton.
    const corpseChk = el.querySelector('#whore-corpse');
    if (corpseChk) {
      corpseChk.onchange = () => {
        if (corpseChk.checked && !confirm(`Keep ${girl.name}'s CORPSE in service? Johns keep coming and your friends will use the body too — pay drops as she rots, and corpse content draws heavy heat. Allow corpse use?`)) {
          corpseChk.checked = false;
          return;
        }
        window.DMTHGame.whoreOut.updateSettings(girl.id, { corpseUseAllowed: corpseChk.checked });
      };
    }
    // throw a gangbang right now (3-5 johns back-to-back). Lethality-gated below.
    const gangBtn = el.querySelector('[data-whore-gangbang]');
    if (gangBtn) {
      gangBtn.onclick = () => {
        const g = window.DMTHGame.state.getGirl(girl.id);
        const hp = g?.body?.health ?? 100;
        // a gangbang on a low-health girl can finish her. Warn before it does.
        if (hp <= 35 && !confirm(`${girl.name} is already wrecked (${Math.round(hp)} Health). A gangbang could be the thing that finally kills her — let the pack have her anyway?`)) return;
        const n = 3 + Math.floor(Math.random() * 3);
        const r = window.DMTHGame.whoreOut.resolveGangbang(girl.id, n);
        if (!r.ok) { alert(r.reason || 'gangbang failed'); return; }
        window.DMTHRouter.handle();
      };
    }
    const cashoutBtn = el.querySelector('[data-whore-cashout]');
    if (cashoutBtn) {
      cashoutBtn.onclick = () => {
        try {
          const r = window.DMTHGame.whoreOut.cashout(girl.id);
          if (!r.ok) { alert(r.reason || 'cashout failed'); return; }
          if (window.DMTHNotify) window.DMTHNotify.show(`💰 Cashed out $${r.amount.toLocaleString()} from ${girl.name}'s johns.`, { type: 'success', durationMs: 2500 });
          window.DMTHRouter.handle();
        } catch (e) { alert(e.message); }
      };
    }

    // attach / detach the per-hold Tit Sucker.
    const tsAttach = el.querySelector('[data-titsucker-attach]');
    if (tsAttach) tsAttach.onclick = () => { const r = window.DMTHGame.milk.attachTitSucker(girl.id); if (!r.ok) { alert(r.reason); return; } window.DMTHRouter.handle(); };
    const tsDetach = el.querySelector('[data-titsucker-detach]');
    if (tsDetach) tsDetach.onclick = () => { const r = window.DMTHGame.milk.detachTitSucker(girl.id); if (!r.ok) { alert(r.reason); return; } window.DMTHRouter.handle(); };
    // collect this hold's pooled milk / set its cap / buy auto-supply.
    const mCollect = el.querySelector('[data-milk-collect]');
    if (mCollect) mCollect.onclick = () => { const r = window.DMTHGame.milk.collectHoldMilk(girl.id); if (!r.ok) { alert(r.reason); return; } if (window.DMTHNotify) window.DMTHNotify.show(`🥛 Collected ${r.qty}L from her hold into inventory.`, { type: 'success', durationMs: 3500 }); window.DMTHRouter.handle(); };
    const mCap = el.querySelector('[data-milk-cap]');
    if (mCap) mCap.onchange = () => { window.DMTHGame.milk.setMilkCap(girl.id, parseInt(mCap.value, 10)); window.DMTHRouter.handle(); };
    const mAuto = el.querySelector('[data-milk-auto-buy]');
    if (mAuto) mAuto.onclick = () => { const r = window.DMTHGame.milk.buyMilkAuto(girl.id); if (!r.ok) { alert(r.reason); return; } window.DMTHRouter.handle(); };

    // insert / pull the timed cum-capacity plug.
    const cpIns = el.querySelector('[data-cumplug-insert]');
    if (cpIns) cpIns.onclick = () => { const r = window.DMTHGame.cumtool.insert(girl.id, 'pussy-wrecker'); if (!r.ok) { alert(r.reason); return; } window.DMTHRouter.handle(); };
    const cpRem = el.querySelector('[data-cumplug-remove]');
    if (cpRem) cpRem.onclick = () => { const r = window.DMTHGame.cumtool.remove(girl.id); if (!r.ok) { alert(r.reason); return; } window.DMTHRouter.handle(); };

    // buy a permanent specialization onto this girl.
    el.querySelectorAll('[data-specialize]').forEach(b => {
      b.onclick = () => {
        const r = window.DMTHGame.specialize.apply(girl.id, b.dataset.specialize);
        if (!r.ok) { alert(r.reason); return; }
        window.DMTHRouter.handle();
      };
    });

    // bloody-fuck acts (only present while she's on the rag). Apply the balanced stat
    // spec, then fire a chat turn so Ollama narrates her reaction (no hardcoded response).
    el.querySelectorAll('[data-period-act]').forEach(b => {
      b.onclick = () => {
        const actId = b.dataset.periodAct;
        if (window.DMTHGame.actionEffects?.applyAction) window.DMTHGame.actionEffects.applyAction(girl.id, actId);
        const PERIOD_TRIGGERS = {
          'period-oral': 'makes her clean his cock off with her mouth while she bleeds, period blood smearing her lips',
          'period-creampie': 'fucks her bloody and breeds her, cumming deep inside her while she\'s on the rag, blood and cum leaking out of her',
          'period-finger': 'fingers her bloody and smears her period blood up her belly and over her tits, marking her red',
          'period-fuck': 'fucks her bloody while she\'s on the rag, her period blood streaking both of you'
        };
        sendTurn(`*${PERIOD_TRIGGERS[actId] || PERIOD_TRIGGERS['period-fuck']}*`);
      };
    });

    // Abortion method buttons. Each consumes 1 of the corresponding catalog
    // item from inventory and applies the resolver. Confirmation dialog before firing.
    // Newborn-disposal method buttons .
    el.querySelectorAll('[data-newborn]').forEach(b => {
      b.onclick = () => {
        const r = window.DMTHGame.pregnancy.disposeNewborn(girl.id, b.dataset.newborn);
        if (!r.ok) { alert(r.reason); return; }
        window.DMTHRouter.handle();
      };
    });
    el.querySelectorAll('[data-abort]').forEach(b => {
      b.onclick = () => {
        const methodId = b.dataset.abort;
        const method = window.DMTHGame.pregnancy?.ABORT_METHODS?.[methodId];
        if (!method) { alert('unknown abort method'); return; }
        const complicationPct = Math.round(method.complications * 100);
        const msg = `Apply ${method.label} to ${girl.name}?\n\n` +
          `· Window: gestation day ${method.windowDays[0]}-${method.windowDays[1]}\n` +
          `· Complication chance: ${complicationPct}%\n` +
          `· Notoriety: +${method.notorietyHit}\n` +
          `· Mood penalty: -${method.moodPenalty}\n\n` +
          `Consumes 1× ${methodId} from inventory.`;
        if (!confirm(msg)) return;
        try {
          const r = window.DMTHGame.pregnancy.applyAbortion(girl.id, methodId);
          if (!r.ok) { alert(r.reason); return; }
          window.DMTHRouter.handle();
        } catch (e) { alert(e.message); }
      };
    });

    // Drug buttons. applyAction first for spec stamina/health/mood/arousal/wetness deltas;
    // drug-scheduler.offer() runs second to add to activeDrugs.
    // curve + consume inventory.
    el.querySelectorAll('[data-drug]').forEach(b => {
      b.onclick = () => {
        try {
          // Tranquilizer admin cancels any in-flight Kokoro audio from a prior turn so
          // the unconscious banner isn't contradicted by her
          // still-speaking voice.
          if (b.dataset.drug === 'tranquilizer' && window.DMTHVoiceQueue) {
            window.DMTHVoiceQueue.cancel();
          }
          const actionId = DRUG_ACTION_MAP[b.dataset.drug];
          if (actionId && window.DMTHGame.actionEffects?.applyAction) {
            window.DMTHGame.actionEffects.applyAction(girl.id, actionId);
          }
          const r = window.DMTHGame.drugs.offer(girl.id, b.dataset.drug);
          window.DMTHGame.state.appendTurn(girl.id, 'user', `*offers ${b.dataset.drug}*`);
          window.DMTHRouter.handle();
        } catch (e) { alert(e.message); }
      };
    });

    // Voice picker — changes this specific girl's voiceId, persists to save.
    const voicePicker = el.querySelector('#voice-picker');
    if (voicePicker) {
      voicePicker.onchange = () => {
        window.DMTHGame.state.updateGirl(girl.id, { voiceId: voicePicker.value });
        if (window.DMTHNotify) window.DMTHNotify.show(`🎙️ ${girl.name} voice → ${voicePicker.options[voicePicker.selectedIndex].textContent.split(' — ')[0]}`, { type: 'success', durationMs: 1500 });
      };
    }
    const voicePreview = el.querySelector('#voice-preview');
    if (voicePreview) {
      voicePreview.onclick = async () => {
        const pickedId = voicePicker.value;
        if (!window.DMTHKokoro || !window.DMTHKokoro.isReady()) {
          alert('Voice still loading or off. Click the 🔊 toggle in the top bar first.');
          return;
        }
        voicePreview.disabled = true;
        voicePreview.textContent = '⏳';
        try {
          const sample = `Hi Master. This is how ${girl.name} sounds.`;
          const url = await window.DMTHKokoro.speak(sample, pickedId, 1.0);
          const audio = new Audio(url);
          audio.play().catch(err => alert('Autoplay blocked — click the page once, then try again. ' + err.message));
        } catch (err) {
          alert('Voice preview failed: ' + err.message);
        } finally {
          voicePreview.disabled = false;
          voicePreview.textContent = '🔊';
        }
      };
    }

    // Heal button. Routed through applyAction so the central action-effects spec is
    // the single source of truth for stat mutations. Falls back to the
    // legacy damage.heal() for full bruise reset since the central spec only does -10.
    el.querySelector('#heal-btn').onclick = () => {
      if (confirm(`Heal ${girl.name}? Resets bruises and mood to baseline.`)) {
        // Spec-driven first pass (stamina+10, health+20, mood+6, bruises-10)
        if (window.DMTHGame.actionEffects?.applyAction) {
          window.DMTHGame.actionEffects.applyAction(girl.id, 'heal');
        }
        // Then legacy full-reset for bruises + damage tracking
        window.DMTHGame.damage.heal(girl.id);
        window.DMTHRouter.handle();
      }
    };

    // Derobe / Re-dress toggle — equip built-in 'nude' pseudo-outfit OR revert to 'default'.
    el.querySelector('#derobe-btn').onclick = () => {
      if (girl.currentOutfit === 'nude') {
        window.DMTHGame.wardrobe.equip(girl.id, 'default');
      } else {
        window.DMTHGame.wardrobe.derobe(girl.id);
      }
      forceRegenProfileImage();
      window.DMTHRouter.handle();
    };

    // Strip everything / Re-dress toggle — equip built-in 'none' pseudo-outfit
    // OR revert to 'default'. Distinct from derobe: 'none' strips garments AND accessories
    // (jewelry, collar, restraints, everything). The image prompt uses the more-aggressive
    // 'stripped' nudity block per imaging.js.
    el.querySelector('#strip-all-btn').onclick = () => {
      if (girl.currentOutfit === 'none') {
        window.DMTHGame.wardrobe.equip(girl.id, 'default');
      } else {
        window.DMTHGame.wardrobe.stripEverything(girl.id);
      }
      forceRegenProfileImage();
      window.DMTHRouter.handle();
    };

    function forceRegenProfileImage() {
      if (!window.DMTHGame.imaging?.isAvailable()) return;
      window.DMTHGame.imaging.generateFor(girl.id, { situation: 'profile', forceRegenerate: true })
        .then(result => {
          if (result?.url) {
            const slot = el.querySelector('#profile-img-slot');
            if (slot) slot.innerHTML = `<img src="${result.url}" alt="${girl.name}" class="gen-img profile-img" />`;
          }
        })
        .catch(() => {});
    }

    // Mic-in button for voice turns
    const sendBar = el.querySelector('.input-row');
    if (sendBar && window.DMTHGame.voiceIn.isSupported()) {
      const micBtn = document.createElement('button');
      micBtn.id = 'mic-btn';
      micBtn.className = 'btn-small';
      micBtn.textContent = '🎤 Voice';
      sendBar.appendChild(micBtn);
      let recording = false;
      micBtn.onclick = async () => {
        if (!recording) {
          try {
            await window.DMTHGame.voiceIn.start();
            recording = true;
            micBtn.textContent = '⏹ Stop + send';
            micBtn.classList.add('btn-danger');
          } catch (err) { alert(err.message); }
        } else {
          micBtn.textContent = 'transcribing…';
          const result = await window.DMTHGame.voiceIn.stopAndTranscribe();
          recording = false;
          micBtn.classList.remove('btn-danger');
          micBtn.textContent = '🎤 Voice';
          if (result.ok && result.transcript) {
            el.querySelector('#user-in').value = result.transcript;
            // Auto-send
            el.querySelector('#send').click();
          } else {
            alert(`voice error: ${result.error || 'no transcript'}`);
          }
        }
      };
    }

    // Custom pose handler. User text → Ollama-as-prompt-writer → Pollinations. Stashed
    // in image history automatically via the generateFor pipeline. Input event updates
    // the draft cache on every keystroke so typing survives state.onChange re-renders.
    const customTextarea = el.querySelector('#custom-pose-in');
    if (customTextarea) {
      customTextarea.addEventListener('input', () => {
        customPoseDrafts.set(girl.id, customTextarea.value);
      });
    }
    const customClearBtn = el.querySelector('#custom-pose-clear');
    if (customClearBtn) {
      customClearBtn.onclick = () => {
        const ta = el.querySelector('#custom-pose-in');
        if (ta) ta.value = '';
        customPoseDrafts.delete(girl.id);
      };
    }
    const customFireBtn = el.querySelector('#custom-pose-fire');
    if (customFireBtn) {
      customFireBtn.onclick = async () => {
        const ta = el.querySelector('#custom-pose-in');
        const text = (ta?.value || '').trim();
        const status = el.querySelector('#custom-pose-status');
        const slot = el.querySelector('#custom-pose-slot');
        if (!text) { if (status) status.textContent = 'type a description first'; return; }
        if (!window.DMTHGame.imaging?.isAvailable()) {
          if (status) status.textContent = 'Pollinations not configured — paste a pk_ key in Settings';
          return;
        }
        // When Ollama is unavailable, composePrompt fallback accepts
        // userStaging as customPose so it still produces a real prompt instead of silently
        // discarding the user's staging text.
        customFireBtn.disabled = true;
        if (status) status.textContent = '⏳ Ollama composing prompt + Pollinations generating…';
        if (slot) slot.innerHTML = `<div class="panel"><p class="small muted">Generating custom pose…</p></div>`;
        try {
          const result = await window.DMTHGame.imaging.generateFor(girl.id, {
            situation: 'custom-pose',
            userStaging: text,
            customPose: text,   // fallback path uses customPose if Ollama is down
            forceRegenerate: true
          });
          if (result?.url) {
            // Persist result to module-scoped cache so state.onChange
            // re-renders restore it from the template render path.
            customPoseResults.set(girl.id, { url: result.url, staging: text, ts: Date.now() });
            if (slot) slot.innerHTML = `
              <div class="panel">
                <img src="${result.url}" alt="${girl.name} custom pose" class="gen-img" onerror="this.outerHTML='<a href=\\'${result.url}\\' target=\\'_blank\\' class=\\'img-link-fallback\\'>🔗 ${girl.name}</a>'" />
                <p class="small muted">${girl.name} · custom pose: "${escapeHtml(text)}"</p>
                <p class="small"><a href="${result.url}" target="_blank" rel="noopener">🔗 open in tab</a> · <a href="#gallery?girl=${girl.id}">🍆 view her Spank Bank</a></p>
              </div>`;
            if (status) status.textContent = '✓ done — saved to her Spank Bank';
          } else {
            if (slot) slot.innerHTML = `<div class="panel danger"><p>Custom pose failed: ${result?.error || 'unknown'}</p></div>`;
            if (status) status.textContent = 'failed';
          }
        } catch (err) {
          if (slot) slot.innerHTML = `<div class="panel danger"><p>Error: ${err.message}</p></div>`;
          if (status) status.textContent = `error: ${err.message}`;
        } finally {
          customFireBtn.disabled = false;
        }
      };
    }

    // Selfie +  buttons — Pollinations overlay into #selfie-slot. Tries fetch;
    // falls back to a direct <img src> if CORS/403. `extraOpts` adds {withPlayer} (you in frame,
    // third-person) or {pov} (first-person, your arms) reading your created character avatar.
    const SELFIE_POSES = ['selfie-topless','selfie-midsection','selfie-panties','selfie-lounge','selfie-kneeling','selfie-spread','selfie-bent-over'];
    async function genIntoSelfieSlot(extraOpts, label) {
      const slot = el.querySelector('#selfie-slot');
      const pose = SELFIE_POSES[Math.floor(Math.random() * SELFIE_POSES.length)];
      slot.innerHTML = `<div class="panel"><p class="small muted">Generating ${label} (${pose})…</p></div>`;
      try {
        const result = await window.DMTHGame.imaging.generateFor(girl.id, Object.assign({ situation: pose }, extraOpts || {}));
        if (result.url) {
          const hint = result.directUrl ? ' (direct — not cached)' : (result.cached ? ' (cached)' : '');
          slot.innerHTML = `
            <div class="panel">
              <img src="${result.url}" alt="${girl.name}" class="gen-img" />
              <p class="small muted">${girl.name} · ${label} · ${pose}${hint}</p>
              <p class="small"><a href="${result.url}" target="_blank" rel="noopener">🔗 open image link</a></p>
            </div>`;
          const img = slot.querySelector('img');
          img.onerror = () => {
            img.outerHTML = `<a href="${result.url}" target="_blank" rel="noopener" class="img-link-fallback">🔗 ${girl.name}</a>`;
          };
        } else {
          slot.innerHTML = `
            <div class="panel danger">
              <p>${label} failed: ${result.error || 'unknown'}</p>
              ${result.url ? `<p class="small"><a href="${result.url}" target="_blank" rel="noopener">🔗 try link directly</a></p>` : ''}
            </div>`;
        }
      } catch (err) {
        slot.innerHTML = `<div class="panel danger"><p>${label} error: ${err.message}</p></div>`;
      }
    }
    el.querySelector('#selfie-btn').onclick = () => genIntoSelfieSlot({}, 'photo of her');
    const _withMeBtn = el.querySelector('#selfie-withme-btn'); if (_withMeBtn) _withMeBtn.onclick = () => genIntoSelfieSlot({ withPlayer: true }, 'shot with you');
    const _povBtn = el.querySelector('#selfie-pov-btn'); if (_povBtn) _povBtn.onclick = () => genIntoSelfieSlot({ pov: true }, 'POV shot');

    // Profile image — Pollinations overlay, optional. Renders via <img src=> so it works
    // even when CORS/fetch blocks the blob cache.  On <img> error, fall back to a clickable
    // link so the user can still open the generated image in a new tab.
    (async () => {
      const slot = el.querySelector('#profile-img-slot');
      if (!slot) return;
      try {
        const result = await window.DMTHGame.imaging.generateFor(girl.id, { situation: 'profile' });
        if (result && result.url) {
          slot.innerHTML = `<img src="${result.url}" alt="${girl.name}" class="gen-img profile-img" />`;
          const img = slot.querySelector('img');
          img.onerror = () => {
            slot.innerHTML = `<a href="${result.url}" target="_blank" rel="noopener" class="img-link-fallback">🔗 ${girl.name}</a>`;
          };
        } else {
          slot.style.display = 'none';
        }
      } catch {
        slot.style.display = 'none';
      }
    })();

    // List for sale
    el.querySelector('#list-sale').onclick = () => {
      const price = window.DMTHGame.slaveMarket.computeSellPrice(girl);
      if (confirm(`List ${girl.name} on the slave market for $${price}?`)) {
        window.DMTHGame.slaveMarket.listForSale(girl.id, price);
        alert('Listed.');
        window.DMTHRouter.go('slave-market');
      }
    };

    // Multi-girl scene controls  — add / remove scene partners on the host girl.
    // sceneGirlIds is the array of present partner captives; setting it replaces wholesale
    // (deepMerge replaces arrays), and we null the legacy single-partner field as we go.
    const sceneAddBtn = el.querySelector('#scene-add');
    if (sceneAddBtn) sceneAddBtn.onclick = () => {
      const pid = el.querySelector('#scene-pick')?.value;
      if (!pid) { alert('pick a captive first'); return; }
      const cur = sceneGirlIdsOf(window.DMTHGame.state.getGirl(girl.id));
      if (cur.includes(pid)) return;
      if (cur.length >= MAX_SCENE_PARTNERS) { alert(`Scene is full — max ${MAX_SCENE_PARTNERS} partners. Send one back to swap.`); return; }
      window.DMTHGame.state.updateGirl(girl.id, { sceneGirlIds: [...cur, pid], multiGirlPartnerId: null });
      const p = window.DMTHGame.state.getGirl(pid);
      if (window.DMTHNotify && p) window.DMTHNotify.show(`👯 ${p.name} pulled into the scene with ${girl.name}.`, { type: 'info', durationMs: 2500 });
      window.DMTHRouter.handle();
    };
    el.querySelectorAll('[data-scene-remove]').forEach(b => {
      b.onclick = () => {
        const pid = b.dataset.sceneRemove;
        const cur = sceneGirlIdsOf(window.DMTHGame.state.getGirl(girl.id));
        window.DMTHGame.state.updateGirl(girl.id, { sceneGirlIds: cur.filter(id => id !== pid), multiGirlPartnerId: null });
        const p = window.DMTHGame.state.getGirl(pid);
        if (window.DMTHNotify && p) window.DMTHNotify.show(`↩️ ${p.name} sent back to her own hold.`, { type: 'info', durationMs: 2000 });
        window.DMTHRouter.handle();
      };
    });

    // Transport controls  — move her to another dungeon via a chosen method.
    const transferMethodSel = el.querySelector('#transfer-method');
    const transferNote = el.querySelector('#transfer-note');
    const updateTransferNote = () => {
      if (!transferMethodSel || !transferNote) return;
      const m = window.DMTHGame.transport.method(transferMethodSel.value);
      if (!m) { transferNote.textContent = ''; return; }
      const bits = [];
      if (m.death > 0) bits.push(`${Math.round(m.death * 100)}% death`);
      if (m.escape > 0) bits.push(`${Math.round(m.escape * 100)}% escape`);
      if (m.injury > 0) bits.push(`${Math.round(m.injury * 100)}% injury`);
      const sed = (m.requiresItem || m.requiresItemAny) ? ` · consumes a sedative (${(m.requiresItemAny || [m.requiresItem]).join(' / ')})` : '';
      transferNote.textContent = `${m.notes} — risk: ${bits.length ? bits.join(' · ') : 'none'}${m.wanted ? ` · up to +${m.wanted} WANTED on a rough move` : ''}${sed}`;
    };
    if (transferMethodSel) { transferMethodSel.onchange = updateTransferNote; updateTransferNote(); }
    const transferBtn = el.querySelector('#transfer-btn');
    if (transferBtn) transferBtn.onclick = () => {
      const dest = el.querySelector('#transfer-dest')?.value;
      const methodId = transferMethodSel?.value;
      if (!dest || !methodId) return;
      const m = window.DMTHGame.transport.method(methodId);
      const chk = window.DMTHGame.transport.canTransport(girl.id, dest, methodId);
      if (!chk.ok) { alert(chk.reason); return; }
      if (!confirm(`Transfer ${girl.name} via ${m.displayName}? It's a risk roll — she could arrive battered, break loose, or die in transit.`)) return;
      const r = window.DMTHGame.transport.transport(girl.id, dest, methodId);
      if (!r.ok) { alert(r.reason); return; }
      // On escape / death she's no longer a captive in this room — bounce to the roster;
      // otherwise re-render the room (she's now in the destination dungeon).
      if (r.outcome === 'escape' || r.outcome === 'death') window.DMTHRouter.go('roster');
      else window.DMTHRouter.handle();
    };

    // Toy controls ( / ) — buy → mount in hold (≤5) → use on her → detach.
    el.querySelectorAll('[data-toy-buy]').forEach(b => {
      b.onclick = () => { const r = window.DMTHGame.toys.buy(b.dataset.toyBuy); if (!r.ok) { alert(r.reason); return; } window.DMTHRouter.handle(); };
    });
    el.querySelectorAll('[data-toy-attach]').forEach(b => {
      b.onclick = () => { const r = window.DMTHGame.toys.attachToHold(girl.assignedDungeonId, girl.assignedHoldIdx ?? 0, b.dataset.toyAttach); if (!r.ok) { alert(r.reason); return; } window.DMTHRouter.handle(); };
    });
    el.querySelectorAll('[data-toy-detach]').forEach(b => {
      b.onclick = () => { const r = window.DMTHGame.toys.detachFromHold(girl.assignedDungeonId, girl.assignedHoldIdx ?? 0, b.dataset.toyDetach); if (!r.ok) { alert(r.reason); return; } window.DMTHRouter.handle(); };
    });
    el.querySelectorAll('[data-toy-use]').forEach(b => {
      b.onclick = () => { const r = window.DMTHGame.toys.use(b.dataset.toyUse, girl.id); if (!r.ok) { alert(r.reason); return; } window.DMTHRouter.handle(); };
    });

    // Dungeon-pool stocking  — convert an inventory item into shared pool supply.
    el.querySelectorAll('[data-pool-stock]').forEach(b => {
      b.onclick = () => {
        const [kind, itemId, units] = b.dataset.poolStock.split(':');
        if (!window.DMTHGame.state.consumeItem(itemId, 1)) { alert('out of ' + itemId); return; }
        window.DMTHGame.supply.stockPool(girl.assignedDungeonId, kind, parseInt(units, 10) || 1);
        window.DMTHRouter.handle();
      };
    });
    el.querySelectorAll('[data-pool-drug]').forEach(b => {
      b.onclick = () => {
        const itemId = b.dataset.poolDrug;
        if (!window.DMTHGame.state.consumeItem(itemId, 1)) { alert('out of ' + itemId); return; }
        const key = window.DMTHGame.drugs?.ITEM_TO_DRUG?.[itemId] || itemId;
        window.DMTHGame.supply.stockPoolDrug(girl.assignedDungeonId, key, 1);
        window.DMTHRouter.handle();
      };
    });

    // Condom controls  — buy / equip / remove typed condoms.
    el.querySelectorAll('[data-condom-buy]').forEach(b => {
      b.onclick = () => { const r = window.DMTHGame.condoms.buy(b.dataset.condomBuy); if (!r.ok) { alert(r.reason); return; } window.DMTHRouter.handle(); };
    });
    el.querySelectorAll('[data-condom-equip]').forEach(b => {
      b.onclick = () => { const r = window.DMTHGame.condoms.equip(girl.id, b.dataset.condomEquip); if (!r.ok) { alert(r.reason); return; } window.DMTHRouter.handle(); };
    });
    const condomRemoveBtn = el.querySelector('#condom-remove');
    if (condomRemoveBtn) condomRemoveBtn.onclick = () => { window.DMTHGame.condoms.unequip(girl.id); window.DMTHRouter.handle(); };

    // Snuff controls  — method picker + film/no-film. Confirms (it's an irreversible kill).
    const snuffSel = el.querySelector('#snuff-method');
    const snuffNote = el.querySelector('#snuff-method-note');
    const updateSnuffNote = () => {
      if (!snuffSel || !snuffNote) return;
      const m = window.DMTHGame.lifespan.SNUFF_METHODS[snuffSel.value];
      snuffNote.textContent = m ? m.notes : '';
    };
    if (snuffSel) { snuffSel.onchange = updateSnuffNote; updateSnuffNote(); }
    const doSnuff = (filmed) => {
      const methodId = snuffSel?.value;
      const m = methodId && window.DMTHGame.lifespan.SNUFF_METHODS[methodId];
      if (!m) return;
      if (!confirm(`Snuff ${girl.name} via "${m.displayName}"${filmed ? ' ON CAMERA' : ''}? This KILLS her — irreversible.`)) return;
      const r = window.DMTHGame.lifespan.snuffKill(girl.id, methodId, { filmed });
      if (!r.ok) { alert(r.reason); return; }
      window.DMTHRouter.handle();
    };
    const snuffFilmBtn = el.querySelector('#snuff-film-btn');
    if (snuffFilmBtn) snuffFilmBtn.onclick = () => doSnuff(true);
    const snuffNoFilmBtn = el.querySelector('#snuff-btn');
    if (snuffNoFilmBtn) snuffNoFilmBtn.onclick = () => doSnuff(false);

    // If she's currently tranquilized, broad-disable interaction buttons
    // (drugs/feed/water/derobe/strip-everything/quick-actions/selfie/heal/mode/record/list-sale)
    // and the typed-input Send button. They re-enable when the page re-renders post-wake-up.
    if (isUnconscious) {
      el.querySelectorAll('.qa-btn, [data-drug], [data-feed], [data-water], #selfie-btn, #selfie-withme-btn, #selfie-pov-btn, #heal-btn, [data-mode], #record-toggle, #list-sale, #derobe-btn, #strip-all-btn, #send, #mic-btn')
        .forEach(b => { b.disabled = true; const t = b.getAttribute('data-tooltip') || ''; b.setAttribute('data-tooltip', t + (t ? '\n' : '') + '💉 she\'s tranquilized — out cold'); });
      const userIn = el.querySelector('#user-in');
      if (userIn) { userIn.disabled = true; userIn.placeholder = 'she\'s tranquilized — wait for wake-up'; }
    }

    // Postmortem (dead) state gating. Disable drugs/feed/water/heal/abortion/mode/list-
    // sale — none of those make sense on a corpse. KEEP quick-actions (sex acts still
    // apply + accrue cumLoad), KEEP chat send (room_postmortem scene returns narration
    // only), KEEP selfie/derobe/strip/record (still pose + record the body).
    if (isDead) {
      el.querySelectorAll('[data-drug], [data-feed], [data-water], [data-drop-food], [data-drop-water], [data-pickup-food], [data-pickup-water], #heal-btn, [data-mode], #list-sale, [data-abort]')
        .forEach(b => { b.disabled = true; const t = b.getAttribute('data-tooltip') || ''; b.setAttribute('data-tooltip', t + (t ? '\n' : '') + '☠️ she\'s deceased — body cannot metabolize / heal / sell'); });
    }

    // Live mm:ss countdown ticker. Updates every second; on wake-up, fires
    // a NotifyToast and re-renders the page so the disabled buttons come back online.
    let tranqTicker = null;
    if (isUnconscious) {
      tranqTicker = setInterval(() => {
        const el2 = el.querySelector('#tranq-countdown');
        if (!el2) { clearInterval(tranqTicker); tranqTicker = null; return; }
        const wearOffAt = Number(el2.dataset.wearOff || 0);
        const remaining = wearOffAt - Date.now();
        if (remaining <= 0) {
          clearInterval(tranqTicker);
          tranqTicker = null;
          if (window.DMTHNotify) {
            window.DMTHNotify.show(`💉 ${girl.name} woke up from the tranquilizer.`, { type: 'info', durationMs: 3000 });
          }
          window.DMTHGame.state.appendTurn(girl.id, 'system', `*${girl.name} stirs and groans, regaining consciousness from the tranquilizer*`);
          window.DMTHRouter.handle();
          return;
        }
        el2.textContent = fmtCountdown(remaining);
      }, 1000);
    }

    // Live cum-capacity-plug countdown — ticks the "next in mm:ss" every second; on completion
    // re-renders so the level + cum-cap jump shows. Reads a real-ms end-stamp off the element.
    const cumplugEl = el.querySelector('#cumplug-countdown');
    if (cumplugEl) {
      const cpTicker = setInterval(() => {
        const el3 = el.querySelector('#cumplug-countdown');
        if (!el3) { clearInterval(cpTicker); return; }
        const endMs = Number(el3.dataset.cpEnd || 0);
        const remSec = Math.max(0, Math.round((endMs - Date.now()) / 1000));
        if (remSec <= 0) { clearInterval(cpTicker); window.DMTHRouter.handle(); return; }
        const m = Math.floor(remSec / 60), ss = remSec % 60;
        el3.textContent = `next in ${m}:${String(ss).padStart(2, '0')}`;
      }, 1000);
    }

    // LIVE activity-history panel. Auto-scrolls to the newest entry UNLESS the user
    // has scrolled up to read back (then it pauses until they return to the bottom — mirrors the
    // chat-log selection-safe pattern). Buffs/debuffs/perks line refreshes alongside.
    const activityLogEl = el.querySelector('#activity-log');
    const activityBuffsEl = el.querySelector('#activity-buffs');
    let activityStick = true;
    if (activityLogEl) {
      activityLogEl.addEventListener('scroll', () => {
        // "At the bottom" within a small tolerance → keep sticking; scrolled up → pause auto-scroll.
        activityStick = (activityLogEl.scrollHeight - activityLogEl.scrollTop - activityLogEl.clientHeight) < 24;
      });
    }
    const ACTIVITY_KIND_EMOJI = { action: '✋', john: '💸', friend: '🩸', milk: '🥛', cash: '💰', capture: '⛓️', birth: '🍼', death: '☠️', buff: '✨' };
    function activityBuffsLine() {
      const g = window.DMTHGame.state.getGirl(girlId);
      if (!g) return '';
      const out = [];
      const drugs = window.DMTHGame.drugs?.summarize ? window.DMTHGame.drugs.summarize(g) : [];
      drugs.forEach(d => out.push(`💊 ${escapeHtml(d.name)} (${d.remainingMin}m)`));
      if (window.DMTHGame.specialize?.list) window.DMTHGame.specialize.list(g).forEach(s => out.push(`${s.emoji} ${escapeHtml(s.displayName)}`));
      if (window.DMTHGame.milk?.buffActive && window.DMTHGame.milk.buffActive()) out.push('🥛 warm-milk high');
      if (window.DMTHGame.period?.isOnPeriod && window.DMTHGame.period.isOnPeriod(g)) out.push('🩸 on the rag');
      if (g.pregnancy?.status === 'pregnant') out.push('🤰 pregnant');
      if (g.body?.isNugget) out.push('🪓 nugget');
      const xlim = window.DMTHGame.actionEffects?.XTOL_LIMIT || 10;
      if ((g.body?.extremeStreak || 0) >= xlim) out.push('⚠️ spent');
      return out.length ? `<b>Now:</b> ${out.map(t => `<span class="stat-pill" style="display:inline-block;margin:1px">${t}</span>`).join('')}` : '<span class="muted">no active buffs / debuffs / perks</span>';
    }
    function renderActivity() {
      if (activityBuffsEl) activityBuffsEl.innerHTML = activityBuffsLine();
      if (!activityLogEl) return;
      const items = window.DMTHGame.state.getActivity ? window.DMTHGame.state.getActivity(girlId, 80) : [];
      activityLogEl.innerHTML = items.length ? items.map(a => {
        const t = (window.DMTHGame.gameClock?.formatStamp && a.gameMin != null) ? window.DMTHGame.gameClock.formatStamp(a.gameMin) : '';
        return `<div class="log-entry"><b>${ACTIVITY_KIND_EMOJI[a.kind] || '·'} ${escapeHtml(a.label || '')}</b>${a.detail ? ` <span class="muted small">${escapeHtml(a.detail)}</span>` : ''}${t ? ` <span class="muted small">· ${escapeHtml(t)}</span>` : ''}</div>`;
      }).join('') : '<div class="muted small">nothing yet — interact with her and it logs here live.</div>';
      if (activityStick) activityLogEl.scrollTop = activityLogEl.scrollHeight;
    }
    renderActivity();

    const unsub = window.DMTHGame.state.onChange(() => {
      if (!location.hash.startsWith('#room')) return;
      renderLog();
      renderActivity();   // keep the live activity history + buffs current
      // Refresh body stat bars in place — without this, the bars stay frozen at
      // render-time values even though applyAction is correctly mutating
      // girl.body.{arousal,wetness,cumLoad,bruises,high,stamina,health}. The bars are
      // pure display (no event handlers), so innerHTML replacement is safe; tooltips
      // re-bind via the document-level delegation engine in tooltips.js.
      const bodyPanel = el.querySelector('#body-stats-panel');
      if (bodyPanel) bodyPanel.innerHTML = renderBodyStatsHTML();
    });
    // When you walk up to her cell she may speak FIRST, on her own — no action from you needed.
    // Off her live state: whored-raw today pours out disparaging/sad/filthy/explicit about being used
    // too much; a deeply-bonded girl he hasn't touched aches and begs to be used; otherwise she blurts
    // whatever her state makes her feel — complain, argue, beg, cry, tremble, taunt, plead. Real
    // inference, throttled to at most once per ~2 game-hours per girl so it never spams.
    async function fireAutoVoice(autoMode) {
      try {
        const dn = girl.assignedDungeonId ? window.DMTHGame.state.getDungeon(girl.assignedDungeonId) : null;
        const dtpl = dn ? window.DMTHAssets.getById('dungeon', dn.templateId) : null;
        const { raw, parsed } = await window.DMTHGame.ollama.runTurn({
          girl, mode, sceneKey: 'unprompted_hold',
          sceneVars: { AUTO_MODE: autoMode, ROOM_AMBIENCE: dtpl?.plotTokens || 'bare hold' },
          userText: '(Master walks up to your hold and looks at you, saying nothing — you speak first, on your own.)',
          room: { ambience: dtpl?.plotTokens || '', upgrades: {} }
        });
        const clean = (parsed.cleanText || raw || '').trim();
        if (!clean) return;
        window.DMTHGame.state.appendTurn(girl.id, 'assistant', clean);
        if (parsed.delta) window.DMTHGame.delta.applyDelta(girl.id, parsed.delta);
        const voiceOn = !window.DMTHIsVoiceOn || window.DMTHIsVoiceOn();
        if (voiceOn && window.DMTHKokoro && window.DMTHKokoro.isReady() && window.DMTHVoiceQueue) {
          const speakable = clean.replace(/\*([^*]+)\*/g, '$1').replace(/\s+/g, ' ').trim();
          if (speakable.length > 0) {
            const validIds = new Set(window.DMTHVoices.VOICES.map(v => v.id));
            let voice = girl.voiceId; if (!voice || !validIds.has(voice)) voice = 'af_nicole';
            const emo = window.DMTHVoices.pickEmotion({ ...girl, mode, bondLevel: girl.bond?.bondLevel || 0, activeDrugs: (girl.body.activeDrugs || []).map(d => d.name || d) });
            const profile = window.DMTHVoices.getEmotionProfile(emo);
            const spoken = profile ? profile.preprocess(speakable) : speakable;
            window.DMTHVoiceQueue.enqueue(spoken, voice, profile?.speed).catch(() => {});
          }
        }
      } catch (e) { /* an unprompted line is best-effort and must never break the room */ }
    }
    (function maybeAutoVoice() {
      if (girl.encounterState === 'dead') return;
      if (window.DMTHGame.drugScheduler && window.DMTHGame.drugScheduler.isUnconscious && window.DMTHGame.drugScheduler.isUnconscious(girl)) return;
      const clk = window.DMTHGame.gameClock;
      const now = clk ? clk.now() : 0;
      const last = autoVoiceAt.has(girl.id) ? autoVoiceAt.get(girl.id) : -1e9;
      if (now - last < 120) return;   // throttle ~2 game-hours per girl
      const MPD = (clk && clk.MIN_PER_DAY) || 1440;
      const today = Math.floor(now / MPD);
      const acts = window.DMTHGame.state.getActivity ? window.DMTHGame.state.getActivity(girl.id) : [];
      let usedToday = 0;
      for (const e of acts) {
        if (e.gameMin == null || Math.floor(e.gameMin / MPD) !== today) continue;
        if (e.kind === 'john' || e.kind === 'friend') usedToday++;
        else if (e.kind === 'action' && /fuck|rape|anal|oral|throat|cum|breed|cock|pussy|ass|choke|face|use/i.test(e.label || '')) usedToday++;
      }
      const bond = girl.bond?.bondLevel || 0;
      let autoMode = null;
      if (usedToday >= 4) autoMode = 'she has been whored out HARD today — fucked too many times, sore, used up, leaking; it pours out of her disparaging, brutally sad, filthy and explicit about being used too much';
      else if (bond >= 8 && usedToday === 0) autoMode = 'she is deeply bonded and he has NOT touched her today — she aches and fiends to be used, begs filthy for his cock and his cum';
      else if (Math.random() < 0.35) autoMode = 'whatever her live state (hunger, thirst, pain, bruises, drugs, arousal, mood, Stockholm) makes her blurt on her own — complain, argue, beg, cry, tremble, taunt, plead';
      if (!autoMode) return;
      autoVoiceAt.set(girl.id, now);
      fireAutoVoice(autoMode);
    })();

    return () => {
      if (tranqTicker) { clearInterval(tranqTicker); tranqTicker = null; }
      if (typeof unsub === 'function') unsub();
    };
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  // Body-state hash — quantized so small fluctuations don't retrigger regen.
  // Bands of 20 on arousal/wetness/high; bands of 5 on bruises; bond level itself.
  // Extended to include active-drug list + pregnancy trimester so tranquilizer image
  // overrides + per-trimester pregnancy regen both fire correctly.
  function roomStateHash(girl) {
    const b = girl.body || {};
    const drugSig = (b.activeDrugs || [])
      .map(d => (typeof d === 'string' ? d : d?.name || ''))
      .filter(Boolean).sort().join(',');
    return [
      Math.floor((b.arousal  || 0) / 20),
      Math.floor((b.wetness  || 0) / 20),
      Math.floor((b.high     || 0) / 20),
      Math.floor((b.bruises  || 0) / 5),
      Math.round((b.cumLoad  || 0) * 2),
      girl.bond?.bondLevel ?? 0,
      girl.currentOutfit || 'default',
      (b.outfitState || 'intact'),
      drugSig || '-',
      girl.pregnancy?.trimester || 0,
      b.activeBondage || '-',
      // Encounter state — alive vs dead transitions trigger image regen so postmortem
      // markers + corpse pose land. Decay bucketed at 1-day granularity so the marker
      // tier (fresh / early / mid / late) changes trigger a fresh image too.
      girl.encounterState || 'captive',
      Math.floor((b.decayedMinutes || 0) / 1440)
    ].join('|');
  }

  window.DMTHRouter.register('room', render);
})();
