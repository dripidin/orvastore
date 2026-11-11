import Image from "next/image";

import { BadgeCheck, Droplets, Factory, Leaf, Plug, Wrench } from "lucide-react";

const ACTIVITIES = [
  { icon: Plug, label: "الأدوات الكهربائية المحمولة" },
  { icon: Wrench, label: "الملحقات والإكسسوارات" },
  { icon: Leaf, label: "معدات البستنة" },
  { icon: Droplets, label: "آلات الغسيل بالضغط العالي (خط B3 الاحترافي)" },
];

/** Trust band before the footer: ORVA sells CROWN equipment directly, from the company to the customer. */
export function CrownPartnerSection() {
  return (
    <section className="border-t border-slate-200" style={{ backgroundColor: "#ffffff" }} aria-labelledby="crown-partner">
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-2">
        <div className="order-2 space-y-5 text-right lg:order-1">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-1 font-bold text-red-700 text-xs">
            <BadgeCheck className="size-3.5" /> من الشركة إلى الزبون مباشرة
          </span>
          <h2 id="crown-partner" className="font-black text-3xl text-slate-900 leading-tight sm:text-4xl">
            نتعامل مع <span className="text-red-600">CROWN</span> مباشرة، بلا وسطاء
          </h2>
          <p className="text-base text-slate-600 leading-relaxed">
            في متجر أورفا نوصّلك عتاد CROWN الأصلي من الشركة إليك مباشرة. هكذا تضمن أن الأداة اللي تستلمها أصلية
            ومطابقة للمواصفات، وبسعر بلا هوامش الوسطاء.
          </p>
          <div className="rounded-2xl border border-slate-200 p-5">
            <div className="mb-3 flex items-center gap-2 font-bold text-slate-900 text-sm">
              <Factory className="size-4 text-red-600" />
              CROWN (Outillage et Équipements) — مجال النشاط
            </div>
            <ul className="grid gap-2.5 sm:grid-cols-2">
              {ACTIVITIES.map(({ icon: Icon, label }) => (
                <li key={label} className="flex items-center gap-2 text-slate-700 text-sm">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-red-50 text-red-600">
                    <Icon className="size-4" />
                  </span>
                  {label}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="order-1 flex flex-col items-center gap-4 lg:order-2">
          <div className="relative aspect-[1285/361] w-full max-w-md">
            <Image
              src="/images/brands/crown-algeria.png"
              alt="CROWN Algeria"
              fill
              sizes="(max-width: 1024px) 90vw, 448px"
              className="object-contain"
            />
          </div>
          <p className="font-semibold text-slate-500 text-sm">معدات CROWN الأصلية متوفرة في متجر أورفا</p>
        </div>
      </div>
    </section>
  );
}
