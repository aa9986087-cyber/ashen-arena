'use strict';

/* Layout coordinates are world units: [model, x, z, size, yaw, solid radius]. */
const ARENA_MAPS = {
  0: {
    ground: 0x3a6150, fog: 0x203b32, amb: 0xb8dbc8, tuft: 0x487454, rim: 0x74ae8a,
    terrain: 'grove', tint: [0.69,0.88,0.81],
    landmarks: [
      ['oak',-6.7,-10.8,7.8,.6,1.2],['oak',6.7,-13,8.7,-.45,1.4],['fir',12,-5,7,.3,.82],
      ['log',-11,-4,4.9,.76,.86],['boulder',9,5,3.5,-.68,1.2],['oak',-13,7,7,.85,1.1],
      ['mushrooms',-5.3,-6.5,2.0,0],['mushrooms',5.6,-4.5,1.7,2],['mushrooms',-7,6,1.8,.6],
    ],
    edges: [['oak',12,18,37,6,9,1.05],['fir',13,15,41,5,8,.68],['mushrooms',22,9,36,.7,1.5,0],
      ['boulder',13,12,44,2.6,4.4,.8],['log',7,20,44,3,5,.75]],
  },
  1: {
    ground: 0x97764d, fog: 0x775437, amb: 0xf0d3a7, tuft: 0xa3885b, rim: 0xb89564,
    terrain: 'temple', tint: [1.05,.88,.63],
    landmarks: [
      ['obelisk',-5.8,-11,7.3,.2,1.0],['obelisk',5.8,-11,7.3,-.2,1.0],['column',-13,-4,5,-.1,1.0],
      ['column',7.6,-6.6,4.6,.35,1.0],['cliff',-12,-16,10,1.2,1.65],['cliff',13,-19,10,-.9,1.65],
      ['coffin',-10,6,4.7,0,1.25],['coffin',10,6,4.7,0,1.25],['palm',-15,-1,4,.4,.7],
    ],
    edges: [['cliff',14,20,45,5.8,10,1.5],['column',10,17,39,4.1,6.5,.95],
      ['boulder',16,11,43,1.8,4.1,.7],['coffin',7,17,44,3.2,4.1,1.05]],
  },
  4: {
    ground: 0x65868d, fog: 0x3f626d, amb: 0xd7eff8, tuft: 0x8ea9b2, rim: 0x9bd1dc,
    terrain: 'frost', tint: [.9,1.05,1.09], surface: 'frost',
    landmarks: [
      ['fir',-6.7,-11,7,.15,.7],['fir',8,-12.5,9,0,.8],['fir',13,-4,7,-.15,.7],
      ['spire',-5.1,-7.6,5.9,.9,.94],['spire',-11,-15,4.4,-.5,.7],['spire',7.4,-6.2,5,.4,.9],
      ['cliff',12,-21,10,.9,1.5],['boulder',-11,6,4,-.3,1.2],
    ],
    edges: [['fir',21,15,43,5,8,.68],['spire',18,11,40,2,5.4,.82],
      ['boulder',16,11,44,2,4.4,.85],['cliff',12,23,46,5.8,8,1.45]],
  },
  2: {
    ground: 0x555765, fog: 0x353846, amb: 0xabb7d3, tuft: 0x555b62, rim: 0xbb7769,
    terrain: 'court', tint: [.80,.79,.89],
    landmarks: [
      ['gate',0,-17,10.5,0],['tower',-10,-18,11,0,1.85],['tower',10,-18,11,0,1.85],
      ['banner',-5.6,-9.7,5.4,.16,.45],['banner',5.6,-9.7,5.4,-.16,.45],['wall',-14,-7,7,Math.PI/2,1.3],
      ['wall',14,-7,7,Math.PI/2,1.3],['brazier',-8.2,5,2.2,0,.48],['brazier',8.2,5,2.2,0,.48],
    ],
    edges: [['wall',19,19,47,4.4,7,1.23],['tower',8,25,46,7,10,1.55],
      ['column',11,12,39,2.6,4.6,.73],['brazier',16,11,41,1.4,2.4,.45]],
  },
  3: {
    ground: 0x535c55, fog: 0x35433e, amb: 0xc7c9ab, tuft: 0x5e6b58, rim: 0xbc9870,
    terrain: 'depot', tint: [.91,.89,.75],
    landmarks: [
      ['siege',-7.0,-14,8,.36,1.55],['gate',0,-23,12,0],['pipe',7.0,-12,6,-.5,1.25],
      ['crate',9,-5,3.2,-.24,1.2],['crate',12,-3,2.9,.21,1.0],['crate',-9,5,2.9,-.12,1.0],
      ['wall',-13,-6,7,Math.PI/2,1.3],['wall',13,8,6.5,-.25,1.18],['banner',8,-17,5.5,.12,.45],
    ],
    edges: [['crate',24,11,42,2.1,3.8,.92],['siege',9,22,43,5.4,9,1.37],
      ['pipe',12,17,48,4,7.3,1.15],['wall',12,18,46,4.5,7.4,1.22]],
  },
  5: {
    ground: 0x594135, fog: 0x4e3029, amb: 0xeab49a, tuft: 0x725746, rim: 0xd08b63,
    terrain: 'caldera', tint: [.94,.75,.67], surface: 'basalt',
    landmarks: [
      ['cliff',-11,-14,10,.53,1.85],['cliff',10,-16,11,-.44,1.75],['spire',-6.2,-11.3,7,.9,1.0],
      ['stump',10,-7,4,.41,.85],['spire',-10,4,5,.3,1.05],['brazier',12,5,2.3,.1,.52],
      ['boulder',7,-9,3.3,.11,1.1],['stump',-12,9,4,-.21,.85],
    ],
    edges: [['cliff',20,16,46,6.5,11,1.55],['spire',17,12,40,3,5.2,.9],
      ['stump',11,12,42,2.8,4.7,.73],['boulder',13,12,43,2.7,4.3,.89]],
  },
  6: {
    ground: 0x445952, fog: 0x2d423d, amb: 0xb3cec1, tuft: 0x64766b, rim: 0x99b5a1,
    terrain: 'path', tint: [.74,.88,.85],
    landmarks: [
      ['crypt',0,-18,9,0,2.0],['obelisk',-10,-16,6.8,0,1],['obelisk',10,-16,6.8,0,1],
      ['tomb',-5.8,-10,3.6,.16,.78],['tomb',5.8,-10,3.6,-.16,.78],['coffin',-10,2,4.7,.25,1.1],
      ['brokenTomb',8,-4,2.9,-.15,.69],['brokenTomb',-8,5,2.6,.2,.65],
      ['fence',-13,-7,6,Math.PI/2,1.18],['fence',13,-7,6,Math.PI/2,1.18],
    ],
    edges: [['tomb',24,11,43,2.2,3.7,.7],['brokenTomb',19,11,42,2.2,3.3,.61],
      ['crypt',8,21,46,5,8,1.4],['coffin',12,16,40,3.4,4.7,1.05]],
  },
  abyss: {
    ground: 0x4b3b60, fog: 0x342545, amb: 0xbfb1e2, tuft: 0x605077, rim: 0xae83c8,
    terrain: 'rift', tint: [.88,.75,1.03], surface: 'shadow',
    landmarks: [
      ['arch',0,-16.8,11,0],['column',-8,-12,7,-.2,1.1],['column',8,-12,7,.2,1.1],
      ['spire',-12,-13,6,.6,1.15],['spire',12,-10,5.5,-.6,1.1],
      ['brokenTomb',-9,4,3.2,.7,.85],['stump',10,7,5,-.35,.84],['spire',9,3.9,4.6,0,.98],
    ],
    edges: [['arch',7,22,45,6.8,11,1.3],['column',17,14,40,3.2,6.7,.82],
      ['spire',21,11,41,3,6.8,.9],['brokenTomb',13,11,41,2.5,4,.65]],
  },
};
const arenaMapMeshCache = new Map();
function arenaStageStyle(stage) {
  const art = ARENA_MAPS[stage.abyss ? 'abyss' : stage.bk];
  return art ? { ...stage, ...art } : stage;
}

