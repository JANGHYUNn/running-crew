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
  // 들어온 웹훅 요약 로그(Workers Logs 에 보존). 시크릿 값은 안 남기고 일치여부만.
  const summary = (body.events ?? [])
    .map((e) => `${e.type}/${e.athlete_id}/${e.activity?.id}`)
    .join(", ");
  console.log(
    `[icu-webhook] hit secretOk=${body.secret === env.ICU_WEBHOOK_SECRET} events=[${summary}]`
  );

  // 본문의 secret 으로 icu 발신임을 검증.
  if (!body.secret || body.secret !== env.ICU_WEBHOOK_SECRET) {
    return json({ error: "bad secret" }, 401);
  }

  // 활동 관련 이벤트를 폭넓게 처리(가민→icu 직결 기준. Strava 경유 활동엔 웹훅이 오지 않음).
  //   ACTIVITY_UPLOADED : 새 활동 업로드. 새 런을 잡는 주 경로(이게 빠져 새 런이 지도에 안 떴음).
  //   ACTIVITY_ANALYZED : 기존 활동 재분석. 업로드 때 GPS 가 늦으면 여기서 점령된다.
  //   ACTIVITY_UPDATED  : 이름 변경 등 수정.
  // 같은 활동이 여러 이벤트로 와도 territory_activities 로 1회만 점령(idempotent). 단, GPS 0좌표면
  // '사용함' 기록을 남기지 않아(handleActivity), 나중에 GPS 가 붙은 웹훅이 점령할 수 있게 한다.
  const ACTIVITY_EVENTS = new Set(["ACTIVITY_UPLOADED", "ACTIVITY_ANALYZED", "ACTIVITY_UPDATED"]);
  const events = (body.events ?? []).filter((e) => e.type != null && ACTIVITY_EVENTS.has(e.type));
  let retryable = false;
  for (const ev of events) {
    try {
      await handleActivity(ev, env);
    } catch (e) {
      console.log(`[icu-webhook] error: ${String(e)}`);
      retryable = true; // 일시적 실패 → icu 재전송에 맡김(claim 은 idempotent)
    }
  }
  // 5xx 면 icu 가 재전송한다. 처리 실패가 있으면 재시도 유도.
  return new Response(null, { status: retryable ? 500 : 200 });
}

// intervals.icu 의 start_date_local 은 타임존 오프셋이 없는 "현지시각" 문자열(예 "2026-06-13T20:10:50").
// 그대로 timestamptz 로 저장하면 UTC 로 해석돼 KST(+09:00)만큼 미래로 기록된다.
// 크루 활동지역(서울, lib/territory.ts REF_LAT=37.5)을 기준으로 +09:00 을 붙여 올바른 순간으로 보정.
// 이미 오프셋(Z 또는 ±hh:mm)이 있는 값(ev.timestamp 등)은 그대로 둔다.
const KST_OFFSET = "+09:00";
function toAbsoluteISO(raw: string): string {
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(raw)) return raw;
  return `${raw}${KST_OFFSET}`;
}

async function handleActivity(ev: IcuEvent, env: Env): Promise<void> {
  const athleteId = ev.athlete_id;
  const activityId = ev.activity?.id;
  if (!athleteId || !activityId) return; // 정보 부족 → 무시

  const tok = await getToken(env, athleteId);
  if (!tok) {
    // 웹훅은 왔는데 이 athlete 의 토큰이 없음 → 그 런이 비는 대표 원인. 로그로 남긴다.
    console.log(`[icu-webhook] ${activityId}: athlete=${athleteId} 토큰 없음 → 무시`);
    return;
  }

  const coords = await fetchRouteCoords(activityId, tok.access_token);
  // GPS 좌표가 없으면(업로드 직후 분석 전 / 실내 활동) 점령을 보류하고 '사용함' 기록도 남기지 않는다.
  // 기록을 남기면 나중에 GPS 가 붙은 ACTIVITY_ANALYZED 웹훅이 와도 -1(이미 사용)로 영구 스킵되기 때문.
  if (coords.length === 0) {
    console.log(`[icu-webhook] ${activityId}: athlete=${athleteId} GPS 없음(coords=0) → 점령 보류(미기록)`);
    return;
  }
  // 경로 → 점령 셀(버퍼 밴드 + 닫힌 루프 내부 채움).
  const payload = [...routeToTerritory(coords).values()].map((c) => ({
    k: `${c.x}_${c.y}`,
    x: c.x,
    y: c.y,
  }));
  // start_date_local 은 오프셋이 없으므로 KST 로 보정(아래 toAbsoluteISO). timestamp 는 이미 오프셋 포함.
  const claimedAt = toAbsoluteISO(
    ev.activity?.start_date_local ?? ev.timestamp ?? new Date().toISOString()
  );
  const claimed = await claimForUser(
    env, tok.user_id, payload, tok.display_name ?? "러너", claimedAt, activityId
  );
  console.log(
    `[icu-webhook] ${activityId}: athlete=${athleteId} coords=${coords.length} ` +
      `cells=${payload.length} claimed=${claimed}` // claimed: 점령/갱신 칸수, -1=이미 사용한 활동
  );
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
  for (let i = 0; i < n; i++) {
    const lo = lng[i];
    const la = lat[i];
    // GPS 드롭 샘플은 스트림에 null 로 들어온다. JS 에선 null/스텝 = 0 → 셀 (0,0)('Null Island')로
    // 둔갑해 보간·bbox 가 폭주(CPU 초과)한다. 비유한값(null/NaN)과 정확한 (0,0)만 버린다.
    // ⚠️ 위치(한국권 등)로는 거르지 않는다 — 해외 런·전지훈련 좌표는 그대로 점령돼야 한다.
    if (!Number.isFinite(lo) || !Number.isFinite(la) || (lo === 0 && la === 0)) continue;
    coords.push([lo, la]);
  }
  return coords;
}

/** 서버 전용 점령 RPC 호출(service_role). 반환: 점령/갱신된 칸수(-1=이미 사용한 활동) */
async function claimForUser(
  env: Env,
  userId: string,
  cells: { k: string; x: number; y: number }[],
  ownerName: string,
  claimedAt: string,
  activityId: string
): Promise<number> {
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
  return Number(await res.text().catch(() => "0")) || 0;
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
