'use client';

import * as React from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  Flame,
  Info,
  Key,
  Layers,
  Loader2,
  Lock,
  MessageSquare,
  Package,
  Radio,
  RefreshCw,
  Save,
  Send,
  Server,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Tag,
  Truck,
  Zap,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  saveSettingsAction,
  testTelegramNotificationAction,
  testCourierConnectionAction,
  getAdminSettingsAction,
  type AdminSettingsRecord,
} from '@/app/actions/settings';

export function AdminSettingsDashboard() {
  // ── Global Status State ───────────────────────────────────────────────────
  const [loading, setLoading] = React.useState<boolean>(true);
  const [saving, setSaving] = React.useState<boolean>(false);
  const [globalFeedback, setGlobalFeedback] = React.useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // ── Meta Pixel & CAPI State ───────────────────────────────────────────────
  const [metaPixelId, setMetaPixelId] = React.useState<string>('');
  const [metaCapiToken, setMetaCapiToken] = React.useState<string>('');
  const [showMetaToken, setShowMetaToken] = React.useState<boolean>(false);
  const [metaTestEventCode, setMetaTestEventCode] = React.useState<string>('');
  const [metaPixelEnabled, setMetaPixelEnabled] = React.useState<boolean>(true);
  const [metaCapiEnabled, setMetaCapiEnabled] = React.useState<boolean>(true);

  // ── Telegram Bot State ────────────────────────────────────────────────────
  const [telegramBotToken, setTelegramBotToken] = React.useState<string>('');
  const [showTelegramToken, setShowTelegramToken] = React.useState<boolean>(false);
  const [telegramChatId, setTelegramChatId] = React.useState<string>('');
  const [telegramAlertsEnabled, setTelegramAlertsEnabled] = React.useState<boolean>(true);
  const [telegramTesting, setTelegramTesting] = React.useState<boolean>(false);
  const [telegramTestResult, setTelegramTestResult] = React.useState<{
    success: boolean;
    message: string;
    alertPreview?: string;
  } | null>(null);

  // ── Courier Logistics State ───────────────────────────────────────────────
  const [activeCourier, setActiveCourier] = React.useState<'mock' | 'yalidine' | 'zr_express'>('mock');
  const [yalidineApiId, setYalidineApiId] = React.useState<string>('');
  const [yalidineApiToken, setYalidineApiToken] = React.useState<string>('');
  const [showYalidineToken, setShowYalidineToken] = React.useState<boolean>(false);
  const [yalidineDeliveryType, setYalidineDeliveryType] = React.useState<'DOMICILE' | 'STOP_DESK'>('DOMICILE');

  const [zrApiKey, setZrApiKey] = React.useState<string>('');
  const [zrApiSecret, setZrApiSecret] = React.useState<string>('');
  const [showZrSecret, setShowZrSecret] = React.useState<boolean>(false);

  const [courierTesting, setCourierTesting] = React.useState<boolean>(false);
  const [courierConnectionStatus, setCourierConnectionStatus] = React.useState<{
    providerId: string;
    success: boolean;
    message: string;
    latencyMs?: number;
  } | null>(null);

  // ── Load Settings on Mount ────────────────────────────────────────────────
  React.useEffect(() => {
    async function loadSettings() {
      try {
        setLoading(true);
        const settings = await getAdminSettingsAction();
        if (settings) {
          // Meta
          setMetaPixelId(settings.metaPixel.pixelId || '');
          setMetaCapiToken(settings.metaPixel.capiToken || '');
          setMetaTestEventCode(settings.metaPixel.testEventCode || '');
          setMetaPixelEnabled(settings.metaPixel.enabled !== false);
          setMetaCapiEnabled(settings.metaPixel.capiEnabled !== false);

          // Telegram
          setTelegramBotToken(settings.telegram.botToken || '');
          setTelegramChatId(settings.telegram.chatId || '');
          setTelegramAlertsEnabled(settings.telegram.enabled !== false);

          // Couriers
          const provider = (settings.couriers.activeProvider || 'mock') as 'mock' | 'yalidine' | 'zr_express';
          setActiveCourier(['mock', 'yalidine', 'zr_express'].includes(provider) ? provider : 'mock');
          setYalidineApiId(settings.couriers.yalidine.apiId || '');
          setYalidineApiToken(settings.couriers.yalidine.apiToken || '');
          setYalidineDeliveryType(settings.couriers.yalidine.defaultDeliveryType || 'DOMICILE');
          setZrApiKey(settings.couriers.zrExpress.apiKey || '');
          setZrApiSecret(settings.couriers.zrExpress.apiSecret || '');
        }
      } catch (err) {
        console.warn('[AdminSettings Load Warning]:', err);
      } finally {
        setLoading(false);
      }
    }

    loadSettings();
  }, []);

  // ── Save All Settings Handler ─────────────────────────────────────────────
  const handleSaveChanges = async () => {
    setSaving(true);
    setGlobalFeedback(null);
    try {
      const res = await saveSettingsAction({
        metaPixel: {
          pixelId: metaPixelId,
          capiToken: metaCapiToken,
          testEventCode: metaTestEventCode,
          enabled: metaPixelEnabled,
          capiEnabled: metaCapiEnabled,
        },
        telegram: {
          botToken: telegramBotToken,
          chatId: telegramChatId,
          enabled: telegramAlertsEnabled,
        },
        couriers: {
          activeProvider: activeCourier,
          yalidine: {
            apiId: yalidineApiId,
            apiToken: yalidineApiToken,
            defaultDeliveryType: yalidineDeliveryType,
          },
          zrExpress: {
            apiKey: zrApiKey,
            apiSecret: zrApiSecret,
          },
        },
      });

      if (res.success) {
        setGlobalFeedback({
          type: 'success',
          message: 'تم حفظ وتحديث كافة الإعدادات والربط السحابي في قاعدة البيانات بنجاح.',
        });
      } else {
        setGlobalFeedback({
          type: 'error',
          message: res.message || 'حدث خطأ أثناء حفظ الإعدادات.',
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل حفظ الإعدادات';
      setGlobalFeedback({ type: 'error', message: msg });
    } finally {
      setSaving(false);
    }
  };

  // ── Test Telegram Alert Handler ───────────────────────────────────────────
  const handleTestTelegram = async () => {
    setTelegramTesting(true);
    setTelegramTestResult(null);
    try {
      const res = await testTelegramNotificationAction(telegramBotToken, telegramChatId);
      setTelegramTestResult(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل إرسال إشعار التجربة';
      setTelegramTestResult({ success: false, message: msg });
    } finally {
      setTelegramTesting(false);
    }
  };

  // ── Test Courier Connection Handler ───────────────────────────────────────
  const handleTestCourier = async (providerId: string) => {
    setCourierTesting(true);
    setCourierConnectionStatus(null);
    try {
      const creds: Record<string, string> = {};
      if (providerId === 'yalidine') {
        creds.apiId = yalidineApiId;
        creds.apiToken = yalidineApiToken;
      } else if (providerId === 'zr_express') {
        creds.apiKey = zrApiKey;
        creds.apiSecret = zrApiSecret;
      }

      const res = await testCourierConnectionAction(providerId, creds);
      setCourierConnectionStatus({
        providerId,
        success: res.success,
        message: res.message,
        latencyMs: res.latencyMs,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل فحص اتصال الناقل';
      setCourierConnectionStatus({
        providerId,
        success: false,
        message: msg,
      });
    } finally {
      setCourierTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 border rounded-xl bg-card">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="size-6 animate-spin text-primary" />
          <p className="text-xs text-muted-foreground">جاري تحميل إعدادات وتكاملات المتجر...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner & Save Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border bg-card shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold">بوابة التكاملات وإعدادات النظام المتقدمة</h2>
            <Badge variant="outline" className="text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300">
              <ShieldCheck className="size-3 mr-1 inline" /> نشط ومحمي
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            إدارة بيكسل فيسبوك، إشعارات تليجرام الفورية للطلبيات، وشبكة شركات التوصيل السريع (Yalidine و ZR Express).
          </p>
        </div>

        <Button
          onClick={handleSaveChanges}
          disabled={saving}
          className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-5 shadow-xs"
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          <span>حفظ التعديلات</span>
        </Button>
      </div>

      {/* Global Feedback Banner */}
      {globalFeedback && (
        <Alert
          variant={globalFeedback.type === 'error' ? 'destructive' : 'default'}
          className={globalFeedback.type === 'success' ? 'border-emerald-500 bg-emerald-50/50 text-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-300' : ''}
        >
          {globalFeedback.type === 'error' ? <AlertCircle className="size-4" /> : <CheckCircle2 className="size-4 text-emerald-600" />}
          <AlertTitle className="font-bold text-xs">
            {globalFeedback.type === 'error' ? 'خطأ في العملية' : 'تم بنجاح'}
          </AlertTitle>
          <AlertDescription className="text-xs mt-1">{globalFeedback.message}</AlertDescription>
        </Alert>
      )}

      {/* Main Tabs Container */}
      <Tabs defaultValue="meta" className="w-full">
        <TabsList className="grid grid-cols-3 w-full max-w-xl h-11 p-1 bg-muted/60">
          <TabsTrigger value="meta" className="text-xs font-semibold gap-1.5 data-[state=active]:shadow-xs">
            <Tag className="size-3.5 text-blue-600" />
            <span>Meta Pixel & CAPI</span>
          </TabsTrigger>
          <TabsTrigger value="telegram" className="text-xs font-semibold gap-1.5 data-[state=active]:shadow-xs">
            <MessageSquare className="size-3.5 text-sky-500" />
            <span>Telegram Bot Alerts</span>
          </TabsTrigger>
          <TabsTrigger value="couriers" className="text-xs font-semibold gap-1.5 data-[state=active]:shadow-xs">
            <Truck className="size-3.5 text-amber-500" />
            <span>شركات الشحن والتوصيل</span>
          </TabsTrigger>
        </TabsList>

        {/* ══════════════════════════════════════════════════════════════════════
            TAB 1: Meta Pixel & Conversions API (CAPI)
        ══════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="meta" className="space-y-4 pt-3">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base font-bold flex items-center gap-2">
                      <Tag className="size-4 text-blue-600" />
                      إعدادات تتبع الحملات — Meta Pixel & Conversions API
                    </CardTitle>
                    <Badge variant="secondary" className="text-[11px] font-mono">
                      v19.0 Graph API
                    </Badge>
                  </div>
                  <CardDescription className="text-xs">
                    تتبع دقيق عالي التحويل لمبيعات COD مع تفادي حظر الكوكيز وإلغاء الازدواجية البرمجية (Deduplication).
                  </CardDescription>
                </div>

                <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 px-3 py-1.5 rounded-lg text-emerald-800 dark:text-emerald-300 text-xs font-medium">
                  <ShieldCheck className="size-4 text-emerald-600" />
                  <span>تشفير SHA-256 للمطابقة الصارمة نشط</span>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-5">
              {/* Feature Toggles */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center justify-between p-3.5 rounded-xl border bg-muted/20">
                  <div className="space-y-0.5">
                    <Label htmlFor="meta-pixel-toggle" className="text-xs font-bold cursor-pointer">
                      حقن كود المتصفح (Browser Pixel Injection)
                    </Label>
                    <p className="text-[11px] text-muted-foreground">
                      تفعيل إطلاق أحداث PageView و ViewContent و InitiateCheckout من المتصفح.
                    </p>
                  </div>
                  <Switch
                    id="meta-pixel-toggle"
                    checked={metaPixelEnabled}
                    onCheckedChange={setMetaPixelEnabled}
                  />
                </div>

                <div className="flex items-center justify-between p-3.5 rounded-xl border bg-muted/20">
                  <div className="space-y-0.5">
                    <Label htmlFor="meta-capi-toggle" className="text-xs font-bold cursor-pointer">
                      خادم التحويلات (Server CAPI Events)
                    </Label>
                    <p className="text-[11px] text-muted-foreground">
                      إرسال أحداث Purchase المؤكدة مباشرة من الخادم عند اكتمال طلب الزبون.
                    </p>
                  </div>
                  <Switch
                    id="meta-capi-toggle"
                    checked={metaCapiEnabled}
                    onCheckedChange={setMetaCapiEnabled}
                  />
                </div>
              </div>

              {/* Pixel ID Input */}
              <div className="space-y-1.5">
                <Label htmlFor="pixel-id-input" className="text-xs font-semibold flex items-center gap-1.5">
                  <span>معرف بيكسل فيسبوك (Meta Pixel ID)</span>
                  <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="pixel-id-input"
                    type="text"
                    dir="ltr"
                    placeholder="مثال: 2340414976777036"
                    value={metaPixelId}
                    onChange={(e) => setMetaPixelId(e.target.value)}
                    className="font-mono text-xs pr-9"
                  />
                  <Tag className="size-3.5 text-muted-foreground absolute right-3 top-3 pointer-events-none" />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  المعرف الرقمي من لوحة Meta Events Manager، يتكون عادة من 15 إلى 16 رقماً.
                </p>
              </div>

              {/* CAPI Access Token Input with Show/Hide */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="capi-token-input" className="text-xs font-semibold flex items-center gap-1.5">
                    <span>رمز وصول الخادم (CAPI Access Token)</span>
                    <span className="text-destructive">*</span>
                  </Label>
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Lock className="size-3 text-emerald-600" />
                    <span>يُخزَّن سرياً على الخادم فقط</span>
                  </span>
                </div>
                <div className="relative">
                  <Input
                    id="capi-token-input"
                    type={showMetaToken ? 'text' : 'password'}
                    dir="ltr"
                    placeholder="مثال: EAAB..."
                    value={metaCapiToken}
                    onChange={(e) => setMetaCapiToken(e.target.value)}
                    className="font-mono text-xs pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowMetaToken(!showMetaToken)}
                    className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground p-0.5 rounded cursor-pointer"
                    title={showMetaToken ? 'إخفاء الرمز' : 'إظهار الرمز'}
                  >
                    {showMetaToken ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  رمز الوصول الطويل المستخرج من إعدادات Conversions API لتخويل الخادم بإرسال أحداث المبيعات.
                </p>
              </div>

              {/* Test Event Code Input */}
              <div className="space-y-1.5">
                <Label htmlFor="test-event-code" className="text-xs font-semibold">
                  رمز اختبار الأحداث (Test Event Code — اختياري):
                </Label>
                <Input
                  id="test-event-code"
                  type="text"
                  dir="ltr"
                  placeholder="مثال: TEST12345"
                  value={metaTestEventCode}
                  onChange={(e) => setMetaTestEventCode(e.target.value)}
                  className="font-mono text-xs"
                />
                <p className="text-[11px] text-muted-foreground">
                  يُستخدم لفحص وصول الأحداث مباشرة في تبويب Test Events بلوحة Meta دون تسجيلها كمبيعات حقيقية.
                </p>
              </div>

              {/* SHA-256 Deduplication Status Card */}
              <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold flex items-center gap-1.5">
                    <ShieldCheck className="size-4 text-emerald-600" />
                    <span>حالة إلغاء الازدواجية والحماية البرمجية (Deduplication Ledger)</span>
                  </h4>
                  <Badge variant="outline" className="text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 text-[10px]">
                    100% متوافق
                  </Badge>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-[11px]">
                  <div className="p-2.5 rounded-lg border bg-background space-y-1">
                    <span className="text-muted-foreground block">مفتاح الدمج (Shared Event ID):</span>
                    <span className="font-mono font-semibold text-foreground">رقم الطلب (ORV-YYMMDD-XXX)</span>
                  </div>
                  <div className="p-2.5 rounded-lg border bg-background space-y-1">
                    <span className="text-muted-foreground block">تشفير هاتف العميل (PII):</span>
                    <span className="font-mono font-semibold text-foreground">SHA-256 (64-hex lowercase)</span>
                  </div>
                  <div className="p-2.5 rounded-lg border bg-background space-y-1">
                    <span className="text-muted-foreground block">العملة المعتمدة للتحويل:</span>
                    <span className="font-mono font-semibold text-foreground">DZD (الدينار الجزائري)</span>
                  </div>
                </div>
              </div>
            </CardContent>

            <CardFooter className="border-t pt-4 flex justify-between items-center">
              <span className="text-[11px] text-muted-foreground">
                يتم تطبيق التغييرات فورياً على نماذج الشراء وصفحات الهبوط.
              </span>
              <Button size="sm" onClick={handleSaveChanges} disabled={saving} className="text-xs gap-1.5">
                {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                <span>حفظ إعدادات Meta</span>
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        {/* ══════════════════════════════════════════════════════════════════════
            TAB 2: Telegram Bot Instant Alerts
        ══════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="telegram" className="space-y-4 pt-3">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    <MessageSquare className="size-4 text-sky-500" />
                    إشعارات تليجرام الفورية للطلبيات (Instant Order Alerts)
                  </CardTitle>
                  <CardDescription className="text-xs">
                    استلم إشعاراً فورياً على هاتفك أو قناة فريق التوصيل لحظة تأكيد أي زبون لطلبية جديدة.
                  </CardDescription>
                </div>

                <div className="flex items-center gap-2">
                  <Switch
                    id="tg-global-toggle"
                    checked={telegramAlertsEnabled}
                    onCheckedChange={setTelegramAlertsEnabled}
                  />
                  <Label htmlFor="tg-global-toggle" className="text-xs font-semibold cursor-pointer">
                    {telegramAlertsEnabled ? 'الإشعارات مفعلة' : 'الإشعارات معطلة'}
                  </Label>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* BotFather Token */}
                <div className="space-y-1.5">
                  <Label htmlFor="tg-token-input" className="text-xs font-semibold flex items-center gap-1.5">
                    <span>رمز بوت تليجرام (BotFather Token)</span>
                    <span className="text-destructive">*</span>
                  </Label>
                  <div className="relative">
                    <Input
                      id="tg-token-input"
                      type={showTelegramToken ? 'text' : 'password'}
                      dir="ltr"
                      placeholder="مثال: 123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"
                      value={telegramBotToken}
                      onChange={(e) => setTelegramBotToken(e.target.value)}
                      className="font-mono text-xs pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowTelegramToken(!showTelegramToken)}
                      className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground p-0.5 rounded cursor-pointer"
                    >
                      {showTelegramToken ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    الرمز الصادر من @BotFather عند إنشاء البوت.
                  </p>
                </div>

                {/* Chat / Channel ID */}
                <div className="space-y-1.5">
                  <Label htmlFor="tg-chat-input" className="text-xs font-semibold flex items-center gap-1.5">
                    <span>معرف المحادثة أو القناة (Chat / Channel ID)</span>
                    <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="tg-chat-input"
                    type="text"
                    dir="ltr"
                    placeholder="مثال: -1001234567890 أو 987654321"
                    value={telegramChatId}
                    onChange={(e) => setTelegramChatId(e.target.value)}
                    className="font-mono text-xs"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    المعرف الرقمي للمحادثة أو القناة (يمكن الحصول عليه عبر @userinfobot).
                  </p>
                </div>
              </div>

              {/* Action: Send Test Alert */}
              <div className="flex items-center gap-3 pt-1">
                <Button
                  onClick={handleTestTelegram}
                  disabled={telegramTesting || !telegramBotToken.trim() || !telegramChatId.trim()}
                  variant="outline"
                  size="sm"
                  className="gap-2 text-xs border-sky-300 text-sky-700 hover:bg-sky-50 dark:hover:bg-sky-950/40"
                >
                  {telegramTesting ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                  <span>إرسال إشعار تجريبي (Send Test Alert)</span>
                </Button>
                <span className="text-[11px] text-muted-foreground">
                  يفحص الاتصال الفعلي مع سيرفرات Telegram Bot API دون التأثير على سجل الطلبيات.
                </span>
              </div>

              {/* Test Result Message Banner */}
              {telegramTestResult && (
                <Alert
                  variant={telegramTestResult.success ? 'default' : 'destructive'}
                  className={telegramTestResult.success ? 'border-sky-300 bg-sky-50/50 text-sky-900 dark:bg-sky-950/30 dark:text-sky-300' : ''}
                >
                  {telegramTestResult.success ? <CheckCircle2 className="size-4 text-sky-600" /> : <AlertCircle className="size-4" />}
                  <AlertTitle className="text-xs font-bold">
                    {telegramTestResult.success ? 'نجاح إرسال إشعار التجربة' : 'فشل الاتصال بالبوت'}
                  </AlertTitle>
                  <AlertDescription className="text-xs mt-1">
                    {telegramTestResult.message}
                  </AlertDescription>
                </Alert>
              )}

              {/* Live Alert Preview Template Card */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold flex items-center gap-1.5">
                    <Sparkles className="size-3.5 text-amber-500" />
                    <span>معاينة حية لرسالة الإشعار التلقائية (Live Telegram Alert Preview)</span>
                  </Label>
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">
                    حجب رقم الهاتف (PII Masking) مفعل تلقائياً
                  </Badge>
                </div>

                <div className="rounded-xl border bg-slate-900 text-slate-100 p-4 font-sans text-xs leading-relaxed max-w-lg shadow-inner space-y-1.5">
                  <div className="font-bold text-sky-400 flex items-center gap-1.5">
                    <span>🔔</span>
                    <span>طلب جديد — متجر أورفا ORVA Store</span>
                  </div>
                  <div className="border-b border-slate-700/80 my-1" />
                  <div><span className="text-slate-400">📦 رقم الطلب: </span><code className="bg-slate-800 px-1 py-0.5 rounded text-amber-300">ORV-261107-777</code></div>
                  <div><span className="text-slate-400">👤 الزبون: </span><span className="font-medium text-slate-200">ياسين التواتي (Yassine Touati)</span></div>
                  <div><span className="text-slate-400">📞 الهاتف: </span><code className="bg-slate-800 px-1 py-0.5 rounded text-emerald-400">0555 •• •• 56</code></div>
                  <div><span className="text-slate-400">📍 الوجهة: </span><span>ولاية الجزائر (16) — باب الوادي</span></div>
                  <div><span className="text-slate-400">🚚 الاستلام: </span><span>توصيل لباب المنزل (Domicile)</span></div>
                  <div><span className="text-slate-400">🛠️ المنتج: </span><span>باك كومبريسار و المفاتيح 4 في 1</span></div>
                  <div><span className="text-slate-400">💰 المبلغ الصافي: </span><strong className="text-amber-400 font-bold text-sm">5,450 د.ج</strong></div>
                  <div className="border-b border-slate-700/80 my-1" />
                  <div className="text-[10px] text-slate-400 italic">
                    📞 يرجى الاتصال بالزبون فوراً لتأكيد العنوان وموعد التسليم.
                  </div>
                </div>
              </div>
            </CardContent>

            <CardFooter className="border-t pt-4 flex justify-between items-center">
              <span className="text-[11px] text-muted-foreground">
                يتم حفظ الرموز بأمان مشفر داخل إعدادات المتجر السحابية.
              </span>
              <Button size="sm" onClick={handleSaveChanges} disabled={saving} className="text-xs gap-1.5">
                {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                <span>حفظ إعدادات تليجرام</span>
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        {/* ══════════════════════════════════════════════════════════════════════
            TAB 3: Courier Delivery Logistics (Yalidine & ZR Express)
        ══════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="couriers" className="space-y-4 pt-3">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    <Truck className="size-4 text-amber-500" />
                    لوجستيات شركات التوصيل المعتمدة (Yalidine & ZR Express)
                  </CardTitle>
                  <CardDescription className="text-xs">
                    توليد بوالص الشحن التلقائية، تتبع الطرود، وتبديل المزود النشط بنقرة زر واحدة.
                  </CardDescription>
                </div>

                <div className="flex items-center gap-1.5 bg-muted px-2.5 py-1 rounded-md text-xs font-semibold">
                  <span className="text-muted-foreground">الناقل النشط حالياً:</span>
                  <Badge variant="default" className="text-[10px]">
                    {activeCourier === 'yalidine' ? 'Yalidine Express' : activeCourier === 'zr_express' ? 'ZR Express' : 'Mock Offline'}
                  </Badge>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-6">
              {/* Active Courier Selection Cards */}
              <div className="space-y-2">
                <Label className="text-xs font-bold">اختر شركة التوصيل الافتراضية للطلبيات:</Label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Yalidine Option */}
                  <div
                    onClick={() => setActiveCourier('yalidine')}
                    className={`cursor-pointer rounded-xl border p-4 space-y-2 transition-all ${
                      activeCourier === 'yalidine'
                        ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20 shadow-xs'
                        : 'hover:border-border hover:bg-muted/40'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs">ياليدين إكسبريس (Yalidine)</span>
                      <Badge variant={activeCourier === 'yalidine' ? 'default' : 'outline'} className="text-[10px]">
                        {activeCourier === 'yalidine' ? 'الناقل الفعّال' : 'تحديد كافتراضي'}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      أكبر شبكة توصيل في الجزائر، دعم كامل لمراكز الاستلام (Stop Desk) وباب المنزل (Domicile).
                    </p>
                    <div className="text-[10px] font-mono text-blue-600 dark:text-blue-400">
                      بادئة التتبع: yal-[wilaya]-...
                    </div>
                  </div>

                  {/* ZR Express Option */}
                  <div
                    onClick={() => setActiveCourier('zr_express')}
                    className={`cursor-pointer rounded-xl border p-4 space-y-2 transition-all ${
                      activeCourier === 'zr_express'
                        ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/20 shadow-xs'
                        : 'hover:border-border hover:bg-muted/40'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs">زد آر إكسبريس (ZR Express)</span>
                      <Badge variant={activeCourier === 'zr_express' ? 'default' : 'outline'} className="text-[10px]">
                        {activeCourier === 'zr_express' ? 'الناقل الفعّال' : 'تحديد كافتراضي'}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      منظومة بروكوليس للشحن السريع عبر الولايات مع تسوية مالية فورية للمدفوعات النقدية.
                    </p>
                    <div className="text-[10px] font-mono text-amber-600 dark:text-amber-400">
                      بادئة التتبع: ZR...DZ
                    </div>
                  </div>

                  {/* Mock Provider Option */}
                  <div
                    onClick={() => setActiveCourier('mock')}
                    className={`cursor-pointer rounded-xl border p-4 space-y-2 transition-all ${
                      activeCourier === 'mock'
                        ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 shadow-xs'
                        : 'hover:border-border hover:bg-muted/40'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs">المحاكي الآمن (Mock Offline)</span>
                      <Badge variant={activeCourier === 'mock' ? 'default' : 'outline'} className="text-[10px]">
                        {activeCourier === 'mock' ? 'الناقل الفعّال' : 'تحديد كافتراضي'}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      وضع المحاكاة للتطوير والتجارب بدون استهلاك رصيد شحنات حقيقي أو إنشاء بوالص فعلية.
                    </p>
                    <div className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400">
                      بادئة التتبع: MCK-[wilaya]-...
                    </div>
                  </div>
                </div>
              </div>

              {/* Connection Status Badge Banner if checked */}
              {courierConnectionStatus && (
                <Alert
                  variant={courierConnectionStatus.success ? 'default' : 'destructive'}
                  className={courierConnectionStatus.success ? 'border-emerald-400 bg-emerald-50/50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300' : ''}
                >
                  {courierConnectionStatus.success ? <CheckCircle2 className="size-4 text-emerald-600" /> : <AlertCircle className="size-4" />}
                  <AlertTitle className="text-xs font-bold flex items-center justify-between">
                    <span>نتيجة فحص الاتصال بالناقل ({courierConnectionStatus.providerId.toUpperCase()})</span>
                    {courierConnectionStatus.latencyMs && (
                      <span className="text-[10px] font-mono font-normal">زمن الاستجابة: {courierConnectionStatus.latencyMs}ms</span>
                    )}
                  </AlertTitle>
                  <AlertDescription className="text-xs mt-1">
                    {courierConnectionStatus.message}
                  </AlertDescription>
                </Alert>
              )}

              {/* Provider 1: Yalidine Express Credentials */}
              <div className="rounded-xl border p-4 space-y-4 bg-muted/10">
                <div className="flex items-center justify-between border-b pb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs">بيانات اعتماد ياليدين (Yalidine Express Credentials)</span>
                    <Badge variant="outline" className="text-[10px]">api.yalidine.app</Badge>
                  </div>

                  <Button
                    onClick={() => handleTestCourier('yalidine')}
                    disabled={courierTesting}
                    variant="outline"
                    size="sm"
                    className="text-xs h-8 gap-1.5"
                  >
                    {courierTesting ? <Loader2 className="size-3 animate-spin" /> : <Zap className="size-3 text-blue-600" />}
                    <span>فحص اتصال Yalidine</span>
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="yalidine-id" className="text-xs font-semibold">
                      معرف الحساب (Yalidine API ID):
                    </Label>
                    <Input
                      id="yalidine-id"
                      type="text"
                      dir="ltr"
                      placeholder="مثال: yal-acc-102938"
                      value={yalidineApiId}
                      onChange={(e) => setYalidineApiId(e.target.value)}
                      className="font-mono text-xs"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="yalidine-token" className="text-xs font-semibold">
                        رمز المصادقة (Yalidine API Token):
                      </Label>
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Lock className="size-2.5 text-emerald-600" />
                        <span>محمي</span>
                      </span>
                    </div>
                    <div className="relative">
                      <Input
                        id="yalidine-token"
                        type={showYalidineToken ? 'text' : 'password'}
                        dir="ltr"
                        placeholder="أدخل رمز Yalidine السري"
                        value={yalidineApiToken}
                        onChange={(e) => setYalidineApiToken(e.target.value)}
                        className="font-mono text-xs pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowYalidineToken(!showYalidineToken)}
                        className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground p-0.5 rounded cursor-pointer"
                      >
                        {showYalidineToken ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs pt-1">
                  <span className="font-semibold text-muted-foreground">التفضيل الافتراضي للاستلام:</span>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="yal-delivery-type"
                      checked={yalidineDeliveryType === 'DOMICILE'}
                      onChange={() => setYalidineDeliveryType('DOMICILE')}
                    />
                    <span>توصيل للمنزل (Domicile)</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="yal-delivery-type"
                      checked={yalidineDeliveryType === 'STOP_DESK'}
                      onChange={() => setYalidineDeliveryType('STOP_DESK')}
                    />
                    <span>مكتب الاستلام (Stop-Desk)</span>
                  </label>
                </div>
              </div>

              {/* Provider 2: ZR Express Credentials */}
              <div className="rounded-xl border p-4 space-y-4 bg-muted/10">
                <div className="flex items-center justify-between border-b pb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs">بيانات اعتماد زد آر إكسبريس (ZR Express / Procolis)</span>
                    <Badge variant="outline" className="text-[10px]">procolis.com/api</Badge>
                  </div>

                  <Button
                    onClick={() => handleTestCourier('zr_express')}
                    disabled={courierTesting}
                    variant="outline"
                    size="sm"
                    className="text-xs h-8 gap-1.5"
                  >
                    {courierTesting ? <Loader2 className="size-3 animate-spin" /> : <Zap className="size-3 text-amber-500" />}
                    <span>فحص اتصال ZR Express</span>
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="zr-key" className="text-xs font-semibold">
                      مفتاح الواجهة (ZR Express API Key):
                    </Label>
                    <Input
                      id="zr-key"
                      type="text"
                      dir="ltr"
                      placeholder="مثال: zr-key-prod-..."
                      value={zrApiKey}
                      onChange={(e) => setZrApiKey(e.target.value)}
                      className="font-mono text-xs"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="zr-secret" className="text-xs font-semibold">
                        الرمز السري (ZR Express API Secret / Token):
                      </Label>
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Lock className="size-2.5 text-emerald-600" />
                        <span>محمي</span>
                      </span>
                    </div>
                    <div className="relative">
                      <Input
                        id="zr-secret"
                        type={showZrSecret ? 'text' : 'password'}
                        dir="ltr"
                        placeholder="أدخل رمز ZR Express السري"
                        value={zrApiSecret}
                        onChange={(e) => setZrApiSecret(e.target.value)}
                        className="font-mono text-xs pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowZrSecret(!showZrSecret)}
                        className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground p-0.5 rounded cursor-pointer"
                      >
                        {showZrSecret ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Provider 3: Mock Provider Test */}
              <div className="rounded-xl border p-4 flex flex-wrap items-center justify-between gap-3 bg-muted/10">
                <div className="space-y-0.5">
                  <span className="font-bold text-xs">المزود التجريبي المحلي (Mock Courier Provider)</span>
                  <p className="text-[11px] text-muted-foreground">
                    فحص استجابة محاكي التوصيل للتحقق من سلامة دورة حياة الطلبيات قبل التبديل للشركات الحقيقية.
                  </p>
                </div>

                <Button
                  onClick={() => handleTestCourier('mock')}
                  disabled={courierTesting}
                  variant="outline"
                  size="sm"
                  className="text-xs h-8 gap-1.5"
                >
                  <RefreshCw className="size-3 text-emerald-600" />
                  <span>فحص اتصال المحاكي</span>
                </Button>
              </div>
            </CardContent>

            <CardFooter className="border-t pt-4 flex justify-between items-center">
              <span className="text-[11px] text-muted-foreground">
                يتم حفظ إعدادات الناقل في جدول courier_configurations وجدول site_settings في Supabase.
              </span>
              <Button size="sm" onClick={handleSaveChanges} disabled={saving} className="text-xs gap-1.5">
                {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                <span>حفظ إعدادات الشحن</span>
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
