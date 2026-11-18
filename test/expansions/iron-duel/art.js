'use strict';

const FORGE_TROUSER_TINT = [0xe0ecf1, 0xd8b4a1, 0xc7cfb2, 0xcabca8];

function forgeDress(f, id) {
  const tint = FORGE_TROUSER_TINT[id];
  if (f.forgeStyle === id || tint === undefined) return;
  const figure = forgeAttachFigure(f);
  f.forgeStyle = id;
  for (const mesh of figure.pieces) {
    const part = mesh.material.name;
    if (part === 'Trousers') mesh.material.color.setHex(tint);
    else if (part.startsWith('Skin')) mesh.material.color.setHex(0xb17d62);
  }
  for (const mesh of [...figure.pieces, ...figure.legacy]) mesh.visible = forgeFighterVisible(mesh);
}

function forgeLight(scene) {
  const warm = new THREE.DirectionalLight(0xffb17b, 0.52);
  warm.position.set(-8, 6, -9);
  const cool = new THREE.DirectionalLight(0xa0bbec, 0.43);
  cool.position.set(8, 8, 9);
  scene.add(warm, cool);
  const brass = new THREE.MeshStandardMaterial({ color: 0x875232, metalness: 0.62, roughness: 0.46 });
  const band = new THREE.Mesh(new THREE.TorusGeometry(9.64, 0.045, 5, 72), brass);
  band.rotation.x = -Math.PI / 2;
  band.position.y = 0.02;
  scene.add(band);
  const teeth = new THREE.InstancedMesh(new THREE.BoxGeometry(0.13, 0.03, 0.27), brass, 32);
  const pose = new THREE.Object3D();
  for (let i = 0; i < 32; i++) {
    const a = i * Math.PI / 16;
    pose.position.set(9.37 * Math.sin(a), 0.022, 9.37 * Math.cos(a));
    pose.rotation.y = a;
    pose.updateMatrix();
    teeth.setMatrixAt(i, pose.matrix);
  }
  scene.add(teeth);
}

let forgeGroundMark;

function forgeGroundShadow(fighter) {
  const scene = fighter.root.parent;
  if (!scene?.isScene) return;
  if (!fighter.forgeShadow) {
    if (!forgeGroundMark) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 64;
      const g = canvas.getContext('2d');
      const alpha = g.createRadialGradient(32, 32, 4, 32, 32, 31);
      alpha.addColorStop(0, 'rgba(9, 7, 10, .77)');
      alpha.addColorStop(.52, 'rgba(9, 7, 10, .46)');
      alpha.addColorStop(1, 'rgba(9, 7, 10, 0)');
      g.fillStyle = alpha;
      g.fillRect(0, 0, 64, 64);
      forgeGroundMark = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.12),
        new THREE.MeshBasicMaterial({map: arenaTex(canvas), transparent: true, depthWrite: false}));
      forgeGroundMark.rotation.x = -Math.PI / 2;
    }
    fighter.forgeShadow = forgeGroundMark.clone();
    scene.add(fighter.forgeShadow);
  }
  fighter.forgeShadow.position.set(fighter.x, .014, fighter.z);
  fighter.forgeShadow.rotation.z = -fighter.face;
  fighter.forgeShadow.scale.setScalar(fighter.act === 'dead' ? 1.22 : 1);
  fighter.forgeShadow.visible = fighter.root.visible && !fighter.gone;
}

function forgeFloorMaterial() {
  const canvas = document.createElement('canvas'), relief = document.createElement('canvas');
  const size = 512;
  canvas.width = canvas.height = relief.width = relief.height = size;
  const g = canvas.getContext('2d'), h = relief.getContext('2d');
  g.fillStyle = '#211e25';
  g.fillRect(0, 0, size, size);
  h.fillStyle = '#252525';
  h.fillRect(0, 0, size, size);
  let seed = 12304;
  const next = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let row = 0; row < 12; row++) {
    for (let col = -1; col < 8; col++) {
      const x = col * 73 + (row % 2) * 36, y = row * 44;
      const shade = Math.round(36 + next() * 22);
      const stone = ctx => {
        ctx.beginPath();
        ctx.moveTo(x + 4, y + 5);
        ctx.lineTo(x + 67, y + 2);
        ctx.lineTo(x + 70, y + 8);
        ctx.lineTo(x + 68, y + 38);
        ctx.lineTo(x + 63, y + 42);
        ctx.lineTo(x + 5, y + 40);
        ctx.lineTo(x + 2, y + 34);
        ctx.closePath();
        ctx.fill();
      };
      const tone = g.createLinearGradient(x, y, x + 36, y + 44);
      tone.addColorStop(0, `rgb(${shade + 14},${shade + 7},${shade + 4})`);
      tone.addColorStop(1, `rgb(${shade},${shade - 4},${shade - 2})`);
      g.fillStyle = tone;
      stone(g);
      h.fillStyle = '#a7a7a7';
      stone(h);
    }
  }
  for (let i = 0; i < 7500; i++) {
    const x = next() * size, y = next() * size;
    g.fillStyle = i % 2 ? '#dea27118' : '#0f101632';
    h.fillStyle = i % 2 ? '#eeeeee16' : '#05050522';
    g.fillRect(x, y, 1 + next() * 2, 1);
    h.fillRect(x, y, 2, 1);
  }
  const repeats = [3.5, 3.5];
  const bumpMap = arenaTex(relief, repeats);
  bumpMap.encoding = THREE.LinearEncoding;
  return { map: arenaTex(canvas, repeats), bumpMap, bumpScale: .135, metalness: .07, roughness: .79 };
}
