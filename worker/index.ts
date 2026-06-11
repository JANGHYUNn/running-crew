// Cloudflare Worker — intervals.icu OAuth 토큰 교환 전용 엔드포인트.
// client_secret 을 브라우저에 노출하지 않기 위한 유일한 서버 코드.
// 그 외 모든 요청은 정적 자산(ASSETS)으로 그대로 흘려보낸다 → 기존 정적 사이트 그대로 동작.
//
// 배포 전 설정:
//   - ICU_CLIENT_ID:     wrangler.jsonc vars 또는 대시보드 (공개 가능)
//   - ICU_CLIENT_SECRET: npx wrangler secret put ICU_CLIENT_SECRET (비밀)
//
// 같은 도메인에서 호출되므로 CORS 헤더는 필요 없다.

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  ICU_CLIENT_ID: string;
  ICU_CLIENT_SECRET: string;
}

const ICU_TOKEN_URL = "https://intervals.icu/api/oauth/token";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/icu/token") return exchange(request, env);
    // /api/icu/* 외에는 정적 자산 서빙
    return env.ASSETS.fetch(request);
  },
};

async function exchange(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return json({ error: "POST only" }, 405);
  if (!env.ICU_CLIENT_ID || !env.ICU_CLIENT_SECRET) {
    return json({ error: "ICU client id/secret 미설정(서버)" }, 500);
  }

  let body: { code?: string; refresh_token?: string; redirect_uri?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const form = new URLSearchParams();
  form.set("client_id", env.ICU_CLIENT_ID);
  form.set("client_secret", env.ICU_CLIENT_SECRET);

  if (body.refresh_token) {
    form.set("grant_type", "refresh_token");
    form.set("refresh_token", body.refresh_token);
  } else if (body.code) {
    form.set("grant_type", "authorization_code");
    form.set("code", body.code);
    if (body.redirect_uri) form.set("redirect_uri", body.redirect_uri);
  } else {
    return json({ error: "code or refresh_token required" }, 400);
  }

  const res = await fetch(ICU_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });

  // icu 응답(JSON)을 상태코드 그대로 전달.
  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
