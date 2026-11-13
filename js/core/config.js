'use strict';
/* Global configuration: asset paths and environment flags. */
/** Folder that holds the background music file. */
const MUSIC_URL = 'assets/audio/music.m4a';
/** Folder scanned for optional .glb/.gltf replacement models (see assets/models/README.md). */
const MODEL_DIR = 'assets/models/';
/** True when the game runs inside a Claude/Anthropic preview sandbox. */
const IS_SANDBOX = /claude|anthropic/.test(location.hostname);
/** Debug "lab" (test tools): on in the sandbox, with #lab in the URL, or after the developer code (js/ui/dev.js). */
let LAB = IS_SANDBOX || location.hash === '#lab';
/** This build's version: the ?v= stamp tools/bump-version.py puts on every script (0 when run unstamped). */
const BUILD =
  +((document.querySelector('script[src*="config.js"]') || {}).src || '').replace(/.*[?&]v=(\d+).*/, '$1') || 0;
