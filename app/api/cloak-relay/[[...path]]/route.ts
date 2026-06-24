import { NextResponse } from "next/server";

const CLOAK_DEVNET_RELAY_URL = "https://api.devnet.cloak.ag";
const HOP_BY_HOP_HEADERS = new Set(["connection", "content-encoding", "content-length", "host", "transfer-encoding"]);

type CloakRelayRouteContext = {
  params: Promise<{ path?: string[] }>;
};

export async function GET(request: Request, context: CloakRelayRouteContext): Promise<Response> {
  return proxyCloakRelayRequest(request, context);
}

export async function POST(request: Request, context: CloakRelayRouteContext): Promise<Response> {
  return proxyCloakRelayRequest(request, context);
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204 });
}

async function proxyCloakRelayRequest(request: Request, context: CloakRelayRouteContext): Promise<Response> {
  const upstreamUrl = await buildUpstreamUrl(request, context);
  const upstreamResponse = await fetch(upstreamUrl, {
    method: request.method,
    headers: proxyRequestHeaders(request.headers),
    body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer(),
    cache: "no-store"
  });

  return new Response(await upstreamResponse.arrayBuffer(), {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: proxyResponseHeaders(upstreamResponse.headers)
  });
}

async function buildUpstreamUrl(request: Request, context: CloakRelayRouteContext): Promise<URL> {
  const requestUrl = new URL(request.url);
  const { path = [] } = await context.params;
  const upstreamUrl = new URL(stripTrailingSlash(process.env.CLOAK_RELAY_UPSTREAM_URL?.trim() || CLOAK_DEVNET_RELAY_URL));

  upstreamUrl.pathname = [stripTrailingSlash(upstreamUrl.pathname), ...path.map(encodeURIComponent)].filter(Boolean).join("/");
  upstreamUrl.search = requestUrl.search;
  return upstreamUrl;
}

function proxyRequestHeaders(headers: Headers): Headers {
  const proxied = new Headers();
  const contentType = headers.get("content-type");
  const authorization = headers.get("authorization");

  if (contentType) {
    proxied.set("content-type", contentType);
  }

  if (authorization) {
    proxied.set("authorization", authorization);
  }

  return proxied;
}

function proxyResponseHeaders(headers: Headers): Headers {
  const proxied = new Headers();

  for (const [key, value] of headers.entries()) {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      proxied.set(key, value);
    }
  }

  proxied.set("cache-control", "no-store");
  return proxied;
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}
