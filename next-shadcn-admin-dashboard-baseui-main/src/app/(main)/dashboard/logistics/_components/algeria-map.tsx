"use strict";
"use client";

import * as React from "react";
import { geoMercator, geoPath } from "d3-geo";
import {
  ArrowLeftRight,
  Compass,
  CornerUpLeft,
  Info,
  MapPin,
  Maximize2,
  Minus,
  Navigation,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Truck,
  User,
  Warehouse,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ALGERIA_SHIPPING_TARIFFS } from "@/data/algeria-locations";
import {
  BISKRA_ORIGIN_HUB,
  calculateGeodesicDistance,
  computeBoundingBoxForPoints,
  extractSwitchedOrderDetails,
  extractWilayaCode,
  getCommunesByWilayaCode,
  SwitchedOrderRouteInfo,
  WILAYA_POINTS_MAP,
  wilayaBoundariesData,
} from "@/data/geoalgeria/geo-helper";

interface OrderItem {
  id: string;
  customer: string;
  phone: string;
  wilaya: string;
  commune: string;
  status: string;
  total: string;
  shippingFee?: string;
  in_redex?: boolean;
  redex_tracking_code?: string;
  isSwitched?: boolean;
  remarks?: any;
}

export interface WilayaDemandMetricItem {
  wilayaCode: number;
  metricValue: number;
  formattedValue: string;
  totalOrders: number;
  deliveredOrders: number;
  returnedOrders: number;
  regionalConversionRate?: number | null;
  knownViewSessions?: number;
}

export interface AlgeriaMapProps {
  orders: OrderItem[];
  selectedWilayaCode: number | null;
  onSelectWilaya: (code: number | null) => void;
  selectedOrder?: OrderItem | null;
  onSelectOrder?: (order: OrderItem) => void;
  demandMetrics?: Map<number, WilayaDemandMetricItem>;
  activeMetricTitle?: string;
  maxMetricValue?: number;
  onSelectWilayaDemand?: (record: WilayaDemandMetricItem) => void;
}

interface PinPopupInfo {
  type: "origin" | "previous" | "current" | "wilaya";
  title: string;
  badge: string;
  wilaya: string;
  commune?: string;
  customer?: string;
  phone?: string;
  status?: string;
  orderId?: string;
  conversionSeq?: number;
  reason?: string;
  distanceKm?: number;
  coordinates: [number, number];
  screenPos: [number, number];
}

