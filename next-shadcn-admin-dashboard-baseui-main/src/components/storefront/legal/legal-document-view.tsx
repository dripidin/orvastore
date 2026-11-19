"use client";

import Link from "next/link";
import { type ReactNode, useState } from "react";
import {
  ExternalLink,
  FileText,
  Globe,
  Mail,
  MessageCircle,
  Phone,
  Scale,
  ShieldCheck,
} from "lucide-react";

import {
  ORVA_LEGAL_EMAIL,
  ORVA_LEGAL_PHONE,
  ORVA_LEGAL_PHONE_DISPLAY,
  ORVA_LEGAL_UPDATED_ISO,
  ORVA_LEGAL_WHATSAPP_URL,
} from "./legal-constants";

export type LegalLanguageFilter = "all" | "ar" | "fr";

export interface LegalSectionItem {
  id: string;
  number: string;
  title: string;
  summary?: string;
  body: ReactNode;
}

export interface LegalLanguageContent {
  dir: "rtl" | "ltr";
  lang: "ar" | "fr";
  badgeLabel: string;
  title: string;
  subtitle: string;
  effectiveLabel: string;
  effectiveDate: string;
  tocLabel: string;
  sections: LegalSectionItem[];
}

export interface LegalDocumentViewProps {
  kind: "terms" | "privacy";
  arabicTitle: string;
  frenchTitle: string;
  leadSummaryAr: string;
  leadSummaryFr: string;
  arabic: LegalLanguageContent;
  french: LegalLanguageContent;
}

