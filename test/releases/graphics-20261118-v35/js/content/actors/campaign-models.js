'use strict';
const CAMPAIGN_BOSS_MODELS = {
  "boss1": {
    "file": "../../../assets/models/campaign/sand.glb",
    "version": "607a60d4d2af",
    "height": 3.9,
    "yaw": 0,
    "locomotionYaw": 0,
    "groundOffset": 0,
    "clips": {
      "special": "special"
    }
  },
  "boss2": {
    "file": "../../../assets/models/campaign/knight.glb",
    "version": "2240e1c6f575",
    "height": 4.2,
    "yaw": 0,
    "locomotionYaw": 0,
    "groundOffset": 0,
    "clips": {
      "special": "special"
    }
  },
  "boss3": {
    "file": "../../../assets/models/campaign/iron.glb",
    "version": "2a83656d8f98",
    "height": 4.15,
    "yaw": 0,
    "locomotionYaw": 0,
    "groundOffset": 0,
    "clips": {
      "special": "special"
    }
  },
  "boss4": {
    "file": "../../../assets/models/campaign/frost.glb",
    "version": "493482abfe7d",
    "height": 3.75,
    "yaw": 0,
    "locomotionYaw": 0,
    "groundOffset": 0,
    "clips": {
      "special": "special"
    }
  },
  "boss5": {
    "file": "../../../assets/models/campaign/fire.glb",
    "version": "09a4ddc2de75",
    "height": 4.05,
    "yaw": 0,
    "locomotionYaw": 0,
    "groundOffset": 0,
    "clips": {
      "special": "special"
    }
  },
  "boss6": {
    "file": "../../../assets/models/campaign/grave.glb",
    "version": "8f81026ee1e8",
    "height": 3.85,
    "yaw": 0,
    "locomotionYaw": 0,
    "groundOffset": 0,
    "clips": {
      "special": "special"
    }
  }
};
for (const asset of Object.values(CAMPAIGN_BOSS_MODELS)) asset.file = new URL(asset.file, document.currentScript.src).href;
