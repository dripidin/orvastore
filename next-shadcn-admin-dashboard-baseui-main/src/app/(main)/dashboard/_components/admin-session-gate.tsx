"use client";

import * as React from "react";
import type { FormEvent, ReactNode } from "react";
import { LockKeyhole, Sparkles } from "lucide-react";


import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { isDemoModeAllowed } from "@/lib/demo-environment";
import { orvaFetch } from "@/lib/orva-api";

interface AdminSessionContextValue {
  logout: () => Promise<void>;
}

const AdminSessionContext = React.createContext<AdminSessionContextValue>({
  logout: async () => undefined,
});

export function useAdminSession() {
  return React.useContext(AdminSessionContext);
}

export function AdminSessionGate({ children }: { children: ReactNode }) {
  const [state, setState] = React.useState<"checking" | "signed-in" | "signed-out">("checking");
  const [password, setPassword] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [serviceUnavailable, setServiceUnavailable] = React.useState(false);
  const [demoAllowed, setDemoAllowed] = React.useState(false);

  const checkSession = React.useCallback(async () => {
    setServiceUnavailable(false);
    const allowed = isDemoModeAllowed();
    setDemoAllowed(allowed);

    // Demo sandbox never auto-signs-in (must click explicit Demo button).
    // Only honor an already-active explicit demo flag on localhost.
    if (!allowed && typeof window !== "undefined") {
      localStorage.removeItem("orva_demo_session_active");
    }
    if (allowed && typeof window !== "undefined") {
      const demoActive = localStorage.getItem("orva_demo_session_active") === "true";
      if (demoActive) {
        setState("signed-in");
        return;
      }
    }

    try {
      const response = await orvaFetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "session" }),
      });
      const result = (await response.json().catch(() => null)) as { success?: boolean } | null;
      setState(response.ok && result?.success ? "signed-in" : "signed-out");
      if (!response.ok && response.status !== 401 && response.status !== 403) setServiceUnavailable(true);
    } catch {
      setState("signed-out");
      setServiceUnavailable(true);
    }
  }, []);


  React.useEffect(() => {
    void checkSession();
  }, [checkSession]);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting || !password.trim()) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const response = await orvaFetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login", password: password.trim() }),
      });
      const result = (await response.json().catch(() => null)) as { success?: boolean; error?: string } | null;
      if (response.ok && result?.success) {
        setPassword("");
        if (typeof window !== "undefined") {
          // Real PHP session — clear demo flag so APIs use live auth cookie
          localStorage.removeItem("orva_demo_session_active");
        }
        setState("signed-in");
        setServiceUnavailable(false);
        return;
      }

      setError(response.status === 401 ? "كلمة المرور غير صحيحة." : "تعذر تسجيل الدخول. تحقق من اتصال خدمة الإدارة.");
      setServiceUnavailable(response.status !== 401 && response.status !== 400);
    } catch {
      setError("تعذر الاتصال بخدمة الإدارة. استخدم الداشبورد على نفس النطاق الذي يستضيف واجهة API.");
      setServiceUnavailable(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const logout = React.useCallback(async () => {
    try {
      await orvaFetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
    } finally {
      if (typeof window !== "undefined") {
        localStorage.setItem("orva_demo_session_active", "false");
      }
      setState("signed-out");
      setPassword("");
      setError(null);
    }
  }, []);


  if (state === "checking") {
    return (
      <div className="grid min-h-dvh place-items-center p-6" dir="ltr">
        <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Spinner />
          جارٍ التحقق من جلسة الإدارة…
        </div>
      </div>
    );
  }

  if (state === "signed-out") {
    return (
      <div className="grid min-h-dvh place-items-center p-6" dir="ltr">
        <Card className="w-full max-w-md">
          <CardHeader className="text-right">
            <div className="mb-2 grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
              <LockKeyhole aria-hidden="true" />
            </div>
            <CardTitle>تسجيل الدخول إلى لوحة ORVA</CardTitle>
            <CardDescription>الدخول مطلوب لعرض بيانات الطلبات وتنفيذ إجراءات الإدارة.</CardDescription>
          </CardHeader>
          <CardContent>
            {serviceUnavailable && (
              <Alert className="mb-4" variant="destructive">
                <AlertTitle>خدمة الإدارة غير متاحة</AlertTitle>
                <AlertDescription>تأكد أن الواجهة وواجهة API تعملان على النطاق نفسه، ثم أعد المحاولة.</AlertDescription>
              </Alert>
            )}
            {error && (
              <Alert className="mb-4" variant="destructive" aria-live="polite">
                <AlertTitle>تعذر تسجيل الدخول</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <form className="flex flex-col gap-4" onSubmit={handleLogin}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="orva-admin-password">كلمة مرور الإدارة</FieldLabel>
                  <Input
                    id="orva-admin-password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    disabled={isSubmitting}
                  />
                </Field>
              </FieldGroup>
              <Button type="submit" disabled={isSubmitting || !password.trim()}>
                {isSubmitting && <Spinner data-icon="inline-start" />}
                {isSubmitting ? "جارٍ التحقق…" : "دخول"}
              </Button>
            </form>

            {demoAllowed && (
              <>
                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">أو</span>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300 hover:bg-amber-500/20 font-semibold text-xs gap-1.5"
                  onClick={() => {
                    if (isDemoModeAllowed() && typeof window !== "undefined") {
                      localStorage.setItem("orva_demo_session_active", "true");
                      setState("signed-in");
                    }
                  }}
                >
                  <Sparkles className="size-3.5 text-amber-600 dark:text-amber-400" />
                  <span>الدخول في وضع التجربة المعزول (Enter Demo Mode)</span>
                </Button>
              </>
            )}
          </CardContent>

        </Card>
      </div>
    );
  }

  return <AdminSessionContext.Provider value={{ logout }}>{children}</AdminSessionContext.Provider>;
}
