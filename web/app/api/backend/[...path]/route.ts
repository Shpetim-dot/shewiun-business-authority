import { NextRequest, NextResponse } from "next/server";

type RouteContext = { params: Promise<{ path: string[] }> };

async function proxy(request: NextRequest, context: RouteContext) {
  const base = process.env.SHEWIUN_API_URL || "https://backend-shewion-ag.vercel.app";
  const secret = process.env.SHEWIUN_API_SECRET;

  if (!secret) {
    return NextResponse.json({ code: "API_PROXY_NOT_CONFIGURED" }, { status: 503 });
  }

  const { path = [] } = await context.params;
  const endpoint = path[0] === "health" ? "/health" : \`/api/\${path.join("/")}\`;
  const normalizedBase = base.endsWith("/") ? base.slice(0, -1) : base;
  const target = new URL(\`\${endpoint}\${request.nextUrl.search}\`, \`\${normalizedBase}/\`);

  const headers = new Headers();
  headers.set("x-shewiun-api-key", secret);
  headers.set("accept", request.headers.get("accept") || "application/json");
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  const correlationId = request.headers.get("x-correlation-id");
  if (correlationId) headers.set("x-correlation-id", correlationId);

  const hasBody = !["GET", "HEAD"].includes(request.method);
  const response = await fetch(target, {
    method: request.method,
    headers,
    body: hasBody ? await request.arrayBuffer() : undefined,
    cache: "no-store",
    redirect: "manual",
  });

  const responseHeaders = new Headers();
  for (const key of ["content-type", "cache-control", "retry-after"]) {
    const value = response.headers.get(key);
    if (value) responseHeaders.set(key, value);
  }
  responseHeaders.set("x-shewiun-proxy", "active");

  return new Response(await response.arrayBuffer(), {
    status: response.status,
    headers: responseHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