function openArenaGeometry(model, surface) {
  const key = model + ':' + surface;
  if (arenaMapMeshCache.has(key)) return arenaMapMeshCache.get(key);
  const [positions, triangles] = OPEN_ARENA_PROPS[model].map(atob);
  const count = positions.length / 2;
  const points = new Float32Array(count), colors = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const bits = positions.charCodeAt(i * 2) | (positions.charCodeAt(i * 2 + 1) << 8);
    points[i] = ((bits << 16) >> 16) / 4096;
  }
  for (let i = 0, face = 0; i < count; i += 9, face += 3) {
    let rgb = [triangles.charCodeAt(face), triangles.charCodeAt(face + 1), triangles.charCodeAt(face + 2)].map(n => n / 255);
    const tone = rgb[0] * .24 + rgb[1] * .55 + rgb[2] * .21;
    if (surface === 'frost' && (model !== 'fir' || points[i + 1] > .23))
      rgb = [.39 + tone * .47, .54 + tone * .4, .62 + tone * .37];
    if (surface === 'basalt' && model !== 'brazier')
      rgb = [.23 + tone * .40, .19 + tone * .35, .18 + tone * .32];
    if (surface === 'shadow') rgb = [.32 + tone * .47,.28 + tone * .42,.41 + tone * .49];
    for (let v = 0; v < 3; v++) colors.set(rgb, i + v * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(points, 3));
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  g.computeBoundingBox();
  arenaMapMeshCache.set(key, g);
  return g;
}

