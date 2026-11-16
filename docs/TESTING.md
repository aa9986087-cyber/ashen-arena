# اختبار اللعبة قبل المعاينة والنشر

اللعبة تبقى classic JavaScript globals مع Three.js، بلا build ولا إطار اختبارات جديد للـruntime. الأدوات المضافة للتطوير فقط: `@playwright/test@1.65.1`، `acorn@8.19.0`، `acorn-walk@8.3.5`، `eslint-scope@9.1.2`. مدير الحزم `npm@10.9.9`؛ CI يستخدم Node `22.23.4`. `npm ci` تثبيت عادي من lock، دون `ignore-scripts` أو lifecycle scripts مضافة؛ لا اعتماديات إنتاج npm.

## البداية والأوامر

```bash
npm ci
npm test                              # سريع: القواعد/العقود/إصلاحات runtime/الخادم والتغليف
npm run test:fixtures                  # تنزيل 8 مكتبات حقيقية من روابط index والتحقق من SHA256
npx playwright install --with-deps chromium
npm run test:smoke                     # Chromium desktop + mobile، بدون إنتاج أو مايك
npm run check                         # fast ثم analyze ثم fixtures ثم smoke
npm run package:game                  # نسخة محلية فقط: dist/game
node tools/test-server.mjs --root dist/game --port 8080
```

`npm test` يشغّل `tests/*.test.mjs` و`tests/unit/*.test.mjs` صراحة؛ لا يسقط اختبارات الإصلاحات الموجودة في جذر tests. `npm start` يشغّل المصدر المحلي على `127.0.0.1:8080`. خادم الاختبار يقبل GET/HEAD فقط ولا يخدم package/tools/tests/.git أو مسارات traversal. معاينة المصدر أو artifact من دون fixtures تشغيل عادي للعبة: قد تتصل بإنتاج Supabase؛ **العزل الآلي أدناه خاص بـPlaywright**. لا تستخدم واجهات اللعب الاجتماعي/إرسال النتائج في معاينة عادية على إنتاج من أجل الاختبار.

للمعاينة الآمنة المعزولة شغّل `npm run test:smoke -- --headed`، أو افتح trace الفشل محليًا. التقارير: `test-results/smoke.json`، و`playwright-report/index.html`؛ تشغيل `npx playwright show-report` يعرض التقرير. لا تحتاج أي مفتاح سرّي للاختبارات.

## ماذا يفحص الخط؟

**Fast:** Acorn يفسر كل ملفات `js/**/*.js` كـscript، ويتحقق من تحميل كل runtime script مرة واحدة بترتيب index دون module/async/defer. يفحص وجود موارد HTML وCSS المحلية، uniqueness لمعرفات HTML، ووجود شاشات `SCREENS` وتطابق `data-go`. لا توجد snapshot شاملة للـlegacy ولا بوابة Prettier على كل الملفات القديمة.

**القواعد المشتركة:** `node:test` و`vm` ينفذان الملفات الفعلية في scope واحد وبترتيب index، بدل تحويل اللعبة إلى modules. تغطي الحالات utils، أكواد Arabic/emoji والتلاعب، save defaults/migration والتخزين الممنوع، مراجع heroes/weapons/specials/evolutions، بيانات upgrades/tree/missions، recalc، أوزان البطاقات وحدود slots وشروط التطور، استعادة state بعد preview، ترتيب الصدارة والنتائج المحلية، المهام اليومية، والصيانة والرجوع دون draw/load للشبكة. DOM/storage/audio/VFX في هذه الوحدات boundaries خفيفة فقط، لا محرك بديل. اختبارات الإصلاحات في جذر tests تضيف تغطيتها المتخصصة؛ فحوص SQL نصية ولا تنفذ SQL في قاعدة.

**Smoke:** رحلتان فعليتان: desktop 1280×800 وmobile 390×844؛ إقلاع واحد لكل جهاز يجمع سيناريوهات الواجهة واللعب، بدل إعادة تحميل المشهد مرتين. تحمل index والمكتبات الأصلية و`main.js`، وتتحقق من `window.__game`، القائمة والتنقل إلى الأبطال والمتجر والشجرة والمهام والإعدادات، قاعة المجد وتبويباتها الخمسة (الأسبوع، الصمود، الزعماء، الأسرع، القتلات) وزرّ الرجوع. تفحص انتقال حالة panel الصوت بعد اتصال محلي مع نفس الأعضاء، دون دخول غرفة أو طلب مايك. تبدأ جولة حقيقية، تنتظر تقدم وقت اللعبة وWebGL draw فعلي، وتحرك اللاعب بالكيبورد أو touch joystick، وتتحقق من hit-test/click لزر المشاهدين، ثم pause/save/return. جميع التأكيدات السابقة محفوظة؛ لا يتم استبدال main أو renderer أو update بـstubs، ولا تعديل G لمحاكاة نجاح الجولة. جودة الرسم المنخفضة إعداد محفوظ حقيقي لتخفيف SwiftShader في CI؛ فحص الارتفاع البصري الكامل/bloom خارج نطاق smoke.

