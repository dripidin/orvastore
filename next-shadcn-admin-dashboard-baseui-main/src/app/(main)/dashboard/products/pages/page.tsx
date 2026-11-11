"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";

import Link from "next/link";

import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  ExternalLink,
  Eye,
  FileCheck,
  FileCode2,
  Globe,
  Layers,
  Package,
  RefreshCw,
  RotateCcw,
  Sparkles,
} from "lucide-react";

import { DevEnvironmentBanner } from "@/components/dev-environment-banner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { PublishToStoreButton } from "@/app/(main)/dashboard/_components/publish-to-store-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getMockStorePagesRepository } from "@/lib/repository/mock-store-pages-repository";
import type { SitemapEntry, StorePage } from "@/lib/repository/store-pages-types";

export default function StorePagesAndSitemapPage() {
  const repo = useMemo(() => getMockStorePagesRepository(), []);

  const [pages, setPages] = useState<StorePage[]>([]);
  const [sitemap, setSitemap] = useState<SitemapEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

  // Preview Dialog State
  const [previewPage, setPreviewPage] = useState<StorePage | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [previewTab, setPreviewTab] = useState<"render" | "code">("render");
  const [copied, setCopied] = useState<boolean>(false);

  // Sitemap Dialog State
  const [sitemapModalOpen, setSitemapModalOpen] = useState<boolean>(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const p = await repo.getPages();
      const s = await repo.getSitemapEntries();
      setPages(p);
      setSitemap(s);
    } catch (_) {
      setFeedback({ type: "error", text: "تعذر تحميل بيانات صفحات المتجر وخريطة الموقع." });
    } finally {
      setLoading(false);
    }
  }, [repo]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleGeneratePreview = async (page: StorePage) => {
    setActionLoading(page.pageId);
    try {
      const html = await repo.generatePreviewHtml(page.pageId);
      setPreviewPage(page);
      setPreviewHtml(html);
      setPreviewTab("render");
      setFeedback({
        type: "success",
        text: `تم توليد كود المعاينة الآمن لصفحة "${page.title}" وفق القالب الأصلي المعتمد (orva-calm-night-light).`,
      });
      await loadData();
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "حدث خطأ أثناء توليد المعاينة.",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleSyncWithProduct = async (page: StorePage) => {
    setActionLoading(`sync_${page.pageId}`);
    try {
      const result = await repo.syncWithProduct(page.productId);
      setFeedback({
        type: result.actionTaken === "archived" ? "info" : "success",
        text: result.message,
      });
      await loadData();
    } catch (_) {
      setFeedback({ type: "error", text: "تعذر إتمام المزامنة مع سجل المنتج." });
    } finally {
      setActionLoading(null);
    }
  };

  const handlePublishPage = async (page: StorePage) => {
    setActionLoading(`pub_${page.pageId}`);
    try {
      const updated = await repo.publishPage(page.pageId);
      setFeedback({
        type: "success",
        text: `تم نشر صفحة المنتج بنجاح وأصبحت متاحة للعملاء على: ${updated.publicUrl}`,
      });
      if (previewPage?.pageId === page.pageId) {
        setPreviewPage(null);
      }
      await loadData();
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "حدث خطأ أثناء نشر الصفحة.",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleUnpublishPage = async (page: StorePage) => {
    setActionLoading(`unpub_${page.pageId}`);
    try {
      await repo.unpublishPage(page.pageId);
      setFeedback({
        type: "info",
        text: `تم إلغاء نشر الصفحة بنجاح وحذفها من مسار المتجر العام.`,
      });
      await loadData();
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "حدث خطأ أثناء إلغاء النشر.",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleArchivePage = async (page: StorePage) => {
    setActionLoading(`arch_${page.pageId}`);
    try {
      await repo.archivePage(page.pageId);
      setFeedback({
        type: "info",
        text: `تمت أرشفة صفحة المنتج وإلغاء ظهورها العام.`,
      });
      await loadData();
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "حدث خطأ أثناء الأرشفة.",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const copyHtmlCode = () => {
    if (!previewHtml) return;
    navigator.clipboard.writeText(previewHtml);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // Metrics
  const publishedCount = pages.filter((p) => p.status === "published").length;
  const previewReadyCount = pages.filter((p) => p.status === "preview_ready").length;
  const draftOrArchivedCount = pages.filter((p) => p.status === "draft" || p.status === "archived").length;

  return (
    <div className="space-y-6 pb-20" dir="ltr">
      <DevEnvironmentBanner />

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/products"
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            >
              <ArrowLeft className="h-3 w-3" />
              الكتالوج والمخزون
            </Link>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2 mt-1">
            <Globe className="h-6 w-6 text-primary" />
            إدارة صفحات المتجر وخريطة الموقع (Store Pages & Sitemap)
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            نظام توليد وإدارة صفحات الهبوط العامة للمتجر، مع المعاينة المعزولة وإدارة مسارات الإنتاج.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <PublishToStoreButton />
          <Button variant="outline" size="sm" onClick={() => setSitemapModalOpen(true)} className="text-xs gap-1.5">
            <FileCode2 className="h-3.5 w-3.5 text-primary" />
            خريطة الموقع (Sitemap XML)
          </Button>

          <Link href="/dashboard/products/designer">
            <Button size="sm" className="text-xs gap-1.5">
              <Layers className="h-3.5 w-3.5" />
              محرر التصميم (Designer)
            </Button>
          </Link>
        </div>
      </div>

      {/* ── Feedback Message ──────────────────────────────────────────────── */}
      {feedback && (
        <Alert variant={feedback.type === "error" ? "destructive" : "default"}>
          {feedback.type === "error" ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
          <AlertTitle>{feedback.type === "error" ? "خطأ في العملية" : "تمت العملية بنجاح"}</AlertTitle>
          <AlertDescription>{feedback.text}</AlertDescription>
        </Alert>
      )}

      {/* ── Metric Summary Cards ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">إجمالي الصفحات المسجلة</CardDescription>
            <CardTitle className="text-2xl font-bold">{pages.length}</CardTitle>
          </CardHeader>
          <CardContent className="text-[11px] text-muted-foreground">تغطي كافة الباقات والعروض في الكتالوج</CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">صفحات منشورة فعلياً (Published)</CardDescription>
            <CardTitle className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {publishedCount}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-[11px] text-muted-foreground">روابط حقيقية ومثبتة في خادم الإنتاج</CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">صفحات جاهزة للمعاينة (Preview Ready)</CardDescription>
            <CardTitle className="text-2xl font-bold text-blue-600 dark:text-blue-400">{previewReadyCount}</CardTitle>
          </CardHeader>
          <CardContent className="text-[11px] text-muted-foreground">باقات جديدة جاهزة للمراجعة قبل النشر</CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">مسودات ومؤرشفة (Draft / Archived)</CardDescription>
            <CardTitle className="text-2xl font-bold text-amber-600 dark:text-amber-400">
              {draftOrArchivedCount}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-[11px] text-muted-foreground">محمية ولا تظهر في نتائج محركات البحث</CardContent>
        </Card>
      </div>

      {/* ── Store Pages & Sitemap Registry Table ──────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <FileCheck className="h-4 w-4 text-primary" />
                سجل صفحات المتجر وخريطة الفهرسة
              </CardTitle>
              <CardDescription className="text-xs">
                قائمة كافة صفحات الهبوط وحالاتها والروابط العامة أو المعاينات المرتبطة بها.
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={loadData} disabled={loading} className="text-xs self-end">
              <RefreshCw className={`h-3.5 w-3.5 ml-1 ${loading ? "animate-spin" : ""}`} />
              تحديث السجل
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">المنتج / الباقة</TableHead>
                  <TableHead className="text-right">المسار والرابط العام</TableHead>
                  <TableHead className="text-right">القالب وإصداره</TableHead>
                  <TableHead className="text-right">الحالة</TableHead>
                  <TableHead className="text-right">آخر توليد</TableHead>
                  <TableHead className="text-left">الإجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pages.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-xs">
                      لا توجد صفحات مسجلة حالياً.
                    </TableCell>
                  </TableRow>
                ) : (
                  pages.map((page) => (
                    <TableRow key={page.pageId}>
                      <TableCell>
                        <div className="font-semibold text-xs text-foreground">{page.title}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Badge variant="outline" className="font-mono text-[10px]">
                            {page.productSku}
                          </Badge>
                          <span className="text-[11px] text-muted-foreground">ID: {page.productId}</span>
                        </div>
                      </TableCell>

                      <TableCell>
                        {page.status === "published" && page.publicUrl ? (
                          <a
                            href={page.publicUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-mono"
                          >
                            <span>{page.publicUrl}</span>
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <div className="flex items-center gap-1 text-muted-foreground text-xs">
                            <span className="font-mono text-[11px]">/{page.slug}</span>
                            <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
                              غير منشور علناً
                            </Badge>
                          </div>
                        )}
                        <div className="text-[10px] text-muted-foreground font-mono mt-0.5">{page.previewPath}</div>
                      </TableCell>

                      <TableCell>
                        <div className="text-xs font-mono">{page.templateId}</div>
                        <div className="text-[10px] text-muted-foreground">v{page.templateVersion}</div>
                      </TableCell>

                      <TableCell>
                        {page.status === "published" && (
                          <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px]">
                            منشور (Published)
                          </Badge>
                        )}
                        {page.status === "preview_ready" && (
                          <Badge
                            variant="secondary"
                            className="bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30 text-[10px]"
                          >
                            جاهز للمعاينة (Preview)
                          </Badge>
                        )}
                        {page.status === "draft" && (
                          <Badge variant="outline" className="text-amber-600 border-amber-400 text-[10px]">
                            مسودة (Draft)
                          </Badge>
                        )}
                        {page.status === "archived" && (
                          <Badge variant="outline" className="text-muted-foreground text-[10px]">
                            مؤرشف (Archived)
                          </Badge>
                        )}
                      </TableCell>

                      <TableCell className="text-xs text-muted-foreground font-mono">
                        {new Date(page.lastGeneratedAt).toLocaleDateString("ar-DZ")}
                      </TableCell>

                      <TableCell className="text-left">
                        <div className="flex items-center justify-end gap-1.5">
                          {page.status === "published" ? (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-[11px] gap-1 text-emerald-600 border-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                                nativeButton={false}
                                render={<a href={page.publicUrl || "#"} target="_blank" rel="noopener noreferrer" />}
                              >
                                <ExternalLink className="h-3 w-3" />
                                <span>عرض</span>
                              </Button>

                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-[11px] gap-1 text-amber-600 border-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                                onClick={() => handleUnpublishPage(page)}
                                disabled={actionLoading === `unpub_${page.pageId}`}
                                title="إلغاء نشر الصفحة وحذفها من مسار المتجر"
                              >
                                <RotateCcw
                                  className={`h-3 w-3 ${actionLoading === `unpub_${page.pageId}` ? "animate-spin" : ""}`}
                                />
                                <span>إلغاء النشر</span>
                              </Button>
                            </>
                          ) : (
                            <Button
                              variant="default"
                              size="sm"
                              className="h-7 text-[11px] gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                              onClick={() => handlePublishPage(page)}
                              disabled={actionLoading === `pub_${page.pageId}`}
                              title="نشر الصفحة للعملاء في مسار المتجر الفعلي"
                            >
                              <CheckCircle2
                                className={`h-3 w-3 ${actionLoading === `pub_${page.pageId}` ? "animate-spin" : ""}`}
                              />
                              <span>نشر الصفحة</span>
                            </Button>
                          )}

                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-[11px] gap-1"
                            onClick={() => handleGeneratePreview(page)}
                            disabled={actionLoading === page.pageId}
                            title="توليد ومعاينة كود HTML المستقل"
                          >
                            <Sparkles className="h-3 w-3 text-amber-500" />
                            <span>المعاينة</span>
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-[11px] text-muted-foreground"
                            onClick={() => handleSyncWithProduct(page)}
                            disabled={actionLoading === `sync_${page.pageId}`}
                            title="مزامنة بيانات الصفحة مع كتالوج المنتجات"
                          >
                            <RefreshCw
                              className={`h-3 w-3 ${actionLoading === `sync_${page.pageId}` ? "animate-spin" : ""}`}
                            />
                          </Button>

                          {page.status !== "archived" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-[11px] text-muted-foreground hover:text-destructive"
                              onClick={() => handleArchivePage(page)}
                              disabled={actionLoading === `arch_${page.pageId}`}
                              title="أرشفة الصفحة"
                            >
                              <Archive className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── Safe HTML Preview Modal ───────────────────────────────────────── */}
      <Dialog open={Boolean(previewPage)} onOpenChange={(open) => !open && setPreviewPage(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col text-right" dir="ltr">
          <DialogHeader className="border-b pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Code2 className="h-5 w-5 text-primary" />
                <DialogTitle className="text-base font-bold">معاينة صفحة المنتج: {previewPage?.title}</DialogTitle>
              </div>
              <Badge variant="outline" className="font-mono text-xs">
                {previewPage?.templateId} v{previewPage?.templateVersion}
              </Badge>
            </div>
            <DialogDescription className="text-xs">
              كود HTML مستقل وخالٍ من تكاليف الشراء أو بيانات الزبائن، يتبع بدقة بنية صفحة المتجر المعتمدة.
            </DialogDescription>
          </DialogHeader>

          {/* Tab Switcher */}
          <div className="flex items-center justify-between border-b py-2 px-1">
            <div className="flex items-center gap-2">
              <Button
                variant={previewTab === "render" ? "default" : "outline"}
                size="sm"
                onClick={() => setPreviewTab("render")}
                className="text-xs h-7"
              >
                <Eye className="h-3.5 w-3.5 ml-1" />
                المعاينة البصرية (Visual Frame)
              </Button>
              <Button
                variant={previewTab === "code" ? "default" : "outline"}
                size="sm"
                onClick={() => setPreviewTab("code")}
                className="text-xs h-7"
              >
                <FileCode2 className="h-3.5 w-3.5 ml-1" />
                كود HTML المولد (Source)
              </Button>
            </div>

            {previewTab === "code" && (
              <Button variant="outline" size="sm" onClick={copyHtmlCode} className="text-xs h-7 gap-1">
                {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                {copied ? "تم النسخ!" : "نسخ الكود"}
              </Button>
            )}
          </div>

          {/* Modal Content */}
          <div className="flex-1 overflow-auto py-2">
            {previewTab === "render" ? (
              <div className="w-full h-[520px] rounded-lg border bg-neutral-950 overflow-hidden">
                <iframe
                  srcDoc={previewHtml}
                  title="Storefront Page Preview"
                  className="w-full h-full border-none"
                  sandbox="allow-scripts"
                />
              </div>
            ) : (
              <div className="relative">
                <pre className="p-4 rounded-lg bg-neutral-900 text-neutral-200 text-xs font-mono overflow-auto max-h-[520px] text-left direction-ltr">
                  <code>{previewHtml}</code>
                </pre>
              </div>
            )}
          </div>

          <DialogFooter className="border-t pt-3 flex items-center justify-between sm:justify-between">
            <div className="text-[11px] text-muted-foreground">
              المسار المعزول: <code className="font-mono text-primary">{previewPage?.previewPath}</code>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5"
                onClick={() => previewPage && handlePublishPage(previewPage)}
                disabled={actionLoading === `pub_${previewPage?.pageId}`}
              >
                <CheckCircle2
                  className={`h-3.5 w-3.5 ${actionLoading === `pub_${previewPage?.pageId}` ? "animate-spin" : ""}`}
                />
                <span>نشر هذه النسخة الآن (Publish Live)</span>
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPreviewPage(null)}>
                إغلاق المعاينة
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Sitemap XML Modal ─────────────────────────────────────────────── */}
      <Dialog open={sitemapModalOpen} onOpenChange={setSitemapModalOpen}>
        <DialogContent className="max-w-2xl text-right" dir="ltr">
          <DialogHeader className="border-b pb-3">
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" />
              <DialogTitle className="text-base font-bold">سجل خريطة الموقع (Sitemap Index Registry)</DialogTitle>
            </div>
            <DialogDescription className="text-xs">
              تصفية الروابط العامة المفهرسة وفق قواعد محركات البحث (SEO Safety Gate).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <p className="text-muted-foreground leading-relaxed">
              تقتصر الروابط العامة المفهرسة حصرياً على الصفحات المنشورة (
              <code className="text-primary font-mono text-[11px]">published</code>). أي صفحات جديدة أو مسودات تجريبية
              يتم استبعادها من الفهرسة لتفادي أخطاء 404 أو روابط وهمية.
            </p>

            <div className="rounded-md border p-3 bg-muted/40 font-mono text-[11px] space-y-1.5 direction-ltr text-left overflow-auto max-h-[260px]">
              <div className="text-muted-foreground">&lt;!-- ORVA Store Sitemap Index --&gt;</div>
              <div className="text-muted-foreground">
                &lt;urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"&gt;
              </div>
              {sitemap
                .filter((entry) => entry.isPublicIndexable)
                .map((entry) => (
                  <div key={entry.url} className="pl-4 text-emerald-400">
                    &lt;url&gt;
                    <br />
                    &nbsp;&nbsp;&lt;loc&gt;https://orva-store.com{entry.url}&lt;/loc&gt;
                    <br />
                    &nbsp;&nbsp;&lt;lastmod&gt;{entry.lastModified.slice(0, 10)}&lt;/lastmod&gt;
                    <br />
                    &nbsp;&nbsp;&lt;changefreq&gt;{entry.changeFrequency}&lt;/changefreq&gt;
                    <br />
                    &nbsp;&nbsp;&lt;priority&gt;{entry.priority.toFixed(1)}&lt;/priority&gt;
                    <br />
                    &lt;/url&gt;
                  </div>
                ))}
              {sitemap
                .filter((entry) => !entry.isPublicIndexable)
                .map((entry) => (
                  <div key={entry.productId} className="pl-4 text-neutral-500 line-through">
                    &lt;!-- Staged: {entry.productSku} ({entry.status}) excluded from public sitemap --&gt;
                  </div>
                ))}
              <div className="text-muted-foreground">&lt;/urlset&gt;</div>
            </div>
          </div>

          <DialogFooter className="border-t pt-3">
            <Button variant="outline" size="sm" onClick={() => setSitemapModalOpen(false)}>
              إغلاق
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
