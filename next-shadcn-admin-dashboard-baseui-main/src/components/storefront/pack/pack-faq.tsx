import { ChevronDown, HelpCircle } from "lucide-react";

export function PackFaq({ className = "" }: { className?: string }) {
  const faqs = [
    {
      q: "هل يمكنني فتح الطرد وفحصه قبل أن أدفع؟",
      a: "نعم، بكل تأكيد! نحن نعتمد سياسة المعاينة قبل الدفع (السلعة يداً بيد). يحق لك فتح الطرد والتأكد من مطابقة وسلامة جميع الأدوات المذكورة في العرض قبل تسليم أي سنتيم لموزع التوصيل.",
    },
    {
      q: "كم يستغرق وصول الطرد إلى ولايتي؟",
      a: "يصل الطرد عادةً خلال 24 إلى 48 ساعة لكافة ولايات الشمال والهضاب العليا، ومن 48 إلى 72 ساعة كأقصى تقدير للولايات الجنوبية والصحراوية.",
    },
    {
      q: "كيف يتم تأكيد طلبيتي بعد التسجيل في الموقع؟",
      a: "بمجرد الضغط على زر تأكيد الطلب، يتصل بك أحد مسؤولي خدمة الزبائن عبر رقمك المسجل لتأكيد العنوان واختيار طريقة التوصيل المفضلة لديك (إلى باب المنزل أو مكتب التوصيل القريب منك).",
    },
    {
      q: "هل الماكينات والأدوات أصلية ومضمونة؟",
      a: "نعم، جميع ماكينات وأدوات CROWN و STARCLE PRO المعروضة في متجر ORVA Store أصلية 100% ومطابقة لكافة المعايير والمواصفات الفنية المذكورة.",
    },
    {
      q: "ماذا أفعل في حالة وجود أي عيب مصنعي أو استفسار بعد الاستلام؟",
      a: "خدمة الزبائن في خدمتكم دائماً. يمكنك الاتصال بنا مباشرة على الرقم 0798282495، وسيقوم فريقنا بمتابعة استفسارك أو استبدال أي قطعة متضررة مجاناً وفوراً.",
    },
    {
      q: "هل الاستلام من مكتب التوصيل (Stop-Desk) متوفر في ولايتي؟",
      a: "خدمة الاستلام من مكتب التوصيل متاحة في الولايات 1 إلى 48 بسعر مخفض، في حين تقتصر الولايات الجنوبية العشر الجديدة (49 إلى 58) على التوصيل السريع لباب المنزل فقط لضمان سلامة الطرود.",
    },
  ];

  return (
    <section className={`py-12 border-t border-slate-200 ${className}`} dir="rtl">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <div className="bg-white rounded-3xl p-6 sm:p-10 border-2 border-slate-200 shadow-xs space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center gap-1.5 bg-amber-100 text-amber-900 border border-amber-300 rounded-full px-3 py-1 text-xs font-bold">
              <HelpCircle className="size-3.5 text-amber-700" />
              <span>إجابات لجميع استفساراتكم الشائعة</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900">
              الأسئلة الشائعة حول الطلب، المعاينة والتوصيل
            </h2>
            <p className="text-xs sm:text-sm text-slate-600">كل ما تحتاج معرفته قبل تأكيد طلب باقتك من متجر أورفا</p>
          </div>

          <div className="space-y-4 divide-y divide-slate-100 pt-2 text-right">
            {faqs.map((faq, index) => (
              <details key={index} className="group pt-4 [&_summary::-webkit-details-marker]:hidden" open={index === 0}>
                <summary className="flex cursor-pointer items-center justify-between gap-1.5 rounded-lg text-slate-900 font-bold text-sm sm:text-base hover:text-amber-600 transition">
                  <h3 className="text-sm sm:text-base font-bold">{faq.q}</h3>
                  <div className="size-6 shrink-0 rounded-full bg-slate-100 group-open:bg-amber-100 flex items-center justify-center transition">
                    <ChevronDown className="size-4 text-slate-600 group-open:rotate-180 group-open:text-amber-700 transition-transform duration-200" />
                  </div>
                </summary>
                <p className="mt-3 text-xs sm:text-sm text-slate-600 leading-relaxed pr-2">{faq.a}</p>
              </details>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
