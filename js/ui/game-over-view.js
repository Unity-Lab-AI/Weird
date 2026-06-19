// DUNGEON MASTER: THE HUNT — GAME OVER screen (arrest → jail).
// The lose condition. Shows how the run ended + a final tally, and the only way forward is a
// fresh game. Reached via location.hash = '#game-over' set by the arrest system.

(function () {
  'use strict';

  function render(el) {
    const s = window.DMTHGame.state.current;
    const go = s && s.gameOver;
    if (!go) {
      // No game-over recorded — bounce to dashboard.
      el.innerHTML = `<div class="panel"><p>No game over recorded. <a href="#dashboard">Dashboard</a></p></div>`;
      return;
    }
    const f = go.finalStats || {};
    el.innerHTML = `
      <div class="panel" style="border:2px solid #c0392b;text-align:center">
        <h1 style="color:#c0392b;letter-spacing:2px">🚨 BUSTED 🚨</h1>
        <h2 style="color:#e74c3c">GAME OVER — you're going to prison</h2>
        <p class="small" style="max-width:640px;margin:12px auto;line-height:1.5">${escapeHtml(go.reason)}</p>
      </div>

      <div class="panel">
        <h2>Final tally</h2>
        <div class="stat-row"><span>💰 Cash at the end</span><b>$${(f.money || 0).toLocaleString()}</b></div>
        <div class="stat-row"><span>🚨 WANTED at the end</span><b class="warn">${f.wanted || 0}/100</b></div>
        <div class="stat-row"><span>⛓️ Captives held</span><b>${f.captives || 0}</b></div>
        <div class="stat-row"><span>☠️ Bodies in holds when raided</span><b class="warn">${f.corpsesHeld || 0}</b></div>
        <div class="stat-row"><span>⚱️ Total disposed over the run</span><b>${f.disposed || 0}</b></div>
        <div class="stat-row"><span>🎬 Films that earned</span><b>${f.filmsSold || 0}</b></div>
        <div class="stat-row"><span>💵 Lifetime film income</span><b>$${Math.round(f.lifetimeFilm || 0).toLocaleString()}</b></div>
        <div class="stat-row"><span>⏱️ Ticks survived</span><b>${f.ticks || 0}</b></div>
      </div>

      <div class="panel" style="text-align:center">
        <p class="small muted">The dungeon's gone cold. Everything you built is evidence now.</p>
        <button id="go-newgame" class="btn-primary" data-tooltip="Wipe the slate and start a fresh operation.">Start a new operation</button>
      </div>
    `;
    const btn = el.querySelector('#go-newgame');
    if (btn) btn.onclick = () => {
      if (window.DMTHRouter && window.DMTHRouter.go) window.DMTHRouter.go('newgame');
      else window.location.hash = '#newgame';
    };
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  window.DMTHRouter.register('game-over', render);
})();
