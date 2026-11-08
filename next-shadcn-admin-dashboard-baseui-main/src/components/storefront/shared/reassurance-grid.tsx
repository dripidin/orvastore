import { PackageOpen, Truck, HandCoins, PhoneCall } from "lucide-react";

export const REASSURANCE_PILLARS = [
  {
    id: 1,
    titleAr: "المعاينة قبل الدفع",
    descAr: "يحق لك فتح الطرد والتأكد من مطابقة جميع السلع قبل دفع المستحقات للموزع.",
    icon: PackageOpen,
    accent: "text-amber-600 bg-amber-50 border-amber-200",
  },
  {
    id: 2,
    titleAr: "توصيل سريع وموثوق",
    descAr: "نرسل طلبيتك عبر أفضل شركات التوصيل الرسمية في الجزائر خلال 24 إلى 48 ساعة.",
    icon: Truck,
    accent: "text-blue-600 bg-blue-50 border-blue-200",
  },
  {
    id: 3,
    titleAr: "الدفع الآمن عند الاستلام",
    descAr: "لا تدفع أي سنتيم مسبقاً. التعامل يتم نقداً يداً بيد عند باب منزلك أو في المكتب.",
    icon: HandCoins,
    accent: "text-emerald-600 bg-emerald-50 border-emerald-200",
  },
  {
    id: 4,
    titleAr: "خدمة عملاء جزائرية",
    descAr: "فريقنا يتصل بك لتأكيد طلبك ومتابعة طردك حتى يصل إلى يديك بكل أمان.",
    icon: PhoneCall,
    accent: "text-purple-600 bg-purple-50 border-purple-200",
  },
];

export function ReassuranceGrid({ className = "" }: { className?: string }) {
  return (
    <section className={`py-10 px-4 sm:px-6 max-w-7xl mx-auto ${className}`}>
      <div className="text-center mb-8">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
          لماذا يثق الحرفيون وأصحاب السيارات في متجر أورفا؟
        </h2>
        <p className="text-sm sm:text-base text-slate-600 mt-2 max-w-2xl mx-auto">
          نوفر لك تجربة تسوق جزائرية 100% مبنية على الشفافية والأمان التام مع حق المعاينة يداً بيد.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {REASSURANCE_PILLARS.map((pillar) => {
          const IconComponent = pillar.icon;
          return (
            <div
              key={pillar.id}
              className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow flex flex-col items-center text-center group"
            >
              <div
                className={`size-14 rounded-2xl flex items-center justify-center border mb-4 ${pillar.accent} group-hover:scale-110 transition-transform`}
              >
                <IconComponent className="size-7" />
              </div>
              <h3 className="font-bold text-lg text-slate-900 mb-2">{pillar.titleAr}</h3>
              <p className="text-sm text-slate-600 leading-relaxed">{pillar.descAr}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
