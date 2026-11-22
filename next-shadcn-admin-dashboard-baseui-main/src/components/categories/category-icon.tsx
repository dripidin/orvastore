"use client";

import * as React from "react";
import {
  Award,
  Axe,
  Backpack,
  BadgeCheck,
  BatteryCharging,
  Bike,
  Bolt,
  Boxes,
  Briefcase,
  Camera,
  Car,
  Check,
  Cog,
  Compass,
  Construction,
  Crown,
  Drill,
  Droplets,
  Dumbbell,
  Fan,
  Flame,
  Flashlight,
  FolderTree,
  Footprints,
  Gauge,
  Gift,
  Hammer,
  HardHat,
  Headphones,
  Home,
  KeyRound,
  Laptop,
  Layers,
  LayoutGrid,
  Leaf,
  Lightbulb,
  Lock,
  type LucideIcon,
  Monitor,
  Nut,
  Package,
  Paintbrush,
  Percent,
  Pickaxe,
  Plug,
  Radio,
  Ruler,
  Scissors,
  Search,
  Settings,
  ShieldCheck,
  Shirt,
  ShoppingBag,
  Shovel,
  Smartphone,
  Sofa,
  Sparkles,
  Speaker,
  Sprout,
  Star,
  Store,
  Sun,
  Tag,
  Tags,
  Thermometer,
  Truck,
  Tv,
  Utensils,
  Watch,
  Wind,
  Wrench,
  Zap,
  Cpu,
} from "lucide-react";
import { DynamicIcon, iconNames as dynamicLucideIconNames, type IconName } from "lucide-react/dynamic";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  CATEGORY_ICON_GROUPS,
  type CategoryIconGroup,
  DEFAULT_CATEGORY_ICON,
  getCuratedIconMeta,
  normalizeCategoryIconName,
  searchCategoryIcons,
} from "@/lib/categories/icon-registry";

const EAGER_ICONS: Record<string, LucideIcon> = {
  "folder-tree": FolderTree,
  wrench: Wrench,
  hammer: Hammer,
  drill: Drill,
  cog: Cog,
  settings: Settings,
  axe: Axe,
  pickaxe: Pickaxe,
  shovel: Shovel,
  scissors: Scissors,
  paintbrush: Paintbrush,
  ruler: Ruler,
  compass: Compass,
  "hard-hat": HardHat,
  construction: Construction,
  nut: Nut,
  bolt: Bolt,
  flame: Flame,
  zap: Zap,
  "battery-charging": BatteryCharging,
  plug: Plug,
  lightbulb: Lightbulb,
  flashlight: Flashlight,
  fan: Fan,
  wind: Wind,
  car: Car,
  truck: Truck,
  gauge: Gauge,
  bike: Bike,
  "key-round": KeyRound,
  lock: Lock,
  package: Package,
  boxes: Boxes,
  layers: Layers,
  "shopping-bag": ShoppingBag,
  store: Store,
  tag: Tag,
  tags: Tags,
  crown: Crown,
  "shield-check": ShieldCheck,
  "badge-check": BadgeCheck,
  award: Award,
  star: Star,
  sparkles: Sparkles,
  gift: Gift,
  percent: Percent,
  "layout-grid": LayoutGrid,
  briefcase: Briefcase,
  backpack: Backpack,
  cpu: Cpu,
  smartphone: Smartphone,
  headphones: Headphones,
  camera: Camera,
  tv: Tv,
  laptop: Laptop,
  monitor: Monitor,
  watch: Watch,
  radio: Radio,
  speaker: Speaker,
  home: Home,
  droplets: Droplets,
  leaf: Leaf,
  sprout: Sprout,
  sun: Sun,
  thermometer: Thermometer,
  sofa: Sofa,
  utensils: Utensils,
  dumbbell: Dumbbell,
  shirt: Shirt,
  footprints: Footprints,
};

const ALL_LUCIDE_ICON_NAMES: string[] = Array.isArray(dynamicLucideIconNames)
  ? (dynamicLucideIconNames as string[])
  : [];
const ALL_SET = new Set(ALL_LUCIDE_ICON_NAMES);

function FallbackCategoryIcon({ className }: { className?: string }) {
  return <FolderTree className={className} aria-hidden="true" />;
}

export function CategoryIcon({
  name,
  className = "size-4",
}: {
  name?: string | null;
  className?: string;
}) {
  const normalized = normalizeCategoryIconName(name || DEFAULT_CATEGORY_ICON);
  const FallbackComp = React.useCallback(
    () => <FallbackCategoryIcon className={className} />,
    [className]
  );
  const Eager = EAGER_ICONS[normalized];
  if (Eager) {
    return <Eager className={className} aria-hidden="true" />;
  }
  if (ALL_SET.has(normalized)) {
    return (
      <DynamicIcon
        name={normalized as IconName}
        className={className}
        fallback={FallbackComp}
        aria-hidden="true"
      />
    );
  }
  return <FolderTree className={className} aria-hidden="true" />;
}

