import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Admin panel routes — check for admin session
  if (pathname.startsWith("/admin") && !pathname.startsWith("/admin/login")) {
    // TODO: Check admin session cookie
    // For now, allow access — will be enforced via server-side auth in pages
  }

  // CORS headers for mobile API
  if (pathname.startsWith("/api/v1")) {
    const response = NextResponse.next();
    response.headers.set("Access-Control-Allow-Origin", "*");
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (request.method === "OPTIONS") {
      return new NextResponse(null, { status: 204, headers: response.headers });
    }

    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/v1/:path*", "/admin/:path*"],
};
