# Open models for حلبة النغالة

Both prepared GLBs use CC0 1.0 assets by Quaternius. Original links and the included CC0 dedication are kept with the source.

- `figures.glb` uses the adult Superhero Male from Universal Base Characters Standard. The imported copy is the rig-preserving `character.glb` mirrored by `programasweights/avatar`, SHA-256 `d6f3b64cab629f6ddca9ba063811aeffd3663a8a4e49ade47cd9505dc2bbd70f`. The preview uses the original weights for the sleeved tunic and adds separate trousers, hem and boots. All parts bind to the matching animated rig. [Original pack](https://quaternius.com/packs/universalbasecharacters.html) · [Mirror provenance](https://github.com/programasweights/avatar/blob/main/ASSETS.md)
- `weapons.glb` uses the original FBX downloads from the Modular Weapons Pack. The build brings each mesh to the size of the game’s hand, keeps its material colors, and names the prop with its duel ID. Exact author filenames and grip positions are in `../tools/prepare-weapons.py`. [Original pack](https://quaternius.com/packs/medievalweapons.html)

The WebP catalog images render the gameplay models locally. To regenerate them, build the preview and run `node tools/render-portraits.mjs <build-directory> assets` from this expansion.
