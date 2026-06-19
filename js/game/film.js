// DUNGEON MASTER: THE HUNT — film recording + quality scoring.

(function () {
  'use strict';

  let active = null;  // current recording session { girlId, startedAt, startTurnIdx, tags }

  function isRecording() { return !!active; }
  function activeSession() { return active; }

  function startRecording(girlId, tags = []) {
    const girl = window.DMTHGame.state.getGirl(girlId);
    if (!girl || girl.encounterState !== 'captive') {
      throw new Error('Can only record captive girls');
    }
    active = {
      girlId,
      startedAt: Date.now(),
      startTurnIdx: (window.DMTHGame.state.current.turns[girlId] || []).length,
      tags: tags.slice()
    };
    return active;
  }

  function tagActive(tag) {
    if (!active) return;
    if (!active.tags.includes(tag)) active.tags.push(tag);
  }

  function stopRecording({ title, blurb, basePrice } = {}) {
    if (!active) throw new Error('No active recording');
    const session = active;
    active = null;

    const girl = window.DMTHGame.state.getGirl(session.girlId);
    const endTurnIdx = (window.DMTHGame.state.current.turns[session.girlId] || []).length;
    const turns = (window.DMTHGame.state.current.turns[session.girlId] || [])
      .slice(session.startTurnIdx, endTurnIdx);

    const dungeon = window.DMTHGame.state.getDungeon(girl.assignedDungeonId);
    const dungeonTpl = dungeon && window.DMTHAssets.getById('dungeon', dungeon.templateId);

    const qualityMarkers = {
      bondLevelAtRecording: girl.bond.bondLevel,
      contentIntensity: computeIntensity(turns, girl),
      girlRarity: girl.archetypeTemplate === 'unity_seed' ? 'legendary' : 'standard',
      settingAesthetic: dungeonTpl?.contentValueMultiplier || 1.0,
      uniqueness: session.tags.includes('first-capture') ? 1.0
                : session.tags.includes('first-bond-up') ? 0.8
                : session.tags.includes('finalization') ? 1.5
                : 0.4
    };

    // Dynamic content analysis — what actually happened on camera (acts, johns, corpse,
    // distress, drugs) drives the title, the scrollable summary, and a +/- value multiplier.
    const contentEvents = analyzeRecording(turns, girl, session);
    let contentMultiplier = contentMultiplierFromEvents(contentEvents);
    // Trophy perks — disposal trophies grant a stacking film-price bonus.
    if (window.DMTHGame.trophies) contentMultiplier *= (1 + window.DMTHGame.trophies.perk('filmPriceMul'));

    const computedBase = basePrice || autoPrice(qualityMarkers);

    const film = {
      id: 'film_' + Date.now().toString(36),
      girlId: girl.id,
      girlNameAtRecording: girl.name,
      dungeonId: dungeon?.id || null,
      dungeonTemplateAtRecording: dungeon?.templateId || null,
      startedAt: session.startedAt,
      endedAt: Date.now(),
      durationMinutes: Math.max(1, Math.round((Date.now() - session.startedAt) / 60000)),
      title: title || dynamicTitle(girl, session, contentEvents),
      blurb: blurb || '',
      // Scrollable per-film summary of the totality of what happened (girl description +
      // detected acts/events + her spoken transcript). Rendered in the market view.
      summary: buildSummary(girl, session, turns, contentEvents, dungeonTpl),
      contentEvents,
      contentMultiplier,
      transcript: turns,
      keyImages: [],
      tags: session.tags,
      qualityMarkers,
      listedForSale: true,
      basePrice: computedBase,
      currentListPrice: Math.round(computedBase * pricingMultiplier(qualityMarkers, session.tags) * contentMultiplier),
      saleRecord: null,
      status: 'listed'
    };
    // Multi-session series stitch — if the girl has prior films with same `seriesId` pattern, link this one.
    const existingSeries = window.DMTHGame.state.current.films.filter(f => f.girlId === girl.id && f.seriesId).slice(-1)[0];
    if (existingSeries && (Date.now() - existingSeries.endedAt < 24*60*60*1000)) {
      film.seriesId = existingSeries.seriesId;
      film.seriesEpisodeNumber = (existingSeries.seriesEpisodeNumber || 1) + 1;
      film.title = `${film.title} (series pt ${film.seriesEpisodeNumber})`;
      film.currentListPrice = Math.round(film.currentListPrice * 1.08);   // small series bonus
    } else if (qualityMarkers.uniqueness >= 0.8 || session.tags.includes('first-capture')) {
      film.seriesId = `series_${girl.id}_${Date.now().toString(36)}`;
      film.seriesEpisodeNumber = 1;
    }

    window.DMTHGame.state.addFilm(film);
    // Apply wardrobe multiplier if she was wearing a non-default outfit
    if (window.DMTHGame.wardrobe) {
      const m = window.DMTHGame.wardrobe.currentMultiplier(girl);
      if (m !== 1.0) {
        window.DMTHGame.state.updateFilm(film.id, {
          currentListPrice: Math.round(film.currentListPrice * m),
          outfitMultiplier: m,
          outfitWorn: girl.currentOutfit
        });
      }
    }
    // Stress-state bonus multiplier. Stacks with wardrobe.
    // Awarded by action-effects.js when body.health stays in the 25-55 band long
    // enough (5 days = tier 1 = 1.15×, 15 days = tier 2 = 1.35×).
    const stressMul = girl.bonuses?.stressFilmMultiplier || 1.0;
    if (stressMul !== 1.0) {
      const current = window.DMTHGame.state.current.films.find(f => f.id === film.id);
      const newPrice = Math.round((current?.currentListPrice || film.currentListPrice) * stressMul);
      window.DMTHGame.state.updateFilm(film.id, {
        currentListPrice: newPrice,
        stressMultiplier: stressMul,
        stressBonusTier: girl.bonuses?.stressBonusTier || 0
      });
    }
    // Cum-load bonus — recording while she's heavily used pays out a premium. Visible
    // signs of recent use are a selling point in the content market. Tiered:
    //   cumLoad ≥ 2.0  → "used"      × 1.10
    //   cumLoad ≥ 3.5  → "well-used" × 1.20
    //   cumLoad ≥ 5.0  → "ruined"    × 1.35  (saturation tier)
    // Stacks multiplicatively with wardrobe + stress bonuses.
    const cl = girl.body?.cumLoad || 0;
    const cumMul = cl >= 5.0 ? 1.35 : cl >= 3.5 ? 1.20 : cl >= 2.0 ? 1.10 : 1.0;
    if (cumMul !== 1.0) {
      const current = window.DMTHGame.state.current.films.find(f => f.id === film.id);
      const newPrice = Math.round((current?.currentListPrice || film.currentListPrice) * cumMul);
      const cumTier = cl >= 5.0 ? 'ruined' : cl >= 3.5 ? 'well-used' : 'used';
      window.DMTHGame.state.updateFilm(film.id, {
        currentListPrice: newPrice,
        cumLoadMultiplier: cumMul,
        cumLoadTier: cumTier,
        cumLoadAtRecording: cl
      });
    }
    // Auto-generate cover image IF Pollinations is configured — otherwise text+emoji film lives fine without it.
    if (window.DMTHGame.imaging && window.DMTHGame.imaging.isAvailable()) {
      window.DMTHGame.imaging.filmCover(film.id).catch(() => {});
    }
    // LLM-generate the title + blurb from the content (fire-and-forget). The dynamic title
    // set above is only the instant dev-fallback; the templates own the real marketing copy.
    if (window.DMTHGame.ollama) generateFilmText(film.id).catch(() => {});
    return film;
  }

  function computeIntensity(turns, girl) {
    // Heuristic from recent transcript: count intensity keywords + state delta magnitudes.
    const keywords = ['cum','fuck','spread','choke','tear','rip','bleed','scream','gag','bruise','break'];
    let kwHits = 0;
    for (const t of turns) {
      const txt = (t.text || '').toLowerCase();
      for (const kw of keywords) if (txt.includes(kw)) kwHits++;
    }
    const normalized = Math.min(1, kwHits / (turns.length * 2 + 1));
    const bodyWeight = Math.min(1, (girl.body.arousal + girl.body.wetness) / 200) * 0.3;
    const violenceWeight = Math.min(1, girl.body.bruises / 30) * 0.2;
    return Math.min(1, normalized * 0.5 + bodyWeight + violenceWeight);
  }

  function autoPrice(qm) {
    const base = 100;
    return Math.round(
      base
      * (0.6 + 0.15 * (qm.bondLevelAtRecording || 0))
      * (0.7 + 0.6 * (qm.contentIntensity || 0))
      * (qm.girlRarity === 'legendary' ? 1.8 : 1.0)
      * (qm.settingAesthetic || 1)
      * (0.7 + 0.8 * (qm.uniqueness || 0))
    );
  }

  function pricingMultiplier(qm, tags) {
    let m = 1;
    if (tags.includes('finalization')) m *= 3.5;
    if (tags.includes('first-capture')) m *= 1.5;
    if (tags.includes('first-bond-up')) m *= 1.25;
    if (tags.includes('group')) m *= 1.4;
    if (tags.includes('extreme-pain')) m *= 1.3;
    return m;
  }

  function autoTitle(girl, tags) {
    if (tags.includes('finalization')) return `${girl.name}: The End`;
    if (tags.includes('first-capture')) return `${girl.name}'s First Night`;
    if (tags.includes('first-bond-up')) return `${girl.name}, Breaking`;
    const arr = [
      `${girl.name} in the Dark`,
      `Session with ${girl.name}`,
      `${girl.name} — Property`,
      `${girl.name}, Day ${Math.max(1, Math.round((Date.now() - (girl.captureDate || Date.now())) / 86400000))}`
    ];
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // -----------------------------------------------------------------------
  // Dynamic content analysis — names + descriptions + per-event value
  // -----------------------------------------------------------------------
  // Scans everything that happened between record-start and stop — the transcript turns,
  // the girl's state (corpse? drugged? bruised? bond?), the johns serviced on camera in the
  // window, the recording tags — and produces (a) a list of detected content events each
  // carrying a +/- price-value contribution, used to build (b) a dynamic title and (c) a
  // scrollable summary of the totality. This is what makes each film unique + priced by what
  // actually occurred, not a generic label.
  function countJohnsDuring(girl, session) {
    const wo = girl.whoreOut;
    if (!wo || !Array.isArray(wo.johnLedger)) return 0;
    return wo.johnLedger.filter(e => e.ts >= session.startedAt && e.ts <= Date.now()).length;
  }

  function analyzeRecording(turns, girl, session) {
    const text = turns.map(t => (t.text || '').toLowerCase()).join('  ');
    const tags = session.tags || [];
    const has = (re) => re.test(text);
    const events = [];   // { key, label, value }  value = additive contribution to the content multiplier (base 1.0)

    const isCorpse = girl.encounterState === 'dead' || tags.includes('postmortem') || tags.includes('necro');
    if (isCorpse)                                    events.push({ key: 'necro',    label: '💀 Postmortem / necro content', value: +0.90 });
    if (has(/throat|face.?fuck|deep.?throat|gag\b/)) events.push({ key: 'throat',   label: '😩 Throat / face-fucking',      value: +0.18 });
    if (has(/\banal\b|asshole|in her ass/))          events.push({ key: 'anal',     label: '🍑 Anal',                       value: +0.20 });
    if (has(/creampie|breed|cum.?inside|cum in her|inside me|inside her/)) events.push({ key: 'creampie', label: '🍆 Creampie / breeding', value: +0.22 });
    if (has(/chok|strangl|can.?t breathe|breath/))   events.push({ key: 'choke',    label: '🤚 Breath play / choking',      value: +0.20 });
    if (has(/whip|cane\b|belt|welt|flog|lash/))      events.push({ key: 'pain',     label: '🔥 Heavy pain',                 value: +0.25 });
    if (has(/blood|bleed|tear|rip|split/))           events.push({ key: 'blood',    label: '🩸 Bloodletting / brutality',   value: +0.30 });
    // The taboo market pays a PREMIUM for genuine non-consent — crying, fighting, terror from
    // a non-indoctrinated girl is the high-value content. Willing/devoted performance is worth
    // far less here.
    if (has(/cry|sob|scream|beg|please|don.?t|no master|stop|tears|weep/)) events.push({ key: 'distress', label: '😭 Fear / crying / pleading', value: +0.30 });
    if (has(/fight|thrash|struggl|kick|bite|claw|writh|jerk|buck/))        events.push({ key: 'fighting', label: '🥊 Fighting / resisting', value: +0.24 });

    const johns = countJohnsDuring(girl, session);
    if (johns > 0) events.push({ key: 'johns', label: `👥 ${johns} john${johns > 1 ? 's' : ''} serviced on camera`, value: +0.12 * Math.min(5, johns) });

    if (girl.pregnancy?.status === 'pregnant') {
      const tri = girl.pregnancy.trimester || 1;
      events.push({ key: 'preggo', label: `🤰 Pregnant (trimester ${tri})`, value: +0.12 + 0.06 * tri });   // bigger bump as the belly shows
    }
    if ((girl.body?.activeDrugs || []).length) events.push({ key: 'drugged', label: '💊 Drugged / intoxicated', value: +0.10 });
    if ((girl.body?.bruises || 0) >= 15)       events.push({ key: 'battered', label: '🟣 Heavily battered', value: +0.15 });
    // Possessiveness premium — a girl permanently branded / tattooed / pierced as property
    // is owned-content gold. Scales with how many marks she carries.
    const marks = girl.body?.ownershipMarks || [];
    if (marks.length) events.push({ key: 'owned', label: `🏷️ Marked as property (${marks.length} owner mark${marks.length > 1 ? 's' : ''})`, value: +0.10 + 0.05 * marks.length });

    const bond = girl.bond?.bondLevel || 0;
    if (bond <= 2)      events.push({ key: 'unwilling', label: '⛓️ UNBROKEN captive — fights it (premium)', value: +0.28 });
    else if (bond <= 4) events.push({ key: 'breaking',  label: '😣 Not yet broken (high value)', value: +0.15 });
    else if (bond >= 8) events.push({ key: 'devoted',   label: '💖 Devoted/willing (worth less here)', value: +0.03 });

    // Negatives — thin / nothing-happened content drags the value down.
    if (turns.length < 2 && !isCorpse && johns === 0) events.push({ key: 'thin', label: '… thin content (barely anything recorded)', value: -0.35 });

    return events;
  }

  function contentMultiplierFromEvents(events) {
    const sum = events.reduce((s, e) => s + e.value, 0);
    return Math.max(0.5, Math.min(3.5, 1 + sum));
  }

  function dynamicTitle(girl, session, events) {
    const keys = new Set(events.map(e => e.key));
    if (session.tags.includes('finalization')) return `${girl.name}: The End`;
    if (keys.has('necro'))     return `${girl.name}: Cold and Used`;
    if (keys.has('blood'))     return `${girl.name} Comes Apart`;
    if (keys.has('johns'))     return `${girl.name} Rented Out`;
    if (keys.has('pain'))      return `Breaking ${girl.name}`;
    if (keys.has('creampie'))  return `${girl.name}, Bred`;
    if (keys.has('throat'))    return `${girl.name} Throated`;
    if (keys.has('anal'))      return `${girl.name}, Every Hole`;
    if (keys.has('unwilling')) return `${girl.name} Doesn't Want To`;
    if (keys.has('devoted'))   return `${girl.name} Begs For It`;
    return autoTitle(girl, session.tags);
  }

  function buildSummary(girl, session, turns, events, dungeonTpl) {
    const vi = girl.visualIdentity || {};
    const appearance = vi.facialDescription ? vi.facialDescription.split(',').slice(0, 2).join(',').trim() : '';
    const days = Math.max(1, Math.round((Date.now() - (girl.captureDate || Date.now())) / 86400000));
    const drugs = (girl.body?.activeDrugs || []).map(d => d.name || d).join(', ');
    const dur = Math.max(1, Math.round((Date.now() - session.startedAt) / 60000));
    const lines = [];
    lines.push(`${girl.name} — ${girl.archetypeTemplate}${girl.age ? `, age ${girl.age}` : ''}${appearance ? ` · ${appearance}` : ''}.`);
    lines.push(`Recorded over ${dur} game-min${dungeonTpl ? ` in the ${dungeonTpl.displayName}` : ''}. Day ${days} of captivity.`);
    lines.push(`Stockholm L${girl.bond?.bondLevel || 0}/9 · mood ${girl.mood?.mood || 'neutral'}${girl.mind === 'broken' ? ' · mind broken' : ''}${drugs ? ` · on ${drugs}` : ''}.`);
    lines.push('');
    lines.push('What happened on camera:');
    if (events.length) { for (const e of events) lines.push(`  • ${e.label}`); }
    else lines.push('  • a quiet session — nothing remarkable');
    // Her own spoken lines from the recording — the scrollable transcript of the totality.
    const spoken = turns.map(t => (t.text || '').trim()).filter(Boolean);
    if (spoken.length) {
      lines.push('');
      lines.push('Transcript:');
      for (const s of spoken) lines.push(`  ${s}`);
    }
    return lines.join('\n');
  }

  // LLM-generated title + blurb from the film's actual content (fire-and-forget post-gen).
  // Templates own the marketing copy — the hardcoded dynamicTitle is just the instant fallback.
  async function generateFilmText(filmId) {
    const film = window.DMTHGame.state.getFilm(filmId);
    if (!film || !window.DMTHGame.ollama) return;
    const events = (film.contentEvents || []).map(e => e.label).join('; ') || 'a session in the dungeon';
    const sys = `You write the TITLE and BLURB for an underground adult film sold on a taboo content marketplace.
Output EXACTLY two lines, nothing else:
TITLE: <punchy 2-6 word title>
BLURB: <one lurid, marketable 1-2 sentence sell line>
Subject: ${film.girlNameAtRecording}. What's in it: ${events}. Tone: lurid, filthy, marketable, taboo. No disclaimers, no preamble.`;
    try {
      const res = await window.DMTHGame.ollama.chat({ system: sys, messages: [{ role: 'user', content: 'Title and blurb this film.' }] });
      const text = (res?.parsed?.cleanText || res?.raw || '').trim();
      const tM = text.match(/TITLE:\s*(.+)/i);
      const bM = text.match(/BLURB:\s*([\s\S]+)/i);
      const patch = {};
      if (tM) patch.title = tM[1].trim().replace(/^["']|["']$/g, '').slice(0, 80);
      if (bM) patch.blurb = bM[1].trim().replace(/^["']|["']$/g, '').slice(0, 300);
      if (Object.keys(patch).length) window.DMTHGame.state.updateFilm(filmId, patch);
    } catch { /* keep the instant fallback title/blurb */ }
  }

  window.DMTHGame = window.DMTHGame || {};
  window.DMTHGame.film = Object.freeze({
    isRecording, activeSession, startRecording, tagActive, stopRecording,
    analyzeRecording, contentMultiplierFromEvents, dynamicTitle, buildSummary, generateFilmText
  });
})();
