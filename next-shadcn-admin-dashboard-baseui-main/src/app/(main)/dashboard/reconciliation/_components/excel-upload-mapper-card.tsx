"use client";

import * as React from "react";

import {
  AlertTriangle,
  CheckCircle2,
  DownloadCloud,
  FileSpreadsheet,
  Loader2,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

interface CourierOption {
  id: string;
  name: string;
  nameAr: string;
  isExternalExcelOnly?: boolean;
}

interface CatalogPreset {
  id: string;
  name: string;
  nameAr: string;
}

export interface StagedUploadFile {
  id: string;
  file: File;
  courierId: string;
  courierName: string;
  customCourierName: string;
}

interface ExcelUploadMapperCardProps {
  couriers: CourierOption[];
  catalog: CatalogPreset[];
  isRunning: boolean;
  freshnessAlerts: Array<{
    courierId: string;
    courierName: string;
    autoRegistered: boolean;
    totalRows: number;
    freshness?: {
      freshnessStatus: string;
      notificationMessage: string;
    };
  }>;
  onRunExcelReconciliation: (files: StagedUploadFile[], includeStoreOnly: boolean) => Promise<void>;
  onRunApiReconciliation: (courierIds: string[], includeStoreOnly: boolean) => Promise<void>;
}

export function ExcelUploadMapperCard({
  couriers,
  catalog,
  isRunning,
  freshnessAlerts,
  onRunExcelReconciliation,
  onRunApiReconciliation,
}: ExcelUploadMapperCardProps) {
  const [stagedFiles, setStagedFiles] = React.useState<StagedUploadFile[]>([]);
  const [includeStoreOnly, setIncludeStoreOnly] = React.useState(true);
  const [selectedApiCourierId, setSelectedApiCourierId] = React.useState("redex");

  const combinedOptions = React.useMemo(() => {
    const map = new Map<string, { id: string; label: string }>();
    for (const c of couriers) {
      map.set(c.id, { id: c.id, label: c.nameAr || c.name });
    }
    for (const p of catalog) {
      if (!map.has(p.id)) {
        map.set(p.id, { id: p.id, label: p.nameAr || p.name });
      }
    }
    return Array.from(map.values());
  }, [couriers, catalog]);

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    setStagedFiles((prev) => [
      ...prev,
      ...files.map((file, idx) => {
        const lower = file.name.toLowerCase();
        const inferred = combinedOptions.find((opt) => lower.includes(opt.id)) ??
          combinedOptions[0] ?? { id: "redex", label: "Redex Express" };

        return {
          id: `${Date.now()}-${idx}-${file.name}`,
          file,
          courierId: inferred.id,
          courierName: inferred.label,
          customCourierName: "",
        };
      }),
    ]);
    e.target.value = "";
  };

  const updateStagedCourier = (rowId: string, courierId: string) => {
    const opt = combinedOptions.find((o) => o.id === courierId);
    setStagedFiles((prev) =>
      prev.map((item) =>
        item.id === rowId
          ? {
              ...item,
              courierId,
              courierName: courierId === "__new__" ? item.customCourierName || "شركة جديدة" : opt?.label || courierId,
            }
          : item,
      ),
    );
  };

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <FileSpreadsheet className="size-4 text-primary" />
              رفع ومقارنة ملفات Excel أو السحب عبر API Token
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              ارفع ملفاً واحداً أو عدة ملفات من شركات توصيل مختلفة دفعة واحدة (حتى غير المسجلة بالمتجر)، وسيُربط كل ملف
              بشركته ويُسجّل النظام الشركة الجديدة تلقائياً ثم يفرز كل الطلبيات والتكرارات عبر الشركات.
            </CardDescription>
          </div>
          <label className="flex items-center gap-2 text-xs border rounded-lg px-2.5 py-1.5 cursor-pointer bg-muted/20">
            <Switch checked={includeStoreOnly} onCheckedChange={setIncludeStoreOnly} />
            <span>شمول طلبيات المتجر غير المرفوعة للمقارنة</span>
          </label>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 text-xs">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Excel Multi-File Dropzone */}
          <div className="rounded-xl border border-dashed border-primary/40 bg-primary/5 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Label className="font-bold text-xs flex items-center gap-1.5">
                <Upload className="size-4 text-primary" />
                إرفاق ملفات Excel / CSV لشركات التوصيل
              </Label>
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-semibold text-xs cursor-pointer hover:opacity-90">
                <Plus className="size-3.5" />
                <span>اختيار ملفات (.xlsx, .xls, .csv)</span>
                <input type="file" multiple accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFilePick} />
              </label>
            </div>

            {stagedFiles.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                لم يتم اختيار أي ملف بعد. يمكنك اختيار أكثر من ملف لشركات متعددة (مثلاً ملف Redex + ملف Yalidine) لاكتشاف
                الطلبيات المتكررة بينهما تلقائياً.
              </p>
            ) : (
              <div className="space-y-2">
                {stagedFiles.map((item) => (
                  <div key={item.id} className="rounded-lg border bg-background p-2.5 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-semibold truncate">{item.file.name}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className="text-[10px]">
                          {(item.file.size / 1024).toFixed(1)} KB
                        </Badge>
                        <Button
                          type="button"
                          size="icon-xs"
                          variant="ghost"
                          onClick={() => setStagedFiles((prev) => prev.filter((x) => x.id !== item.id))}
                        >
                          <Trash2 className="size-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <Select
                        value={item.courierId}
                        onValueChange={(val) => {
                          if (!val) return;
                          updateStagedCourier(item.id, val);
                        }}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="حدد شركة التوصيل..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__new__">+ تسجيل شركة توصيل جديدة من هذا الملف</SelectItem>
                          {combinedOptions.map((opt) => (
                            <SelectItem key={opt.id} value={opt.id}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {item.courierId === "__new__" && (
                        <Input
                          value={item.customCourierName}
                          onChange={(e) => {
                            const name = e.target.value;
                            setStagedFiles((prev) =>
                              prev.map((x) =>
                                x.id === item.id ? { ...x, customCourierName: name, courierName: name } : x,
                              ),
                            );
                          }}
                          placeholder="اكتب اسم شركة التوصيل الجديدة..."
                          className="h-8 text-xs"
                        />
                      )}
                    </div>
                  </div>
                ))}

                <Button
                  size="sm"
                  className="w-full gap-1.5 font-bold"
                  disabled={isRunning || stagedFiles.length === 0}
                  onClick={() => void onRunExcelReconciliation(stagedFiles, includeStoreOnly)}
                >
                  {isRunning ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                  تشغيل الفرز والمطابقة الشاملة ({stagedFiles.length} ملف)
                </Button>
              </div>
            )}
          </div>

          {/* Direct Live API Pull */}
          <div className="rounded-xl border bg-muted/20 p-4 space-y-3 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="font-bold text-xs flex items-center gap-1.5">
                <DownloadCloud className="size-4 text-primary" />
                المطابقة المباشرة عبر API Token (بدون ملف Excel)
              </div>
              <p className="text-[11px] text-muted-foreground">
                يسحب الطلبيات مباشرة عبر API Token للشركة المحددة (أو الكل) ويقارنها فوراً بقاعدة بيانات المتجر ويلتقط أي
                طرد مرتجع يحمل معرّفات ORVA.
              </p>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Select
                  value={selectedApiCourierId}
                  onValueChange={(val) => {
                    if (val) setSelectedApiCourierId(val);
                  }}
                >
                  <SelectTrigger className="h-8 w-56 text-xs bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {couriers
                      .filter((c) => !c.isExternalExcelOnly)
                      .map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nameAr || c.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>

                <Button
                  size="sm"
                  variant="outline"
                  disabled={isRunning}
                  onClick={() => void onRunApiReconciliation([selectedApiCourierId], includeStoreOnly)}
                >
                  {isRunning ? (
                    <Loader2 className="size-3.5 me-1 animate-spin" />
                  ) : (
                    <DownloadCloud className="size-3.5 me-1" />
                  )}
                  سحب ومطابقة عبر API
                </Button>
              </div>
            </div>

            {freshnessAlerts.length > 0 && (
              <div className="space-y-1.5 pt-2 border-t">
                {freshnessAlerts.map((c, idx) => (
                  <Alert
                    key={`${c.courierId}-${idx}`}
                    variant={
                      c.freshness?.freshnessStatus === "stale_warning" || c.freshness?.freshnessStatus === "duplicate"
                        ? "destructive"
                        : "default"
                    }
                    className="py-2"
                  >
                    <AlertTriangle className="size-3.5" />
                    <AlertTitle className="text-[11px] font-bold flex flex-wrap items-center gap-1.5">
                      <span>{c.courierName}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {c.totalRows} صف
                      </Badge>
                      {c.autoRegistered && (
                        <Badge className="text-[10px] bg-emerald-600 text-white">تم تسجيل الشركة تلقائياً بالنظام</Badge>
                      )}
                    </AlertTitle>
                    {c.freshness && (
                      <AlertDescription className="text-[11px] mt-0.5">
                        {c.freshness.notificationMessage}
                      </AlertDescription>
                    )}
                  </Alert>
                ))}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
