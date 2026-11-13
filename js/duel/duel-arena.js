'use strict';
/* Sword duel — the arena: «حلبة النغالة». A flagstone ring with the Vamos crest at its heart, a stone wall hung with
   banners, tiered stands full of spectators, braziers on pillars and a night sky. Every texture is drawn on a canvas
   here (no image files to download). */
const ARENA_NAME = 'حلبة النغالة';
const ARENA_FONT = "'Lalezar', 'Tajawal', sans-serif";
function arenaTex(c, rep) {
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  t.anisotropy = 4;
  if (rep) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rep[0], rep[1]);
  }
  return t;
}
function arenaCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}
/** Fine grain over a whole canvas: dirt specks and soft blotches. */
function arenaGrain(x, w, h, n, a) {
  for (let i = 0; i < n; i++) {
    x.fillStyle =
      Math.random() < 0.5 ? `rgba(0,0,0,${Math.random() * a})` : `rgba(255,240,220,${Math.random() * a * 0.5})`;
    const s = Math.random() < 0.97 ? 1 + Math.random() * 2 : 4 + Math.random() * 10;
    x.fillRect(Math.random() * w, Math.random() * h, s, s);
  }
}
/** The Vamos crest: a shield with a V over two crossed swords, the name under it. */
function arenaCrest(x, cx, cy, s, gold, dark) {
  x.save();
  x.translate(cx, cy);
  x.scale(s, s);
  // crossed swords behind the shield
  for (const d of [-1, 1]) {
    x.save();
    x.rotate(d * 0.72);
    x.fillStyle = gold;
    x.fillRect(-7, -150, 14, 250);
    x.beginPath();
    x.moveTo(-7, -150);
    x.lineTo(0, -178);
    x.lineTo(7, -150);
    x.fill();
    x.fillRect(-34, 92, 68, 12);
    x.fillRect(-6, 104, 12, 34);
    x.beginPath();
    x.arc(0, 146, 11, 0, Math.PI * 2);
    x.fill();
    x.restore();
  }
  // shield
  const shield = () => {
    x.beginPath();
    x.moveTo(-82, -96);
    x.lineTo(82, -96);
    x.lineTo(82, 10);
    x.quadraticCurveTo(80, 82, 0, 118);
    x.quadraticCurveTo(-80, 82, -82, 10);
    x.closePath();
  };
  shield();
  x.fillStyle = dark;
  x.fill();
  x.lineWidth = 12;
  x.strokeStyle = gold;
  x.stroke();
  shield();
  x.lineWidth = 3;
  x.strokeStyle = 'rgba(0,0,0,0.5)';
  x.stroke();
  // the V
  x.fillStyle = gold;
  x.beginPath();
  x.moveTo(-58, -72);
  x.lineTo(-24, -72);
  x.lineTo(0, 22);
  x.lineTo(24, -72);
  x.lineTo(58, -72);
  x.lineTo(14, 80);
  x.lineTo(-14, 80);
  x.closePath();
  x.fill();
  x.restore();
}
/* ---- the floor: worn flagstones, darker toward the wall, the crest in the middle */
function arenaFloorTex() {
  const [c, x] = arenaCanvas(1024, 1024);
  x.fillStyle = '#3d3632';
  x.fillRect(0, 0, 1024, 1024);
  const N = 8,
    S = 1024 / N;
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const off = (j % 2) * S * 0.5,
        v = 72 + Math.random() * 34,
        tint = Math.random() * 10 - 5;
      x.fillStyle = `rgb(${v + 10 + tint},${v + 3},${v - 6 - tint})`;
      const px = i * S + off + 3,
        py = j * S + 3;
      x.fillRect(px, py, S - 6, S - 6);
      if (off && i === N - 1) x.fillRect(px - 1024, py, S - 6, S - 6);
      // edge wear and a highlight on the upper lip
      x.fillStyle = 'rgba(0,0,0,0.18)';
      x.fillRect(px, py + S - 12, S - 6, 6);
      x.fillStyle = 'rgba(255,240,215,0.06)';
      x.fillRect(px, py, S - 6, 4);
      // a crack now and then
      if (Math.random() < 0.35) {
        x.strokeStyle = 'rgba(20,14,12,0.55)';
        x.lineWidth = 1.5;
        x.beginPath();
        let cx = px + Math.random() * S,
          cy = py + Math.random() * S;
        x.moveTo(cx, cy);
        for (let k = 0; k < 6; k++) {
          cx += (Math.random() - 0.5) * 40;
          cy += (Math.random() - 0.5) * 40;
          x.lineTo(cx, cy);
        }
        x.stroke();
      }
    }
  arenaGrain(x, 1024, 1024, 26000, 0.16);
  // old dark stains of past fights
  for (let i = 0; i < 14; i++) {
    const g = x.createRadialGradient(0, 0, 0, 0, 0, 60 + Math.random() * 60),
      px = Math.random() * 1024,
      py = Math.random() * 1024;
    g.addColorStop(0, 'rgba(40,10,6,0.28)');
    g.addColorStop(1, 'rgba(40,10,6,0)');
    x.save();
    x.translate(px, py);
    x.fillStyle = g;
    x.fillRect(-130, -130, 260, 260);
    x.restore();
  }
  return arenaTex(c, [4, 4]);
}
function arenaEmblemTex() {
  const [c, x] = arenaCanvas(1024, 1024);
  const gold = '#c9a24a';
  x.translate(512, 512);
  // rings
  x.strokeStyle = gold;
  x.lineWidth = 18;
  x.beginPath();
  x.arc(0, 0, 490, 0, Math.PI * 2);
  x.stroke();
  x.lineWidth = 6;
  x.beginPath();
  x.arc(0, 0, 452, 0, Math.PI * 2);
  x.stroke();
  x.beginPath();
  x.arc(0, 0, 330, 0, Math.PI * 2);
  x.stroke();
  // the arena's name around the ring (top) and VAMOS (bottom), letter by letter on the circle
  x.fillStyle = gold;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.font = '64px ' + ARENA_FONT;
  const ring = (txt, a0, dir, r) => {
    const w = x.measureText(txt).width,
      span = w / r;
    // Arabic must keep its joined shapes: draw it as one word on a gently curved path made of slices
    const [tc, tx] = arenaCanvas(Math.ceil(w) + 20, 100);
    tx.fillStyle = gold;
    tx.font = x.font;
    tx.textAlign = 'center';
    tx.textBaseline = 'middle';
    tx.fillText(txt, tc.width / 2, 50);
    const slices = 40;
    for (let k = 0; k < slices; k++) {
      const sx = (k / slices) * tc.width,
        sw = tc.width / slices + 1,
        a = a0 + dir * (k / slices - 0.5) * span;
      x.save();
      x.rotate(a);
      x.translate(0, -dir * r);
      x.drawImage(tc, sx, 0, sw, 100, -sw / 2, -50, sw, 100);
      x.restore();
    }
  };
  ring(ARENA_NAME, 0, 1, 392);
  x.font = '60px ' + ARENA_FONT;
  ring('VAMOS', 0, -1, 392);
  // dots between the words
  for (const a of [Math.PI / 2, -Math.PI / 2]) {
    x.beginPath();
    x.arc(Math.cos(a) * 392, Math.sin(a) * 392, 12, 0, Math.PI * 2);
    x.fill();
  }
  arenaCrest(x, 0, -10, 1.55, gold, 'rgba(70,10,10,0.92)');
  // worn: knock holes in the paint
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 9000; i++) {
    x.fillStyle = `rgba(0,0,0,${Math.random() * 0.6})`;
    const s = 1 + Math.random() * 4;
    x.fillRect(Math.random() * 1024, Math.random() * 1024, s, s);
  }
  x.globalCompositeOperation = 'source-over';
  return arenaTex(c);
}
/* ---- wall, banners, stands, sky */
function arenaStoneTex(w, h, rows, base) {
  const [c, x] = arenaCanvas(w, h);
  x.fillStyle = '#1c1714';
  x.fillRect(0, 0, w, h);
  const bh = h / rows;
  for (let r = 0; r < rows; r++) {
    let px = r % 2 ? -bh : 0;
    while (px < w) {
      const bw = bh * (1.6 + Math.random() * 1.2),
        v = base + Math.random() * 22;
      x.fillStyle = `rgb(${v + 8},${v},${v - 8})`;
      x.fillRect(px + 2, r * bh + 2, bw - 4, bh - 4);
      x.fillStyle = 'rgba(0,0,0,0.22)';
      x.fillRect(px + 2, r * bh + bh - 8, bw - 4, 6);
      px += bw;
    }
  }
  arenaGrain(x, w, h, w * h * 0.03, 0.2);
  return c;
}
function arenaBannerTex(kind) {
  const [c, x] = arenaCanvas(256, 640);
  const red = kind === 0,
    gold = '#d4ac52';
  x.fillStyle = red ? '#6e0d0d' : '#141014';
  x.fillRect(0, 0, 256, 640);
  // cloth folds
  for (let i = 0; i < 256; i += 2) {
    x.fillStyle = `rgba(0,0,0,${0.18 * (0.5 + 0.5 * Math.sin(i / 14))})`;
    x.fillRect(i, 0, 2, 640);
  }
  x.strokeStyle = gold;
  x.lineWidth = 8;
  x.strokeRect(14, 14, 228, 560);
  // swallow-tail bottom
  x.globalCompositeOperation = 'destination-out';
  x.beginPath();
  x.moveTo(0, 640);
  x.lineTo(128, 560);
  x.lineTo(256, 640);
  x.fill();
  x.globalCompositeOperation = 'source-over';
  x.fillStyle = gold;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  if (red) {
    arenaCrest(x, 128, 250, 0.82, gold, '#3a0606');
    x.font = '58px ' + ARENA_FONT;
    x.fillText('VAMOS', 128, 455);
  } else {
    x.font = '74px ' + ARENA_FONT;
    x.save();
    x.translate(128, 300);
    x.rotate(-Math.PI / 2);
    x.fillText(ARENA_NAME, 0, 0);
    x.restore();
    x.font = '40px ' + ARENA_FONT;
    x.fillText('VAMOS', 128, 520);
  }
  arenaGrain(x, 256, 640, 4000, 0.18);
  return arenaTex(c);
}
function arenaCrowdTex() {
  const [c, x] = arenaCanvas(1024, 128);
  x.fillStyle = '#100c0e';
  x.fillRect(0, 0, 1024, 128);
  const cloth = ['#3a1414', '#1e2433', '#2c2a1c', '#2a1830', '#33261c', '#4a1010', '#18281e'];
  // two rows of spectators: shoulders and heads, some with arms raised
  for (const [row, y0, sc] of [
    [0, 70, 0.85],
    [1, 112, 1],
  ])
    for (let px = (row ? 10 : 0) + Math.random() * 6; px < 1024; px += 24 * sc + Math.random() * 8) {
      const skin = 40 + Math.random() * 40;
      x.fillStyle = cloth[(Math.random() * cloth.length) | 0];
      x.beginPath();
      x.ellipse(px, y0, 12 * sc, 22 * sc, 0, Math.PI, 0);
      x.fill();
      if (Math.random() < 0.18) x.fillRect(px + 8 * sc, y0 - 46 * sc, 5 * sc, 30 * sc);
      x.fillStyle = `rgb(${skin + 20},${skin + 6},${skin})`;
      x.beginPath();
      x.arc(px, y0 - 28 * sc, 8 * sc, 0, Math.PI * 2);
      x.fill();
    }
  arenaGrain(x, 1024, 128, 6000, 0.25);
  return arenaTex(c, [6, 1]);
}
function arenaSky() {
  const [c, x] = arenaCanvas(32, 512);
  const g = x.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#05040b');
  g.addColorStop(0.42, '#120c22');
  g.addColorStop(0.5, '#3a1a20');
  g.addColorStop(0.53, '#1a1014');
  g.addColorStop(1, '#0a0708');
  x.fillStyle = g;
  x.fillRect(0, 0, 32, 512);
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(80, 32, 16),
    new THREE.MeshBasicMaterial({ map: arenaTex(c), side: THREE.BackSide, fog: false })
  );
  // stars
  const n = 700,
    p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2,
      e = 0.12 + Math.random() * 1.3;
    p[i * 3] = Math.cos(a) * Math.cos(e) * 75;
    p[i * 3 + 1] = Math.sin(e) * 75;
    p[i * 3 + 2] = Math.sin(a) * Math.cos(e) * 75;
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const stars = new THREE.Points(
    sg,
    new THREE.PointsMaterial({
      color: 0xd8dcff,
      size: 1.6,
      sizeAttenuation: false,
      fog: false,
      transparent: true,
      opacity: 0.8,
    })
  );
  return [sky, stars];
}
/** The name over the main gate: a dark wooden board in an arch, gilded letters. */
function arenaGate(s, stone) {
  const [c, x] = arenaCanvas(1024, 256);
  const g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#2a1a10');
  g.addColorStop(1, '#170d08');
  x.fillStyle = g;
  x.fillRect(0, 0, 1024, 256);
  for (let i = 0; i < 40; i++) {
    x.fillStyle = `rgba(0,0,0,${Math.random() * 0.25})`;
    x.fillRect(0, Math.random() * 256, 1024, 1 + Math.random() * 2);
  }
  x.strokeStyle = '#b8913e';
  x.lineWidth = 10;
  x.strokeRect(10, 10, 1004, 236);
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.font = '150px ' + ARENA_FONT;
  x.shadowColor = 'rgba(0,0,0,0.8)';
  x.shadowBlur = 12;
  x.shadowOffsetY = 6;
  const lg = x.createLinearGradient(0, 40, 0, 200);
  lg.addColorStop(0, '#f6dc8a');
  lg.addColorStop(0.55, '#c9a24a');
  lg.addColorStop(1, '#7a5a1e');
  x.fillStyle = lg;
  x.fillText(ARENA_NAME, 640, 134);
  x.shadowBlur = 0;
  arenaCrest(x, 160, 128, 0.62, '#c9a24a', '#4a0808');
  arenaGrain(x, 1024, 256, 5000, 0.14);
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(8, 2),
    new THREE.MeshStandardMaterial({
      map: arenaTex(c),
      roughness: 0.6,
      metalness: 0.15,
      emissive: 0xffffff,
      emissiveIntensity: 0.75,
    })
  );
  board.material.emissiveMap = board.material.map; // the sign lights itself (no lamp needed)
  const R = 13.2,
    a = Math.PI / 2; // behind the north (guest) side
  const gate = new THREE.Group();
  gate.position.set(Math.cos(a) * R, 0, Math.sin(a) * R);
  gate.lookAt(0, 0, 0);
  board.position.set(0, 6.4, 0.45);
  gate.add(board);
  for (const sx of [-4.6, 4.6]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(1.2, 8.4, 1.2), stone);
    post.position.set(sx, 4.2, 0);
    post.castShadow = true;
    gate.add(post);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.35, 1.5), stone);
    cap.position.set(sx, 8.55, 0);
    gate.add(cap);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(10.4, 0.7, 1.3), stone);
  lintel.position.set(0, 7.75, 0);
  gate.add(lintel);
  s.add(gate);
}
/** A flame: a soft additive glow that flickers (drawn once, shared). */
let arenaGlowTex = null;
function arenaGlow() {
  if (!arenaGlowTex) {
    const [c, x] = arenaCanvas(128, 128);
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,236,190,1)');
    g.addColorStop(0.25, 'rgba(255,170,70,0.75)');
    g.addColorStop(0.6, 'rgba(220,80,20,0.22)');
    g.addColorStop(1, 'rgba(160,40,10,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
    arenaGlowTex = new THREE.CanvasTexture(c);
  }
  return new THREE.SpriteMaterial({
    map: arenaGlowTex,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    fog: false,
  });
}
function duelArena() {
  const s = new THREE.Scene();
  s.background = new THREE.Color(0x0a0708);
  s.fog = new THREE.Fog(0x120a0e, 22, 70);
  s.add(new THREE.HemisphereLight(0xb8b0e0, 0x4a2814, 0.62));
  const key = new THREE.DirectionalLight(0xc8d4ff, 0.55); // moonlight
  key.position.set(6, 14, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 1, far: 40 });
  key.shadow.bias = -0.0008;
  s.add(key);
  const [sky, stars] = arenaSky();
  s.add(sky, stars);
  // floor + crest
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(12.6, 64),
    new THREE.MeshStandardMaterial({ map: arenaFloorTex(), roughness: 0.88 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  s.add(floor);
  const emblem = new THREE.Mesh(
    new THREE.PlaneGeometry(6.4, 6.4),
    new THREE.MeshStandardMaterial({
      map: arenaEmblemTex(),
      transparent: true,
      roughness: 0.45,
      metalness: 0.55,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    })
  );
  emblem.rotation.x = -Math.PI / 2;
  emblem.rotation.z = Math.PI; // the name reads from the south (where you start)
  emblem.position.y = 0.004;
  emblem.receiveShadow = true;
  s.add(emblem);
  // the ring's curb
  const stoneTex = arenaTex(arenaStoneTex(512, 256, 4, 70), [10, 1]);
  const curbMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x6a5c50).convertSRGBToLinear(),
    roughness: 0.85,
  });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(10.75, 0.32, 8, 72), curbMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.12;
  ring.receiveShadow = true;
  s.add(ring);
  // the wall around the ring
  const wallMat = new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.9, side: THREE.BackSide });
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(12.6, 12.6, 2.6, 72, 1, true), wallMat);
  wall.position.y = 1.3;
  wall.receiveShadow = true;
  s.add(wall);
  const coping = new THREE.Mesh(new THREE.TorusGeometry(12.6, 0.22, 6, 72), curbMat);
  coping.rotation.x = Math.PI / 2;
  coping.position.y = 2.62;
  s.add(coping);
  // tiered stands behind the wall, full of spectators
  const crowd = arenaCrowdTex();
  for (let t = 0; t < 3; t++) {
    const r = 13.6 + t * 2.1,
      y = 2.6 + t * 1.5;
    const tier = new THREE.Mesh(
      new THREE.RingGeometry(r - 1, r + 2.1, 64),
      new THREE.MeshLambertMaterial({ color: 0x2a2320 })
    );
    tier.rotation.x = -Math.PI / 2;
    tier.position.y = y;
    s.add(tier);
    const people = new THREE.Mesh(
      new THREE.CylinderGeometry(r + 0.6, r + 0.6, 1.25, 64, 1, true),
      new THREE.MeshLambertMaterial({ map: crowd, side: THREE.BackSide, color: 0xb0a090 })
    );
    people.position.y = y + 0.6;
    people.rotation.y = t * 1.7;
    s.add(people);
  }
  const outer = new THREE.Mesh(
    new THREE.CylinderGeometry(21, 21, 9, 64, 1, true),
    new THREE.MeshLambertMaterial({ map: arenaTex(arenaStoneTex(512, 256, 6, 46), [14, 2]), side: THREE.BackSide })
  );
  outer.position.y = 4.5;
  s.add(outer);
  // pillars with braziers, banners hung on the wall between them
  DUEL.torches = [];
  DUEL.banners = [];
  const pillarMat = new THREE.MeshStandardMaterial({
    map: arenaTex(arenaStoneTex(256, 512, 10, 80), [1, 1]),
    roughness: 0.85,
  });
  const iron = new THREE.MeshStandardMaterial({ color: 0x2a2624, roughness: 0.5, metalness: 0.7 });
  const bannerMats = [0, 1].map(
    k =>
      new THREE.MeshStandardMaterial({
        map: arenaBannerTex(k),
        roughness: 0.9,
        side: THREE.DoubleSide,
        transparent: true,
        alphaTest: 0.5,
      })
  );
  const bannerGeo = new THREE.PlaneGeometry(1.3, 3.25, 1, 6);
  bannerGeo.translate(0, -1.62, 0); // hangs from its top edge
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2,
      cx = Math.cos(a),
      cz = Math.sin(a),
      R = 11.4;
    if (Math.abs(wrapAng(a - Math.PI / 2)) < 0.35) continue; // the gate stands there
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.52, 4.4, 12), pillarMat);
    p.position.set(cx * R, 2.2, cz * R);
    p.castShadow = true;
    s.add(p);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.18, 0.32, 12), iron);
    bowl.position.set(cx * R, 4.56, cz * R);
    s.add(bowl);
    const flame = new THREE.Sprite(arenaGlow());
    flame.position.set(cx * R, 4.95, cz * R);
    flame.scale.setScalar(1.5);
    s.add(flame);
    const core = new THREE.Sprite(arenaGlow());
    core.position.set(cx * R, 4.85, cz * R);
    core.scale.setScalar(0.7);
    s.add(core);
    flame.userData.core = core;
    DUEL.torches.push(flame);
    if (i % 2 === 0) {
      const l = new THREE.PointLight(0xff8a3a, 1, 14, 2);
      l.position.set(cx * R * 0.97, 5.2, cz * R * 0.97);
      s.add(l);
      flame.userData.light = l;
    }
  }
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + 0.2 + Math.PI / 16;
    if (Math.abs(wrapAng(a - Math.PI / 2)) < 0.5) continue;
    // a holder faces the centre; the cloth inside it sways (its own x rotation stays free for that)
    const holder = new THREE.Group();
    holder.position.set(Math.cos(a) * 12.45, 2.55, Math.sin(a) * 12.45);
    holder.lookAt(0, 2.55, 0);
    const b = new THREE.Mesh(bannerGeo, bannerMats[i % 2]);
    b.userData.ph = Math.random() * 6;
    holder.add(b);
    s.add(holder);
    DUEL.banners.push(b);
  }
  arenaGate(s, pillarMat);
  // embers rising from the braziers
  const EN = 90,
    ep = new Float32Array(EN * 3);
  const eg = new THREE.BufferGeometry();
  eg.setAttribute('position', new THREE.BufferAttribute(ep, 3));
  const embers = new THREE.Points(
    eg,
    new THREE.PointsMaterial({
      color: 0xffa040,
      size: 0.06,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    })
  );
  embers.frustumCulled = false;
  embers.userData.e = Array.from({ length: EN }, () => ({ t: Math.random() * 3, src: 0, ox: 0, oz: 0 }));
  s.add(embers);
  DUEL.embers = embers;
  goreInit(s);
  return s;
}
/** Per frame: braziers flicker, embers drift up, banners sway. */
function arenaTick(dt) {
  const T = performance.now() / 1000;
  for (const t of DUEL.torches) {
    const k = 0.88 + Math.random() * 0.24;
    t.scale.setScalar(1.5 * k);
    t.userData.core.scale.setScalar(0.7 * (0.9 + Math.random() * 0.2));
    if (t.userData.light) t.userData.light.intensity = 0.9 * k;
  }
  for (const b of DUEL.banners || []) b.rotation.x = Math.sin(T * 1.3 + b.userData.ph) * 0.06;
  const E = DUEL.embers;
  if (E && DUEL.torches.length) {
    const pos = E.geometry.attributes.position;
    E.userData.e.forEach((e, i) => {
      e.t += dt;
      if (e.t > 2.6 || !e.src) {
        e.t = Math.random() * 0.4;
        e.src = DUEL.torches[(Math.random() * DUEL.torches.length) | 0];
        e.ox = rand(-0.25, 0.25);
        e.oz = rand(-0.25, 0.25);
      }
      const p = e.src.position;
      pos.setXYZ(
        i,
        p.x + e.ox + Math.sin(T * 2 + i) * 0.15 * e.t,
        p.y + e.t * 1.1,
        p.z + e.oz + Math.cos(T * 1.7 + i) * 0.15 * e.t
      );
    });
    pos.needsUpdate = true;
  }
}
