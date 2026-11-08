import Image from "next/image";
import Link from "next/link";

import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Flame,
  Headphones,
  HelpCircle,
  PhoneCall,
  ShieldCheck,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Truck,
  Wrench,
} from "lucide-react";

import WaveMesh from "@/components/ui/wave-mesh";
import { Button } from "@/components/ui/button";

export default function StorefrontHomePage() {
  return (
    <div className="space-y-16 sm:space-y-24 pb-20">
      {/* 1. Hero Banner */}
      <section className="relative overflow-hidden border-b border-slate-200 bg-white pt-12 pb-16 sm:pt-20">
        <div className="pointer-events-none absolute inset-0 z-0">
          <WaveMesh colors={["#f8fafc", "#334155", "#f59e0b"]} className="h-full w-full" />
        </div>
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6">
          <div className="max-w-3xl mx-auto text-center space-y-6">
            <div className="inline-flex items-center gap-2 bg-amber-100/80 text-amber-900 border border-amber-300 rounded-full px-4 py-1.5 text-xs sm:text-sm font-bold shadow-2xs">
              <Sparkles className="size-4 text-amber-600" />
              <span>متجر أورفا الرسمي لأدوات الورشة والصيانة</span>
            </div>

            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-slate-900 leading-tight">
              عتاد متين وقوي لكل ورشة
            </h1>

            <p className="text-base sm:text-lg text-slate-600 leading-relaxed">
              أدوات أصلية من <strong className="text-slate-900">CROWN</strong> و{" "}
              <strong className="text-slate-900">STARCLE PRO</strong>، مختارة للأشغال اليومية الشاقة. اطلب بسهولة واستفد
              من التوصيل والدفع عند الاستلام.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
              <a
                href="#packs-section"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-base px-6 py-3.5 shadow-md shadow-amber-600/25 transition active:scale-95"
              >
                <span>اكتشف الباقات</span>
                <ChevronDown className="size-5" />
              </a>
              <Link
                href="/pack1"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-white hover:bg-slate-50 text-slate-800 font-bold text-base px-6 py-3.5 border border-slate-300 shadow-2xs transition"
              >
                <span>شاهد الباقة الأكثر طلباً</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Featured 3 Packs Grid */}
      <section id="packs-section" className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-12">
          <div className="inline-block bg-amber-100 text-amber-800 font-bold text-xs rounded-full px-3 py-1 mb-2">
            عروض حصرية لفترة محدودة
          </div>
          <h2 className="text-3xl sm:text-4xl font-black text-slate-900">باقات العتاد الجاهزة للتوصيل</h2>
          <p className="text-sm sm:text-base text-slate-600 mt-2">
            اختر الباقة المناسبة لاحتياجاتك واضغط عليها لتعبئة إستمارة الطلب السريع في ثوانٍ.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Pack 1 */}
          <div className="bg-white rounded-3xl border-2 border-slate-200 hover:border-amber-500 overflow-hidden shadow-sm hover:shadow-xl transition-all flex flex-col group">
            <div className="relative bg-slate-100 p-6 flex items-center justify-center aspect-4/3">
              <span className="absolute top-4 right-4 bg-slate-900/80 text-amber-400 border border-amber-500/30 text-xs font-bold px-3 py-1 rounded-full shadow-xs">
                باقة 4 في 1
              </span>
              <Image
                src="/images/packs/pack-1/hero.webp"
                alt="باك كومبريسار و المفاتيح 4 في 1"
                width={400}
                height={300}
                className="object-contain max-h-56 group-hover:scale-105 transition-transform duration-300"
              />
            </div>

            <div className="p-6 flex-1 flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <h3 className="text-xl font-black text-slate-900">باك كومبريسار و المفاتيح 4 في 1</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  الحل المتكامل لطوارئ السيارة وأشغال البيت: منفاخ إطارات، طقم مفاتيح 46 قطعة، ومفكات.
                </p>

                <ul className="space-y-2 text-xs font-medium text-slate-700">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
                    <span>منفاخ عجلات TOYOTA مع عداد ضغط مدمج</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
                    <span>علبة مفاتيح ورؤوس 46 قطعة STARCLE PRO</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
                    <span>مفك مرن 11 قطعة STARCLE PRO</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
                    <span>طقم 6 مفكات بمقابض مريحة</span>
                  </li>
                </ul>
              </div>

              <div className="pt-4 border-t border-slate-100 space-y-3">
                <div className="flex items-baseline justify-between">
                  <div>
                    <span className="text-xs text-slate-400 line-through font-mono">9,750 د.ج</span>
                    <div className="text-2xl font-black text-slate-900 font-mono">4,950 د.ج</div>
                  </div>
                  <span className="text-[10px] bg-red-500/20 text-red-600 px-2 py-0.5 rounded font-bold">
                    توفير 4,800 د.ج
                  </span>
                </div>

                <Link
                  href="/pack1"
                  className="w-full inline-flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black py-3 px-4 rounded-lg shadow-md transition active:scale-95"
                >
                  <span>معاينة وطلب الباقة الآن</span>
                  <ArrowLeft className="size-4" />
                </Link>
              </div>
            </div>
          </div>

          {/* Pack 2 */}
          <div className="bg-white rounded-3xl border-2 border-amber-500 overflow-hidden shadow-md hover:shadow-xl transition-all flex flex-col group relative">
            <div className="relative bg-slate-100 p-6 flex items-center justify-center aspect-4/3">
              <span className="absolute top-4 right-4 bg-slate-900/80 text-amber-400 border border-amber-500/30 text-xs font-bold px-3 py-1 rounded-full shadow-xs">
                باقة 5 في 1
              </span>
              <Image
                src="/images/packs/pack-2/hero.webp"
                alt="باك الفيسوز كراون Elite"
                width={400}
                height={300}
                className="object-contain max-h-56 group-hover:scale-105 transition-transform duration-300"
              />
            </div>

            <div className="p-6 flex-1 flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <h3 className="text-xl font-black text-slate-900">باك الفيسوز كراون Elite (Pack Pro 2)</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  ماكينة ثقب CROWN 20V الأصلية ببطاريتين مع طقم مفاتيح وعتاد متكامل للورشة.
                </p>

                <ul className="space-y-2 text-xs font-medium text-slate-700">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-amber-600 shrink-0" />
                    <span>ماكينة ثقب CROWN 20V مع 2 بطاريات قوية وحقيبة 29 قطعة</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-amber-600 shrink-0" />
                    <span>علبة مفاتيح ورؤوس 46 قطعة STARCLE PRO</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-amber-600 shrink-0" />
                    <span>مفك مرن 11 قطعة STARCLE PRO</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-amber-600 shrink-0" />
                    <span>طقم مفكات 6 قطع + قفازات حماية GILAN</span>
                  </li>
                </ul>
              </div>

              <div className="pt-4 border-t border-slate-100 space-y-3">
                <div className="flex items-baseline justify-between">
                  <div>
                    <span className="text-xs text-slate-400 line-through font-mono">21,250 د.ج</span>
                    <div className="text-2xl font-black text-slate-900 font-mono">12,950 د.ج</div>
                  </div>
                  <span className="text-[10px] bg-red-500/20 text-red-600 px-2 py-0.5 rounded font-bold">
                    توفير 8,300 د.ج
                  </span>
                </div>

                <Link
                  href="/pack2"
                  className="w-full inline-flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black py-3 px-4 rounded-lg shadow-md transition active:scale-95"
                >
                  <span>معاينة وطلب باقة الورشة</span>
                  <ArrowLeft className="size-4" />
                </Link>
              </div>
            </div>
          </div>

          {/* Pack 3 */}
          <div className="bg-white rounded-3xl border-2 border-slate-200 hover:border-amber-500 overflow-hidden shadow-sm hover:shadow-xl transition-all flex flex-col group">
            <div className="relative bg-slate-100 p-6 flex items-center justify-center aspect-4/3">
              <span className="absolute top-4 right-4 bg-slate-900/80 text-amber-400 border border-amber-500/30 text-xs font-bold px-3 py-1 rounded-full shadow-xs">
                باقة 6 في 1
              </span>
              <Image
                src="/images/packs/pack-3/hero.webp"
                alt="باك سودير كراون الصلب"
                width={400}
                height={300}
                className="object-contain max-h-56 group-hover:scale-105 transition-transform duration-300"
              />
            </div>

            <div className="p-6 flex-1 flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <h3 className="text-xl font-black text-slate-900">باك سودير كراون الصلب 6 في 1</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  ماكينة لحام CROWN CT33102 MMA-200 MINI مع نظام أمان VRD وملحقات اللحام الكاملة.
                </p>

                <ul className="space-y-2 text-xs font-medium text-slate-700">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
                    <span>ماكينة لحام CROWN CT33102 MMA-200 MINI</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
                    <span>تحكم رقمي في قوة اللحام ونظام أمان VRD</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
                    <span>قفازات GILAN المضادة للقطع وقناع اللحام</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
                    <span>فرشاة سلك + كوابل لحام + طقم مفكات 6 قطع</span>
                  </li>
                </ul>
              </div>

              <div className="pt-4 border-t border-slate-100 space-y-3">
                <div className="flex items-baseline justify-between">
                  <div>
                    <span className="text-xs text-slate-400 line-through font-mono">24,500 د.ج</span>
                    <div className="text-2xl font-black text-slate-900 font-mono">15,950 د.ج</div>
                  </div>
                  <span className="text-[10px] bg-red-500/20 text-red-600 px-2 py-0.5 rounded font-bold">
                    توفير 8,550 د.ج
                  </span>
                </div>

                <Link
                  href="/pack3"
                  className="w-full inline-flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black py-3 px-4 rounded-lg shadow-md transition active:scale-95"
                >
                  <span>معاينة وطلب باقة اللحام</span>
                  <ArrowLeft className="size-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. 4-Pillar Buyer Reassurance Grid */}

      {/* 5. Key Advantages */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:col-span-2 sm:p-9">
            <div aria-hidden className="pointer-events-none absolute inset-0 opacity-70" style={{ background: "radial-gradient(ellipse 60% 100% at 75% 50%, rgba(245,158,11,0.12), transparent)" }} />
            <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="max-w-2xl">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-amber-800">ضمانات أورفا</span>
                <h3 className="mt-4 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">ضمانات متجر أورفا الرسمية</h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">التزامنا الصارم بتقديم تجربة شراء مريحة ومحمية لكل مواطن جزائري</p>
              </div>
              <a href="#packs-section" className="inline-flex w-fit shrink-0 items-center gap-2 rounded-xl bg-amber-600 px-5 py-3 font-bold text-white shadow-sm transition hover:bg-amber-700">تصفح الباقات <ArrowLeft className="size-4" /></a>
            </div>
          </div>
          <div className="flex flex-col gap-5 rounded-3xl border border-slate-200 bg-slate-50/70 p-7">
            <div className="grid size-11 place-items-center rounded-xl border border-slate-200 bg-white text-amber-600"><Truck className="size-5" /></div>
            <div><h4 className="text-base font-black text-slate-900">حاجة متينة و قوية</h4><p className="mt-2 text-sm leading-relaxed text-slate-600">أدوات قوية ومتينة مصممة لترافقك في الورشة وتتحمل ضغط الأشغال اليومية.</p></div>
          </div>
          <div className="flex flex-col gap-5 rounded-3xl border border-slate-200 bg-slate-50/70 p-7">
            <div className="grid size-11 place-items-center rounded-xl border border-slate-200 bg-white text-emerald-600"><RotateCcw className="size-5" /></div>
            <div><h4 className="text-base font-black text-slate-900">حق الاستبدال في حالة وجود عيب</h4><p className="mt-2 text-sm leading-relaxed text-slate-600">إذا وجدت أي نقص أو خلل مصنعي عند الاستلام، نوفر لك خدمة استبدال فورية دون أي تعقيد.</p></div>
          </div>
          <div className="flex flex-col gap-5 rounded-3xl border border-slate-200 bg-slate-50/70 p-7 sm:col-span-2">
            <div className="grid size-11 place-items-center rounded-xl border border-slate-200 bg-white text-violet-600"><Headphones className="size-5" /></div>
            <div><h4 className="text-base font-black text-slate-900">متابعة هاتفية خطوة بخطوة</h4><p className="mt-2 text-sm leading-relaxed text-slate-600">فريق خدمة العملاء متواجد لمرافقتك منذ لحظة تأكيد الطلبية عبر الهاتف وحتى تسلم الطرد بين يديك.</p></div>
          </div>
        </div>
      </section>

      {/* 6. Frequently Asked Questions (FAQ) */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-9">
          <div className="text-right space-y-2">
            <div className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-700 rounded-full px-3 py-1 text-xs font-bold">
              <HelpCircle className="size-3.5 text-amber-600" />
              <span>إجابات لجميع استفساراتكم</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900">الأسئلة الشائعة حول الطلب والتوصيل</h2>
          </div>

          <div className="space-y-4 divide-y divide-slate-100 pt-2 text-right">
            <div className="pt-4 space-y-1.5">
              <h4 className="font-bold text-base text-slate-900">هل يمكنني فتح الطرد وفحصه قبل أن أدفع؟</h4>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                نعم، بكل تأكيد! نحن نعتمد سياسة المعاينة قبل الدفع. يحق لك فتح الطرد والتأكد من مطابقة جميع الأدوات
                المذكورة في العرض قبل تسليم أي سنتيم للموزع.
              </p>
            </div>

            <div className="pt-4 space-y-1.5">
              <h4 className="font-bold text-base text-slate-900">كم يستغرق وصول الطرد إلى ولايتي؟</h4>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                يصل الطرد عادةً خلال 24 إلى 48 ساعة لكافة ولايات الشمال والهضاب، ومن 48 إلى 72 ساعة كأقصى تقدير للولايات
                الجنوبية.
              </p>
            </div>

            <div className="pt-4 space-y-1.5">
              <h4 className="font-bold text-base text-slate-900">كيف يتم تأكيد طلبيتي بعد التسجيل في الموقع؟</h4>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                بمجرد إرسال الإستمارة، يتصل بك أحد مسؤولي خدمة العملاء عبر رقمك المسجل لتأكيد العنوان واختيار طريقة
                التوصيل (إلى المنزل أو مكتب التوصيل).
              </p>
            </div>

            <div className="pt-4 space-y-1.5">
              <h4 className="font-bold text-base text-slate-900">هل المنتجات أصلية؟</h4>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                نعم، جميع ماكينات وأدوات CROWN و STARCLE PRO المعروضة في المتجر أصلية ومطابقة للمواصفات الفنية المذكورة.
              </p>
            </div>
          </div>
          </div>
          <aside className="lg:sticky lg:top-28 rounded-3xl bg-slate-950 p-7 text-white shadow-lg">
            <div className="mb-4 grid size-11 place-items-center rounded-xl bg-amber-500/15 text-amber-400"><PhoneCall className="size-5" /></div>
            <p className="text-sm font-bold text-amber-300">مزلت حاب تأكد ؟</p>
            <h3 className="mt-2 text-2xl font-black leading-snug">اطلب الباك القوي من عند Orva</h3>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">اختار الباقة المناسبة، ونكملوا معاك تأكيد الطلب هاتفياً بكل سهولة.</p>
            <div className="mt-6 flex flex-col gap-3">
              <Link href="/pack1" className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3 font-black text-slate-950 transition hover:bg-amber-400">اكتشف الباقات <ArrowLeft className="size-4" /></Link>
              <a href="tel:0798282495" className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 px-4 py-3 text-sm font-bold text-white transition hover:bg-white/10">اتصل بنا <PhoneCall className="size-4" /></a>
            </div>
          </aside>
        </div>
      </section>

      {/* Product-focused animated callout */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white px-6 py-14 text-center shadow-sm sm:py-20">
          <span className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-4 py-2 text-sm font-bold text-amber-800"><ShieldCheck className="size-4" /> عتاد أصلي، اختيار مضمون</span>
          <h2 className="mx-auto mt-6 max-w-4xl text-3xl font-black tracking-tight text-slate-900 sm:text-5xl">جهّز ورشتك بـ <span className="text-amber-600">CROWN</span> و <span className="text-amber-600">STARCLE PRO</span></h2>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">باقات عملية تجمع الأدوات الأساسية، مع توصيل إلى ولايتك والدفع عند الاستلام.</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="#packs-section" className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-6 py-3.5 font-black text-white transition hover:bg-amber-700">شوف الباقات <ArrowLeft className="size-4" /></Link>
            <a href="tel:0798282495" className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-6 py-3.5 font-bold text-slate-800 transition hover:bg-slate-50">كلمنا الآن <PhoneCall className="size-4" /></a>
          </div>
        </div>
      </section>
    </div>
  );
}
