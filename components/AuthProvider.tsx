"use client";

// 전역 카카오 인증 상태. 정적 export라 세션 확인·구독은 전부 브라우저에서.
// 예전엔 /me·/map 이 각자 getCurrentUser+onAuthChange 를 돌렸는데, 여기로 모아
// 앱 전체(헤더 포함)가 같은 로그인 상태를 공유한다. 로그인은 강제하지 않는다(소프트).
import { createContext, useContext, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabaseReady } from "@/lib/supabase";
import {
  getCurrentUser,
  onAuthChange,
  signInWithKakao,
  signOut as authSignOut,
} from "@/lib/auth";
import { upsertMyProfile } from "@/lib/stats";

interface AuthState {
  user: User | null;
  /** 초기 세션 확인 중(true면 로그인 여부 아직 모름) */
  loading: boolean;
  /** Supabase 설정 여부 — 미설정이면 로그인 UI 자체를 숨긴다 */
  ready: boolean;
  /** 카카오 로그인 시작(기본: 현재 페이지로 복귀) */
  signIn: (redirectTo?: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  // 설정 안 됐으면 로딩할 것도 없음 → 바로 false
  const [loading, setLoading] = useState(supabaseReady);

  // 초기 1회 세션 조회 + 변화 구독(카카오 콜백 복귀·로그아웃 포함)
  useEffect(() => {
    if (!supabaseReady) return;
    let alive = true;
    getCurrentUser()
      .then((u) => {
        if (alive) {
          setUser(u);
          setLoading(false);
        }
      })
      .catch(() => alive && setLoading(false));
    return onAuthChange((u) => {
      if (!alive) return;
      setUser(u);
      setLoading(false);
    });
  }, []);

  // 로그인되면 프로필 동기화(랭킹·땅따먹기에 닉네임·아바타 노출). 실패해도 무시.
  useEffect(() => {
    if (user) upsertMyProfile(user).catch(() => {});
  }, [user]);

  const value: AuthState = {
    user,
    loading,
    ready: supabaseReady,
    signIn: signInWithKakao,
    signOut: authSignOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** 전역 로그인 상태·동작. AuthProvider 안에서만 사용 가능. */
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
