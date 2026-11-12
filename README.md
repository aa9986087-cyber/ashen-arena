# ساحة الرماد — Ashen Arena

لعبة بقاء ثلاثية الأبعاد في المتصفح (three.js r128)، بدون أي أداة بناء: افتح `index.html` وتشتغل.
صنعها **Vamos**.

## التشغيل

```bash
npm start          # خادم محلي على http://localhost:8080
```

أو أي خادم ثابت (`python3 -m http.server`). الفتح المباشر من `file://` يشتغل أيضاً، لكن تحميل النماذج الاختيارية (`assets/models`) يحتاج `http`.
النشر على GitHub Pages: ارفع المجلد كما هو، و`index.html` هو نقطة الدخول.

- `#lab` في آخر الرابط يفتح **المختبر** (أدوات تجربة: استدعاء وحوش وزعماء، تخطي المراحل، عدم الموت…).

## هيكل المشروع

```
index.html              الواجهة فقط (HTML)، وترتيب تحميل السكربتات
css/
  base.css              المتغيرات (الألوان، الخطوط)، الـ reset
  hud.css               واجهة اللعب وأزرار اللمس
  screens.css           القوائم والشاشات والعناصر المشتركة
  cards.css             بطاقات التطوير ومشهد الأسطوري
  responsive.css        الجوال وتقليل الحركة
js/
  core/                 أساسيات بدون منطق لعب
    utils.js            دوال رياضية (rand, clamp, wrapAng, rotate, fmtT…)
    config.js           مسارات الأصول وأعلام البيئة (MUSIC_URL, MODEL_DIR, LAB)
    dom.js              $، el، pips
    save.js             ملف اللاعب الدائم (localStorage)
  data/                 بيانات اللعبة فقط — مكان التوازن والمحتوى
    weapons.js  characters.js  upgrades.js  achievements.js  stages.js  enemies.js
  audio/
    sound.js            المؤثرات المولّدة بـ WebAudio + الموسيقى الاحتياطية
    music-track.js      تشغيل ملف الموسيقى وتغيير صوته مع حدة القتال
  render/
    scene.js            المُصيّر، المشهد، الإضاءة، أدوات InstancedMesh
    geometry.js         نماذج الأعداء والزعماء والديكور (مبنية من أشكال بسيطة)
    instances.js        الكائنات المرسومة بالجملة (أعداء، طلقات، جواهر…)
    world.js            الأرض، ديكور المراحل setStage، تجمعات المؤثرات
    player-model.js     نموذج البطل والسلاح بيده
    models.js           تحميل نماذج glb/gltf الاختيارية
    renderer.js         رسم الإطار + الطبقة ثنائية الأبعاد
  game/                 منطق اللعب
    state.js            حالة الجولة G، الإدخال IN، newRun، recalc
    fx.js               جزيئات، نصوص طائرة، حلقات، اهتزاز، لافتات
    spawning.js         ظهور الأعداء والزعماء والموجات
    combat.js           الإصابة، القتل، المقذوفات، أسلحة اللاعب، القدرات
    enemy-ai.js         سلوك الأعداء والزعماء
    update.js           محاكاة كل إطار
    progression.js      هزيمة الزعيم، المراحل، النهاية/الهاوية، الإنجازات
    cards.js            بطاقات المستوى ومكافأة الزعيم
    run.js              بدء/استكمال/إنهاء/إيقاف الجولة
  ui/
    hud.js  screens.js  leaderboard.js  lab.js
  input.js              لوحة المفاتيح، الفأرة، عصا اللمس
  main.js               الإقلاع وحلقة الإطارات
assets/
  audio/music.m4a       الموسيقى (كانت مضمّنة base64 داخل الـ HTML)
  models/               نماذج اختيارية — اقرأ README داخله
```

### قاعدة مهمة: ترتيب السكربتات

الملفات سكربتات عادية (مو ES modules) تتشارك نطاقاً عاماً واحداً، تماماً مثل الملف الأصلي، عشان يبقى السلوك مطابقاً 100%.
لذلك **الترتيب في `index.html` مهم**: أي كود ينفّذ مباشرة عند التحميل (خارج الدوال) يقدر يستخدم فقط ما عرّفته الملفات اللي قبله.
الدوال نفسها تقدر تستدعي أي شيء، لأنها تشتغل بعد تحميل الكل.
عند إضافة ملف جديد: ضعه في المجلد المناسب، وأضف سطر `<script>` في مكانه الصحيح.

## كيف أضيف محتوى؟

| أبي أضيف… | المكان |
|---|---|
| سلاح | `js/data/weapons.js` (+ شكله في `buildWeapon` داخل `render/player-model.js`، وصوته في `SFX` داخل `audio/sound.js`) |
| بطل | `js/data/characters.js` (+ تفاصيل شكله في `buildPlayer`) |
| تطوير / صفقة / تطوير دائم / عقدة مهارة | `js/data/upgrades.js` (+ أثره في `recalc` داخل `game/state.js` أو في `update`) |
| إنجاز | `js/data/achievements.js` |
| عدو | `js/data/enemies.js` + شكله في `render/geometry.js` (نفس المفتاح) + سلوكه في `game/enemy-ai.js` + وزنه في `pickType` داخل `game/spawning.js` |
| مرحلة / زعيم | `js/data/stages.js` (+ هجمات الزعيم في `game/enemy-ai.js` حسب `bk`) |

أدوات مساعدة جاهزة للهجمات: `eRing` (حلقة طلقات)، `eFan` (مروحة طلقات)، `spawnPack` (مجموعة أعداء)، `zoneBarrage` (دوائر خطر)، `eachInRadius` (كل عدو داخل دائرة)، `heal`.

## التنسيق

```bash
npm run format     # Prettier (الإعدادات في .prettierrc.json)
```

## ملاحظات الحفظ

- ملف اللاعب: `localStorage['ashen_arena_v1']`، والجولة الجارية: `localStorage['ashen_arena_run']`.
- لا تغيّر هذه المفاتيح، وإلا يضيع تقدم اللاعبين الحاليين.
