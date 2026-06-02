// Strava 연동 (프론트엔드).
//
// 시크릿이 필요한 토큰 교환/갱신은 /api/strava/* (Cloudflare Worker)가 처리한다.
// 활동 조회도 워커가 프록시하므로 CORS 이슈가 없다.
// 토큰은 localStorage에 저장(스코프 activity:read 라 민감도 낮음).
//
// client_id 는 워커의 /api/strava/config 에서 런타임에 받아온다(빌드 변수 불필요).

const SCOPE = "activity:read";
const STORAGE_KEY = "strava_tokens";

/** 워커에서 client_id 를 받아온다. 빈 문자열이면 서버에 키 미설정(=연동 불가). */
export async function fetchClientId(): Promise<string> {
  try {
    const res = await fetch("/api/strava/config");
    if (!res.ok) return "";
    const d = await res.json();
    return typeof d.clientId === "string" ? d.clientId : "";
  } catch {
    return "";
  }
}

export interface StravaTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number; // epoch seconds
  athleteName?: string;
}

export interface StravaActivity {
  id: number;
  name: string;
  type: string; // "Run", "Ride", ...
  distance: number; // meters
  moving_time: number; // seconds
  start_date_local: string; // ISO 문자열
}

/** Strava 인증 동의 화면 URL. redirectUri 는 현재 출처 + /card 를 넘긴다. */
export function buildAuthorizeUrl(clientId: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    approval_prompt: "auto",
    scope: SCOPE,
  });
  return `https://www.strava.com/oauth/authorize?${params}`;
}

// ---- 토큰 저장소 (localStorage) ----
export function loadTokens(): StravaTokens | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StravaTokens) : null;
  } catch {
    return null;
  }
}
function saveTokens(t: StravaTokens) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(t));
}
export function clearTokens() {
  localStorage.removeItem(STORAGE_KEY);
}

/** redirect로 돌아온 code 를 토큰으로 교환하고 저장. athlete 이름도 추출. */
export async function exchangeCode(code: string): Promise<StravaTokens> {
  const res = await fetch("/api/strava/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) throw new Error("Strava 토큰 교환에 실패했습니다");
  const d = await res.json();
  const athlete = d.athlete;
  const tokens: StravaTokens = {
    access_token: d.access_token,
    refresh_token: d.refresh_token,
    expires_at: d.expires_at,
    athleteName: athlete
      ? `${athlete.firstname ?? ""} ${athlete.lastname ?? ""}`.trim()
      : undefined,
  };
  saveTokens(tokens);
  return tokens;
}

/** 만료 시 자동 갱신 후 유효한 access_token 반환. 실패하면 토큰 제거 후 null. */
async function getValidAccessToken(): Promise<string | null> {
  const t = loadTokens();
  if (!t) return null;

  const now = Math.floor(Date.now() / 1000);
  if (t.expires_at - 60 > now) return t.access_token; // 아직 유효(60초 여유)

  const res = await fetch("/api/strava/refresh", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refresh_token: t.refresh_token }),
  });
  if (!res.ok) {
    clearTokens();
    return null;
  }
  const d = await res.json();
  saveTokens({
    access_token: d.access_token,
    refresh_token: d.refresh_token,
    expires_at: d.expires_at,
    athleteName: t.athleteName,
  });
  return d.access_token;
}

/** 최근 러닝 활동만 가져온다(달리기 외 종목 제외). */
export async function fetchRecentRuns(): Promise<StravaActivity[]> {
  const token = await getValidAccessToken();
  if (!token) throw new Error("Strava 인증이 필요합니다");

  const res = await fetch("/api/strava/activities", {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("활동을 불러오지 못했습니다");
  const list = (await res.json()) as StravaActivity[];
  return Array.isArray(list) ? list.filter((a) => a.type === "Run") : [];
}

/** Strava 활동 → 카드 입력 폼 값으로 변환. */
export function activityToCardInputs(a: StravaActivity): {
  distance: string;
  duration: string;
  date: string;
  name: string;
} {
  const distance = (a.distance / 1000).toFixed(2);

  const total = a.moving_time;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  const duration = h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;

  return {
    distance,
    duration,
    date: a.start_date_local.slice(0, 10), // YYYY-MM-DD
    name: a.name,
  };
}
