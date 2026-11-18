'use strict';
/* Global configuration: asset paths and environment flags. */
/** The recorded soundtrack: one original theme for each moment of the game. */
const MUSIC = {
  menu: 'assets/audio/music/menu.m4a',
  run: 'assets/audio/music/run.m4a',
  boss: 'assets/audio/music/boss.m4a',
  win: 'assets/audio/music/win.m4a',
  lose: 'assets/audio/music/lose.m4a',
};
/** Music bed levels (before the player's music setting): quiet behind the fight, a little louder for the boss. */
const MUSIC_VOL = { menu: 0.4, run: 0.22, runPeak: 0.1, boss: 0.4, sting: 0.55 };
/** Which theme belongs to a game state: a boss overrides the run; everything outside a run is the menu. */
function musicFor(state, boss) {
  const run = state === 'play' || state === 'cards' || state === 'paused' || state === 'lab';
  return run ? (boss ? 'boss' : 'run') : 'menu';
}
/** Folder scanned for optional .glb/.gltf replacement models (see assets/models/README.md). */
const MODEL_DIR = 'assets/models/';
/** True when the game runs inside a Claude/Anthropic preview sandbox. */
const IS_SANDBOX = /claude|anthropic/.test(location.hostname);
/** Debug "lab" (test tools): on in the sandbox, with #lab in the URL, or after the developer code (js/ui/dev.js). */
let LAB = IS_SANDBOX || (location.pathname.indexOf('/test/') >= 0 && location.hash === '#lab');
/** This build's version: the ?v= stamp tools/bump-version.py puts on every script (0 when run unstamped). */
const BUILD =
  +((document.querySelector('script[src*="config.js"]') || {}).src || '').replace(/.*[?&]v=(\d+).*/, '$1') || 0;
