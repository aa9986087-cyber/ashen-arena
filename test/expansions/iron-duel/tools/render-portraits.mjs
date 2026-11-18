import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const build = path.resolve(process.argv[2]);
const output = path.resolve(process.argv[3]);
const origin = 'http://iron-catalog.test';
const browser = await chromium.launch({
  executablePath: process.env.IRON_CHROMIUM || undefined,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
});
try {
  const page = await browser.newPage({viewport: {width: 800, height: 500}});
  page.on('console', message => { if (message.type() === 'error' && !message.text().includes('Failed to load resource')) console.error(message.text()); });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    const file = path.resolve(build, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(build + path.sep)) return route.abort();
    return route.fulfill({path:file}).catch(() => route.abort());
  });
  await page.goto(origin, {waitUntil:'domcontentloaded'});
  const frames = await page.evaluate(async fighterOnly => {
    const [model] = await Promise.all([duelLoad(), forgeLoadGear()]);
    const rig = new Duelist(model, 212, 110);
    const scene = new THREE.Scene();
    const lights = [
      new THREE.HemisphereLight(0xf4e6d9, 0x898ba1, .52),
      new THREE.DirectionalLight(0xffdda7, 1.24),
      new THREE.DirectionalLight(0xa1bdde, 1.05),
    ];
    lights[1].position.set(-4, 3.4, 2.9);
    lights[2].position.set(4, 3, -4);
    scene.add(...lights);
    const canvas = new THREE.WebGLRenderer({alpha:true, antialias:true, preserveDrawingBuffer:true});
    canvas.outputEncoding = THREE.sRGBEncoding;
    canvas.setClearColor(0, 0);
    const frames = {};
    const render = (id, width, height, halfHeight, position, center) => {
      canvas.setSize(width, height, false);
      const extent = halfHeight * width / height;
      const camera = new THREE.OrthographicCamera(-extent, extent, halfHeight, -halfHeight, .05, 32);
      camera.position.set(...position);
      camera.lookAt(...center);
      canvas.render(scene, camera);
      frames[id] = canvas.domElement.toDataURL('image/webp', .86).split(',')[1];
    };
    scene.add(rig.root);
    rig.mixer.update(.21);
    rig.sword.visible = false;
    forgeDress(rig, 0);
    rig.root.rotation.y = .22;
    const head = goreBone(rig,'Head');
    head.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0), -.19));
    render('fighter', 480, 590, .89, [.47, 1.48, 4.9], [0, .94, 0]);
    scene.remove(rig.root);
    for (const id of fighterOnly ? [] : DUEL_WEAPON_IDS) {
      const weapon = forgeWeaponModel(id);
      const wrapper = new THREE.Group();
      const bounds = new THREE.Box3().setFromObject(weapon);
      weapon.position.sub(bounds.getCenter(new THREE.Vector3()));
      const tall = bounds.getSize(new THREE.Vector3()).y;
      wrapper.rotation.set(-.20, .19, -.94);
      wrapper.add(weapon);
      scene.add(wrapper);
      render(id, 488, 294, tall * .39, [0, .06, 3.5], [0, 0, 0]);
      scene.remove(wrapper);
    }
    canvas.dispose();
    return frames;
  }, process.argv.includes('--fighter-only'));
  await fs.mkdir(output, {recursive:true});
  await Promise.all(Object.entries(frames).map(([id, frame]) => fs.writeFile(path.join(output, id + '.webp'), Buffer.from(frame, 'base64'))));
  console.log('Rendered in-game wardrobe and weapon portraits:', Object.keys(frames).length);
} finally {
  await browser.close();
}
