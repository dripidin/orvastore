import { NextRequest, NextResponse } from "next/server";
import {
  extractSessionToken,
  generateSessionToken,
  isValidPassword,
  verifySessionToken,
  invalidateSession,
  SESSION_COOKIE_NAME,
} from "@/lib/auth/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const token = extractSessionToken(request);
  const isValid = await verifySessionToken(token);

  if (isValid) {
    return NextResponse.json({ success: true, authenticated: true });
  }

  return NextResponse.json(
    { success: false, authenticated: false, error: "Unauthorized session" },
    { status: 401 }
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
        return NextResponse.json({ success: true, authenticated: true });
      }

      return NextResponse.json(
        { success: false, authenticated: false, error: "No active session" },
        { status: 401 }
      );
    }

    // 2. Login
    if (action === "login") {
      const password = typeof body?.password === "string" ? body.password : "";

      if (isValidPassword(password)) {
        const token = generateSessionToken();
        const response = NextResponse.json({
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

      return NextResponse.json(
        { success: false, error: "كلمة المرور غير صحيحة." },
        { status: 401 }
      );
    }

    // 3. Logout
    if (action === "logout") {
      const token = extractSessionToken(request);
      if (token) {
        const revoked = await invalidateSession(token);
        if (!revoked) {
          return NextResponse.json(
            { success: false, error: "Database session revocation failed" },
            { status: 500 }
          );
        }
      }

      const response = NextResponse.json({
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

    return NextResponse.json(
      { success: false, error: "Invalid auth action" },
      { status: 400 }
    );
  } catch (error) {
    console.error("[API /api/auth] Auth handler error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