const arenaTileShape = white(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
const arenaStoneShape = white(new THREE.ShapeGeometry(new THREE.Shape(
  [[-.50,-.17],[-.31,-.48],[.19,-.49],[.49,-.19],[.43,.33],[.02,.49],[-.4,.36]].map(p => new THREE.Vector2(...p))
)).rotateX(-Math.PI / 2));
function arenaRandom(seed) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
function arenaFloor(st) {
  const tiles = [], stones = [], random = arenaRandom(37 + st.bk * 213 + (st.abyss ? 39 : 0));
  const tile = (x,z,w,h,turn,color) => tiles.push([x,z,w,h,turn,color]);
  const stone = (x,z,w,h,turn,color) => stones.push([x,z,w,h,turn,color]);
  const line = (x,z,tx,tz,width,color) =>
    tile((x + tx) / 2,(z + tz) / 2,width,Math.hypot(tx-x,tz-z),Math.atan2(tx-x,tz-z),color);
  const pavers = (cols, rows, xstep, zstep, color, jitter = .13) => {
    for (let col = -cols; col <= cols; col++) for (let row = -rows; row <= rows; row++)
      tile(col*xstep + (random()-.5)*jitter,row*zstep + (random()-.5)*jitter,
        xstep*.94,zstep*.93,(random()-.5)*.025,color);
  };
  switch (st.terrain) {
    case 'grove':
      for (let n=0; n<44; n++) {
        const a = (n % 2 ? 1 : -1) * (5 + random()*15);
        stone(a,(random()-.5)*49,3+random()*6,2+random()*4,random()*TAU,0x284a39);
      }
      for (let z=-15; z<=15; z+=2.8) stone(Math.sin(z*.22)*2,z,2.5,1.7,z*.1,0x536054);
      break;
    case 'temple':
      pavers(1,4,3.7,4.1,0x95764f,.32);
      for (const s of [-1,1]) for (let z=-12;z<16;z+=4.3) tile(s*7.1,z,2.3,.64,s*.1,0xab885e);
      for (const s of [-1,1]) {
        line(s*9,-16,s*9,16,.35,0xae8e63);
        line(-9,s*16,9,s*16,.35,0xae8e63);
        line(s*7.5,-14,s*7.5,14,.22,0x6d583e);
      }
      break;
    case 'frost':
      stone(0,-2,26,35,.23,0x57747e);
      for (let i=0;i<11;i++) {
        const a = i * 2.4;
        const x = Math.cos(a)*(6 + random()*10), z = Math.sin(a)*(8+random()*9);
        line(x,z,x+Math.sin(a)*3.3,z+Math.cos(a)*4.3,.17,0x798f94);
        line(x,z,x+Math.cos(a)*2.1,z+Math.sin(a)*2.7,.11,0x86a0a7);
      }
      break;
    case 'court':
      pavers(4,7,2.55,2.65,0x656674,.34);
      for (const side of [-1,1]) line(side*12,-20,side*12,20,.42,0x494750);
      break;
    case 'depot':
      pavers(2,4,3.7,4.8,0x5c655a,.42);
      for (const side of [-1,1]) {
        line(side*8.9,-23,side*8.9,21,.35,0x8c7957);
        for (let z=-18;z<20;z+=4.2) tile(side*12,z,1.24,.25,side*.56,0x7b6b4d);
      }
      break;
    case 'caldera':
      for (let n=0;n<43;n++)
        stone((random()-.5)*51,(random()-.5)*53,3+random()*4,2+random()*5,random()*TAU,0x463633);
      for (const side of [-1,1]) {
        let x = 6.6*side;
        for (let z=-24;z<24;z+=4.6) {
          const next = (5.8 + random()*2.3)*side;
          line(x,z,next,z+4.6,.88,0x77462e);
          line(x,z,next,z+4.6,.27,0xbd703e);
          x = next;
        }
      }
      break;
    case 'path':
      pavers(1,7,2.75,2.65,0x607068,.35);
      for (const side of [-1,1]) {
        line(side*5,-22,side*5,19,.22,0x758274);
        for (let z=-13;z<17;z+=4.5) tile(side*6,z,1.7,.27,0,0x596c62);
      }
      break;
    case 'rift':
      for (let i=0;i<28;i++) {
        const a = i * 2.4, r = 5 + random()*22;
        stone(Math.cos(a)*r,Math.sin(a)*r,3+random()*4,2+random()*6,random()*TAU,0x4b405d);
      }
      for (const side of [-1,1]) {
        line(side*7,-18,side*11,-2,.25,0x745884);
        line(side*11,-2,side*6,15,.21,0x745884);
      }
      break;
  }
  for (const [geo, items, height] of [[arenaTileShape, tiles, .021], [arenaStoneShape, stones, .015]]) {
    if (!items.length) continue;
    const batch = inst(geo, lamV, items.length, false);
    batch.mesh.receiveShadow = true;
    const tint = new THREE.Color();
    let offset = 0;
    for (const [x,z,w,h,turn,color] of items) {
      tint.setHex(color);
      put(batch, x, height + offset++ * .000017, z, turn, w, 1, h, tint.r, tint.g, tint.b);
    }
    flush(batch);
    decor.push(batch);
  }
}

function mountArenaMap(st) {
  if (!st.terrain) return false;
  const random = arenaRandom(8073 + st.bk * 719 + (st.abyss ? 157 : 0));
  const items = new Map();
  const occupied = [];
  const surface = st.surface || 'natural';
  const add = (model, x, z, size, yaw, solid, variation = 1) => {
    const { min, max } = openArenaGeometry(model, surface).boundingBox;
    const skyline = Math.hypot(x, z) >= ARENA + 4;
    // Limit the display bounds in world units, rather than applying the same shrink to every model.
    const height = max.y - min.y;
    const span = Math.hypot(max.x - min.x, max.z - min.z);
    const scale = Math.min(size, (skyline ? 5.5 : 2.2) / height, (skyline ? 9 : 3.6) / span);
    if (solid > 0) solid *= scale / size;
    if (!items.has(model)) items.set(model, []);
    items.get(model).push([x,z,scale,yaw,variation]);
    if (solid > 0) {
      occupied.push({x,z,r:solid});
      if (Math.hypot(x,z) + solid < ARENA - .5) OBST.push({x,z,r:solid});
    }
  };
  for (const placement of st.landmarks) add(...placement);
  for (const [model,count,near,far,min,max,footprint] of st.edges) {
    for (let j = 0; j < count; j++) {
      const angle = j / count * TAU + random()*.36, r = near + random()*(far-near);
      const x = Math.sin(angle)*r, z = Math.cos(angle)*r;
      if (footprint && ((r < 19 && Math.min(Math.abs(x),Math.abs(z)) < 2.8) ||
        occupied.some(o => Math.hypot(o.x-x,o.z-z) < o.r + footprint + 2.5))) continue;
      add(model,x,z,min+random()*(max-min),random()*TAU,footprint,.74+random()*.26);
    }
  }
  // Rim landmarks live beyond the playable boundary. They never enter the collision list.
  const [silhouette, , , , , size] = st.edges[0];
  for (let j = 0; j < 12; j++) {
    const angle = j / 12 * TAU + random() * .19;
    const radius = ARENA + 5 + random() * 12;
    add(silhouette, Math.sin(angle)*radius, Math.cos(angle)*radius, size*(1.45 + random()*.45),
      random()*TAU, 0, .6 + random()*.19);
  }
  const [r,g,b] = st.tint;
  for (const [model, locations] of items) {
    const geometry = openArenaGeometry(model, surface);
    const batch = inst(geometry, lamV, locations.length, true);
    batch.mesh.receiveShadow = true;
    batch.mesh.name = 'arena-map-' + model;
    batch.mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    for (const [x,z,s,yaw,t] of locations) put(batch,x,0,z,yaw,s,s,s,r*t,g*t,b*t);
    flush(batch);
    decor.push(batch);
  }
  arenaFloor(st);
  edge.material.color.setHex(st.rim);
  POSTS.mesh.visible = false;
  return true;
}
