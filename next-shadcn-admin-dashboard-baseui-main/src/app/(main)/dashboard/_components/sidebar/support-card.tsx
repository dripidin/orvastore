import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function SupportCard() {
  return (
    <Card size="sm" className="overflow-hidden shadow-none group-data-[collapsible=icon]:hidden border-border/60 bg-muted/30">
      <CardHeader className="min-w-0 px-4 py-3 text-left">
        <CardTitle className="truncate text-xs font-bold text-foreground">ORVA STORE — ADMIN</CardTitle>
        <CardDescription className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
          Manage orders, shipping, and delivery operations across Algeria.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}
