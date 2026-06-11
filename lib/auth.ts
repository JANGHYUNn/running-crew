// 카카오 로그인(Supabase OAuth) 인증 레이어.
// 정적 export라 모든 인증은 브라우저에서 직접 처리. getSupabase() 클라이언트의 기본 옵션
// (detectSessionInUrl/persistSession/PKCE)이 OAuth 콜백·세션 유지를 자동으로 해준다.
import { getSupabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

/**
 * 카카오 로그인 시작 → 카카오 동의화면으로 이동 후 복귀.
 * @param redirectTo 복귀할 앱 내 경로(기본: 현재 페이지). 예: "/map"
 */
export async function signInWithKakao(redirectTo?: string): Promise<void> {
  const client = getSupabase();
  if (!client) throw new Error("Supabase 가 설정되지 않았습니다.");
  // 기본은 로그인을 누른 현재 페이지로 복귀(예: /map 에서 로그인하면 /map 으로).
  const path = redirectTo ?? window.location.pathname;
  // 주의: Supabase 카카오 provider 는 account_email 을 강제 요청한다(클라 scopes 로 제거 불가).
  // → 카카오 앱을 비즈앱으로 전환하고 account_email 동의항목을 활성화해야 로그인이 된다.
  const { error } = await client.auth.signInWithOAuth({
    provider: "kakao",
    options: { redirectTo: `${window.location.origin}${path}` },
  });
  if (error) throw new Error(error.message);
}

/** 로그아웃 */
export async function signOut(): Promise<void> {
  const client = getSupabase();
  if (!client) return;
  await client.auth.signOut();
}

/** 현재 로그인 사용자(없으면 null) */
export async function getCurrentUser(): Promise<User | null> {
  const client = getSupabase();
  if (!client) return null;
  const { data } = await client.auth.getUser();
  return data.user ?? null;
}

/** 로그인 상태 변화 구독. 반환된 함수로 구독 해제 */
export function onAuthChange(cb: (user: User | null) => void): () => void {
  const client = getSupabase();
  if (!client) return () => {};
  const { data } = client.auth.onAuthStateChange((_event, session) => {
    cb(session?.user ?? null);
  });
  return () => data.subscription.unsubscribe();
}

/** 카카오 메타데이터에서 표시용 닉네임 추출(필드명이 환경따라 달라 폴백 체인) */
export function nicknameOf(user: User): string {
  const m = user.user_metadata ?? {};
  return (
    m.name ||
    m.full_name ||
    m.preferred_username ||
    m.nickname ||
    m.user_name ||
    "러너"
  );
}

/** 카카오 프로필 이미지 URL(없으면 null) */
export function avatarOf(user: User): string | null {
  const m = user.user_metadata ?? {};
  return m.avatar_url || m.picture || null;
}
