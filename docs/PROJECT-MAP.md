# ابدأ من هنا

لعبة جوال أولًا. اقرأ `AGENTS.md` و`HANDOFF.md`، ثم صف المهمة في الجدول فقط. لا تبدأ بمسح المستودع كله.

| المهمة | مصدر التعديل / موضع البداية | الفحص المناسب |
|---|---|---|
| خبر أو نص | `js/data/news.js`؛ عرض النشرة `js/ui/news.js` | `npm test`، دون متصفح للبيانات النصية وحدها |
| ضربات/شفاء/وحوش | `js/game/combat.js`، `enemy-ai.js`، `update.js` | اختبار العطل في `tests/*regressions*` أو `shaman-healing.test.mjs` + mobile |
| بطاقات/تقدم | `js/game/cards.js`، `progression.js`، `js/data/upgrades.js` | قواعد + mobile |
| حفظ/استكمال/مهارات | `js/core/save.js`، `penalties.js`، `js/game/run.js`، `js/ui/backup.js` | قواعد الحفظ + mobile |
| واجهة/لمس/حجم الشاشة | `js/input.js`، `css/` وملف الشاشة في `js/ui/`؛ ترتيب الموارد في `index.html` | mobile باللمس؛ راجع وضوح الأزرار ومسار الرجوع |
| نماذج/حركة/صوت | `js/render/`، `js/audio/`؛ ابحث عن الاسم داخل المجلد أولًا | mobile؛ جودة الفن/أجهزة فعلية حسب التغيير |
| مجسمات الأبطال والزعماء | الرسمية في `js/content/actors/` و`assets/models/`، والتجربة المعزولة في `test/addons/` | اختبر التحميل والحركة على الجوال |
| تعديل تجربة عام | `test/tools/modular-runtime/` و`build-modular-test.py` | المصدر إنتاج مثبت بـSHA؛ لا تعدّل ناتج البناء |
| حارس العهد وخرائط الحملة | `js/content/{gravebound,oath-warden,maps,bosses}/`، ومصادر v33 في `test/expansions/` | `tests/gravebound.test.mjs` واختبارات الحملة على الجوال |
| شبكة/قاعدة بيانات | `js/duel/duel-net.js`، شاشات `js/ui/` المعنية، `supabase/`؛ ابحث عن RPC بالاسم | اختبار معزول متخصص؛ المتصفح لا يثبت SQL/RLS |
| اختبارات/نشر | `tools/change-scope.mjs`، `.github/workflows/game-pages.yml`، `playwright.config.mjs` | `npm test` + workflow + mobile عند تعديل أدوات الفحص |

## أوامر يومية

```sh
npm run check:plan                         # فرق origin/main مع HEAD والملفات المحلية
npm run check:plan -- --base HEAD          # التعديل غير الملتزم فقط
npm test                                  # سريع دائمًا
npm run test:smoke                         # Chromium جوال 390×844 بلمس فعلي
npm run test:desktop                       # اختياري
npm run test:all                           # الجوال ثم الكمبيوتر
npm run analyze                           # عند تغيير كود أو علاقات الملفات
```

التثبيت أول مرة فقط: `npm ci`، `npm run test:fixtures`، `npx playwright install chromium`. لا تعِد التثبيت ما لم تتغير الاعتماديات أو تختفِ البيئة. لا بديل عن فحص Safari/جهاز فعلي عند مشكلة تخصهما؛ محاكاة Chromium ليست اختبار آيفون حقيقيًا.

CI يحتفظ باسم `check`: fast دائمًا؛ الوثائق وبيانات الأخبار الثابتة تتجاوز التحليل وChromium. غير ذلك يفحص الجوال. الملفات المختلطة/المجهولة، حذف الأخبار أو كود تنفيذي داخلها، وتاريخ Git غير المتاح تأخذ مسار الجوال. التشغيل اليدوي يفحص الجوال دائمًا مع خيار إضافة الكمبيوتر. التغليف وبوابة النشر يبقيان مستقلين عن تخفيف فحص المتصفح.

`tools/update-handoff.mjs` يحدّث قسم `AUTO-HANDOFF` في `HANDOFF.md` تلقائيًا بعد فحوص push إلى main؛ يسجّل المرجع وملفات الدفعة وأحدث خمس دفعات ونتيجة الفحوص وإصدار التجربة. يحفظ القسم اليدوي كما هو ولا يخمّن المهام أو قرارات المحادثة. job واحد بصلاحية كتابة إلى المستودع، لا يعمل على PR ولا يعيد تشغيل نفسه؛ إذا تقدّم main يترك التسجيل للتشغيل الأحدث. كل مساعد يرفع عمله ويحدّث السياق اليدوي قبل التسليم.

ابحث في المصدر الصغير: `rg -n 'اسم الدالة' js/game` أو `rg --files js/ui`. استعمل `rg --no-ignore` لملف معروف داخل `test/releases/` عند فحص ناتج البناء فقط. تفاصيل أعمق عند الحاجة: `DEVELOPMENT.md` و`TESTING.md`.
