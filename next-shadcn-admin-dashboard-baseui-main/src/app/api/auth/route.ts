import { NextRequest, NextResponse } from "next/server";
import {
  extractSessionToken,
  generateSessionToken,
  isValidPassword,
  verifyCsrfOrigin,
  verifySessionToken,
  invalidateSession,
  SESSION_COOKIE_NAME,
} from "@/lib/auth/admin-auth";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
} as const;

function jsonNoStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

export async function GET(request: NextRequest) {
  const token = extractSessionToken(request);
  const isValid = await verifySessionToken(token);

  if (isValid) {
    return jsonNoStore({ success: true, authenticated: true });
  }

  return jsonNoStore(
    { success: false, authenticated: false, error: "Unauthorized session" },
    401
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const action = body?.action;

    // 1. Check Session
    if (action === "session") {
      const token = extractSessionToken(request);
      const isValid = await verifySessionToken(token);

      if (isValid) {
        return jsonNoStore({ success: true, authenticated: true });
      }

      return jsonNoStore(
        { success: false, authenticated: false, error: "No active session" },
        401
      );
    }

    // 2. Login
    if (action === "login") {
      const password = typeof body?.password === "string" ? body.password.trim() : "";

      if (!password) {
        return jsonNoStore(
          { success: false, error: "يرجى إدخال كلمة المرور." },
          400
        );
      }

      if (isValidPassword(password)) {
        const token = generateSessionToken();
        const response = jsonNoStore({
          success: true,
          message: "Authenticated successfully",
          token,
        });

        // Set strictly hardened HTTP-Only 24-hour cookie
        response.cookies.set({
          name: SESSION_COOKIE_NAME,
          value: token,
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: 24 * 60 * 60, // 24 hours (86,400 seconds)
        });

        return response;
      }

      return jsonNoStore(
        { success: false, error: "كلمة المرور غير صحيحة." },
        401
      );
    }

    // 3. Logout
    if (action === "logout") {
      const hasSessionCookie = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value);
      if (hasSessionCookie && !verifyCsrfOrigin(request)) {
        return jsonNoStore(
          { success: false, error: "Forbidden: CSRF origin mismatch" },
          403
        );
      }

      const token = extractSessionToken(request);
      if (token) {
        const revoked = await invalidateSession(token);
        if (!revoked) {
          return jsonNoStore(
            { success: false, error: "Database session revocation failed" },
            500
          );
        }
      }

      const response = jsonNoStore({
        success: true,
        message: "Logged out successfully",
      });

      response.cookies.set({
        name: SESSION_COOKIE_NAME,
        value: "",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 0,
      });

      return response;
    }

    return jsonNoStore(
      { success: false, error: "Invalid auth action" },
      400
    );
  } catch (error) {
    console.error("[API /api/auth] Auth handler error:", error);
    return jsonNoStore(
      { success: false, error: "Internal server error" },
      500
    );
  }
}