## عزل الشبكة وfixtures

Playwright يركّب routes على **context قبل navigation**، يسمح GET/HEAD لخادم loopback المحدد فقط، ويحقق مكتبات CDN ثم يخدمها من ملفات fixtures المحلية. كل HTTP خارجي آخر ـ بما فيه جميع Supabase reads/writes ـ يعاد محليًا بـ503 (font CSS فارغ)، دون وصول الطلب للخادم الخارجي. كل WebSocket محجوب ولا يُستدعى `connectToServer()`؛ service workers محجوبة. `#netlocal` يستخدم مسار BroadcastChannel الموجود أصلًا للـrealtime. `getUserMedia` مرفوض في fixture وطلبات المايك تُعدّ ويجب أن تكون صفرًا؛ لا permissions للمايك. أسماء/تقدم الاختبار localStorage في browser context جديد لكل حالة؛ لا تنتهي الجولة بإرسال score للإنتاج.

`tests/fixtures/cdn-lock.json` يحفظ URLs وSHA256 لثمانية scripts الموجودة في index؛ ملفات Three.js الفعلية محلية في `tests/.cache/cdn/` (متجاهلة Git، نحو 732 KiB عند إعدادها الأول). يبقى copyright/license الأصلي داخل الملفات، Three.js MIT. CI يحفظ هذا المجلد و`~/.cache/ms-playwright/` فقط بمفتاح hashes لـpackage-lock وCDN lock، ولا يستعيد source أو tests من cache؛ تحقق hashes يتم حتى عند cache hit. CI يحتاج اتصالًا لتنزيلها أول مرة؛ تنفيذ browser نفسه لا يعتمد على CDN. عند تغيير رابط مكتبة، راجع النسخة ومصدرها ثم نفّذ:

```bash
npm run test:fixtures -- --refresh-lock
```

راجع فرق lock قبل اعتماده؛ لا تقبل تغيير hash بعيد تلقائيًا. لا تحفظ browser binaries أو مكتبات fixtures في artifact الإنتاج. تقرير كل smoke يرفق قائمة HTTP/WebSocket المحجوب وأخطاء runtime؛ لا تُخفى `pageerror` ولا يسمح مرور خطأ uncaught.

## كل ميزة: تعديل صغير، اختبار، ثم معاينة وموافقة

1. أضف/حدّث اختبارًا مركزًا للسلوك الجديد؛ القواعد pure في unit، وتفاعل DOM/render في smoke عند الحاجة. لا تثبت عدد الأبطال أو كل تفاصيل legacy بـsnapshot.
2. شغّل `npm test` أولًا، ثم الاختبار المعني و`npm run check` قبل المعاينة؛ أصلح فشلًا أصليًا بدليل بدل إسكات assertions. الأرقام في آخر actual run ليست وعد أداء ثابت.
3. كوّن artifact محليًا وراجع المعاينة والتقارير، خصوصًا mobile/desktop ومسار الرجوع. النتيجة الخضراء ليست موافقة نشر.
4. لا commit/push، ولا تغيير Pages، ولا API writes، ولا نشر/SQL إنتاج حتى موافقة المستخدم الصريحة بعد المعاينة.

## GitHub Actions وPages: الحالة الحالية ليست حماية إنتاج

يوجد workflow واحد `.github/workflows/game-pages.yml`: PR، وpush على main، وworkflow_dispatch. وظيفة `check` تنفذ fast → تحليل globals → fixtures/Chromium → smoke → packaging. `deploy` تحتاج check لنفس checkout/SHA وتستخدم artifact نفس الـrun، ولا تعمل على PR أو فرع غير main. صلاحية workflow الأساسية `contents: read`؛ فقط deploy تملك `pages: write` و`id-token: write`. إلغاء stale runs للـPR فقط؛ لا يلغي run جديد نشرًا سابقًا. المهلة 15 دقيقة لـcheck و5 لـdeploy، بلا شبكة إنتاج في browser tests.

في deploy تستخدم `configure-pages@v5` مع `enablement: false` لقراءة configuration فقط؛ ليست محاولة تفعيل Pages. رفع Pages artifact عبر `upload-pages-artifact@v4` يقتصر على main غير PR؛ PR يرفع تقارير check فقط.

