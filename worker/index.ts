// Cloudflare Worker — intervals.icu 연동용 서버 엔드포인트.
//   POST /api/icu/token   : OAuth 토큰 교환(client_secret 은닉).
//   POST /api/icu/webhook : icu 활동 웹훅 → 자동 땅 점령(서버에서 처리).
// 그 외 모든 요청은 정적 자산(ASSETS)으로 그대로 흘려보낸다 → 기존 정적 사이트 그대로 동작.
//
// 배포 전 설정:
//   - ICU_CLIENT_ID:              wrangler.jsonc vars (공개 가능)
//   - ICU_CLIENT_SECRET:          npx wrangler secret put ICU_CLIENT_SECRET
//   - SUPABASE_URL:               wrangler.jsonc vars (공개 가능, NEXT_PUBLIC_SUPABASE_URL 과 동일)
//   - SUPABASE_SERVICE_ROLE_KEY:  npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY  (절대 비밀!)
//   - ICU_WEBHOOK_SECRET:         npx wrangler secret put ICU_WEBHOOK_SECRET
//     → icu /settings → Manage App 의 webhook secret 과 동일 값으로. event 는 ACTIVITY_ANALYZED 활성화.
import { routeToTerritory } from "../lib/territory";

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  ICU_CLIENT_ID: string;
  ICU_CLIENT_SECRET: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  ICU_WEBHOOK_SECRET: string;
}

const ICU_TOKEN_URL = "https://intervals.icu/api/oauth/token";
const ICU_API = "https://intervals.icu/api/v1";

const handler = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/icu/token") return exchange(request, env);
    if (url.pathname === "/api/icu/webhook") return webhook(request, env);
    // /api/icu/* 외에는 정적 자산 서빙
    return env.ASSETS.fetch(request);
  },
};

export default handler;

// ── OAuth 토큰 교환 ─────────────────────────────────────
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

// ── 활동 웹훅 → 자동 점령 ────────────────────────────────
interface IcuEvent {
  athlete_id?: string;
  type?: string;
  timestamp?: string;
  activity?: { id?: string; start_date_local?: string };
}
interface WebhookBody {
  secret?: string;
  events?: IcuEvent[];
}
interface TokenRow {
  user_id: string;
  access_token: string;
  display_name: string | null;
}
interface IcuStream {
  type: string;
  data?: number[];
  data2?: number[];
}

async function webhook(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return json({ error: "POST only" }, 405);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.ICU_WEBHOOK_SECRET) {
    return json({ error: "webhook env 미설정(서버)" }, 500);
  }

  let body: WebhookBody;
  try {
    body = (await request.json()) as WebhookBody;
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  // 본문의 secret 으로 icu 발신임을 검증.
  if (!body.secret || body.secret !== env.ICU_WEBHOOK_SECRET) {
    return json({ error: "bad secret" }, 401);
  }

  // 분석 완료(GPS 준비됨) 이벤트만 처리.
  const events = (body.events ?? []).filter((e) => e.type === "ACTIVITY_ANALYZED");
  let retryable = false;
  for (const ev of events) {
    try {
      await handleActivity(ev, env);
    } catch {
      retryable = true; // 일시적 실패 → icu 재전송에 맡김(claim 은 idempotent)
    }
  }
  // 5xx 면 icu 가 재전송한다. 처리 실패가 있으면 재시도 유도.
  return new Response(null, { status: retryable ? 500 : 200 });
}

async function handleActivity(ev: IcuEvent, env: Env): Promise<void> {
  const athleteId = ev.athlete_id;
  const activityId = ev.activity?.id;
  if (!athleteId || !activityId) return; // 정보 부족 → 무시

  const tok = await getToken(env, athleteId);
  if (!tok) return; // 우리 앱에 연동 안 된 athlete → 무시

  const coords = await fetchRouteCoords(activityId, tok.access_token);
  // 경로 → 점령 셀(버퍼 밴드 + 닫힌 루프 내부 채움).
  const payload = [...routeToTerritory(coords).values()].map((c) => ({
    k: `${c.x}_${c.y}`,
    x: c.x,
    y: c.y,
  }));
  // GPS 없으면 payload 가 빈 배열 → 그래도 호출(서버에 '사용함' 기록돼 재처리 안 됨).
  const claimedAt = ev.activity?.start_date_local ?? ev.timestamp ?? new Date().toISOString();
  await claimForUser(env, tok.user_id, payload, tok.display_name ?? "러너", claimedAt, activityId);
}

function sbHeaders(env: Env): Record<string, string> {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
  };
}

/** athlete_id 로 저장된 토큰·유저 조회(없으면 null) */
async function getToken(env: Env, athleteId: string): Promise<TokenRow | null> {
  const url =
    `${env.SUPABASE_URL}/rest/v1/icu_tokens` +
    `?athlete_id=eq.${encodeURIComponent(athleteId)}` +
    `&select=user_id,access_token,display_name&limit=1`;
  const res = await fetch(url, { headers: sbHeaders(env) });
  if (!res.ok) throw new Error(`token lookup ${res.status}`);
  const rows = (await res.json()) as TokenRow[];
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

/** 활동 GPS 스트림 → [lng, lat][] (icu latlng 스트림: data=위도, data2=경도) */
async function fetchRouteCoords(
  activityId: string,
  accessToken: string
): Promise<[number, number][]> {
  const res = await fetch(`${ICU_API}/activity/${activityId}/streams.json?types=latlng`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    if (res.status === 404) return []; // GPS 없음(실내 등)
    throw new Error(`streams ${res.status}`);
  }
  const streams = (await res.json()) as IcuStream[];
  const s = Array.isArray(streams) ? streams.find((x) => x.type === "latlng") : undefined;
  if (!s?.data || !s.data2) return [];
  const lat = s.data;
  const lng = s.data2;
  const n = Math.min(lat.length, lng.length);
  const coords: [number, number][] = [];
  for (let i = 0; i < n; i++) coords.push([lng[i], lat[i]]);
  return coords;
}

/** 서버 전용 점령 RPC 호출(service_role) */
async function claimForUser(
  env: Env,
  userId: string,
  cells: { k: string; x: number; y: number }[],
  ownerName: string,
  claimedAt: string,
  activityId: string
): Promise<void> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/claim_cells_for`, {
    method: "POST",
    headers: sbHeaders(env),
    body: JSON.stringify({
      p_user_id: userId,
      cells,
      p_owner_name: ownerName,
      p_claimed_at: claimedAt,
      p_activity_id: activityId,
    }),
  });
  if (!res.ok) throw new Error(`claim ${res.status} ${await res.text().catch(() => "")}`);
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
