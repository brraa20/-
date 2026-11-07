# ربط منصة طلاقة بـ Supabase

تستخدم صفحات دخول المعلمين ولوحة المالك Supabase Auth وقاعدة بيانات Supabase. لا تنشر مفاتيح `service_role` أو `secret` في ملفات الموقع أو GitHub.

## 1. إعداد قاعدة البيانات

1. افتح مشروع Supabase ثم **SQL Editor → New query**.
2. انسخ محتوى `schema.sql` كاملًا ونفّذه.
3. عند تحديث مشروع موجود، نفّذ كذلك ملف `migrations/20261107_teacher_invitation_acceptance.sql`. الحسابات القديمة التي سبق أن قبلت دعوة بريد مؤكدة تبقى مقبولة؛ الحسابات الأخرى تحتاج دعوة صالحة.
4. من **Authentication → Providers → Email** فعّل البريد الإلكتروني. يلزم إعداد SMTP موثوق إذا أردت وصول دعوات المعلمين إلى بريدهم.
5. من **Authentication → URL Configuration** أضف عنوان الموقع المنشور إلى Site URL وRedirect URLs؛ مثل `https://OWNER.github.io/REPOSITORY/`.

الجداول مفعّل عليها RLS. لا يحصل حساب المعلم على صلاحيات الدخول حتى يفتح رابط دعوة Supabase الوارد إلى بريده، ينشئ كلمة المرور، وتؤكد قاعدة البيانات قبول الدعوة. تفعيل الحساب من لوحة المالك وحده لا يتجاوز قبول الدعوة. تقارير الطلاب لا يقرؤها إلا المعلم النشط المقبول صاحب صلاحية `reports`، ولا تظهر تذاكر الدعم إلا لحساب يملك صلاحية `support`.

## 2. إنشاء حساب المالك

1. من **Authentication → Users → Add user** أنشئ حساب بريد المالك وكلمة مروره.
2. انسخ UUID للحساب.
3. نفّذ الاستعلام التالي في SQL Editor مع استبدال UUID:

```sql
update public.profiles
set role = 'owner',
    active = true,
    display_name = 'مالك المنصة',
    permissions = array['reports', 'analytics', 'questions', 'interventions', 'support']
where id = 'ضع-UUID-حساب-المالك-هنا';
```

لا يمكن لمالك المنصة تحديد دوره من صفحة الموقع؛ الدور لا يعيّنه إلا مسؤول المشروع في Supabase.

تحقق من تعيين الحساب:

```sql
select id, email, role, active, permissions
from public.profiles
where id = 'ضع-UUID-حساب-المالك-هنا';
```

## 3. نشر وظيفة دعوة المعلمين

تحتاج حسابات المعلمين دعوة بالبريد؛ كلمة المرور يختارها المعلم بنفسه عبر رابط الدعوة الذي ينشئه Supabase Auth. لا تُرسل كلمة المرور المؤقتة عبر قاعدة البيانات. لا تُمنح صلاحيات لوحة المعلم قبل التحقق من الدعوة وتسجيل قبولها في قاعدة البيانات.

1. ثبّت Supabase CLI من المصدر الرسمي، ثم افتح PowerShell داخل مجلد المستودع.
2. سجّل الدخول واربط المشروع:

```powershell
supabase login
supabase link --project-ref PROJECT_REF
```

3. انشر الوظيفة:

```powershell
supabase functions deploy create-teacher
```

تستخدم الوظيفة `SUPABASE_SERVICE_ROLE_KEY` سرًا داخل بيئة Supabase فقط، وتتحقق من جلسة المستخدم ومن كونه المالك قبل إرسال أي دعوة.

## 4. إعداد الواجهة العامة

من **Project Settings → API** انسخ **Project URL** والمفتاح العام **Publishable key** (أو مفتاح `anon` القديم) وضعهما في `supabase/config.js`:

```js
window.TalalaSupabaseConfig = Object.freeze({
    url: 'https://PROJECT_REF.supabase.co',
    publishableKey: 'sb_publishable_...'
});
```

استبدل القيم بالمشروع الفعلي، ثم اختبر الموقع على HTTPS. هذه القيم مخصصة لواجهة المتصفح؛ أمان قاعدة البيانات يعتمد على RLS وليس على إخفاء المفتاح العام.

لا تضع `service_role` أو `secret key` في هذا الملف. لا تُفعّل أو تنشر المنصة قبل إعداد القيم، دعوة المالك، وتشغيل فحوص الموقع.

## حذف البيانات يدويًا

يستطيع المالك حذف سجل طالب من لوحة المعلم. ولحذف كل النتائج أو التذاكر من SQL Editor:

```sql
delete from public.assessment_attempts;
delete from public.support_tickets;
```
