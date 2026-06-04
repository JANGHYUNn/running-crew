-- 증빙 이미지 저장용 Storage 버킷 + 정책
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 실행하세요. (한 번만)
--
-- proofs: 공개 버킷(로그인 없는 크루 앱이라 누구나 열람). anon 업로드/조회/삭제 허용.
-- 보안 수준은 RLS 전체허용과 동일(신뢰 그룹 전제). 이미지는 클라이언트에서 압축 후 업로드.

insert into storage.buckets (id, name, public)
values ('proofs', 'proofs', true)
on conflict (id) do nothing;

drop policy if exists proofs_read   on storage.objects;
drop policy if exists proofs_insert on storage.objects;
drop policy if exists proofs_delete on storage.objects;

create policy proofs_read on storage.objects
  for select to anon using (bucket_id = 'proofs');
create policy proofs_insert on storage.objects
  for insert to anon with check (bucket_id = 'proofs');
create policy proofs_delete on storage.objects
  for delete to anon using (bucket_id = 'proofs');
