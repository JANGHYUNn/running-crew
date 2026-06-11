// intervals.icu 연동(OAuth) 클라이언트 레이어 — 지도 레이어 기능 전용.
//
// 흐름:
//   startIcuAuth() → icu 동의화면 이동
//   → /icu/callback 에서 exchangeAndStore(code)
//   → 토큰을 Supabase(icu_tokens, 카카오 user_id 귀속, supabase/icu-tokens.sql)에 저장
//   → icuGet()이 Bearer 로 /api/v1 직접 호출(/v1 은 CORS 지원). 만료 임박 시 자동 refresh.
//
// client_secret 교환만 Cloudflare Worker(/api/icu/token, 같은 도메인)가 담당해 secret 을 은닉한다.
import { getSupabase } from "@/lib/supabase";
import { nicknameOf } from "@/lib/auth";

const ICU_AUTHORIZE = "https://intervals.icu/oauth/authorize";
const ICU_API = "https://intervals.icu/api/v1";
const TOKEN_ENDPOINT = "/api/icu/token"; // 우리 Cloudflare Worker
// ⚠️ 앱 등록 시 발급되는 정확한 scope 명으로 확정할 것(활동 읽기). 임시값.
const SCOPE = "ACTIVITY:READ";

const CLIENT_ID = process.env.NEXT_PUBLIC_ICU_CLIENT_ID;
/** client_id 설정 여부(페이지 분기용) */
export const icuConfigured = Boolean(CLIENT_ID);

export interface IcuActivity {
  id: string;
  source: string | null;
  type: string | null;
  name: string | null;
  start_date_local: string | null;
}

function redirectUri(): string {
  return `${window.location.origin}/icu/callback`;
}

function sb() {
  const c = getSupabase();
  if (!c) throw new Error("Supabase 가 설정되지 않았습니다.");
  return c;
}

async function currentUserId(): Promise<string> {
  const { data } = await sb().auth.getUser();
  if (!data.user) throw new Error("먼저 카카오 로그인이 필요합니다.");
  return data.user.id;
}

// ── OAuth 시작 / state 검증 ─────────────────────────────
/** state(CSRF) 저장 후 icu 동의화면으로 이동 */
export function startIcuAuth(): void {
  if (!CLIENT_ID) throw new Error("intervals.icu client id 가 설정되지 않았습니다.");
  const state = crypto.randomUUID();
  sessionStorage.setItem("icu_oauth_state", state);
  const p = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPE,
    state,
  });
  window.location.href = `${ICU_AUTHORIZE}?${p.toString()}`;
}

/** 콜백에서 돌아온 state 가 우리가 보낸 것과 일치하는지 검증 */
export function verifyState(returned: string | null): boolean {
  const saved = sessionStorage.getItem("icu_oauth_state");
  sessionStorage.removeItem("icu_oauth_state");
  return Boolean(returned && saved && returned === saved);
}

// ── 토큰 교환 · 저장 · 갱신 ──────────────────────────────
interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  athlete_id?: string;
  athlete?: { id?: string };
}

async function callTokenEndpoint(payload: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(`토큰 교환 실패 (${res.status}) ${msg}`.trim());
  }
  return res.json();
}

/** 콜백의 code 를 토큰으로 교환해 저장 */
export async function exchangeAndStore(code: string): Promise<void> {
  const t = await callTokenEndpoint({ code, redirect_uri: redirectUri() });
  await storeToken(t);
}

async function storeToken(t: TokenResponse): Promise<void> {
  const { data } = await sb().auth.getUser();
  if (!data.user) throw new Error("먼저 카카오 로그인이 필요합니다.");
  // intervals.icu 는 refresh token 을 쓰지 않고 장수명 access token 만 발급한다.
  // (재인증할 때마다 새 access token 이 발급돼 기존 토큰을 대체)
  if (!t.access_token) throw new Error("access token 이 없습니다.");
  // display_name 을 함께 저장 → 웹훅 점령(서버) 때 owner_name 으로 쓴다.
  const { error } = await sb()
    .from("icu_tokens")
    .upsert({
      user_id: data.user.id,
      access_token: t.access_token,
      athlete_id: t.athlete_id ?? t.athlete?.id ?? null,
      scope: t.scope ?? null,
      display_name: nicknameOf(data.user),
      updated_at: new Date().toISOString(),
    });
  if (error) throw new Error(error.message);
}

interface StoredToken {
  access_token: string;
  athlete_id: string | null;
}

/** 연동 여부 + 저장된 토큰(없으면 null) */
export async function getIcuConnection(): Promise<StoredToken | null> {
  const userId = await currentUserId();
  const { data, error } = await sb()
    .from("icu_tokens")
    .select("access_token, athlete_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as StoredToken) ?? null;
}

/** 연동 해제(토큰 삭제) */
export async function disconnectIcu(): Promise<void> {
  const userId = await currentUserId();
  const { error } = await sb().from("icu_tokens").delete().eq("user_id", userId);
  if (error) throw new Error(error.message);
}

/** 저장된 토큰 반환. intervals.icu access token 은 장수명이라 갱신 로직이 없다.
 *  (만료/철회 시 API 가 401 → icuGet 에서 재연동 안내) */
async function getValidToken(): Promise<StoredToken> {
  const tok = await getIcuConnection();
  if (!tok) throw new Error("intervals.icu 연동이 필요합니다.");
  return tok;
}

// ── icu API 호출 ────────────────────────────────────────
async function icuGet<T>(path: string): Promise<T> {
  const tok = await getValidToken();
  const res = await fetch(`${ICU_API}${path}`, {
    headers: { Authorization: `Bearer ${tok.access_token}` },
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error("intervals.icu 연동이 만료되었어요. 연동을 해제하고 다시 연결해 주세요.");
  }
  if (!res.ok) throw new Error(`intervals.icu API 오류 (${res.status})`);
  return res.json();
}

async function athleteId(): Promise<string> {
  const tok = await getValidToken();
  // OAuth 토큰과 함께 저장된 athlete id. 없으면 "0"(self) 시도.
  return tok.athlete_id ?? "0";
}

/** 기간 내 활동 목록 (oldest·newest 필수 — 없으면 icu 가 422) */
export async function listActivities(oldest: string, newest: string): Promise<IcuActivity[]> {
  const id = await athleteId();
  const data = await icuGet<IcuActivity[]>(
    `/athlete/${id}/activities?oldest=${oldest}&newest=${newest}`
  );
  return Array.isArray(data) ? data : [];
}

/** 활동의 GPS 경로 → [lng, lat] 좌표 배열(GeoJSON 순서).
 *  icu latlng 스트림은 data=위도, data2=경도 의 평행 배열로 온다(실측 확인). */
export async function getRouteCoords(activityId: string): Promise<[number, number][]> {
  const streams = await icuGet<{ type: string; data?: number[]; data2?: number[] }[]>(
    `/activity/${activityId}/streams.json?types=latlng`
  );
  const s = Array.isArray(streams) ? streams.find((x) => x.type === "latlng") : undefined;
  if (!s?.data || !s.data2) return [];
  const lat = s.data;
  const lng = s.data2;
  const n = Math.min(lat.length, lng.length);
  const coords: [number, number][] = [];
  for (let i = 0; i < n; i++) coords.push([lng[i], lat[i]]); // GeoJSON = [lng, lat]
  return coords;
}

/** 좌표 배열 → GeoJSON LineString Feature */
export function coordsToGeoJSON(coords: [number, number][]) {
  return {
    type: "Feature" as const,
    geometry: { type: "LineString" as const, coordinates: coords },
    properties: {},
  };
}
