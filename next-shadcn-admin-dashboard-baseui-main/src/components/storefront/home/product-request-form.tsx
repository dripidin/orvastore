"use client";

import { useState } from "react";

import { CheckCircle2, Lightbulb, Loader2, Send } from "lucide-react";

import { ALGERIA_58_WILAYAS } from "@/lib/types/checkout";

const inputCls =
  "w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 placeholder-slate-400 outline-hidden transition focus:border-amber-500 focus:bg-white";

/** Home-page form: customers tell us which products they want ORVA to sell. */
export function ProductRequestForm() {
  const [form, setForm] = useState({ customerName: "", phone: "", wilaya: "", productWanted: "", message: "" });
  const [website, setWebsite] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (form.customerName.trim().length < 2) return setError("يرجى كتابة اسمك.");
    if (form.productWanted.trim().length < 3) return setError("يرجى كتابة المنتج الذي تبحث عنه.");
    setState("sending");
    try {
      const res = await fetch("/api/product-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, website }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok || !d?.success) throw new Error(d?.error || "تعذر الإرسال، حاول مرة أخرى.");
      setState("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر الإرسال، حاول مرة أخرى.");
      setState("idle");
    }
  };

  return (
    <section id="request-product" className="mx-auto max-w-7xl px-4 sm:px-6">
      <div className="grid overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm lg:grid-cols-5">
        <div className="space-y-4 bg-slate-950 p-8 text-white lg:col-span-2">
          <span className="grid size-12 place-items-center rounded-2xl bg-amber-500/15 text-amber-400">
            <Lightbulb className="size-6" />
          </span>
          <h2 className="font-black text-2xl leading-snug sm:text-3xl">ما لقيتش واش تحوس عليه؟</h2>
          <p className="text-slate-300 text-sm leading-relaxed">
            قولنا على المنتج أو الأداة اللي تحب نوفروها في المتجر. نقراو كل الطلبات ونزيدو المنتجات الأكثر طلباً،
            ونتصلو بيك كي يتوفر.
          </p>
        </div>

        <div className="p-6 sm:p-8 lg:col-span-3">
          {state === "sent" ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 py-10 text-center">
              <CheckCircle2 className="size-12 text-emerald-600" />
              <h3 className="font-black text-xl text-slate-900">وصلنا طلبك، شكراً!</h3>
              <p className="text-slate-600 text-sm">سنراجعه ونتصل بك عند توفر المنتج.</p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4 text-right" noValidate>
              <input
                type="text"
                name="website"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                className="hidden"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="font-bold text-slate-800 text-sm">الاسم *</span>
                  <input className={inputCls} value={form.customerName} onChange={set("customerName")} placeholder="اسمك" />
                </label>
                <label className="space-y-1.5">
                  <span className="font-bold text-slate-800 text-sm">رقم الهاتف (اختياري)</span>
                  <input
                    className={`${inputCls} text-right font-mono`}
                    dir="ltr"
                    type="tel"
                    value={form.phone}
                    onChange={set("phone")}
                    placeholder="05 / 06 / 07"
                  />
                </label>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="font-bold text-slate-800 text-sm">المنتج المطلوب *</span>
                  <input
                    className={inputCls}
                    value={form.productWanted}
                    onChange={set("productWanted")}
                    placeholder="مثال: مكينة غسيل بالضغط CROWN"
                  />
                </label>
                <label className="space-y-1.5">
                  <span className="font-bold text-slate-800 text-sm">الولاية</span>
                  <select className={`${inputCls} cursor-pointer`} value={form.wilaya} onChange={set("wilaya")}>
                    <option value="">اختر الولاية</option>
                    {ALGERIA_58_WILAYAS.map((w) => (
                      <option key={w.code} value={`${w.code} - ${w.nameAr}`}>
                        {String(w.code).padStart(2, "0")} - {w.nameAr}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block space-y-1.5">
                <span className="font-bold text-slate-800 text-sm">تفاصيل إضافية</span>
                <textarea
                  className={`${inputCls} min-h-24 resize-y`}
                  value={form.message}
                  onChange={set("message")}
                  placeholder="الماركة، المقاس، الاستعمال، السعر اللي يناسبك..."
                />
              </label>
              {error && <p className="font-medium text-red-600 text-sm">{error}</p>}
              <button
                type="submit"
                disabled={state === "sending"}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-6 py-3.5 font-black text-slate-950 transition hover:bg-amber-400 disabled:opacity-70 sm:w-auto"
              >
                {state === "sending" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                أرسل طلبك
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
