import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = [/^\/login/, /^\/register/, /^\/api\/auth\/(login|register|status)/, /^\/api\/health/, /^\/offline/, /^\/_next\//, /^\/media\//, /^\/icons\//, /^\/sw\.js$/, /^\/manifest\.webmanifest$/, /^\/favicon/];

/** Cheap cookie-presence gate; real session validation happens server-side in every page/route. */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((re) => re.test(pathname))) return NextResponse.next();
  if (!req.cookies.get("ff_session")) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: { code: "unauthenticated", message: "لطفاً وارد شوید." } }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