function LanguageDocumentArticle({
  content,
  hidden,
  anchorId,
}: {
  content: LegalLanguageContent;
  hidden: boolean;
  anchorId: string;
}) {
  const isRtl = content.dir === "rtl";

  return (
    <article
      id={anchorId}
      dir={content.dir}
      lang={content.lang}
      hidden={hidden}
      aria-labelledby={`${anchorId}-heading`}
      className={`min-w-0 space-y-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-8 ${
        isRtl ? "text-right" : "text-left"
      }`}
    >
      <header className="space-y-3 border-b border-slate-100 pb-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">
            <Globe className="size-3.5 shrink-0" />
            {content.badgeLabel}
          </span>
          <span className="text-xs font-medium text-slate-500">
            {content.effectiveLabel}:{" "}
            <time dateTime={ORVA_LEGAL_UPDATED_ISO} className="font-semibold text-slate-700">
              {content.effectiveDate}
            </time>
          </span>
        </div>

        <h2
          id={`${anchorId}-heading`}
          className="text-xl font-black tracking-tight text-slate-900 sm:text-2xl"
        >
          {content.title}
        </h2>
        <p className="text-sm leading-relaxed text-slate-600">{content.subtitle}</p>
      </header>

      <nav
        aria-label={content.tocLabel}
        className="rounded-xl border border-slate-100 bg-slate-50/80 p-4"
      >
        <p className="mb-2.5 text-xs font-extrabold uppercase tracking-wide text-slate-500">
          {content.tocLabel}
        </p>
        <ol className="grid gap-1.5 sm:grid-cols-2">
          {content.sections.map((section) => (
            <li key={section.id} className="min-w-0">
              <a
                href={`#${section.id}`}
                className="inline-flex max-w-full items-baseline gap-1.5 text-xs font-semibold text-slate-700 transition-colors hover:text-amber-700 hover:underline sm:text-sm"
              >
                <span className="shrink-0 font-mono text-amber-700">{section.number}.</span>
                <span className="truncate">{section.title}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="space-y-4">
        {content.sections.map((section) => (
          <section
            key={section.id}
            id={section.id}
            aria-labelledby={`${section.id}-title`}
            className="scroll-mt-24 space-y-2.5 rounded-xl border border-slate-200/80 bg-slate-50/40 p-4 sm:p-5"
          >
            <h3
              id={`${section.id}-title`}
              className="flex items-baseline gap-2 text-base font-black text-slate-900 sm:text-lg"
            >
              <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-slate-900 font-mono text-xs font-bold text-white">
                {section.number}
              </span>
              <span className="min-w-0 break-words">{section.title}</span>
            </h3>
            {section.summary ? (
              <p className="text-xs font-semibold text-slate-500 sm:text-sm">{section.summary}</p>
            ) : null}
            <div className="space-y-2.5 text-sm leading-7 text-slate-700 [&_strong]:font-bold [&_strong]:text-slate-900 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:ps-5">
              {section.body}
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}

export function LegalDocumentView({
  kind,
  arabicTitle,
  frenchTitle,
  leadSummaryAr,
  leadSummaryFr,
  arabic,
  french,
}: LegalDocumentViewProps) {
  const [filter, setFilter] = useState<LegalLanguageFilter>("all");

  const HeroIcon = kind === "terms" ? Scale : ShieldCheck;
  const siblingHref = kind === "terms" ? "/privacy/" : "/terms/";
  const siblingLabelAr = kind === "terms" ? "سياسة الخصوصية" : "الشروط والأحكام";
  const siblingLabelFr =
    kind === "terms" ? "Politique de confidentialité" : "Conditions générales";

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:py-12">
      {/* Unified Bilingual Header & Interactive Switcher */}
      <header className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">
            <HeroIcon className="size-4 shrink-0" />
            <span>متجر أورفا • ORVA Store Algeria</span>
          </div>

          <Link
            href={siblingHref}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-800 transition-colors hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800"
          >
            <FileText className="size-3.5 shrink-0" />
            <span>
              {siblingLabelAr} / {siblingLabelFr}
            </span>
          </Link>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-black leading-tight text-slate-900 sm:text-3xl">
            {arabicTitle}
          </h1>
          <p dir="ltr" lang="fr" className="text-base font-extrabold text-slate-700 sm:text-lg">
            {frenchTitle}
          </p>
        </div>

        <div className="grid gap-3 border-y border-slate-100 py-4 sm:grid-cols-2">
          <p className="text-sm leading-relaxed text-slate-600">{leadSummaryAr}</p>
          <p
            dir="ltr"
            lang="fr"
            className="border-t border-slate-100 pt-3 text-left text-sm leading-relaxed text-slate-600 sm:border-s sm:border-t-0 sm:ps-4 sm:pt-0"
          >
            {leadSummaryFr}
          </p>
        </div>

        {/* Interactive Language View Controls + Instant Anchor Jumps */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div
            role="group"
            aria-label="اختيار لغة العرض / Choisir la langue d'affichage"
            className="inline-flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 p-1"
          >
            <button
              type="button"
              onClick={() => setFilter("all")}
              aria-pressed={filter === "all"}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                filter === "all"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "text-slate-700 hover:bg-white hover:text-slate-900"
              }`}
            >
              العربية + Français
            </button>
            <button
              type="button"
              onClick={() => setFilter("ar")}
              aria-pressed={filter === "ar"}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                filter === "ar"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "text-slate-700 hover:bg-white hover:text-slate-900"
              }`}
            >
              العربية فقط
            </button>
            <button
              type="button"
              onClick={() => setFilter("fr")}
              aria-pressed={filter === "fr"}
              lang="fr"
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                filter === "fr"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "text-slate-700 hover:bg-white hover:text-slate-900"
              }`}
            >
              Français uniquement
            </button>
          </div>

          {filter === "all" ? (
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
              <a
                href="#ar-version"
                className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-slate-700 transition-colors hover:border-amber-300 hover:text-amber-700"
              >
                القسم العربي ↑
              </a>
              <a
                href="#fr-version"
                lang="fr"
                className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-slate-700 transition-colors hover:border-amber-300 hover:text-amber-700"
              >
                Aller à la version française ↓
              </a>
            </div>
          ) : null}
        </div>
      </header>

      {/* Arabic Version (Default RTL) */}
      <LanguageDocumentArticle content={arabic} hidden={filter === "fr"} anchorId="ar-version" />

      {/* French Version (Explicit LTR) */}
      <LanguageDocumentArticle content={french} hidden={filter === "ar"} anchorId="fr-version" />

      {/* Verified Store Contact & Legal Cross-Navigation Footer */}
      <footer className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-7">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <h2 className="text-base font-black text-slate-900">
              قنوات التواصل الرسمية — متجر أورفا
            </h2>
            <p className="text-xs leading-relaxed text-slate-600">
              لأي استفسار أو طلب، تواصل معنا عبر قنواتنا الرسمية أدناه.
            </p>
          </div>
          <div dir="ltr" lang="fr" className="space-y-2 text-left">
            <h2 className="text-base font-black text-slate-900">
              Contacts officiels — ORVA Store Algeria
            </h2>
            <p className="text-xs leading-relaxed text-slate-600">
              Pour toute question ou demande, contactez-nous via nos canaux officiels ci-dessous.
            </p>
          </div>
        </div>

        <div className="grid gap-3 text-xs sm:grid-cols-3">
          <a
            href={`mailto:${ORVA_LEGAL_EMAIL}`}
            className="flex min-w-0 items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50/70 p-3 font-medium text-slate-800 transition-colors hover:border-amber-300 hover:bg-amber-50/50"
          >
            <Mail className="size-4 shrink-0 text-amber-700" />
            <span dir="ltr" className="truncate font-mono font-bold">
              {ORVA_LEGAL_EMAIL}
            </span>
          </a>

          <a
            href={`tel:${ORVA_LEGAL_PHONE}`}
            className="flex min-w-0 items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50/70 p-3 font-medium text-slate-800 transition-colors hover:border-amber-300 hover:bg-amber-50/50"
          >
            <Phone className="size-4 shrink-0 text-amber-700" />
            <span dir="ltr" className="truncate font-mono font-bold">
              {ORVA_LEGAL_PHONE_DISPLAY}
            </span>
          </a>

          <a
            href={ORVA_LEGAL_WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-w-0 items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3 font-bold text-slate-800 transition-colors hover:border-emerald-300 hover:bg-emerald-50/50"
          >
            <span className="flex items-center gap-2">
              <MessageCircle className="size-4 shrink-0 text-emerald-700" />
              <span>واتساب / WhatsApp</span>
            </span>
            <ExternalLink className="size-3.5 shrink-0 text-slate-400" />
          </a>
        </div>

        <nav
          aria-label="روابط صفحات المتجر / Navigation légale"
          className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-100 pt-4 text-xs font-bold sm:text-sm"
        >
          <Link href="/" className="text-amber-700 hover:underline">
            الرئيسية / Accueil
          </Link>
          <Link href="/shop/" className="text-slate-700 hover:text-amber-700 hover:underline">
            المتجر / Boutique
          </Link>
          <Link href="/terms/" className="text-slate-700 hover:text-amber-700 hover:underline">
            الشروط والأحكام / Conditions
          </Link>
          <Link href="/privacy/" className="text-slate-700 hover:text-amber-700 hover:underline">
            سياسة الخصوصية / Confidentialité
          </Link>
        </nav>
      </footer>
    </div>
  );
}
