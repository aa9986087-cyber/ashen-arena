# المحرك المشترك وعقد الدمج

`actor-runtime.js` مشتق من `c0c1701f7c35abc8766c0fd9bdac61417bb524d5:test/js/render/actor-models.js`؛ نسخة واحدة فقط للفارس والرامي وحارس الغابة. لا يحتوي جسم زعيم الفارس ولا يبدأ تحميلًا أو معركة عند تشغيله. `textureEdge=1024` و`fade=0.08` إعدادان مشتركان، وبقية `ACTOR_CONFIG` تأتي حصريًا من الإضافات المسجلة والمفعّلة. بيانات مصدر المحرك وبصمته في `manifest.json`.

## السجل الذي تملكه نسخة التجربة

ليس جزءًا من هذه الحزم. يلزم تهيئة `window.ASHEN_ADDONS` أولًا بالواجهات:

- `define(id, descriptor)` يحفظ الوصف دون تفعيله أو طلب أصل.
- `enabled(id)` يرجع قيمة منطقية، والافتراضي `false` لكل الإضافات؛ `config.json` الافتراضي `[]`.
- `actorConfigs()` يرجع `{ [descriptor.actorKey]: descriptor.actor }` للإضافات المفعّلة فقط.
- `queueMelee(apply)` يمر على `hooks.queueMelee` للإضافات المفعّلة؛ إذا لم يرجع أي خطاف `true` ينفّذ `apply()` فورًا.
- `updateMelee()` يستدعي `hooks.updateMelee` للطابور؛ يجب السماح بالتنظيف عند تعطيل الفارس بعد وجود طابور. `clearMelee()` يستدعي `hooks.clearMelee` عند تغيير الجولة/اللاعب.
- `weapon(R,id,t,ev,tc,em,s)` يرجع `true` إذا بنى `hooks.weapon` للإضافة المفعّلة السلاح، وإلا `false`.
- `portrait(id)` يرجع `descriptor.portrait` للإضافة المفعّلة المطابقة فقط، وإلا قيمة فارغة، دون جلب الصورة.

تفعيل التطوير الاختياري عبر `?addons=knight,ranger,forest-guardian`؛ تغييرات مجموعة التفعيل تستلزم إعادة تحميل الصفحة. لا تغيّر مجموعة التفعيل أثناء اللعب؛ المحرك يلتقط إعدادات المفعّلين عند تشغيله. `define` لا يغيّر `config.json` ولا يتجاوز الإعداد الافتراضي.

## الترتيب الصريح

سكربتات كلاسيكية خارجية متتابعة (ليست `async`، ولا `type=module` لأن الإعدادات تعتمد `document.currentScript.src`):

1. سجل النسخة الجديد وإعداد التفعيل الافتراضي الفارغ.
2. `knight/melee.js` ثم `knight/config.js`.
3. `ranger/bow-weapon.js` ثم `ranger/config.js`.
4. `forest-guardian/config.js`.
5. سكربتات خط الأساس كالمعتاد؛ تحميل المحرك `shared/actor-runtime.js` مرة واحدة **بعد** `js/render/models.js` و**قبل** `js/main.js`.

يمكن تحميل ملفات التعريف دون أي أصل عند تعطيلها، أو حذف سكربتات الإضافة المعطلة. ينبغي عدم تحميل ملفات `test/js` القديمة أو `actor-models.js` إلى جانب هذا المحرك. مسار الأصل محسوب من URL سكربت `config.js`، ولذلك لا يعتمد مسار الإصدار الجديد أو مسارات أصول الاختبار القديم. لكل أصل وسم كاش من نسخة إضافته.

## الخطافات المحايدة في نسخة نظيفة من الإنتاج

