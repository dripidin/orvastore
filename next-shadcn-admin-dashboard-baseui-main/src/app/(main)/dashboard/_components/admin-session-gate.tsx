"use client";

import * as React from "react";
import type { FormEvent, ReactNode } from "react";
import { LockKeyhole, RefreshCw, Sparkles } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { isDemoModeAllowed } from "@/lib/demo-environment";
import { orvaFetch } from "@/lib/orva-api";

export const ADMIN_AUTH_ENDPOINT = "/api/auth/";
const TRANSIENT_GATEWAY_STATUSES = new Set([502, 503, 504]);
const TRANSIENT_RETRY_DELAY_MS = 600;

export interface AuthFailureClassification {
  unavailable: boolean;
  unavailableDetail: string | null;
  loginError: string;
}

export function classifyAuthFailure(status: number, hasJsonPayload: boolean): AuthFailureClassification {
  if (status === 401) {
    return {
      unavailable: false,
      unavailableDetail: null,
      loginError: "كلمة المرور غير صحيحة.",
    };
  }
  if (status === 400) {
    return {
      unavailable: false,
      unavailableDetail: null,
      loginError: "يرجى إدخال كلمة مرور صالحة.",
    };
  }
  if (TRANSIENT_GATEWAY_STATUSES.has(status)) {
    return {
      unavailable: true,
      unavailableDetail: `خادم الإدارة قيد إعادة التشغيل أو غير متاح مؤقتاً (HTTP ${status}). أعد المحاولة بعد لحظات.`,
      loginError: `خادم الإدارة غير متاح مؤقتاً (HTTP ${status}). يرجى إعادة المحاولة بعد لحظات.`,
    };
  }
  if (!hasJsonPayload || status >= 500 || status === 404) {
    return {
      unavailable: true,
      unavailableDetail: `تعذر الحصول على استجابة صالحة من خدمة الإدارة (HTTP ${status}). تحقق من حالة الخادم ثم أعد المحاولة.`,
      loginError: `تعذر تسجيل الدخول بسبب استجابة غير متوقعة من خدمة الإدارة (HTTP ${status}).`,
    };
  }
  return {
    unavailable: false,
    unavailableDetail: null,
    loginError: "تعذر تسجيل الدخول. يرجى المحاولة مرة أخرى.",
  };
}

async function fetchAdminAuth(
  body: Record<string, unknown>,
  extraHeaders?: Record<string, string>,
  retryOnTransient = true
): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...extraHeaders,
  };

  const response = await orvaFetch(ADMIN_AUTH_ENDPOINT, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (retryOnTransient && TRANSIENT_GATEWAY_STATUSES.has(response.status)) {
    await new Promise((resolve) => setTimeout(resolve, TRANSIENT_RETRY_DELAY_MS));
    return orvaFetch(ADMIN_AUTH_ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  }

  return response;
}

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
  const [isRetrying, setIsRetrying] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [serviceUnavailable, setServiceUnavailable] = React.useState(false);
  const [serviceUnavailableDetail, setServiceUnavailableDetail] = React.useState<string | null>(null);
  const [demoAllowed, setDemoAllowed] = React.useState(false);

  const checkSession = React.useCallback(async () => {
    setServiceUnavailable(false);
    setServiceUnavailableDetail(null);
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
      const headers: Record<string, string> = {};
      if (typeof window !== "undefined") {
        const token = localStorage.getItem("orva_admin_token");
        if (token) headers["Authorization"] = `Bearer ${token}`;
      }
      const response = await fetchAdminAuth({ action: "session" }, headers, true);
      const result = (await response.json().catch(() => null)) as { success?: boolean } | null;

      if (response.ok && result?.success) {
        setState("signed-in");
        setServiceUnavailable(false);
        setServiceUnavailableDetail(null);
        return;
      }

      if (response.status === 401 || response.status === 403) {
        if (typeof window !== "undefined") {
          localStorage.removeItem("orva_admin_token");
        }
        setState("signed-out");
        return;
      }

      const classified = classifyAuthFailure(response.status, result !== null);
      setState("signed-out");
      setServiceUnavailable(classified.unavailable);
      setServiceUnavailableDetail(classified.unavailableDetail);
    } catch {
      setState("signed-out");
      setServiceUnavailable(true);
      setServiceUnavailableDetail("تعذر الاتصال بخدمة الإدارة. تأكد من اتصالك وتوفر الخادم، ثم أعد المحاولة.");
    }
  }, []);

  React.useEffect(() => {
    void checkSession();
  }, [checkSession]);

  const handleRetrySessionCheck = async () => {
    if (isRetrying) return;
    setIsRetrying(true);
    setError(null);
    try {
      await checkSession();
    } finally {
      setIsRetrying(false);
    }
  };

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting || !password.trim()) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetchAdminAuth(
        { action: "login", password: password.trim() },
        undefined,
        true
      );
      const result = (await response.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
        token?: string;
      } | null;

      if (response.ok && result?.success) {
        setPassword("");
        if (typeof window !== "undefined") {
          localStorage.removeItem("orva_demo_session_active");
          if (result.token) {
            localStorage.setItem("orva_admin_token", result.token);
          }
        }
        setState("signed-in");
        setServiceUnavailable(false);
        setServiceUnavailableDetail(null);
        return;
      }

      const classified = classifyAuthFailure(response.status, result !== null);
      setError(classified.loginError);
      setServiceUnavailable(classified.unavailable);
      setServiceUnavailableDetail(classified.unavailableDetail);
    } catch {
      setError("تعذر الاتصال بخدمة الإدارة. تحقق من الاتصال وتوفر الخادم ثم أعد المحاولة.");
      setServiceUnavailable(true);
      setServiceUnavailableDetail("تعذر الاتصال بخدمة الإدارة. تأكد من اتصالك وتوفر الخادم، ثم أعد المحاولة.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const logout = React.useCallback(async () => {
    try {
      await fetchAdminAuth({ action: "logout" }, undefined, false);
    } finally {
      if (typeof window !== "undefined") {
        localStorage.setItem("orva_demo_session_active", "false");
        localStorage.removeItem("orva_admin_token");
      }
      setState("signed-out");
      setPassword("");
      setError(null);
      setServiceUnavailable(false);
      setServiceUnavailableDetail(null);
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
                <AlertTitle>خدمة الإدارة غير متاحة مؤقتاً</AlertTitle>
                <AlertDescription className="space-y-2">
                  <p>
                    {serviceUnavailableDetail ||
                      "تأكد أن الواجهة وواجهة API تعملان على النطاق نفسه، ثم أعد المحاولة."}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void handleRetrySessionCheck()}
                    disabled={isRetrying}
                    className="gap-1.5"
                  >
                    <RefreshCw className={`size-3.5 ${isRetrying ? "animate-spin" : ""}`} />
                    <span>{isRetrying ? "جارٍ إعادة الفحص…" : "إعادة المحاولة"}</span>
                  </Button>
                </AlertDescription>
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
