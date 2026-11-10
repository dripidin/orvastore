import Link from "next/link";

import { ArrowUpRight, ChartNoAxesColumn } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export function StoreTraffic() {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="font-normal text-muted-foreground text-sm">Store Traffic</CardTitle>
        <CardDescription className="text-foreground text-xl leading-none tracking-tight">
          المزامنة غير متاحة بعد
        </CardDescription>
        <CardAction>
          <Button
            nativeButton={false}
            render={<Link href="/dashboard/store-traffic" />}
            variant="ghost"
            size="icon-sm"
            aria-label="فتح زيارات المتجر"
          >
            <ArrowUpRight aria-hidden="true" />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ChartNoAxesColumn aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>لا يوجد مصدر زيارات متصل</EmptyTitle>
            <EmptyDescription>
              لم يتم ربط Google Analytics أو مصدر موثوق آخر. لا يمكن مزامنة الزيارات تلقائيًا قبل ربط مصدر حقيقي، لذلك لا
              تظهر أرقام أو رسوم تقديرية.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </CardContent>
    </Card>
  );
}
