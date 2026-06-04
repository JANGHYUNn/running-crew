// Supabase 클라이언트 싱글톤.
// 정적 export라 모든 호출은 브라우저에서 직접 이뤄진다(서버 0). anon key는 공개돼도
// 무방한 값이며, 데이터 보호는 Supabase RLS 정책으로 한다(supabase/schema.sql 참고).
//
// 환경변수가 없으면 client는 null → 페이지에서 "설정 필요" 안내를 띄운다(빌드는 통과).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** 설정 여부. 페이지에서 안내 분기에 사용 */
export const supabaseReady = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

/** 설정돼 있으면 클라이언트, 아니면 null */
export function getSupabase(): SupabaseClient | null {
  if (!supabaseReady) return null;
  if (!client) client = createClient(url!, anonKey!);
  return client;
}
