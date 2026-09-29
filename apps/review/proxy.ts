import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, authMode, verifySession } from "./lib/auth";

/** Every page and API route needs the admin session (see lib/auth.ts). */
export async function proxy(request: NextRequest) {
  const mode = authMode();
  if (mode === "off") return NextResponse.next();
  if (mode === "misconfigured") {
    return new NextResponse("Login is not configured: set ADMIN_PASSWORD (and AUTH_SECRET) on this deployment.", {
      status: 503,
    });
  }
  if (await verifySession(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "login required" }, { status: 401 });
  }
  const login = new URL("/login", request.url);
  if (pathname !== "/") login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except the login page/endpoint and Next's static assets.
  matcher: ["/((?!login|api/login|_next/static|_next/image|favicon.ico).*)"],
};
