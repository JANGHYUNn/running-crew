-- RLS 정책을 authenticated 역할에도 허용하도록 수정
--
-- 증상: 카카오 로그인(/me)을 한 사용자가 시즌·조 추가 시
--       "new row violates row-level security policy for table seasons" 에러.
-- 원인: 기존 정책이 to anon 으로만 허용됨. 로그인하면 역할이 authenticated 가 되어
--       정책에 매칭되지 않아 차단됨. (로그인 안 한 로컬에서는 anon 이라 통과)
-- 조치: anon + authenticated 두 역할 모두에 전체 허용 정책 재생성.
--
-- Supabase 대시보드 → SQL Editor 에 통째로 붙여넣고 실행하세요. (재실행 안전)

do $$
declare t text;
begin
  foreach t in array array['seasons','teams','members','runs'] loop
    execute format('drop policy if exists %I_all on %I', t, t);
    execute format(
      'create policy %I_all on %I for all to anon, authenticated using (true) with check (true)',
      t, t);
  end loop;
end $$;
