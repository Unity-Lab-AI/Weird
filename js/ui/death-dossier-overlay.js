// DUNGEON MASTER: THE HUNT — death dossier popup (DEATHSTATS.1).
// When a girl dies, this modal surfaces her FINAL dossier: her last living likeness, her final
// stats, and the full history of what was done to her (where captured, where held longest,
// films, johns, pregnancies, chat turns). The same record is saved on her + attached to her
// trophy at disposal. Self-contained (inline styles) so it has no CSS dependency.

(function () {
  'use strict';

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function row(label, value) {
    return `<div style="display:flex;justify-content:space-between;gap:12px;padding:3px 0;border-bottom:1px solid #2a2a30;font-size:0.88rem"><span style="color:#9a9aa5">${esc(label)}</span><b style="color:#e8e8ee;text-align:right">${esc(value)}</b></div>`;
  }

  function show(rec, girlId) {
    if (!rec) return;
    // Tear down any existing dossier first.
    const old = document.getElementById('death-dossier-backdrop');
    if (old) old.remove();

    const fs = rec.finalStats || {};
    const t = rec.tally || {};
    const flags = [];
    if (fs.isNugget) flags.push('🪓 nugget');
    else if (fs.limbsRemoved) flags.push(`🪓 ${fs.limbsRemoved} limb${fs.limbsRemoved === 1 ? '' : 's'} taken`);
    if (fs.ownershipMarks) flags.push(`🏷️ ${fs.ownershipMarks} owner-mark${fs.ownershipMarks === 1 ? '' : 's'}`);
    if (fs.addicted) flags.push('💊 addicted');

    const backdrop = document.createElement('div');
    backdrop.id = 'death-dossier-backdrop';
    backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.82);z-index:9999;display:flex;align-items:center;justify-content:center;padding:24px;overflow:auto;';
    backdrop.innerHTML = `
      <div style="background:#141418;border:1px solid #3a2a2a;border-radius:12px;max-width:560px;width:100%;box-shadow:0 16px 60px rgba(0,0,0,.7);overflow:hidden">
        <div style="background:linear-gradient(90deg,#3a1414,#1a1a1f);padding:14px 18px;border-bottom:1px solid #4a2020">
          <div style="font-size:1.15rem;font-weight:700;color:#ff8a8a">☠️ ${esc(rec.name)} is dead</div>
          <div style="font-size:0.82rem;color:#9a9aa5;margin-top:2px">${esc(rec.archetype || '')}${rec.affect ? ' · ' + esc(rec.affect) : ''} · age ${esc(rec.ageAtDeath)} · ${esc(rec.cause)}</div>
        </div>
        <div style="display:flex;gap:14px;padding:16px 18px;flex-wrap:wrap">
          ${rec.finalImageUrl ? `<img src="${esc(rec.finalImageUrl)}" alt="${esc(rec.name)}" style="width:160px;max-width:40%;border-radius:8px;object-fit:cover;border:1px solid #333" onerror="this.style.display='none'"/>` : ''}
          <div style="flex:1;min-width:220px">
            <div style="color:#c8a0ff;font-size:0.8rem;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Final stats</div>
            ${row('Stockholm bond', 'L' + fs.bondLevel)}
            ${row('Health / Stamina', `${fs.health} / ${fs.stamina}`)}
            ${row('Bruises · High', `${fs.bruises} · ${fs.high}`)}
            ${row('Final mood', fs.mood)}
            ${flags.length ? row('Marks', flags.join(' · ')) : ''}
          </div>
        </div>
        <div style="padding:0 18px 8px">
          <div style="color:#c8a0ff;font-size:0.8rem;text-transform:uppercase;letter-spacing:.05em;margin:6px 0 4px">Her history</div>
          <div style="max-height:200px;overflow-y:auto;padding-right:4px">
            ${[
              (t.totalEarned > 0) ? row('💰 Total earned', `$${t.totalEarned.toLocaleString()}`) : '',
              rec.captureLocation ? row('Captured at', rec.captureLocation) : '',
              rec.longestHeld ? row('Held longest at', rec.longestHeld) : '',
              (rec.daysHeld > 0) ? row('Days held', rec.daysHeld) : '',
              (t.films > 0) ? row('🎬 Films made', `${t.films} ($${(t.filmEarnings || 0).toLocaleString()})`) : '',
              (t.johns > 0) ? row('👥 Johns serviced', t.johns) : '',
              (t.friendVisits > 0) ? row('🩸 Friend visits', t.friendVisits) : '',
              (t.playerActs > 0) ? row('✊ Player acts on her', t.playerActs) : '',
              (t.pregnancies > 0) ? row('🤰 Pregnancies', t.pregnancies) : '',
              (t.births > 0) ? row('🍼 Births', t.births) : '',
              (t.milkProduced > 0) ? row('🥛 Milk produced', `${t.milkProduced}L`) : '',
              (t.chatTurns > 0) ? row('💬 Chat turns', t.chatTurns) : ''
            ].filter(Boolean).join('') || `<div class="small muted">No notable history.</div>`}
          </div>
        </div>
        <div style="display:flex;gap:8px;padding:14px 18px;border-top:1px solid #2a2a30">
          <button id="dossier-dispose" style="flex:1;padding:9px;background:#7a1f1f;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:600">⚱️ Dispose / claim trophy →</button>
          <button id="dossier-close" style="padding:9px 16px;background:#26262c;color:#ccc;border:1px solid #3a3a42;border-radius:6px;cursor:pointer">Keep the body</button>
        </div>
        <div style="padding:0 18px 14px;font-size:0.76rem;color:#777">Her body stays in the hold for postmortem use — fresh pays the most, value drops as she rots (~5 game days). This dossier is saved + attached to her trophy at disposal.</div>
      </div>
    `;
    document.body.appendChild(backdrop);

    const close = () => backdrop.remove();
    backdrop.querySelector('#dossier-close').onclick = close;
    backdrop.querySelector('#dossier-dispose').onclick = () => { close(); if (girlId) location.hash = '#dispose?girl=' + girlId; };
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  }

  window.DMTHDeathDossier = Object.freeze({ show });
})();
