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
  title: "سياسة الخصوصية | Politique de Confidentialité — متجر أورفا ORVA Store",
  description:
    "سياسة الخصوصية لمتجر أورفا الجزائر (ORVA Store): كيفية جمع ومعالجة وحماية بيانات الطلبات والتوصيل وخدمة الزبائن.",
  alternates: {
    canonical: `${ORVA_CANONICAL_ORIGIN}/privacy/`,
  },
  openGraph: {
    title: "سياسة الخصوصية | Politique de Confidentialité — متجر أورفا ORVA Store",
    description:
      "تفاصيل جمع وحماية بيانات الزبائن ومعالجة الطلبات في متجر أورفا الجزائر.",
    url: `${ORVA_CANONICAL_ORIGIN}/privacy/`,
    type: "website",
  },
};

const ARABIC_PRIVACY: LegalLanguageContent = {
  dir: "rtl",
  lang: "ar",
  badgeLabel: "النسخة العربية الرسمية",
  title: "سياسة الخصوصية وحماية البيانات — متجر أورفا الجزائر",
  subtitle:
    "توضح هذه السياسة أنواع البيانات التي يجمعها متجر أورفا، أغراض معالجتها، وكيفية التواصل بخصوص بياناتك.",
  effectiveLabel: "آخر تحديث",
  effectiveDate: "19 نوفمبر 2026",
  tocLabel: "فهرس بنود الخصوصية",
  sections: [
    {
      id: "ar-privacy-1",
      number: "1",
      title: "هوية المتجر وقنوات التواصل الخاصة بالخصوصية",
      body: (
        <>
          <p>
            يتولى تشغيل المتجر الإلكتروني <strong>متجر أورفا الجزائر (ORVA Store Algeria)</strong>.
          </p>
          <p>
            لأي سؤال أو طلب يخص بياناتك الشخصية: البريد الإلكتروني{" "}
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
            — واتساب:{" "}
            <a
              href={ORVA_WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-emerald-700 hover:underline"
            >
              تواصل مباشر
            </a>
            .
          </p>
        </>
      ),
    },
    {
      id: "ar-privacy-2",
      number: "2",
      title: "البيانات الشخصية التي نجمعها",
      body: (
        <>
          <p>نجمع فقط البيانات اللازمة لتنفيذ طلبيات الدفع عند الاستلام والرد على استفساراتك:</p>
          <ul>
            <li>
              <strong>بيانات استمارة الطلب المباشر في الموقع:</strong> الاسم الكامل، رقم الهاتف
              المحمول الجزائري (<span dir="ltr">05 / 06 / 07</span>)، رقم هاتف ثانوي اختياري، الولاية
              (من 1 إلى 58)، البلدية، نوع التوصيل (منزل أو مكتب)، عنوان التوصيل عند اختيار التوصيل
              للمنزل، تفاصيل المنتج والمبلغ.
            </li>
            <li>
              <strong>استمارة «طلب منتج غير متوفر»:</strong> الاسم، اسم المنتج المطلوب، ورقم
              الهاتف والولاية والرسالة (حقول اختيارية).
            </li>
            <li>
              <strong>لا نجمع أي بيانات دفع إلكتروني:</strong> لا نطلب ولا نخزن أرقام بطاقات
              بنكية أو بريدية أو حسابات مالية لأن الدفع يتم نقداً عند الاستلام فقط.
            </li>
          </ul>
        </>
      ),
    },
    {
      id: "ar-privacy-3",
      number: "3",
      title: "أغراض معالجة البيانات",
      body: (
        <ul>
          <li>
            استقبال طلبيات الشراء ومراجعتها والتواصل معك هاتفياً أو عبر واتساب لتأكيد الطلبية
            والعنوان قبل الشحن.
          </li>
          <li>
            احتساب تعريفة التوصيل الصحيحة لكل ولاية (بما في ذلك توجيه الولايات 49–58 إلى التوصيل
            للمنزل تلقائياً).
          </li>
          <li>تسليم الطرود المؤكدة لشركة الشحن لمتابعة التوصيل وتحصيل مبلغ الدفع عند الاستلام.</li>
          <li>معالجة طلبات المنتجات غير المتوفرة، الاستبدالات المصنعية، وخدمة ما بعد البيع.</li>
        </ul>
      ),
    },
    {
      id: "ar-privacy-4",
      number: "4",
      title: "إجراءات أمن المعلومات",
      body: (
        <>
          <p>نطبق تدابير لحماية البيانات المتداولة عبر الموقع، من أبرزها:</p>
          <ul>
            <li>نقل البيانات عبر بروتوكول HTTPS / TLS المشفّر.</li>
            <li>استخدام بيانات الطلبات حصراً من طرف فريقنا لتأكيد الطلبيات ومتابعة توصيلها.</li>
          </ul>
        </>
      ),
    },
    {
      id: "ar-privacy-5",
      number: "5",
      title: "حقوق الزبون",
      body: (
        <>
          <p>يمكنك في أي وقت التواصل معنا لطلب:</p>
          <ul>
            <li>الاطلاع على البيانات المرتبطة بطلبيتك أو نموذجك.</li>
            <li>تصحيح رقم الهاتف، الولاية، البلدية، أو عنوان التسليم.</li>
          </ul>
        </>
      ),
    },
    {
      id: "ar-privacy-6",
      number: "6",
      title: "التحديثات",
      body: (
        <p>
          قد نحدّث هذه السياسة عند تغير المتطلبات التشغيلية أو القانونية ويُعرض تاريخ التحديث في
          أعلى الصفحة. يُرجى أيضاً مراجعة{" "}
          <Link href="/terms/" className="font-bold text-amber-700 underline">
            الشروط والأحكام
          </Link>{" "}
          الخاصة بمتجر أورفا.
        </p>
      ),
    },
  ],
};

const FRENCH_PRIVACY: LegalLanguageContent = {
  dir: "ltr",
  lang: "fr",
  badgeLabel: "Version française officielle",
  title: "Politique de Confidentialité — ORVA Store Algeria",
  subtitle:
    "Cette politique décrit les données collectées par ORVA Store, leur finalité, la sécurisation des échanges ainsi que vos droits.",
  effectiveLabel: "Dernière mise à jour",
  effectiveDate: "19 novembre 2026",
  tocLabel: "Sommaire de confidentialité",
  sections: [
    {
      id: "fr-privacy-1",
      number: "1",
      title: "Responsable du traitement et coordonnées",
      body: (
        <>
          <p>
            La boutique en ligne est exploitée par <strong>ORVA Store Algeria (متجر أورفا)</strong>.
          </p>
          <p>
            Contact confidentialité et données personnelles :{" "}
            <a
              href={`mailto:${ORVA_CONTACT_EMAIL}`}
              className="font-mono font-bold text-amber-700 hover:underline"
            >
              {ORVA_CONTACT_EMAIL}
            </a>{" "}
            — Téléphone :{" "}
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
    {
      id: "fr-privacy-2",
      number: "2",
      title: "Données personnelles collectées",
      body: (
        <>
          <p>
            Nous collectons uniquement les informations nécessaires au traitement des commandes en
            paiement à la livraison et à la réponse aux demandes clients :
          </p>
          <ul>
            <li>
              <strong>Formulaire de commande COD sur le site :</strong> nom complet, numéro de
              téléphone mobile algérien (05 / 06 / 07), téléphone secondaire optionnel, wilaya (1 à
              58), commune, mode de livraison (Domicile ou Stop Desk), adresse postale (requise pour
              la livraison à domicile), produit/pack et montant total.
            </li>
            <li>
              <strong>Formulaire « Demander un produit indisponible » :</strong> nom, produit
              recherché, et à titre facultatif téléphone, wilaya et message.
            </li>
            <li>
              <strong>Aucune donnée bancaire :</strong> nous ne demandons ni ne stockons aucun
              numéro de carte bancaire ou identifiant financier en ligne (paiement exclusivement en
              espèces à la livraison).
            </li>
          </ul>
        </>
      ),
    },
    {
      id: "fr-privacy-3",
      number: "3",
      title: "Finalités du traitement",
      body: (
        <ul>
          <li>
            Enregistrer les commandes COD et contacter le client par téléphone ou WhatsApp pour
            confirmer le produit, la wilaya, la commune et l'adresse avant expédition.
          </li>
          <li>
            Calculer les frais de livraison exacts (y compris l'orientation automatique en livraison
            à domicile pour les wilayas 49 à 58).
          </li>
          <li>
            Transmettre les colis confirmés au transporteur afin d'assurer la livraison et
            l'encaissement COD.
          </li>
          <li>Traiter les demandes de produits, échanges pour défaut de fabrication et SAV.</li>
        </ul>
      ),
    },
    {
      id: "fr-privacy-4",
      number: "4",
      title: "Sécurité des données",
      body: (
        <>
          <p>Les mesures appliquées sur notre site comprennent notamment :</p>
          <ul>
            <li>Chiffrement des communications en transit via HTTPS / TLS.</li>
            <li>
              Accès limité aux données de commande aux seules fins de confirmation et de livraison.
            </li>
          </ul>
        </>
      ),
    },
    {
      id: "fr-privacy-5",
      number: "5",
      title: "Vos droits",
      body: (
        <>
          <p>Vous disposez du droit de demander à tout moment :</p>
          <ul>
            <li>L'accès aux informations personnelles liées à votre commande ou à votre demande.</li>
            <li>La rectification de votre téléphone, wilaya, commune ou adresse de livraison.</li>
          </ul>
        </>
      ),
    },
    {
      id: "fr-privacy-6",
      number: "6",
      title: "Mises à jour",
      body: (
        <p>
          Toute mise à jour de la présente politique est publiée sur cette page avec sa date de
          révision. Veuillez également consulter nos{" "}
          <Link href="/terms/" className="font-bold text-amber-700 underline">
            Conditions Générales (Terms of Service)
          </Link>
          .
        </p>
      ),
    },
  ],
};

export default function PrivacyPage() {
  return (
    <LegalDocumentView
      kind="privacy"
      arabicTitle="سياسة الخصوصية وحماية البيانات"
      frenchTitle="Politique de Confidentialité (Privacy Policy)"
      leadSummaryAr="تشرح هذه الوثيقة كيفية جمع متجر أورفا لبيانات الطلبيات واستخدامها لتأكيد الطلبات والشحن مع احترام خصوصية الزبون."
      leadSummaryFr="Cette politique explique la collecte et la protection de vos données sur ORVA Store pour le traitement et la livraison des commandes."
      arabic={ARABIC_PRIVACY}
      french={FRENCH_PRIVACY}
    />
  );
}
