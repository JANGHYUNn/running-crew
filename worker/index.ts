// Cloudflare Worker — Strava OAuth 처리 + 활동 조회 프록시.
//
// 왜 워커가 필요한가:
//   Strava OAuth는 토큰 교환/갱신에 client_secret이 필요한데(PKCE 미지원),
//   정적 프론트(output:"export")에 시크릿을 박으면 누구나 훔쳐볼 수 있다.
//   → 시크릿이 필요한 부분만 이 워커가 처리한다.
//
// 라우팅:
//   GET  /api/strava/config     공개값 client_id 만 프론트로 전달(연동 가능 여부 판단)
//   POST /api/strava/token      code -> access/refresh token (client_secret 사용)
//   POST /api/strava/refresh    refresh_token -> 새 토큰        (client_secret 사용)
//   GET  /api/strava/activities Bearer 토큰으로 활동 목록 프록시 (CORS 회피용)
//   그 외                       정적 자산(out/)으로 위임
//
// 프론트와 같은 도메인에서 호출되므로 CORS 헤더 불필요(동일 출처).
// client_id / client_secret 은 Cloudflare 대시보드의 Variables & Secrets 로 주입.

interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  STRAVA_CLIENT_ID: string;
  STRAVA_CLIENT_SECRET: string;
}

const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";
const STRAVA_API = "https://www.strava.com/api/v3";

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname === "/api/strava/config" && request.method === "GET") {
      // client_id 는 인증 URL에 어차피 노출되는 공개값이라 그대로 내려도 안전.
      return json({ clientId: env.STRAVA_CLIENT_ID ?? "" });
    }
    if (pathname === "/api/strava/token" && request.method === "POST") {
      return handleToken(request, env);
    }
    if (pathname === "/api/strava/refresh" && request.method === "POST") {
      return handleRefresh(request, env);
    }
    if (pathname === "/api/strava/activities" && request.method === "GET") {
      return handleActivities(request);
    }

    // 나머지는 전부 정적 자산
    return env.ASSETS.fetch(request);
  },
};

export default worker;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Strava 토큰 엔드포인트 호출 공통부 */
async function postToken(
  env: Env,
  extra: Record<string, string>
): Promise<Response> {
  if (!env.STRAVA_CLIENT_ID || !env.STRAVA_CLIENT_SECRET) {
    return json({ error: "서버에 Strava 키가 설정되지 않았습니다" }, 500);
  }
  const res = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: env.STRAVA_CLIENT_ID,
      client_secret: env.STRAVA_CLIENT_SECRET,
      ...extra,
    }),
  });
  return json(await res.json(), res.status);
}

async function handleToken(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as { code?: string };
  if (!body.code) return json({ error: "code 누락" }, 400);
  return postToken(env, { code: body.code, grant_type: "authorization_code" });
}

async function handleRefresh(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    refresh_token?: string;
  };
  if (!body.refresh_token) return json({ error: "refresh_token 누락" }, 400);
  return postToken(env, {
    refresh_token: body.refresh_token,
    grant_type: "refresh_token",
  });
}

async function handleActivities(request: Request): Promise<Response> {
  const auth = request.headers.get("authorization");
  if (!auth) return json({ error: "인증 토큰 누락" }, 401);

  const res = await fetch(`${STRAVA_API}/athlete/activities?per_page=30`, {
    headers: { authorization: auth },
  });
  return json(await res.json(), res.status);
}
