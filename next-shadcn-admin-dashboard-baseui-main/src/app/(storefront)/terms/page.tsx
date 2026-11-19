import type { Metadata } from "next";
import Link from "next/link";

import {
  ORVA_LEGAL_EMAIL as ORVA_CONTACT_EMAIL,
  ORVA_LEGAL_ORIGIN as ORVA_CANONICAL_ORIGIN,
  ORVA_LEGAL_PHONE as ORVA_CONTACT_PHONE,
  ORVA_LEGAL_PHONE_DISPLAY as ORVA_CONTACT_PHONE_DISPLAY,
  ORVA_LEGAL_WHATSAPP_URL as ORVA_WHATSAPP_URL,
} from "@/components/storefront/legal/legal-constants";
import {
  LegalDocumentView,
  type LegalLanguageContent,
} from "@/components/storefront/legal/legal-document-view";

export const metadata: Metadata = {
  title: "الشروط والأحكام | Conditions Générales — متجر أورفا ORVA Store",
  description:
    "الشروط والأحكام الرسمية لمتجر أورفا الجزائر (ORVA Store): البيع بالدفع عند الاستلام (COD)، التوصيل لـ 58 ولاية، حق المعاينة قبل الدفع، وسياسة الاستبدال.",
  alternates: {
    canonical: `${ORVA_CANONICAL_ORIGIN}/terms/`,
  },
  openGraph: {
    title: "الشروط والأحكام | Conditions Générales — متجر أورفا ORVA Store",
    description:
      "شروط البيع، الدفع عند الاستلام بالدينار الجزائري، التوصيل عبر 58 ولاية، وحق المعاينة والاستبدال في متجر أورفا.",
    url: `${ORVA_CANONICAL_ORIGIN}/terms/`,
    type: "website",
  },
};

