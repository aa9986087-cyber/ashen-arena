'use strict';
/* Global configuration: asset paths and environment flags. */
/** Folder that holds the background music file. */
const MUSIC_URL = 'assets/audio/music.m4a';
/** Folder scanned for optional .glb/.gltf replacement models (see assets/models/README.md). */
const MODEL_DIR = 'assets/models/';
/** True when the game runs inside a Claude/Anthropic preview sandbox. */
const IS_SANDBOX = /claude|anthropic/.test(location.hostname);
/** Debug "lab" (test tools) is enabled in the sandbox or with #lab in the URL. */
const LAB = IS_SANDBOX || location.hash === '#lab';