function activateSvgElementOnKeyboard(event: React.KeyboardEvent<SVGElement>) {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  event.currentTarget.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

export function AlgeriaMap({
  orders,
  selectedWilayaCode,
  onSelectWilaya,
  selectedOrder,
  onSelectOrder,
  demandMetrics,
  activeMetricTitle,
  maxMetricValue,
  onSelectWilayaDemand,
}: AlgeriaMapProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = React.useState({ width: 850, height: 600 });
  const [hoveredWilaya, setHoveredWilaya] = React.useState<number | null>(null);
  const [searchQuery, setSearchQuery] = React.useState("");

  // Zoom & Pan state
  const [transform, setTransform] = React.useState({ x: 0, y: 0, k: 1 });
  const [isDragging, setIsDragging] = React.useState(false);
  const dragStartRef = React.useRef({ x: 0, y: 0 });
  const dragDistRef = React.useRef(0);

  // Selected Pin Popup
  const [activePinPopup, setActivePinPopup] = React.useState<PinPopupInfo | null>(null);

  // 1. ResizeObserver: Dynamic container measurement
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 200 && height > 200) {
          setDimensions({
            width: Math.round(width),
            height: Math.round(height),
          });
        }
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // 2. Mouse Wheel Zoom (Non-passive listener to prevent page scrolling while zooming)
  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;

      setTransform((prev) => {
        const nextK = Math.max(0.75, Math.min(6.0, Number((prev.k * zoomFactor).toFixed(3))));
        const nextX = mouseX - (mouseX - prev.x) * (nextK / prev.k);
        const nextY = mouseY - (mouseY - prev.y) * (nextK / prev.k);
        return { x: nextX, y: nextY, k: nextK };
      });
    };

    container.addEventListener("wheel", onWheel, { passive: false });
    return () => container.removeEventListener("wheel", onWheel);
  }, []);

  // 3. Dynamic Projection via d3-geo adapting to live container dimensions
  const { pathGenerator, projection } = React.useMemo(() => {
    const w = Math.max(300, dimensions.width);
    const h = Math.max(300, dimensions.height);
    const proj = geoMercator().fitExtent(
      [
        [30, 30],
        [w - 30, h - 30],
      ],
      wilayaBoundariesData as any
    );
    const pathGen = geoPath().projection(proj);
    return { pathGenerator: pathGen, projection: proj };
  }, [dimensions.width, dimensions.height]);

  // 4. Compute order aggregation by wilaya code
  const wilayaStats = React.useMemo(() => {
    const map = new Map<
      number,
      {
        total: number;
        confirmed: number;
        shipped: number;
        delivered: number;
        returned: number;
        pending: number;
        orders: OrderItem[];
      }
    >();

    orders.forEach((o) => {
      const code = extractWilayaCode(o.wilaya);
      if (!code) return;

      if (!map.has(code)) {
        map.set(code, {
          total: 0,
          confirmed: 0,
          shipped: 0,
          delivered: 0,
          returned: 0,
          pending: 0,
          orders: [],
        });
      }

      const st = map.get(code)!;
      st.total++;
      st.orders.push(o);

      const s = (o.status || "").toLowerCase();
      if (s === "delivered") st.delivered++;
      else if (s === "shipped" || o.in_redex) st.shipped++;
      else if (s === "confirmed") st.confirmed++;
      else if (s === "returned") st.returned++;
      else st.pending++;
    });

    return map;
  }, [orders]);

  // 5. Projected coordinates for Biskra Hub (07)
  const biskraCoords = BISKRA_ORIGIN_HUB.coordinates;
  const biskraPoint = React.useMemo<[number, number]>(() => {
    const projected = projection(biskraCoords);
    return projected ? [projected[0], projected[1]] : [dimensions.width * 0.6, dimensions.height * 0.2];
  }, [projection, dimensions]);

  // 6. Active target wilaya code
  const activeWilayaCode = React.useMemo(() => {
    if (selectedOrder) {
      const c = extractWilayaCode(selectedOrder.wilaya);
      if (c) return c;
    }
    return selectedWilayaCode;
  }, [selectedOrder, selectedWilayaCode]);

  // 7. Extract Switched-Order 3-Point Details (Origin, Previous Dest, New Dest)
  const switchedRoute = React.useMemo<SwitchedOrderRouteInfo | null>(() => {
    if (!selectedOrder) return null;
    return extractSwitchedOrderDetails(selectedOrder);
  }, [selectedOrder]);

  // 8. Standard single destination route (when order is not switched, or wilaya selected)
  const standardRoute = React.useMemo(() => {
    if (switchedRoute) return null; // Switched order takes precedence
    if (!activeWilayaCode || activeWilayaCode === BISKRA_ORIGIN_HUB.code) return null;

    const targetPointInfo = WILAYA_POINTS_MAP.get(activeWilayaCode);
    if (!targetPointInfo) return null;

    const destCoords = targetPointInfo.coordinates;
    const projectedDestination = projection(destCoords);
    if (!projectedDestination) return null;
    const destPoint: [number, number] = [projectedDestination[0], projectedDestination[1]];

    const [x1, y1] = biskraPoint;
    const [x2, y2] = destPoint;
    const distanceKm = calculateGeodesicDistance(biskraCoords, destCoords);

    // Quadratic curve control point
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const curveOffset = Math.min(80, Math.sqrt(dx * dx + dy * dy) * 0.25);
    const ctrlX = midX - (dy / (Math.abs(dy) + 1)) * curveOffset;
    const ctrlY = midY - curveOffset;

    const pathD = `M ${x1} ${y1} Q ${ctrlX} ${ctrlY} ${x2} ${y2}`;

    return {
      destPoint,
      distanceKm,
      pathD,
      targetPointInfo,
    };
  }, [switchedRoute, activeWilayaCode, biskraPoint, projection]);

  // 9. Projected Screen Points & Arcs for Switched Order
  const switchedScreenData = React.useMemo(() => {
    if (!switchedRoute) return null;

    const [hx, hy] = biskraPoint;

    // Previous Destination Screen Point
    let prevScreen: [number, number] | null = null;
    let arcHubToPrev = "";
    if (switchedRoute.previousDestination?.coordinates) {
      prevScreen = projection(switchedRoute.previousDestination.coordinates);
      if (prevScreen) {
        const [px, py] = prevScreen;
        const midX = (hx + px) / 2;
        const midY = (hy + py) / 2;
        const dx = px - hx;
        const dy = py - hy;
        const offset = Math.min(75, Math.sqrt(dx * dx + dy * dy) * 0.22);
        const cx = midX - (dy / (Math.abs(dy) + 1)) * offset;
        const cy = midY - offset;
        arcHubToPrev = `M ${hx} ${hy} Q ${cx} ${cy} ${px} ${py}`;
      }
    }

    // New Destination Screen Point
    let newScreen: [number, number] | null = null;
    let arcHubToNew = "";
    if (switchedRoute.currentDestination?.coordinates) {
      newScreen = projection(switchedRoute.currentDestination.coordinates);
      if (newScreen) {
        const [nx, ny] = newScreen;
        const midX = (hx + nx) / 2;
        const midY = (hy + ny) / 2;
        const dx = nx - hx;
        const dy = ny - hy;
        const offset = Math.min(75, Math.sqrt(dx * dx + dy * dy) * 0.22);
        const cx = midX - (dy / (Math.abs(dy) + 1)) * offset;
        const cy = midY - offset;
        arcHubToNew = `M ${hx} ${hy} Q ${cx} ${cy} ${nx} ${ny}`;
      }
    }

    // Transfer Arc between Previous and New Destination
    let arcPrevToNew = "";
    if (prevScreen && newScreen) {
      const [px, py] = prevScreen;
      const [nx, ny] = newScreen;
      const midX = (px + nx) / 2;
      const midY = (py + ny) / 2;
      const dx = nx - px;
      const dy = ny - py;
      const offset = Math.min(65, Math.sqrt(dx * dx + dy * dy) * 0.25);
      const cx = midX - (dy / (Math.abs(dy) + 1)) * offset;
      const cy = midY - offset;
      arcPrevToNew = `M ${px} ${py} Q ${cx} ${cy} ${nx} ${ny}`;
    }

    return {
      hubScreen: [hx, hy] as [number, number],
      prevScreen,
      newScreen,
      arcHubToPrev,
      arcHubToNew,
      arcPrevToNew,
    };
  }, [switchedRoute, biskraPoint, projection]);

  // 10. Auto-Fit View Effect on Selection
  React.useEffect(() => {
    if (switchedScreenData) {
      // Collect valid screen points to frame: Hub, Previous, New
      const points: Array<[number, number]> = [switchedScreenData.hubScreen];
      if (switchedScreenData.prevScreen) points.push(switchedScreenData.prevScreen);
      if (switchedScreenData.newScreen) points.push(switchedScreenData.newScreen);

      const box = computeBoundingBoxForPoints(points, dimensions.width, dimensions.height, 90);
      setTransform(box);
    } else if (standardRoute) {
      const points: Array<[number, number]> = [biskraPoint, standardRoute.destPoint];
      const box = computeBoundingBoxForPoints(points, dimensions.width, dimensions.height, 90);
      setTransform(box);
    } else if (selectedWilayaCode) {
      const p = WILAYA_POINTS_MAP.get(selectedWilayaCode);
      if (p) {
        const screenPt = projection(p.coordinates);
        if (screenPt) {
          const targetK = 2.4;
          const targetX = dimensions.width / 2 - screenPt[0] * targetK;
          const targetY = dimensions.height / 2 - screenPt[1] * targetK;
          setTransform({ x: targetX, y: targetY, k: targetK });
        }
      }
    }
  }, [switchedScreenData, standardRoute, selectedWilayaCode, dimensions, biskraPoint, projection]);

  // 11. Pointer Drag Handlers (Pan interaction)
  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return; // Only left click / single touch
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - transform.x, y: e.clientY - transform.y };
    dragDistRef.current = 0;
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const nextX = e.clientX - dragStartRef.current.x;
    const nextY = e.clientY - dragStartRef.current.y;
    const delta = Math.abs(nextX - transform.x) + Math.abs(nextY - transform.y);
    dragDistRef.current += delta;
    if (dragDistRef.current > 6) {
      const canvas = e.currentTarget as HTMLElement;
      if (!canvas.hasPointerCapture(e.pointerId)) canvas.setPointerCapture(e.pointerId);
    }
    setTransform((prev) => ({ ...prev, x: nextX, y: nextY }));
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
  };

  // 12. Manual Zoom Controls
  const handleZoomIn = () => {
    setTransform((prev) => {
      const nextK = Math.min(6.0, Number((prev.k * 1.3).toFixed(2)));
      const cx = dimensions.width / 2;
      const cy = dimensions.height / 2;
      const nextX = cx - (cx - prev.x) * (nextK / prev.k);
      const nextY = cy - (cy - prev.y) * (nextK / prev.k);
      return { x: nextX, y: nextY, k: nextK };
    });
  };

  const handleZoomOut = () => {
    setTransform((prev) => {
      const nextK = Math.max(0.75, Number((prev.k / 1.3).toFixed(2)));
      const cx = dimensions.width / 2;
      const cy = dimensions.height / 2;
      const nextX = cx - (cx - prev.x) * (nextK / prev.k);
      const nextY = cy - (cy - prev.y) * (nextK / prev.k);
      return { x: nextX, y: nextY, k: nextK };
    });
  };

  const handleResetView = () => {
    setTransform({ x: 0, y: 0, k: 1 });
    setActivePinPopup(null);
    onSelectWilaya(null);
  };

  const clearMapSelection = (event?: React.MouseEvent<SVGElement | HTMLDivElement>) => {
    if (dragDistRef.current > 6) {
      dragDistRef.current = 0;
      return;
    }
    event?.stopPropagation();
    dragDistRef.current = 0;
    setHoveredWilaya(null);
    setActivePinPopup(null);
    onSelectWilaya(null);
  };

  const handleBackgroundKeyDown = (event: React.KeyboardEvent<SVGRectElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onSelectWilaya(null);
    setActivePinPopup(null);
  };

  // 13. Hover Tooltip Data
  const hoveredInfo = React.useMemo(() => {
    if (!hoveredWilaya) return null;
    const p = WILAYA_POINTS_MAP.get(hoveredWilaya);
    const stats = wilayaStats.get(hoveredWilaya);
    const codeStr = String(hoveredWilaya).padStart(2, "0");
    const tariff = ALGERIA_SHIPPING_TARIFFS[Number(codeStr)];
    const communes = getCommunesByWilayaCode(hoveredWilaya);

    return {
      code: hoveredWilaya,
      name_ar: p?.name_ar ?? `ولاية ${hoveredWilaya}`,
      name_fr: p?.name_fr ?? "",
      totalOrders: stats?.total ?? 0,
      confirmed: stats?.confirmed ?? 0,
      shipped: stats?.shipped ?? 0,
      delivered: stats?.delivered ?? 0,
      returned: stats?.returned ?? 0,
      homeTariff: tariff?.domicile ? `${tariff.domicile} د.ج` : "غير مهيأة",
      deskTariff: tariff?.stopdesk ? `${tariff.stopdesk} د.ج` : "غير متاح",
      deliveryTime: tariff?.time ?? "24 - 48 H",
      communesCount: communes.length,
      sampleCommunes: communes.slice(0, 3).map((c) => c.commune_name_ar).join("، "),
    };
  }, [hoveredWilaya, wilayaStats]);

  // Handle Search input
  const handleSearchWilaya = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    const code = extractWilayaCode(searchQuery);
    if (code) {
      onSelectWilaya(code);
      setHoveredWilaya(code);
    }
  };

  return (
    <Card className="border-border shadow-xs overflow-hidden" dir="ltr">
      <CardHeader className="pb-3 border-b text-right">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Navigation className="size-4 text-primary" />
                <span>Algeria Delivery &amp; Shipment Map</span>
              </CardTitle>
              <Badge variant="outline" className="border-border bg-background/50 text-muted-foreground text-[11px] gap-1">
                <span>{wilayaStats.size} ولاية نشطة في بيانات الاختبار (58 ولاية مدعومة)</span>
              </Badge>
              {switchedRoute && (
                <Badge variant="outline" className="border-purple-500/50 bg-purple-500/10 text-purple-700 text-[11px] font-semibold animate-pulse flex items-center gap-1">
                  <ArrowLeftRight className="size-3" />
                  <span>تتبع طلبية محوّلة (مسار 3 نقاط)</span>
                </Badge>
              )}
            </div>
            <CardDescription className="text-xs">
              خريطة تفاعلية متجاوبة تدعم التكبير والتصغير والتحريك (Zoom & Pan)، مع تتبع مسارات التحويل ثلاثية النقاط للطلبيات المحوّلة.
            </CardDescription>
          </div>

          {/* Quick Search & Reset */}
          <div className="flex items-center gap-2 w-full md:w-auto">
            <form onSubmit={handleSearchWilaya} className="relative w-full md:w-56">
              <Search className="absolute right-2.5 top-2.5 size-3.5 text-muted-foreground" />
              <Input
                type="text"
                placeholder="ابحث بالاسم أو رقم الولاية..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-8 h-8 text-xs bg-background"
              />
            </form>

            <Button
              size="sm"
              variant="outline"
              onClick={handleResetView}
              className="h-8 gap-1 text-xs shrink-0"
              title="إعادة ضبط العرض الأصلي (Reset View)"
            >
              <RotateCcw className="size-3" />
              <span>إعادة ضبط العرض (Reset View)</span>
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0 relative bg-muted/10">
        {/* Floating Interactive Zoom & Pan Controls Toolbar */}
        <div className="absolute top-3 left-3 z-30 flex flex-col items-center bg-background/90 backdrop-blur-md border border-border/80 shadow-md rounded-lg p-1 space-y-1">
          <Button
            size="icon"
            variant="ghost"
            onClick={handleZoomIn}
            className="size-7 hover:bg-muted text-foreground"
            title="تكبير (Zoom In)"
          >
            <Plus className="size-4" />
          </Button>
          <div className="text-[10px] font-mono text-muted-foreground select-none py-0.5">
            {Math.round(transform.k * 100)}%
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={handleZoomOut}
            className="size-7 hover:bg-muted text-foreground"
            title="تصغير (Zoom Out)"
          >
            <Minus className="size-4" />
          </Button>
          <div className="w-full border-t border-border/60 my-0.5" />
          <Button
            size="icon"
            variant="ghost"
            onClick={handleResetView}
            className="size-7 hover:bg-muted text-muted-foreground hover:text-foreground"
            title="إعادة ضبط العرض (Reset View)"
          >
            <RotateCcw className="size-3.5" />
          </Button>
        </div>

        {/* Floating Route Banner for Switched Orders (3 Points Info) */}
        {switchedRoute && switchedScreenData && (
          <div className="absolute top-3 right-3 z-20 rounded-xl border border-purple-500/40 bg-background/95 backdrop-blur-md p-3 shadow-lg max-w-sm text-xs space-y-2 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center justify-between border-b pb-1.5">
              <span className="font-bold text-purple-700 dark:text-purple-400 flex items-center gap-1.5">
                <ArrowLeftRight className="size-4" />
                <span>مسار الطلبية المحوّلة (3 نقاط جغرافية)</span>
              </span>
              <Badge variant="outline" className="text-[10px] font-mono">
                تسلسل #{switchedRoute.conversionSequence}
              </Badge>
            </div>

            <div className="space-y-1.5 text-[11px]">
              {/* Point 1: Origin Hub */}
              <div className="flex items-center justify-between bg-amber-500/10 rounded p-1.5 border border-amber-500/20">
                <span className="text-amber-800 dark:text-amber-300 font-semibold flex items-center gap-1">
                  <Warehouse className="size-3" />
                  <span>1. مركز الانطلاق:</span>
                </span>
                <span className="font-bold text-amber-700 dark:text-amber-400 font-mono">
                  {switchedRoute.originHub.label}
                </span>
              </div>

              {/* Point 2: Previous Destination */}
              {switchedRoute.previousDestination && (
                <div className="flex items-center justify-between bg-orange-500/10 rounded p-1.5 border border-orange-500/20">
                  <div className="space-y-0.5">
                    <span className="text-orange-800 dark:text-orange-300 font-semibold flex items-center gap-1">
                      <CornerUpLeft className="size-3" />
                      <span>2. الوجهة السابقة (قبل التحويل):</span>
                    </span>
                    <p className="text-[10px] text-muted-foreground truncate max-w-[190px]">
                      {switchedRoute.previousDestination.recipientName ?? "مستلم سابق"} — {switchedRoute.previousDestination.wilayaName}
                    </p>
                  </div>
                  <span className="font-mono text-[10px] text-orange-700 dark:text-orange-400 shrink-0 font-bold">
                    ~{switchedRoute.distanceHubToPrevKm} كم
                  </span>
                </div>
              )}

              {/* Point 3: New Destination */}
              <div className="flex items-center justify-between bg-emerald-500/10 rounded p-1.5 border border-emerald-500/20">
                <div className="space-y-0.5">
                  <span className="text-emerald-800 dark:text-emerald-300 font-semibold flex items-center gap-1">
                    <Truck className="size-3" />
                    <span>3. الوجهة الجديدة (الحالية):</span>
                  </span>
                  <p className="text-[10px] text-muted-foreground truncate max-w-[190px]">
                    {switchedRoute.currentDestination.recipientName} — {switchedRoute.currentDestination.wilayaName} ({switchedRoute.currentDestination.communeName})
                  </p>
                </div>
                <span className="font-mono text-[10px] text-emerald-700 dark:text-emerald-400 shrink-0 font-bold">
                  ~{switchedRoute.distanceHubToNewKm} كم
                </span>
              </div>

              {/* Transition Distance */}
              <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-0.5 border-t">
                <span>المسافة بين الوجهتين (تحويل مباشر):</span>
                <span className="font-mono font-bold text-foreground">~{switchedRoute.distancePrevToNewKm} كم</span>
              </div>

              <p className="text-[9px] text-muted-foreground/80 leading-tight">
                * ملاحظة: الخطوط المعروضة هي مسارات جيوديسية تقديرية توضيحية وليست مسارات قيادة طرق حقيقية.
              </p>
            </div>
          </div>
        )}

        {/* Floating Route Banner for Normal Orders (2 Points Info) */}
        {!switchedRoute && standardRoute && (
          <div className="absolute top-3 right-3 z-20 rounded-xl border border-primary/40 bg-background/95 backdrop-blur-md p-3 shadow-md max-w-xs text-xs space-y-1.5 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center justify-between border-b pb-1">
              <span className="font-bold text-primary flex items-center gap-1">
                <Truck className="size-3.5" />
                <span>مسار الشحنة المحدد</span>
              </span>
              <button
                type="button"
                onClick={() => onSelectWilaya(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </div>

            <div className="space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">نقطة الانطلاق:</span>
                <span className="font-semibold text-amber-600 font-mono">بسكرة (07 - Biskra Hub)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">وجهة التوصيل:</span>
                <span className="font-semibold text-foreground font-mono">
                  {standardRoute.targetPointInfo.name_ar} ({String(standardRoute.targetPointInfo.code).padStart(2, "0")})
                </span>
              </div>
              <div className="flex justify-between border-t pt-1">
                <span className="text-muted-foreground">مسافة جغرافية تقديرية:</span>
                <span className="font-bold text-foreground font-mono">~{standardRoute.distanceKm} كم (مباشر)</span>
              </div>
            </div>
          </div>
        )}

        {/* Hover Tooltip Overlay for Demand Mode */}
        {hoveredInfo && demandMetrics && (
          <div className="absolute top-3 right-3 z-20 rounded-xl border bg-background/95 backdrop-blur-md p-3 shadow-md max-w-xs text-xs space-y-1.5 animate-in fade-in" dir="ltr">
            <div className="flex items-center justify-between border-b pb-1">
              <span className="font-bold text-foreground">
                {String(hoveredInfo.code).padStart(2, "0")} — {hoveredInfo.name_ar}
              </span>
              <span className="text-[10px] text-muted-foreground font-mono">{hoveredInfo.name_fr}</span>
            </div>
            {demandMetrics.has(hoveredInfo.code) ? (
              <div className="space-y-1 text-[11px]">
                <div className="flex justify-between bg-primary/10 rounded px-2 py-1 font-semibold">
                  <span className="text-primary">{activeMetricTitle || "المؤشر"}:</span>
                  <span className="font-mono text-primary font-bold">{demandMetrics.get(hoveredInfo.code)?.formattedValue}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">إجمالي الطلبات:</span>
                  <span className="font-bold font-mono">{demandMetrics.get(hoveredInfo.code)?.totalOrders} طلب</span>
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>مسلّمة: {demandMetrics.get(hoveredInfo.code)?.deliveredOrders}</span>
                  <span>مرتجعة: {demandMetrics.get(hoveredInfo.code)?.returnedOrders}</span>
                </div>
                {demandMetrics.get(hoveredInfo.code)?.regionalConversionRate !== null && demandMetrics.get(hoveredInfo.code)?.regionalConversionRate !== undefined && (
                  <div className="flex justify-between border-t pt-1 text-[10px]">
                    <span className="text-muted-foreground">التحويل الإقليمي:</span>
                    <span className="font-mono font-bold text-emerald-600">{demandMetrics.get(hoveredInfo.code)?.regionalConversionRate}%</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-[11px] text-muted-foreground py-1">
                لا توجد طلبات مسجلة لهذه الولاية في التصفية الحالية.
              </div>
            )}
          </div>
        )}

        {/* Hover Tooltip Overlay (when no order route is active and not in demand mode) */}
        {hoveredInfo && !switchedRoute && !standardRoute && !demandMetrics && (
          <div className="absolute top-3 right-3 z-20 rounded-xl border bg-background/95 backdrop-blur-md p-3 shadow-md max-w-xs text-xs space-y-1 animate-in fade-in">
            <div className="flex items-center justify-between border-b pb-1">
              <span className="font-bold text-foreground">
                {String(hoveredInfo.code).padStart(2, "0")} — {hoveredInfo.name_ar}
              </span>
              <span className="text-[10px] text-muted-foreground font-mono">{hoveredInfo.name_fr}</span>
            </div>
            <div className="space-y-0.5 text-[11px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">إجمالي الطلبيات:</span>
                <span className="font-bold font-mono text-primary">{hoveredInfo.totalOrders} طلب</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">تسعيرة التوصيل المنزلي:</span>
                <span className="font-mono text-foreground font-semibold">{hoveredInfo.homeTariff}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">تسعيرة التوصيل للمكتب:</span>
                <span className="font-mono text-foreground">{hoveredInfo.deskTariff}</span>
              </div>
              {hoveredInfo.communesCount > 0 && (
                <div className="border-t pt-1 mt-1 space-y-0.5">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-muted-foreground">البلديات المتاحة:</span>
                    <span className="font-mono font-semibold text-foreground">{hoveredInfo.communesCount} بلدية</span>
                  </div>
                  {hoveredInfo.sampleCommunes && (
                    <p className="text-[10px] text-muted-foreground truncate max-w-[220px]">
                      {hoveredInfo.sampleCommunes}...
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Interactive Pin Popover Modal */}
        {activePinPopup && (
          <div
            className="absolute z-40 bg-background/95 backdrop-blur-md border border-primary/40 rounded-xl p-3 shadow-xl max-w-xs text-xs space-y-1.5 animate-in fade-in zoom-in-95"
            style={{
              top: Math.max(10, Math.min(dimensions.height - 180, activePinPopup.screenPos[1] * transform.k + transform.y - 120)),
              left: Math.max(10, Math.min(dimensions.width - 250, activePinPopup.screenPos[0] * transform.k + transform.x - 120)),
            }}
          >
            <div className="flex items-center justify-between border-b pb-1">
              <span className="font-bold text-foreground flex items-center gap-1.5">
                <MapPin className="size-3.5 text-primary" />
                <span>{activePinPopup.title}</span>
              </span>
              <button
                type="button"
                onClick={() => setActivePinPopup(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </div>
            <div className="space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">الولاية:</span>
                <span className="font-semibold text-foreground">{activePinPopup.wilaya}</span>
              </div>
              {activePinPopup.commune && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">البلدية:</span>
                  <span className="font-medium text-foreground">{activePinPopup.commune}</span>
                </div>
              )}
              {activePinPopup.customer && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">المستلم:</span>
                  <span className="font-semibold text-foreground">{activePinPopup.customer}</span>
                </div>
              )}
              {activePinPopup.phone && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">الهاتف:</span>
                  <span className="font-mono text-foreground">{activePinPopup.phone}</span>
                </div>
              )}
              {activePinPopup.reason && (
                <div className="border-t pt-1 text-[10px] text-muted-foreground">
                  <span className="font-semibold text-foreground">سبب التحويل:</span> {activePinPopup.reason}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Responsive Canvas SVG Map Container with Mouse & Touch Pan-Zoom */}
        <div
          ref={containerRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className={`w-full h-[520px] sm:h-[620px] relative overflow-hidden select-none touch-none ${
            isDragging ? "cursor-grabbing" : "cursor-grab"
          }`}
        >
          <svg
            viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
            preserveAspectRatio="xMidYMid meet"
            className="w-full h-full"
            style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.05))" }}
          >
            <title>Algeria wilayas and order map</title>
            <defs>
              {/* Radial glow for Previous Destination */}
              <radialGradient id="prevDestGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#ea580c" stopOpacity="0.8" />
                <stop offset="60%" stopColor="#ea580c" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#ea580c" stopOpacity="0" />
              </radialGradient>

              {/* Radial glow for New Destination */}
              <radialGradient id="newDestGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.85" />
                <stop offset="60%" stopColor="#10b981" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
              </radialGradient>

              {/* Gradient for shipping route arc (Biskra -> New) */}
              <linearGradient id="routeGradientNew" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#f59e0b" />
                <stop offset="100%" stopColor="#10b981" />
              </linearGradient>

              {/* Gradient for shipping route arc (Biskra -> Prev) */}
              <linearGradient id="routeGradientPrev" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#f59e0b" />
                <stop offset="100%" stopColor="#ea580c" />
              </linearGradient>

              {/* Gradient for transfer arc (Prev -> New) */}
              <linearGradient id="routeGradientTransfer" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ea580c" />
                <stop offset="100%" stopColor="#9333ea" />
              </linearGradient>
            </defs>

            {/* 0. Canvas Background Layer */}
            {/* biome-ignore lint/a11y/useSemanticElements: The SVG background rect is the full-canvas hit target for clearing the map filter. */}
            <rect
              width={dimensions.width}
              height={dimensions.height}
              rx={12}
              fill="#f8fafc"
              className="dark:fill-slate-900/90 transition-colors"
              role="button"
              tabIndex={0}
              aria-label="Clear selected Wilaya filter"
              onClick={clearMapSelection}
              onKeyDown={handleBackgroundKeyDown}
            />

            {/* Transform Container Group for Zoom and Pan */}
            <g
              transform={`translate(${transform.x}, ${transform.y}) scale(${transform.k})`}
              style={{
                transition: isDragging ? "none" : "transform 0.28s cubic-bezier(0, 0, 0.2, 1)",
              }}
            >
              {/* Layer 1: Base Wilaya Polygons */}
              <g className="wilayas-group">
                {(wilayaBoundariesData.features as any[]).map((feature, idx) => {
                  const code = Number(feature.properties?.code);
                  if (!Number.isInteger(code)) return null;
                  const pathStr = pathGenerator(feature);
                  if (!pathStr) return null;

                  const hasOrders = (wilayaStats.get(code)?.total ?? 0) > 0;
                  const orderCount = wilayaStats.get(code)?.total ?? 0;
                  const isSelected = activeWilayaCode === code;
                  const isHovered = hoveredWilaya === code;
                  const isBiskraHub = code === BISKRA_ORIGIN_HUB.code;

                  // Explicit, guaranteed colors for both light and dark mode
                  let defaultFill = "#f1f5f9";
                  let defaultStroke = "#cbd5e1";
                  let strokeWidth = 0.8;
                  let fillClass = "fill-slate-100 hover:fill-sky-100/70 dark:fill-slate-800/80 dark:hover:fill-slate-700/80";
                  let strokeClass = "stroke-slate-300 dark:stroke-slate-700";

                  if (demandMetrics) {
                    const dItem = demandMetrics.get(code);
                    const hasDemand = dItem && (dItem.totalOrders > 0 || dItem.metricValue > 0);
                    const maxVal = maxMetricValue && maxMetricValue > 0 ? maxMetricValue : 100;
                    const ratio = hasDemand ? Math.max(0, Math.min(1, (dItem?.metricValue ?? 0) / maxVal)) : 0;

                    if (isBiskraHub) {
                      defaultFill = isSelected ? "#fcd34d" : "#fef3c7";
                      defaultStroke = "#d97706";
                      strokeWidth = isSelected ? 2.4 : 1.8;
                      fillClass = isSelected ? "fill-amber-300 dark:fill-amber-900" : "fill-amber-100 dark:fill-amber-950/70";
                      strokeClass = "stroke-amber-600 dark:stroke-amber-500";
                    } else if (isSelected) {
                      defaultFill = "#fed7aa";
                      defaultStroke = "#ea580c";
                      strokeWidth = 2.4;
                      fillClass = "fill-orange-200 dark:fill-orange-950";
                      strokeClass = "stroke-orange-600 dark:stroke-orange-500";
                    } else if (isHovered) {
                      defaultFill = "#e0f2fe";
                      defaultStroke = "#0284c7";
                      strokeWidth = 2.0;
                      fillClass = "fill-sky-100 dark:fill-sky-950";
                      strokeClass = "stroke-sky-500 dark:stroke-sky-400";
                    } else if (hasDemand) {
                      if (ratio >= 0.65) {
                        defaultFill = "#1d4ed8";
                        defaultStroke = "#1e40af";
                        strokeWidth = 1.4;
                        fillClass = "fill-blue-700 dark:fill-blue-600";
                        strokeClass = "stroke-blue-800 dark:stroke-blue-400";
                      } else if (ratio >= 0.35) {
                        defaultFill = "#3b82f6";
                        defaultStroke = "#2563eb";
                        strokeWidth = 1.2;
                        fillClass = "fill-blue-500 dark:fill-blue-500";
                        strokeClass = "stroke-blue-600 dark:stroke-blue-400";
                      } else if (ratio >= 0.15) {
                        defaultFill = "#60a5fa";
                        defaultStroke = "#3b82f6";
                        strokeWidth = 1.1;
                        fillClass = "fill-blue-400 dark:fill-blue-400";
                        strokeClass = "stroke-blue-500 dark:stroke-blue-500";
                      } else {
                        defaultFill = "#bfdbfe";
                        defaultStroke = "#93c5fd";
                        strokeWidth = 1.0;
                        fillClass = "fill-blue-200 dark:fill-blue-900/60";
                        strokeClass = "stroke-blue-400 dark:stroke-blue-600";
                      }
                    } else {
                      // Neutral for no demand
                      defaultFill = "#f1f5f9";
                      defaultStroke = "#cbd5e1";
                      strokeWidth = 0.8;
                      fillClass = "fill-slate-100 hover:fill-slate-200 dark:fill-slate-800/80 dark:hover:fill-slate-700/80";
                      strokeClass = "stroke-slate-300 dark:stroke-slate-700";
                    }
                  } else if (isBiskraHub) {
                    defaultFill = isSelected ? "#fcd34d" : "#fef3c7";
                    defaultStroke = "#d97706";
                    strokeWidth = isSelected ? 2.4 : 1.8;
                    fillClass = isSelected
                      ? "fill-amber-300/80 dark:fill-amber-900/80"
                      : "fill-amber-200/60 dark:fill-amber-950/70";
                    strokeClass = "stroke-amber-600 dark:stroke-amber-500";
                  } else if (isSelected) {
                    defaultFill = "#fed7aa";
                    defaultStroke = "#ea580c";
                    strokeWidth = 2.4;
                    fillClass = "fill-orange-200/90 dark:fill-orange-950/90";
                    strokeClass = "stroke-orange-600 dark:stroke-orange-500";
                  } else if (isHovered) {
                    defaultFill = "#e0f2fe";
                    defaultStroke = "#0284c7";
                    strokeWidth = 1.8;
                    fillClass = "fill-sky-100 dark:fill-sky-950/80";
                    strokeClass = "stroke-sky-500 dark:stroke-sky-400";
                  } else if (hasOrders) {
                    if (orderCount > 5) {
                      defaultFill = "#bfdbfe";
                      defaultStroke = "#2563eb";
                      strokeWidth = 1.4;
                      fillClass = "fill-blue-200/85 dark:fill-blue-900/60";
                      strokeClass = "stroke-blue-500 dark:stroke-blue-500";
                    } else {
                      defaultFill = "#dbeafe";
                      defaultStroke = "#60a5fa";
                      strokeWidth = 1.1;
                      fillClass = "fill-blue-100/75 dark:fill-blue-950/50";
                      strokeClass = "stroke-blue-400 dark:stroke-blue-600";
                    }
                  }

                  return (
                    <React.Fragment key={`wilaya-poly-${code || idx}`}>
                      {/* biome-ignore lint/a11y/useSemanticElements: SVG map regions use path geometry as interactive controls. */}
                      <path
                        d={pathStr}
                        fill={defaultFill}
                        stroke={defaultStroke}
                        strokeWidth={strokeWidth}
                        strokeLinejoin="round"
                        className={`cursor-pointer transition-colors duration-150 ${fillClass} ${strokeClass}`}
                        role="button"
                        tabIndex={0}
                        aria-label={`Select Wilaya ${code}`}
                        onMouseEnter={() => setHoveredWilaya(code)}
                        onMouseLeave={() => setHoveredWilaya(null)}
                        onKeyDown={activateSvgElementOnKeyboard}
                        onClick={(e) => {
                          // Distinguish click from pan drag
                          if (dragDistRef.current > 6) {
                            dragDistRef.current = 0;
                            return;
                          }
                          e.stopPropagation();
                          setActivePinPopup(null);
                          dragDistRef.current = 0;
                          const nextCode = selectedWilayaCode === code ? null : code;
                          onSelectWilaya(nextCode);
                          if (demandMetrics && onSelectWilayaDemand && demandMetrics.has(code)) {
                            onSelectWilayaDemand(demandMetrics.get(code)!);
                          }
                        }}
                      >
                        <title>{`Wilaya ${code}`}</title>
                      </path>
                    </React.Fragment>
                  );
                })}
              </g>

              {/* Layer 2: Connecting Arcs & Routes */}
              {/* 2A. Switched Order 3-Arc System */}
              {switchedScreenData && (
                <g className="switched-arcs-group pointer-events-none">
                  {/* Arc 1: Hub -> Previous Destination */}
                  {switchedScreenData.arcHubToPrev && (
                    <g>
                      <path
                        d={switchedScreenData.arcHubToPrev}
                        fill="none"
                        stroke="rgba(0,0,0,0.12)"
                        strokeWidth="5"
                        strokeLinecap="round"
                      />
                      <path
                        d={switchedScreenData.arcHubToPrev}
                        fill="none"
                        stroke="url(#routeGradientPrev)"
                        strokeWidth="2.2"
                        strokeDasharray="4 3"
                        strokeLinecap="round"
                        className="opacity-75"
                      />
                    </g>
                  )}

                  {/* Arc 2: Hub -> New Destination */}
                  {switchedScreenData.arcHubToNew && (
                    <g>
                      <path
                        d={switchedScreenData.arcHubToNew}
                        fill="none"
                        stroke="rgba(0,0,0,0.15)"
                        strokeWidth="6"
                        strokeLinecap="round"
                      />
                      <path
                        d={switchedScreenData.arcHubToNew}
                        fill="none"
                        stroke="url(#routeGradientNew)"
                        strokeWidth="2.8"
                        strokeLinecap="round"
                      />
                    </g>
                  )}

                  {/* Arc 3: Previous -> New Destination (Transfer Vector) */}
                  {switchedScreenData.arcPrevToNew && (
                    <g>
                      <path
                        d={switchedScreenData.arcPrevToNew}
                        fill="none"
                        stroke="rgba(147, 51, 234, 0.2)"
                        strokeWidth="5"
                        strokeLinecap="round"
                      />
                      <path
                        d={switchedScreenData.arcPrevToNew}
                        fill="none"
                        stroke="url(#routeGradientTransfer)"
                        strokeWidth="2.6"
                        strokeDasharray="6 5"
                        strokeLinecap="round"
                        className="animate-pulse"
                      />
                    </g>
                  )}
                </g>
              )}

              {/* 2B. Standard Single Destination Arc */}
              {!switchedScreenData && standardRoute && (
                <g className="standard-route-group pointer-events-none">
                  <path
                    d={standardRoute.pathD}
                    fill="none"
                    stroke="rgba(0,0,0,0.15)"
                    strokeWidth="5"
                    strokeLinecap="round"
                  />
                  <path
                    d={standardRoute.pathD}
                    fill="none"
                    stroke="url(#routeGradientNew)"
                    strokeWidth="2.6"
                    strokeDasharray="6 4"
                    strokeLinecap="round"
                    className="animate-pulse"
                  />
                </g>
              )}

              {/* Layer 3: Order Density Centroid Badges */}
              <g className="density-badges-group pointer-events-none">
                {Array.from(wilayaStats.entries()).map(([code, stats]) => {
                  if (stats.total === 0) return null;
                  const pt = WILAYA_POINTS_MAP.get(code);
                  if (!pt) return null;

                  const projected = projection(pt.coordinates);
                  if (!projected) return null;

                  const [cx, cy] = projected;
                  const isSelected = activeWilayaCode === code;

                  return (
                    <g key={`badge-${code}`} transform={`translate(${cx}, ${cy}) scale(${1 / transform.k})`}>
                      <circle
                        r={isSelected ? 10 : 8}
                        fill={isSelected ? "#2563eb" : "#ffffff"}
                        stroke="#2563eb"
                        strokeWidth={1.5}
                        className="shadow-sm dark:fill-slate-900"
                      />
                      <text
                        textAnchor="middle"
                        dy="3.5"
                        fontSize="9"
                        fontWeight="bold"
                        fill={isSelected ? "#ffffff" : "#2563eb"}
                        className="font-mono select-none"
                      >
                        {stats.total}
                      </text>
                    </g>
                  );
                })}
              </g>

              {/* Layer 4: Destination Pins. Biskra itself marks the hub with its amber Wilaya fill. */}
              {/* Point 2: Previous Destination Pin (for Switched Orders) */}
              {switchedScreenData?.prevScreen && switchedRoute?.previousDestination && (
                <>
                  {/* biome-ignore lint/a11y/useSemanticElements: This interactive map marker must remain in the SVG layer. */}
                  <g
                  className="prev-dest-marker cursor-pointer"
                  role="button"
                  tabIndex={0}
                  aria-label="View previous shipment destination"
                  transform={`translate(${switchedScreenData.prevScreen[0]}, ${switchedScreenData.prevScreen[1]}) scale(${1 / transform.k})`}
                  onKeyDown={activateSvgElementOnKeyboard}
                  onClick={(e) => {
                    if (dragDistRef.current > 6) return;
                    e.stopPropagation();
                    setActivePinPopup({
                      type: "previous",
                      title: "الوجهة السابقة (قبل التحويل)",
                      badge: "مستلم سابق",
                      wilaya: switchedRoute.previousDestination?.wilayaName ?? "",
                      commune: switchedRoute.previousDestination?.communeName ?? "",
                      customer: switchedRoute.previousDestination?.recipientName ?? "مستلم سابق",
                      phone: switchedRoute.previousDestination?.phone ?? "",
                      reason: switchedRoute.reason,
                      conversionSeq: switchedRoute.conversionSequence,
                      distanceKm: switchedRoute.distanceHubToPrevKm,
                      coordinates: switchedRoute.previousDestination?.coordinates ?? [0, 0],
                      screenPos: switchedScreenData.prevScreen!,
                    });
                  }}
                >
                  <circle r="18" fill="url(#prevDestGlow)" className="animate-ping" opacity="0.4" />
                  <circle r="7" fill="#ea580c" stroke="#ffffff" strokeWidth="2" />
                  <rect
                    x="-48"
                    y="-25"
                    width="96"
                    height="16"
                    rx="8"
                    fill="#431407"
                    opacity="0.92"
                    className="pointer-events-none"
                  />
                  <text
                    x="0"
                    y="-13.5"
                    textAnchor="middle"
                    fontSize="8.5"
                    fontWeight="bold"
                    fill="#fed7aa"
                    className="pointer-events-none select-none"
                  >
                    الوجهة السابقة ({String(switchedRoute.previousDestination.wilayaName ?? "").split("-")[0]?.trim() ?? "سابق"})
                  </text>
                  </g>
                </>
              )}

              {/* Point 3: New / Current Destination Pin (for Switched Orders) */}
              {switchedScreenData?.newScreen && switchedRoute?.currentDestination && (
                <>
                  {/* biome-ignore lint/a11y/useSemanticElements: This interactive map marker must remain in the SVG layer. */}
                  <g
                  className="new-dest-marker cursor-pointer"
                  role="button"
                  tabIndex={0}
                  aria-label="View current shipment destination"
                  transform={`translate(${switchedScreenData.newScreen[0]}, ${switchedScreenData.newScreen[1]}) scale(${1 / transform.k})`}
                  onKeyDown={activateSvgElementOnKeyboard}
                  onClick={(e) => {
                    if (dragDistRef.current > 6) return;
                    e.stopPropagation();
                    setActivePinPopup({
                      type: "current",
                      title: "الوجهة الجديدة (المستلم الحالي)",
                      badge: "محوّلة ومؤكدة",
                      wilaya: switchedRoute.currentDestination.wilayaName,
                      commune: switchedRoute.currentDestination.communeName,
                      customer: switchedRoute.currentDestination.recipientName,
                      phone: switchedRoute.currentDestination.phone,
                      reason: switchedRoute.reason,
                      conversionSeq: switchedRoute.conversionSequence,
                      distanceKm: switchedRoute.distanceHubToNewKm,
                      coordinates: switchedRoute.currentDestination.coordinates ?? [0, 0],
                      screenPos: switchedScreenData.newScreen!,
                    });
                  }}
                >
                  <circle r="20" fill="url(#newDestGlow)" className="animate-pulse" />
                  <circle r="8" fill="#10b981" stroke="#ffffff" strokeWidth="2.2" />
                  <rect
                    x="-50"
                    y="-26"
                    width="100"
                    height="17"
                    rx="8.5"
                    fill="#064e3b"
                    opacity="0.92"
                    className="pointer-events-none"
                  />
                  <text
                    x="0"
                    y="-14"
                    textAnchor="middle"
                    fontSize="9"
                    fontWeight="bold"
                    fill="#a7f3d0"
                    className="pointer-events-none select-none"
                  >
                    الوجهة الجديدة ({String(switchedRoute.currentDestination.wilayaName ?? "").split("-")[0]?.trim() ?? "جديد"})
                  </text>
                  </g>
                </>
              )}

              {/* Single Destination Pin (for Standard Orders) */}
              {!switchedScreenData && standardRoute && (
                <>
                  {/* biome-ignore lint/a11y/useSemanticElements: This interactive map marker must remain in the SVG layer. */}
                  <g
                  className="standard-dest-marker cursor-pointer"
                  role="button"
                  tabIndex={0}
                  aria-label="View selected order destination"
                  transform={`translate(${standardRoute.destPoint[0]}, ${standardRoute.destPoint[1]}) scale(${1 / transform.k})`}
                  onKeyDown={activateSvgElementOnKeyboard}
                  onClick={(e) => {
                    if (dragDistRef.current > 6) return;
                    e.stopPropagation();
                    setActivePinPopup({
                      type: "current",
                      title: "وجهة الشحنة المحددة",
                      badge: "توصيل نشط",
                      wilaya: standardRoute.targetPointInfo.name_ar,
                      customer: selectedOrder?.customer ?? "غير مسجل",
                      phone: selectedOrder?.phone ?? "",
                      distanceKm: standardRoute.distanceKm,
                      coordinates: standardRoute.targetPointInfo.coordinates,
                      screenPos: standardRoute.destPoint,
                    });
                  }}
                >
                  <circle r="16" fill="#3b82f6" opacity="0.25" className="animate-ping" />
                  <circle r="7.5" fill="#3b82f6" stroke="#ffffff" strokeWidth="2" />
                  <rect
                    x="-40"
                    y="-25"
                    width="80"
                    height="16"
                    rx="8"
                    fill="#1e3a5f"
                    opacity="0.9"
                    className="pointer-events-none"
                  />
                  <text
                    x="0"
                    y="-13.5"
                    textAnchor="middle"
                    fontSize="8.5"
                    fontWeight="bold"
                    fill="#93c5fd"
                    className="pointer-events-none select-none"
                  >
                    {standardRoute.targetPointInfo.name_ar}
                  </text>
                  </g>
                </>
              )}
            </g>
          </svg>
        </div>

        {/* Legend Footer */}
        <div className="p-3 border-t bg-card/60 flex flex-wrap items-center justify-between gap-3 text-[11px] text-muted-foreground">
          <div className="flex flex-wrap items-center gap-4">
            <span className="font-bold text-foreground">دليل الخريطة:</span>

            {/* Point 1 */}
            <div className="flex items-center gap-1.5">
              <span className="size-3 rounded-sm bg-amber-200/60 dark:bg-amber-950/70 border border-amber-600 inline-block" />
              <span>ولاية الانطلاق (بسكرة 07 - Hub)</span>
            </div>

            {/* Switched Order Legends */}
            {switchedRoute ? (
              <>
                <div className="flex items-center gap-1.5">
                  <span className="size-3 rounded-full bg-orange-600 border border-orange-700 inline-block" />
                  <span>الوجهة السابقة (قبل التحويل)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="size-3 rounded-full bg-emerald-500 border border-emerald-600 inline-block" />
                  <span>الوجهة الجديدة (المستلم الحالي)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-4 h-0.5 border-b-2 border-dashed border-purple-600 inline-block" />
                  <span>مسار التحويل المباشر</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-1.5">
                  <span className="size-3 rounded-sm bg-primary/30 border border-primary inline-block" />
                  <span>ولايات بها طلبيات نشطة</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="size-3 rounded-full bg-blue-500 inline-block" />
                  <span>وجهة الشحنة المحددة</span>
                </div>
              </>
            )}
          </div>

          <span className="text-[10px]">
            استخدم أزرار التكبير (+) و(-) وعجلة الماوس والسحب للتحريك • انقر على أي نقطة لعرض تفاصيلها
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