export function CategoryIconPicker({
  value,
  onChange,
  disabled = false,
}: {
  value?: string | null;
  onChange: (nextIconName: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [group, setGroup] = React.useState<CategoryIconGroup>("tools");
  const [limit, setLimit] = React.useState(120);

  const normalizedValue = normalizeCategoryIconName(value);
  const activeMeta = getCuratedIconMeta(normalizedValue);

  const effectiveGroup: CategoryIconGroup = query.trim().length > 0 ? "all" : group;
  const results = React.useMemo(
    () => searchCategoryIcons(query, effectiveGroup, limit, ALL_LUCIDE_ICON_NAMES),
    [query, effectiveGroup, limit]
  );

  const handleOpen = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      setQuery("");
      setLimit(120);
    }
  };

  return (
    <>
      <div className="flex items-center gap-3 rounded-lg border bg-muted/20 p-2.5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-background text-primary shadow-2xs">
          <CategoryIcon name={normalizedValue} className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">
            {activeMeta?.labelAr || normalizedValue}
          </div>
          <div className="truncate font-mono text-[11px] text-muted-foreground" dir="ltr">
            lucide:{normalizedValue}
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => handleOpen(true)}
          className="shrink-0 text-xs"
        >
          تغيير الأيقونة
        </Button>
      </div>

      <Dialog open={open} onOpenChange={handleOpen}>
        <DialogContent className="sm:max-w-2xl" dir="rtl">
          <DialogHeader className="text-right">
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <Sparkles className="size-4 text-primary" />
              اختيار أيقونة التصنيف (مكتبة shadcn / Lucide)
            </DialogTitle>
            <DialogDescription className="text-xs">
              ابحث بالعربية (مثل: لحام، مثقاب، سيارة، مفاتيح، بطارية) أو بالإنجليزية عبر أكثر من 2,300 أيقونة متجهة، أو مرّر للأسفل للاختيار.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute top-2.5 right-3 size-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setLimit(160);
                }}
                placeholder="ابحث عن أيقونة... مثلاً: لحام، drill، car، flame، wrench"
                className="pr-9 text-sm"
                autoFocus
              />
            </div>

            {!query.trim() && (
              <div className="flex flex-wrap gap-1.5">
                {CATEGORY_ICON_GROUPS.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => {
                      setGroup(g.id);
                      setLimit(120);
                    }}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium transition cursor-pointer ${
                      group === g.id
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {g.labelAr}
                  </button>
                ))}
              </div>
            )}

            <ScrollArea className="h-80 rounded-lg border bg-muted/15 p-3">
              {results.length === 0 ? (
                <div className="flex h-48 flex-col items-center justify-center gap-1 text-center text-xs text-muted-foreground">
                  <span>لم يتم العثور على أيقونة مطابقة لـ «{query}».</span>
                  <span>جرّب كلمة إنجليزية مثل tool أو package أو car.</span>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                    {results.map((item) => {
                      const active = item.name === normalizedValue;
                      return (
                        <button
                          key={item.name}
                          type="button"
                          onClick={() => {
                            onChange(item.name);
                            setOpen(false);
                          }}
                          className={`group relative flex flex-col items-center gap-1.5 rounded-lg border p-2.5 text-center transition cursor-pointer ${
                            active
                              ? "border-primary bg-primary/10 ring-1 ring-primary"
                              : "border-border bg-background hover:border-primary/50 hover:bg-muted/40"
                          }`}
                          title={item.name}
                        >
                          {active && (
                            <span className="absolute top-1 left-1 rounded-full bg-primary p-0.5 text-primary-foreground">
                              <Check className="size-2.5" />
                            </span>
                          )}
                          <CategoryIcon
                            name={item.name}
                            className={`size-5 ${active ? "text-primary" : "text-foreground group-hover:text-primary"}`}
                          />
                          <span className="line-clamp-1 w-full text-[11px] font-medium text-muted-foreground">
                            {item.labelAr}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {effectiveGroup === "all" && results.length >= limit && limit < ALL_LUCIDE_ICON_NAMES.length && (
                    <div className="flex justify-center pt-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setLimit((prev) => prev + 160)}
                        className="text-xs"
                      >
                        تحميل المزيد من الأيقونات ({results.length} / {ALL_LUCIDE_ICON_NAMES.length})
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
