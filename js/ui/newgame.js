// DUNGEON MASTER: THE HUNT — new game setup page.

(function () {
  'use strict';

  // dropdown option sets for the new-game character creator. These feed the
  // player's avatar (state.playerCharacter), which gets woven into the images he appears in with
  // the girls + dressed by his in-game clothing store.
  // STANDING RULE : character-creator selections are DROPDOWNS with a full
  // menagerie / complete range — ALL the ages, a whole zoo of builds, broad hair + race sets.
  // Applies to every player-attribute selection built going forward (clothing store etc.).
  const SEX   = [['male', 'Male'], ['female', 'Female']];
  const HAIR  = ['shaved bald', 'buzzcut', 'crew cut', 'short cropped', 'short messy', 'slicked back', 'undercut', 'medium tousled', 'shoulder-length', 'long hair', 'man-bun', 'top knot', 'ponytail', 'braided', 'dreadlocks', 'cornrows', 'mohawk', 'mullet', 'balding', 'receding hairline', 'grey / silver', 'salt-and-pepper', 'bald with full beard', 'curly afro'];
  // Hair COLOR is its own selector (style above is shape, this is shade) — full menagerie
  // per the standing dropdown rule. Woven into the player's image tokens alongside style so
  // he renders with the right hair, and the custom-detail field still lets him add anything exotic.
  const HAIRCOLOR = ['black', 'jet black', 'dark brown', 'brown', 'light brown', 'dirty blonde', 'blonde', 'platinum blonde', 'strawberry blonde', 'auburn', 'red', 'ginger', 'copper', 'chestnut', 'grey', 'silver', 'white', 'salt-and-pepper', 'dyed pink', 'dyed blue', 'dyed purple', 'dyed green', 'dyed teal', 'bleached', 'highlighted', 'ombre', 'two-tone'];
  const BUILD = ['skinny', 'lean', 'slim', 'wiry', 'lanky', 'average', 'stocky', 'dad-bod', 'soft / pudgy', 'athletic', 'toned', 'muscular', 'heavily muscled', 'bodybuilder', 'hulking', 'broad-shouldered', 'barrel-chested', 'heavyset', 'big beer gut', 'fat', 'obese', 'gaunt', 'short and squat', 'tall and rangy'];
  const RACE  = ['white', 'black', 'latino / hispanic', 'east asian', 'southeast asian', 'south asian / indian', 'middle-eastern', 'north african', 'native american', 'pacific islander', 'mixed'];
  // ALL the ages — every adult age 18 through 80 .
  const AGES  = Array.from({ length: 80 - 18 + 1 }, (_, i) => 18 + i);

  const opt = (v, label, sel) => `<option value="${v}"${sel ? ' selected' : ''}>${label || v}</option>`;
  const optsFrom = (arr, def) => arr.map(v => Array.isArray(v) ? opt(v[0], v[1], v[0] === def) : opt(v, v, v === def)).join('');

  function render(el) {
    el.innerHTML = `
      <div class="panel">
        <h2>Start a new game</h2>
        <p class="small">The game saves to this browser's IndexedDB. You can export / import saves in Settings.</p>

        <div class="settings-section">
          <label class="field"><span>What your girls call you</span>
            <input type="text" id="player-name" maxlength="24" placeholder="Master" value="Master" />
          </label>
          <label class="field"><span>Mode</span>
            <select id="mode">
              <option value="normal">Normal — earn it from scratch</option>
              <option value="sandbox">Sandbox — everything unlocked, $999,999</option>
            </select>
          </label>
          <label class="field"><span>Include Unity as starter captive</span>
            <input type="checkbox" id="unity" checked />
          </label>
        </div>

        <h3 style="margin-top:14px">Your character</h3>
        <p class="small">This is YOU — it gets woven into every image you appear in with the girls. Buy more clothes for your character in-game later.</p>
        <div class="settings-section">
          <label class="field"><span>Sex</span><select id="pc-sex">${optsFrom(SEX, 'male')}</select></label>
          <label class="field"><span>Age</span><select id="pc-age">${optsFrom(AGES, 35)}</select></label>
          <label class="field"><span>Race</span><select id="pc-race">${optsFrom(RACE, 'white')}</select></label>
          <label class="field"><span>Body build</span><select id="pc-build">${optsFrom(BUILD, 'average')}</select></label>
          <label class="field"><span>Hair style</span><select id="pc-hair">${optsFrom(HAIR, 'short cropped')}</select></label>
          <label class="field"><span>Hair color</span><select id="pc-haircolor">${optsFrom(HAIRCOLOR, 'brown')}</select></label>
          <label class="field"><span>Starting clothing</span>
            <input type="text" id="pc-clothing" maxlength="80" placeholder="dirty white tank top and jeans" value="plain dark t-shirt and jeans" />
            <span class="small muted">Keep it short — a few words (max 80 chars). Long write-ups get cut off.</span>
          </label>
          <label class="field"><span>One custom detail (optional)</span>
            <input type="text" id="pc-custom" maxlength="80" placeholder="e.g. heavy tattooed forearms, scruffy beard" />
            <span class="small muted">One extra detail, kept short (max 80 chars). Obscure or baroque write-ins can ruin the image generation — keep it simple and concrete.</span>
          </label>
        </div>

        <div class="btn-row">
          <button id="start" class="btn-primary">Start</button>
          <a href="#dashboard" class="btn-small">Cancel</a>
        </div>

        <div id="warn" class="warn small"></div>
      </div>
    `;

    const existing = window.DMTHGame.state.current;
    if (existing && existing.createdAt) {
      el.querySelector('#warn').innerHTML = `⚠️ A save exists from ${new Date(existing.createdAt).toLocaleString()}. Starting a new game will OVERWRITE it. <button id="export-first" class="btn-small">Export current save first</button>`;
      el.querySelector('#export-first').onclick = async () => {
        const data = await window.DMTHStorage.exportAll();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ssd-save-${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.json`;
        a.click();
        URL.revokeObjectURL(url);
      };
    }

    el.querySelector('#start').onclick = async () => {
      const mode = el.querySelector('#mode').value;
      const includeUnity = el.querySelector('#unity').checked;
      const playerName = (el.querySelector('#player-name').value || 'Master').trim() || 'Master';
      // collect the avatar from the creator (text inputs hard-clamped to 80
      // chars by maxlength AND re-trimmed/sliced here as a belt-and-suspenders length guard).
      const playerCharacter = {
        sex:   el.querySelector('#pc-sex').value,
        age:   parseInt(el.querySelector('#pc-age').value, 10) || 35,
        race:  el.querySelector('#pc-race').value,
        build: el.querySelector('#pc-build').value,
        hair:  el.querySelector('#pc-hair').value,
        hairColor: el.querySelector('#pc-haircolor').value,
        startClothing: (el.querySelector('#pc-clothing').value || '').trim().slice(0, 80) || 'a plain dark t-shirt and jeans',
        custom:        (el.querySelector('#pc-custom').value || '').trim().slice(0, 80)
      };
      await window.DMTHGame.state.load();  // ensure state is initialized
      await window.DMTHGame.bootstrap.newGame({ mode, includeUnity });
      window.DMTHGame.state.setPlayerName(playerName);   // what the girls call the player
      window.DMTHGame.state.setPlayerCharacter(playerCharacter);   // his avatar for the images
      window.DMTHRouter.go('dashboard');
    };
  }

  window.DMTHRouter.register('newgame', render);
})();
