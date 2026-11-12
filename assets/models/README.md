# النماذج ثلاثية الأبعاد

النماذج هنا تحل محل الأشكال المبنية بالكود. اللعبة تحوّل كل نموذج لألوان مسطحة، وتكبّره أو تصغّره على حجم الشكل اللي يحل محله.

**الحركة:** وقت التحميل تاخذ اللعبة لقطات من كل حركة (عددها في `ANIM_FRAMES` داخل `js/render/models.js`) وتعرضها ورا بعض مثل الرسوم المتحركة. بهالطريقة تتحرك مئات الأعداء بدون ما تثقل على الجوال. أسماء الحركات اللي تعرفها اللعبة:
- **الأعداء:** `walk`.
- **الزعماء:** `walk` و`attack`، والهجوم يشتغل وقت التحضير للضربات.
- **البطل:** `idle` و`run` و`attack`.

أداة `tools/prepare-models.mjs` تختار الحركات من الملف الأصلي وتسمّيها بهالأسماء.

## الموجود حالياً

| الملف | يحل محل | المصدر |
|---|---|---|
| `hero-knight.glb` | البطل: الفارس | KayKit Adventurers (Knight) |
| `hero-berserker.glb` | البطل: البربري | KayKit Adventurers (Barbarian) |
| `hero-mage.glb` | البطلة: الساحرة | KayKit Adventurers (Mage) |
| `hero-ranger.glb` | البطلة: الرامية | KayKit Adventurers (Rogue) |
| `hero-assassin.glb` | البطل: القاتل | KayKit Adventurers (Rogue Hooded) |
| `grunt.glb` | الجندي | KayKit Skeletons (Minion + فأس) |
| `shield.glb` | حامل الدرع | KayKit Skeletons (Warrior + سيف ودرع) |
| `archer.glb` | الرامي | KayKit Skeletons (Rogue + قوس) |
| `mage.glb` | الساحر | KayKit Skeletons (Mage + عصا) |
| `wolf.glb` | الذئب | Quaternius Animals (Wolf) |
| `fast.glb` | السريع | Quaternius Easy Enemies (Spider) |
| `runner.glb` | الراكض | Quaternius Easy Enemies (Snake) |
| `bomber.glb` | الانتحاري | Quaternius Ultimate Monsters (Flying Demon) |
| `shaman.glb` | الشامان | Quaternius Ultimate Monsters (Alpaking Evolved) |
| `boss-forest.glb` | حارس الغابة | Quaternius Ultimate Monsters (Orc Skull) |
| `boss-knight.glb` | الفارس الأسود | Quaternius Ultimate Monsters (Demon) |
| `boss-frost.glb` | ملك الصقيع | Quaternius Ultimate Monsters (Yeti) |
| `boss-flame.glb` | سيد اللهب | Quaternius Ultimate Monsters (Dragon Evolved) |

## الرخصة

كل النماذج رخصتها **CC0** (ملكية عامة): تقدر تستخدمها وتعدلها حتى تجارياً، بدون ذكر المصدر. ومع ذلك نشكرهم:
- **KayKit** من Kay Lousberg: https://kaylousberg.com
- **Quaternius**: https://quaternius.com

## إضافة نموذج جديد

1. جهّز الملف بأداة `tools/prepare-models.mjs`. تشيل الحركات، وتصغّر الصور، وتشيل الأشياء اللي اللعبة ترسمها بنفسها (مثل سلاح البطل)، فيصير الملف أصغر بحوالي 10 مرات.
2. ضع ملف `.glb` في هذا المجلد.
3. أضفه في `MODEL_FILES` داخل `js/render/models.js`. مثلاً `'brute.glb': 'brute'`، أو لبطل `'hero-mage.glb': 'hero:mage'`.
   - تقدر تضبط الحجم بـ `size` (مثل `{ to: 'fast', size: 0.45 }`).
   - وتقدر تغمّق النموذج بـ `tint: true`.
4. إذا عدّلت ملف موجود، زد `MODEL_VER` عشان المتصفحات تحمّل النسخة الجديدة.

النماذج ما تشتغل لما تفتح اللعبة من `file://`، لازم تشغلها عبر `http`.