1. بداية `buildRig(R,charId,wep)` قبل الجسم البدائي: `if (typeof buildActorRig === 'function' && buildActorRig(R,charId,wep)) return;` ثم `actorReleaseRig(R)` إن كانت متاحة، وإلا إزالة الجسم القديمة. هذا يحرر النموذج الصحيح قبل العودة إلى خط الأساس.
2. بداية `poseRig(R,p,wepId,playing,now)`: `if (typeof actorRigPose === 'function' && actorRigPose(R,p,wepId,playing,now)) return;` حتى لا يحاول خط الأساس تحريك أطراف غير موجودة في الهيكل المطوّر.
3. بداية `buildWeapon(R,wep)`: نادِ `actorWeaponWillRebuild(R)` إن كانت متاحة؛ ثم احتفظ بالمسح والمعاملات الأصلية. **قبل** `const model = weaponModel(...)`: `if (window.ASHEN_ADDONS && ASHEN_ADDONS.weapon(R,id,t,ev,tc,em,s)) return;`. `actorWeaponSync(R)` اختياري بعد البناء؛ المحرك ينفّذه بعد كل وضعية أيضًا. لا يلزم تعديل `WEP_MODEL` عالميًا.
4. بداية `heroPortrait(id)`: إن أعاد `ASHEN_ADDONS.portrait(id)` مسارًا استخدمه وأعده قبل مسار بناء الصورة القديم؛ وإلا تابع كالمعتاد. لا حاجة لاستبدال صور الأبطال غير المفعّلين.
5. اختيار الشخصية/بناء القائمة/بدء الجولة: طلب `loadActor(id)` أو `loadActors()` للشخصية المحلية المختارة دون انتظار حاجب؛ المحرك يعيد `buildPlayer()` عند جاهزيتها. لا تطلب نماذج الأبطال الآخرين ولا تستورد قائمة الأبطال القديمة.
6. في `fire()` أبقِ كتلة `if (d.melee)` الأصلية كاملة داخل `applyMelee`، ثم `ASHEN_ADDONS.queueMelee(applyMelee)` أو `applyMelee()` عند غياب السجل. أبقِ صوت الضربة القريبة داخل نفس كتلة التطبيق لتطابق 0.04 ثانية، وصوت السلاح غير القريب فوريًا. لا تغيّر الحسابات أو المدى أو القوس أو حلقة الأعداء. نادِ `ASHEN_ADDONS.updateMelee()` بعد تقدم `G.t` في المحاكاة، وأيضًا أثناء التوقف/الموت/البطاقات لإلغاء الضربات القديمة، و`clearMelee()` في بداية الجولة/تغيير اللاعب. الطابور مملوك للفارس وحده؛ بقية الأبطال يعملون فورًا كما في الإنتاج.
7. عند أي إطلاق حقيقي: يمكن زيادة `p.swingT` واستدعاء `actorNotify(p,'attack')` إن كانت متاحة. هذا مهم لإشارات إطلاق الرامي المتكررة. عند فقدان صحة حقيقي نادِ `actorNotify(entity,'hurt')`، وليس عند وميض التحضير. الفارس يتزامن مع `p.meleeVisual` من طابوره بدل إشعار لكل ضحية.
8. قبل زعيم الغابة: `loadBossActor(0)`؛ بقية الأنواع تعيد `Promise.resolve([])`. في حلقة الزعيم: `const actorBody = actorBossRender(e,now)`، و`bossMesh.visible = !actorBody`؛ نفّذ الجسم البدائي فقط إذا `!actorBody`، وأبقِ الهالة والـHUD خارج الشرط. استدعِ `actorBossFrame(now)` لكل إطار، و`actorBossHide(e)` عند الموت والإزالة و`actorBossHide()` عند مسح الحالة.
9. إن أردت انتظار نموذج الحارس قبل سينمائية دخوله، اجعل الانتظار في مسار الزعيم مع تجميد المحاكاة/الضرر والكاميرا الموجود في خط الأساس؛ لا تجعل بداية المعركة تلقائية. طول/دوران الكاميرا لا تعدّله هذه الحزمة.

## التوافق والتحقق

يتوقع المحرك `THREE` r128 و`GLTFLoader`، و`scene` و`renderer` و`GEO` و`PM` و`S` و`G` ومساعدي `buildWeapon`/`buildPlayer` من خط الأساس. يتعامل مع اللاعب المحلي فقط؛ لا يحوّل نماذج زملاء التعاون. يحدد ارتفاع الحارس من `GEO.boss0` وقت الطلب؛ لا تطلبه قبل تهيئة الهندسة أو اضبط `height` رقمًا موجبًا في إضافته. عند فشل أصل يعود إلى جسم خط الأساس، ولا يحتوي الحزم عارضًا تلقائيًا أو سجل إنتاج أو اتصال قاعدة بيانات.

التحقق المحلي: `node test/addons/shared/verify-addons.cjs` و`node --check` لكل ملفات JavaScript. الاختبار يتحقق من مجموعات التفعيل الثماني وعزل الطلبات وطابور الفارس وتجاوز القوس وبصمات الأصول، لكنه لا يحل محل اختبار المتصفح الفعلي على الجوال والكمبيوتر الذي يجريه مالك نسخة التجربة. لم تُجرَ تجربة متصفح ضمن إنشاء الحزم.

### الدوال المتاحة

`loadActors`, `loadActor`, `loadBossActor`, `buildActorRig`, `actorRigPose`, `actorReleaseRig`, `actorWeaponWillRebuild`, `actorWeaponSync`, `actorNotify`, `actorBossRender`, `actorBossHide`, `actorBossFrame`, `disposeActors`؛ إضافيًا `actorEnabled`, `actorMeleeTiming`, `actorWeaponOverride`. يمكن استخدام `actorWeaponOverride` بدل خطاف السجل للقوس، وليس الاثنين معًا. `loadActor` يقبل الفارس/الرامي فقط؛ المجهول أو المعطّل لا يجلب شيئًا.
