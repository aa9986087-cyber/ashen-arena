# نماذج ثلاثية الأبعاد اختيارية (Optional 3D models)

ضع هنا ملفات `.glb` أو `.gltf` بالأسماء التالية، واللعبة تستبدل بها الأشكال المبنية برمجياً تلقائياً.
إذا ما وجد الملف، تبقى الأشكال الأصلية كما هي (الطلبات الفاشلة 404 متوقعة وغير مؤذية).

| اسم الملف | يستبدل |
|---|---|
| `hero.glb` | البطل |
| `grunt.glb`, `fast.glb`, `archer.glb`, `shield.glb`, `brute.glb`, `wolf.glb`, `bomber.glb`, `mage.glb`, `shaman.glb`, `golem.glb`, `runner.glb` | الأعداء |
| `boss-forest.glb` | حارس الغابة |
| `boss-sand.glb` | ملك الرمال |
| `boss-knight.glb` | الفارس الأسود |
| `boss-general.glb` | الجنرال الحديدي |
| `boss-frost.glb` | ملك الصقيع |
| `boss-flame.glb` | سيد اللهب |

ملاحظات:
- النماذج تُحمّل فقط عند التشغيل عبر `http/https` (مو `file://`).
- كل نموذج يُصغّر/يُكبّر تلقائياً لطول الشكل الأصلي، وألوانه (والـ texture) تُخبز في ألوان الرؤوس.
- قائمة الأسماء موجودة في `MODEL_SLOTS` داخل `js/render/models.js`، والمجلد في `MODEL_DIR` داخل `js/core/config.js`.