const ARABIC_TERMS: LegalLanguageContent = {
  dir: "rtl",
  lang: "ar",
  badgeLabel: "النسخة العربية الرسمية",
  title: "الشروط والأحكام — متجر أورفا الجزائر",
  subtitle:
    "تحكم هذه الشروط والأحكام طلبات الشراء، الدفع عند الاستلام، التوصيل، المعاينة، واستخدام الموقع الرسمي لمتجر أورفا.",
  effectiveLabel: "آخر تحديث",
  effectiveDate: "19 نوفمبر 2026",
  tocLabel: "فهرس البنود",
  sections: [
    {
      id: "ar-terms-1",
      number: "1",
      title: "هوية المتجر ونطاق النشاط",
      body: (
        <>
          <p>
            <strong>متجر أورفا الجزائر (ORVA Store Algeria)</strong> هو متجر إلكتروني جزائري متخصص
            في بيع المعدات والأدوات الكهربائية واليدوية وباقات الصيانة الاحترافية (بما في ذلك أدوات{" "}
            <strong>CROWN</strong> و<strong>STARCLE PRO</strong> ومستلزماتها).
          </p>
          <p>
            يسري هذا المستند على جميع الطلبيات المقدمة عبر استمارات الطلب المباشر في الموقع أو عبر
            قنوات التواصل المعتمدة للمتجر.
          </p>
        </>
      ),
    },
    {
      id: "ar-terms-2",
      number: "2",
      title: "المنتجات والباقات والأسعار",
      body: (
        <ul>
          <li>
            تُعرض جميع أسعار المنتجات والباقات حصراً بـ <strong>الدينار الجزائري (DZD / د.ج)</strong>.
          </li>
          <li>
            يُظهر ملخص الطلب في الموقع سعر المنتج أو الباقة بالإضافة إلى تعريفة التوصيل المحتسبة
            حسب الولاية ونوع التسليم المختار، ويتم التحقق من السعر النهائي مقابل الكتالوج الفعلي
            عند استلام الطلب.
          </li>
        </ul>
      ),
    },
    {
      id: "ar-terms-3",
      number: "3",
      title: "تقديم الطلبية وإجراء التأكيد الهاتفي",
      body: (
        <>
          <p>تصل الطلبيات إلى نظامنا عبر نموذج الدفع عند الاستلام في الموقع الإلكتروني.</p>
          <ul>
            <li>
              تخضع كل طلبية للمراجعة والتأكيد الهاتفي قبل تسليمها إلى شركة التوصيل.
            </li>
            <li>
              يتصل فريق خدمة الزبائن بالعميل هاتفياً أو عبر واتساب لتأكيد المنتج المختار، عنوان
              التوصيل، ونوع التسليم قبل اعتماد الشحن.
            </li>
          </ul>
        </>
      ),
    },
    {
      id: "ar-terms-4",
      number: "4",
      title: "شروط الدفع عند الاستلام (COD)",
      body: (
        <ul>
          <li>
            يعتمد متجر أورفا نظام <strong>الدفع نقداً عند الاستلام (Cash on Delivery)</strong> حصراً
            بالدينار الجزائري.
          </li>
          <li>
            لا يُطلب من الزبون أي دفع إلكتروني مسبق عبر البطاقة البنكية أو البريدية أو إدخال
            معلومات بنكية على الموقع قبل وصول الطرد.
          </li>
          <li>
            يلتزم الزبون بدفع المبلغ الإجمالي المتفق عليه عند تأكيد الطلبية (سعر المنتج + مصاريف
            التوصيل) لموزع شركة الشحن بعد إجراء المعاينة.
          </li>
        </ul>
      ),
    },
    {
      id: "ar-terms-5",
      number: "5",
      title: "التغطية والتوصيل عبر 58 ولاية جزائرية",
      body: (
        <ul>
          <li>
            يغطي التوصيل جميع <strong>الولايات الجزائرية الـ 58</strong> بالتعاون مع شركة التوصيل
            المعتمدة، سواء عبر التوصيل للمنزل (
            <span dir="ltr" className="font-mono text-xs">
              DOMICILE
            </span>
            ) أو الاستلام من مكتب التوصيل (
            <span dir="ltr" className="font-mono text-xs">
              STOP_DESK
            </span>
            ) في الولايات والمراكز المدعومة.
          </li>
          <li>
            <strong>تنبيه خاص بولايات الجنوب (الولايات 49 إلى 58 — المنطقة 5):</strong> نظراً لعدم
            توفر خدمة الاستلام من المكتب في هذه الولايات ضمن شبكة الشحن الحالية، تُحوَّل طلبات هذه
            الولايات تلقائياً إلى <strong>التوصيل للمنزل (DOMICILE)</strong> وفق التعريفة المعتمدة
            للمنطقة.
          </li>
          <li>
            <strong>آجال التوصيل التقديرية:</strong> من <strong>24 إلى 48 ساعة</strong> لولايات
            الشمال والهضاب العليا، ومن <strong>48 إلى 72 ساعة</strong> لولايات الجنوب. هذه الآجال
            تقديرية وتخضع لظروف النقل والولاية وجدولة الموزع.
          </li>
        </ul>
      ),
    },
    {
      id: "ar-terms-6",
      number: "6",
      title: "حق المعاينة قبل الدفع",
      body: (
        <p>
          يضمن متجر أورفا للزبون <strong>حق فتح الطرد ومعاينته أمام موزع شركة التوصيل</strong> قبل
          دفع المبلغ الإجمالي، وذلك للتحقق من سلامة القطع الظاهرة ومطابقة محتوى الباقة للطلبية
          المؤكدة.
        </p>
      ),
    },
    {
      id: "ar-terms-7",
      number: "7",
      title: "الاستبدال والإرجاع والاسترداد عند الخلل أو عدم المطابقة",
      body: (
        <>
          <p>
            بفضل حق المعاينة قبل الدفع، يمكن للزبون رفض استلام الطرد مجاناً عند الموزع دون دفع أي
            مبلغ إذا لاحظ عدم مطابقة أو تلفاً ظاهراً أثناء الفحص.
          </p>
          <p>
            وفي حال ثبوت أي <strong>خلل مصنعي</strong> أو <strong>نقص في محتوى الباقة</strong>{" "}
            عند الاستلام والمعاينة، يتكفل متجر أورفا باستبدال القطعة أو الباقة المتضررة{" "}
            <strong>دون رسوم توصيل أو تكاليف إضافية</strong> على الزبون عند التبليغ الفوري لخدمة
            الزبائن عبر القنوات الرسمية.
          </p>
        </>
      ),
    },
    {
      id: "ar-terms-8",
      number: "8",
      title: "التزامات الزبون وإلغاء الطلبية أو رفضها",
      body: (
        <ul>
          <li>
            <strong>مسؤوليات الزبون:</strong> يلتزم الزبون بتقديم اسم صحيح ورقم هاتف محمول جزائري
            شغّال (<span dir="ltr">05 / 06 / 07</span>) وبيانات ولاية وبلدية وعنوان دقيقة، وبالرد
            على مكالمة التأكيد، ومعاينة الطرد ودفع المبلغ الإجمالي المتفق عليه عند القبول، والامتناع
            عن تقديم طلبات وهمية أو متعسفة.
          </li>
          <li>
            <strong>الإلغاء من طرف الزبون:</strong> يحق للزبون إلغاء الطلبية أو تعديل بيانات التوصيل
            مجاناً <strong>قبل تأكيدها</strong> هاتفياً وتسليمها لشركة التوصيل، عبر الهاتف أو واتساب
            أو البريد الإلكتروني.
          </li>
          <li>
            <strong>الإلغاء من طرف المتجر:</strong> يحتفظ المتجر بحق إلغاء أي طلبية يتعذر فيها
            الوصول إلى الزبون هاتفياً لتأكيدها، أو تتضمن رقماً غير صالح، أو طلباً مكرراً، أو عند
            نفاد المخزون غير المتوقع قبل الشحن.
          </li>
        </ul>
      ),
    },
    {
      id: "ar-terms-9",
      number: "9",
      title: "الملكية الفكرية والاستخدام المشروع للموقع",
      body: (
        <>
          <p>
            جميع النصوص والوصف التجاري والصور وتصاميم العرض والشعارات الخاصة بمتجر أورفا، وكذا
            أسماء وعلامات الشركات المصنعة المعروضة (مثل CROWN وSTARCLE PRO)، تخضع للحماية ولا يجوز
            نسخها أو إعادة نشرها لأغراض تجارية دون إذن خطي.
          </p>
          <p>
            يُمنع استخدام أي وسائل آلية لإرسال طلبات وهمية أو إساءة استخدام استمارات الموقع.
          </p>
        </>
      ),
    },
    {
      id: "ar-terms-10",
      number: "10",
      title: "حدود المسؤولية، الخصوصية، والقانون المعمول به",
      body: (
        <>
          <p>
            لا يتحمل المتجر مسؤولية التأخيرات الخارجة عن إرادته والمرتبطة بالظروف الجوية، القوة
            القاهرة، أو الجداول التشغيلية لشركة الشحن الخارجية، مع التزامنا الكامل بمتابعة كل طرد
            حتى التسليم.
          </p>
          <p>
            تُعالج بيانات الزبائن وفقاً لما هو مفصل في{" "}
            <Link href="/privacy/" className="font-bold text-amber-700 underline">
              سياسة الخصوصية لمتجر أورفا
            </Link>
            . وتخضع هذه الشروط والأحكام للقوانين السارية في{" "}
            <strong>الجمهورية الجزائرية الديمقراطية الشعبية</strong>.
          </p>
          <p>
            للتواصل القانوني أو خدمة الزبائن:{" "}
            <a
              href={`mailto:${ORVA_CONTACT_EMAIL}`}
              dir="ltr"
              className="font-mono font-bold text-amber-700 hover:underline"
            >
              {ORVA_CONTACT_EMAIL}
            </a>{" "}
            — الهاتف:{" "}
            <a
              href={`tel:${ORVA_CONTACT_PHONE}`}
              dir="ltr"
              className="font-mono font-bold text-amber-700 hover:underline"
            >
              {ORVA_CONTACT_PHONE_DISPLAY}
            </a>{" "}
            —{" "}
            <a
              href={ORVA_WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-emerald-700 hover:underline"
            >
              واتساب المباشر
            </a>
            .
          </p>
        </>
      ),
    },
  ],
};

const FRENCH_TERMS: LegalLanguageContent = {
  dir: "ltr",
  lang: "fr",
  badgeLabel: "Version française officielle",
  title: "Conditions Générales d'Utilisation et de Vente — ORVA Store",
  subtitle:
    "Les présentes conditions régissent les commandes, le paiement à la livraison (COD), l'expédition, le droit d'inspection et l'utilisation de la plateforme ORVA Store Algeria.",
  effectiveLabel: "Dernière mise à jour",
  effectiveDate: "19 novembre 2026",
  tocLabel: "Sommaire des articles",
  sections: [
    {
      id: "fr-terms-1",
      number: "1",
      title: "Identité de la boutique et périmètre",
      body: (
        <>
          <p>
            <strong>ORVA Store Algeria (متجر أورفا)</strong> est une boutique algérienne de commerce
            électronique spécialisée dans l'outillage électroportatif et les packs d'équipements
            (notamment les gammes <strong>CROWN</strong> et <strong>STARCLE PRO</strong>).
          </p>
          <p>
            Ces conditions s'appliquent aux commandes passées via le formulaire du site web ou via
            nos canaux de support vérifiés.
          </p>
        </>
      ),
    },
    {
      id: "fr-terms-2",
      number: "2",
      title: "Produits, packs et tarification",
      body: (
        <ul>
          <li>
            Tous les prix affichés sont libellés exclusivement en{" "}
            <strong>Dinars Algériens (DZD)</strong>.
          </li>
          <li>
            Le récapitulatif de commande indique le prix du produit ou du pack ainsi que les frais
            de livraison applicables selon la wilaya et le mode choisi, vérifiés côté serveur par
            rapport au catalogue en vigueur.
          </li>
        </ul>
      ),
    },
    {
      id: "fr-terms-3",
      number: "3",
      title: "Passation de commande et confirmation téléphonique",
      body: (
        <>
          <p>Les demandes proviennent du formulaire de commande du site web.</p>
          <ul>
            <li>
              Toute commande est soumise à un examen et à une confirmation téléphonique avant remise
              au transporteur.
            </li>
            <li>
              Notre service client appelle ou contacte le client via WhatsApp afin de vérifier le
              produit, l'adresse et le mode de livraison avant expédition.
            </li>
          </ul>
        </>
      ),
    },
    {
      id: "fr-terms-4",
      number: "4",
      title: "Modalités de paiement à la livraison (COD)",
      body: (
        <ul>
          <li>
            ORVA Store fonctionne exclusivement en{" "}
            <strong>Paiement à la livraison (Cash on Delivery)</strong> en espèces (DZD).
          </li>
          <li>
            Aucun paiement par carte bancaire, Edahabia, CIB ou prépaiement en ligne n'est exigé
            sur le site avant réception du colis.
          </li>
          <li>
            Le montant total confirmé (prix du produit + tarif de livraison) est réglé directement au
            livreur après vérification du colis.
          </li>
        </ul>
      ),
    },
    {
      id: "fr-terms-5",
      number: "5",
      title: "Livraison sur les 58 wilayas et délais indicatifs",
      body: (
        <ul>
          <li>
            La livraison couvre les <strong>58 wilayas d'Algérie</strong> via notre transporteur
            partenaire, à domicile (<span className="font-mono text-xs">DOMICILE</span>) ou en bureau
            Stop Desk (<span className="font-mono text-xs">STOP_DESK</span>) dans les wilayas
            éligibles.
          </li>
          <li>
            <strong>Règle applicable aux wilayas du Sud (Wilayas 49 à 58 — Zone 5) :</strong> le
            retrait Stop Desk n'étant pas disponible pour ces wilayas, les demandes concernées sont
            automatiquement orientées vers la <strong>livraison à domicile (DOMICILE)</strong> avec
            le tarif de Zone 5 correspondant.
          </li>
          <li>
            <strong>Délais estimés :</strong> <strong>24 à 48 heures</strong> pour les wilayas du
            Nord et des Hauts Plateaux, et <strong>48 à 72 heures</strong> pour les wilayas du Sud
            (délais indicatifs soumis aux contraintes logistiques du transporteur).
          </li>
        </ul>
      ),
    },
    {
      id: "fr-terms-6",
      number: "6",
      title: "Droit d'inspection avant paiement",
      body: (
        <p>
          Le client dispose du droit d'<strong>ouvrir et de contrôler le colis devant le livreur</strong>{" "}
          avant d'effectuer le règlement afin de vérifier la conformité des outils et du contenu du
          pack commandé.
        </p>
      ),
    },
    {
      id: "fr-terms-7",
      number: "7",
      title: "Retours, échanges, remboursements et défauts de fabrication",
      body: (
        <>
          <p>
            Grâce au droit d'inspection avant paiement, le client peut refuser sans frais un colis
            non conforme ou endommagé lors du contrôle devant le livreur avant tout règlement.
          </p>
          <p>
            En cas de <strong>défaut de fabrication avéré</strong> ou d'article manquant dans un pack
            constaté à la réception, ORVA Store assure le remplacement de la pièce ou du pack concerné{" "}
            <strong>sans frais supplémentaires</strong> pour le client, sur signalement immédiat
            auprès de notre service client.
          </p>
        </>
      ),
    },
    {
      id: "fr-terms-8",
      number: "8",
      title: "Obligations du client, annulation et refus de commande",
      body: (
        <ul>
          <li>
            <strong>Responsabilités du client :</strong> le client s'engage à fournir un nom exact,
            un numéro mobile algérien joignable (05 / 06 / 07) et une localisation précise (wilaya,
            commune, adresse), à répondre à l'appel de confirmation, à contrôler et régler le montant
            COD convenu lors de l'acceptation, et à ne soumettre aucune commande fictive ou abusive.
          </li>
          <li>
            <strong>Annulation par le client :</strong> le client peut annuler ou modifier sa
            commande sans frais tant qu'elle n'a pas été confirmée et remise au transporteur, en
            contactant notre équipe par téléphone, WhatsApp ou e-mail.
          </li>
          <li>
            <strong>Annulation par la boutique :</strong> ORVA Store se réserve le droit d'annuler
            toute commande injoignable lors de la confirmation téléphonique, comportant un numéro
            invalide, constituant un doublon technique ou affectée par une rupture de stock imprévue
            avant expédition.
          </li>
        </ul>
      ),
    },
    {
      id: "fr-terms-9",
      number: "9",
      title: "Propriété intellectuelle et usage acceptable",
      body: (
        <>
          <p>
            Les textes, visuels produits, packs, éléments graphiques et signes distinctifs d'ORVA
            Store, ainsi que les marques fabricants présentées (telles que CROWN et STARCLE PRO),
            ne peuvent être reproduits ou exploités commercialement sans autorisation préalable.
          </p>
          <p>
            Toute soumission automatisée ou utilisation frauduleuse des formulaires du site est
            strictement interdite.
          </p>
        </>
      ),
    },
    {
      id: "fr-terms-10",
      number: "10",
      title: "Responsabilité, données personnelles et droit applicable",
      body: (
        <>
          <p>
            ORVA Store ne saurait être tenue responsable des retards indépendants de sa volonté liés
            aux aléas climatiques, cas de force majeure ou incidents opérationnels du transporteur,
            tout en accompagnant le client jusqu'à la résolution du suivi.
          </p>
          <p>
            Le traitement de vos données est décrit dans notre{" "}
            <Link href="/privacy/" className="font-bold text-amber-700 underline">
              Politique de confidentialité
            </Link>
            . Les présentes conditions sont régies par le droit applicable en{" "}
            <strong>République Algérienne Démocratique et Populaire</strong>.
          </p>
          <p>
            Contact juridique et support :{" "}
            <a
              href={`mailto:${ORVA_CONTACT_EMAIL}`}
              className="font-mono font-bold text-amber-700 hover:underline"
            >
              {ORVA_CONTACT_EMAIL}
            </a>{" "}
            — Tél. :{" "}
            <a
              href={`tel:${ORVA_CONTACT_PHONE}`}
              className="font-mono font-bold text-amber-700 hover:underline"
            >
              {ORVA_CONTACT_PHONE_DISPLAY}
            </a>{" "}
            —{" "}
            <a
              href={ORVA_WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-emerald-700 hover:underline"
            >
              WhatsApp officiel
            </a>
            .
          </p>
        </>
      ),
    },
  ],
};

export default function TermsPage() {
  return (
    <LegalDocumentView
      kind="terms"
      arabicTitle="الشروط والأحكام القانونية"
      frenchTitle="Conditions Générales d'Utilisation et de Vente (Terms of Service)"
      leadSummaryAr="تنظم هذه الوثيقة شروط البيع بالدفع عند الاستلام، التوصيل عبر 58 ولاية، حق المعاينة قبل الدفع، وسياسة الاستبدال في متجر أورفا الجزائر."
      leadSummaryFr="Ce document présente les conditions applicables aux commandes en paiement à la livraison (COD), à l'expédition sur les 58 wilayas, au droit de vérification avant paiement et aux échanges chez ORVA Store Algeria."
      arabic={ARABIC_TERMS}
      french={FRENCH_TERMS}
    />
  );
}