**Pages الحالية legacy من main: هذا workflow لا يحمي نشرها الآن.** بعد المعاينة ثم الموافقة فقط، يلزم تغيير Settings → Pages → Source إلى **GitHub Actions**، وإعداد required status check باسم **check** على main (branch protection/ruleset ومنع bypass المباشر حسب الصلاحيات). لإبقاء موافقة بشرية قبل كل نشر، أضف required reviewer لبيئة `github-pages` بعد الموافقة على هذا الإعداد. لم يُغيّر أي من هذه Settings هنا. مجرد رفع workflow أو نجاح check لا يمنع Pages legacy من نشر main.

تقارير CI محفوظة كـ`check-reports-<SHA>` سبعة أيام. artifact Pages هو `dist/game` فقط، يتضمن index/css/js/assets و`.nojekyll`؛ لا tools/tests/docs/SQL/.git/node_modules أو CDN fixtures. التغليف يضيف `rev=<commit>-<content SHA256>` إلى local JS/CSS في **index داخل artifact فقط**، ولا يغير index المصدر. يبقي `?v=` الرقمي وآلية BUILD الموجودة؛ rev يعالج cache للملفات، وليس بديلًا عن bump source build عند تحديث إشعار النسخة.

## القياسات وحدود التغطية

تشغيل 15 نوفمبر 2026، 22:39–22:42 UTC: **65/65 fast** في **619 ms** لعملية node:test، و**75 runtime scripts** بلا parse errors في المحلل، و**4/4 smoke** في نحو **131 ثانية**. wall time لـ`npm run check` كان **135.460 ثانية**؛ تغليف **227 ملفًا** وrevision لـ**86 JS/CSS** استغرق **0.482 ثانية**. هذه قياسات sandbox لهذه الجولة وليست وعد زمن أو ضمان CI.

القياس أعلاه تاريخي قبل جمع سيناريوهات كل جهاز في إقلاع واحد؛ لا يمثل عدد الاختبارات أو زمن النسخة النهائية. آخر سجل تشغيل للمراجعة المحلية في `/home/ubuntu/ashen-review/tests.txt` و`final-results.json` يعرض العدد والزمن الفعليين بعد التحسين. `test-results/smoke.json` يتضمن إحصاءات آخر browser run. هذه ملفات مراجعة وليست production artifacts.

الخط لا يثبت gameplay balance أو جودة الفن، ولا يكشف كل missing global داخل فرع غير مستخدم: المحلل المخصص وsmoke يكملان syntax/VM. لا يفحص Safari/Firefox أو مايك/WebRTC حقيقي أو Supabase schema/RLS/network/multiplayer production؛ هذه تحتاج staging معزولًا مستقلًا. لا snapshots بصرية شاملة، لا اختبار ضغط طويل أو session rescue كامل، ولا قاعدة بيانات إنتاج. الانقطاع عند تنزيل الاعتماديات/Chromium/fixtures في CI فشل إعداد واضح لا سبب لتجاوز gate.

### التشغيل النهائي بعد التحسين

نجح تشغيل 15 نوفمبر 2026 22:45–22:47 UTC: 66 اختبارًا سريعًا، ورحلتان كاملتان في Chromium للهاتف والكمبيوتر، صفر فشل وصفر تخطٍ وصفر حالات flaky. مدة الخط 101.54 ثانية؛ smoke 98.454 ثانية. المدة محلية ولا تضمن زمن GitHub Actions. جميع التأكيدات السابقة محفوظة مع إقلاع واحد لكل جهاز.

### التشغيل النهائي بعد تنظيف الكود — 15 نوفمبر 2026، 23:32–23:34 UTC

النسخة المجمعة اجتازت **128 اختبارًا سريعًا** و**رحلتي Chromium** للهاتف والكمبيوتر، وصفر فشل/تخطٍ/flaky. استغرقت fast **1.745 ثانية**، والتحليل **1.260**، والـfixtures **0.359**، والمتصفح **90.499**، والتعبئة **0.408**؛ wall time **94.274 ثانية**. جميع التأكيدات السابقة محفوظة، وأضيفت 62 حالة توصيف وتنظيف إلى المجموعة القائمة، دون إطار أو gate إضافي. قياس محلي لا وعد CI أو دليل تحسين FPS. السجل الحالي `/home/ubuntu/ashen-cleanup/final-results.json` و`tests.txt`؛ القياسات في ashen-review تاريخية للجولة السابقة. انظر CLEANUP.md للمحذوفات المثبتة وحدود المراجعة.
