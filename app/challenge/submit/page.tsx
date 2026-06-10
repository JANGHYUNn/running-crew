"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { crew } from "@/lib/crew";
import { supabaseReady } from "@/lib/supabase";
import { runOcr } from "@/lib/ocr";
import {
  addRun,
  deleteRun,
  findRunByImageHash,
  getActiveSeason,
  listMembers,
  listRunsByMember,
  listTeams,
  memberLabel,
  type Member,
  type Run,
  type Season,
  type Team,
} from "@/lib/challenge";
import { compressImage } from "@/lib/image";
import { uploadProof } from "@/lib/storage";
import { formatDateDot, formatKm, todayISO } from "@/lib/format";
import SupabaseNotice from "@/components/SupabaseNotice";

export default function SubmitPage() {
  const [season, setSeason] = useState<Season | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [memberId, setMemberId] = useState("");
  const [distance, setDistance] = useState("");
  const [runDate, setRunDate] = useState(""); // 사용자가 먼저 날짜를 고르게 함
  const [note, setNote] = useState("");

  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [imageHash, setImageHash] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [myRuns, setMyRuns] = useState<Run[]>([]);
  const [justAdded, setJustAdded] = useState(false);

  // 초기 로드: 시즌 + 조 + 멤버
  useEffect(() => {
    if (!supabaseReady) return;
    (async () => {
      try {
        const s = await getActiveSeason(todayISO());
        setSeason(s);
        if (s) {
          const t = await listTeams(s.id);
          setTeams(t);
          const m = await listMembers(t.map((x) => x.id));
          setMembers(m);
          // 항상 '— 선택 —'이 기본 (이전 선택 복원하지 않음)
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "불러오기 실패");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // 멤버 선택 시: 기억 + 내 기록 로드 (멤버 미선택 시엔 '내 기록' 영역 자체가 숨겨짐)
  useEffect(() => {
    if (!memberId || !season) return;
    let cancelled = false;
    listRunsByMember(memberId, season)
      .then((r) => !cancelled && setMyRuns(r))
      .catch(() => !cancelled && setMyRuns([]));
    return () => {
      cancelled = true;
    };
  }, [memberId, season]);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setOcrError(null);
    setDistance(""); // 새 이미지 → 이전 사진의 거리 잔존 방지(이번 사진 값으로만)
    setOcrBusy(true);
    setOcrProgress(0);
    try {
      const dataUrl = await fileToDataUrl(file);
      setImageFile(file); // 증빙 업로드용 원본 보관
      setImagePreview(dataUrl); // 미리보기
      setImageHash(await sha256Hex(file)); // 중복 차단용 해시
      const { stats } = await runOcr(dataUrl, setOcrProgress);
      if (stats.distance) setDistance(stats.distance);
      else setOcrError("거리 자동인식 실패 — 거리 칸에 직접 입력해 주세요.");
    } catch (err) {
      console.error(err);
      setOcrError(
        (err instanceof Error ? err.message : String(err)) ||
          "이미지 인식에 실패했어요."
      );
    } finally {
      setOcrBusy(false);
      e.target.value = ""; // 같은 파일 다시 선택 가능하게
    }
  }

  async function handleSubmit() {
    const km = Number(distance);
    if (!memberId) return alert("이름을 선택해 주세요.");
    if (!km || km <= 0) return alert("거리를 올바르게 입력해 주세요.");
    if (!imageFile || !imageHash) return alert("인증 이미지를 첨부해 주세요.");
    // 중복 제출 가드: 같은 날짜·거리 기록이 이미 있으면 확인
    const dup = myRuns.some(
      (r) => r.run_date === runDate && Number(r.distance_km) === km
    );
    if (dup && !confirm(`${runDate}에 ${km}km 기록이 이미 있어요. 그래도 추가할까요?`))
      return;
    setSubmitting(true);
    try {
      // 이미지 중복 차단: 같은 인증 이미지가 이미 등록됐으면 거부
      const existing = await findRunByImageHash(imageHash);
      if (existing) {
        alert("이미 등록된 인증 이미지예요. (같은 이미지는 한 번만 등록돼요)");
        return;
      }
      // 압축 후 Storage 업로드 → 증빙 URL
      const blob = await compressImage(imageFile);
      const imageUrl = await uploadProof(blob);

      await addRun({
        memberId,
        distanceKm: km,
        runDate,
        note: note.trim() || null,
        imageUrl,
        imageHash,
      });
      setDistance("");
      setNote("");
      setImageHash(null);
      setImageFile(null);
      setImagePreview(null);
      setJustAdded(true);
      setTimeout(() => setJustAdded(false), 1800);
      if (season) setMyRuns(await listRunsByMember(memberId, season));
    } catch (e) {
      alert(e instanceof Error ? e.message : "제출 실패");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("이 기록을 삭제할까요?")) return;
    try {
      await deleteRun(id);
      setMyRuns((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      alert(e instanceof Error ? e.message : "삭제 실패");
    }
  }

  if (!supabaseReady) return <SupabaseNotice />;

  const myTotal = myRuns.reduce((s, r) => s + Number(r.distance_km), 0);
  const distanceValid = Number(distance) > 0;
  const myMember = members.find((m) => m.id === memberId);
  const myName = myMember ? memberLabel(members, myMember) : "";
  const teamName = teams.find(
    (t) => t.id === members.find((m) => m.id === memberId)?.team_id
  )?.name;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-xl font-bold">🏃 기록 제출</h1>
      {season ? (
        <p className="mb-6 text-sm text-neutral-500">
          {season.name} · {formatDateDot(season.start_date)}~
          {formatDateDot(season.end_date)}
        </p>
      ) : (
        <p className="mb-6 text-sm text-neutral-500">진행 중인 시즌이 없습니다.</p>
      )}

      {loading && <p className="py-10 text-center text-neutral-400">불러오는 중…</p>}
      {error && (
        <p className="rounded-xl bg-red-50 p-4 text-sm text-red-600">{error}</p>
      )}

      {!loading && season && members.length === 0 && (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-500">
          아직 조원이 없습니다.{" "}
          <Link href="/challenge/admin" className="underline">
            관리 화면
          </Link>
          에서 추가하세요.
        </div>
      )}

      {!loading && season && members.length > 0 && (
        <>
          <div className="rounded-2xl border border-neutral-200 bg-white p-5">
            {/* 이름 선택 */}
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-neutral-500">
                이름 (내가 누구인지)
              </span>
              <select
                value={memberId}
                onChange={(e) => setMemberId(e.target.value)}
                className="input"
              >
                <option value="">— 선택 —</option>
                {teams.map((t) => (
                  <optgroup key={t.id} label={t.name}>
                    {members
                      .filter((m) => m.team_id === t.id)
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {memberLabel(members, m)}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </label>
            {teamName && (
              <p className="mt-1 text-xs text-neutral-400">소속: {teamName}</p>
            )}

            {/* 1) 날짜 먼저 선택 → 2) 거리·이미지 입력이 나타남 */}
            <label className="mt-4 block">
              <span className="mb-1 block text-xs font-medium text-neutral-500">
                날짜
              </span>
              <input
                type="date"
                value={runDate}
                max={season.end_date}
                min={season.start_date}
                onChange={(e) => setRunDate(e.target.value)}
                className="input"
              />
            </label>
            {!runDate && (
              <p className="mt-2 text-xs text-neutral-400">
                날짜를 선택하면 거리·인증 이미지 입력이 나타나요.
              </p>
            )}

            {runDate && (
              <>
                <label className="mt-4 block">
                  <span className="mb-1 block text-xs font-medium text-neutral-500">
                    거리 (km)
                  </span>
                  <input
                    value={distance}
                    onChange={(e) => setDistance(e.target.value)}
                    className="input"
                    placeholder="8.24"
                    inputMode="decimal"
                  />
                </label>

                <label className="mt-4 block">
              <span className="mb-1 block text-xs font-medium text-neutral-500">
                메모 (선택)
              </span>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="input"
                placeholder="한강 반포지구 정기런"
              />
            </label>

            {/* 인증 이미지 (필수) */}
            <div className="mt-4 rounded-xl bg-neutral-50 p-3">
              <span className="block text-xs font-medium text-neutral-500">
                인증 이미지 <span className="text-red-500">*</span> — 기록 스샷 올리면
                거리 자동인식 + 증빙으로 보관돼요
              </span>
              <input
                type="file"
                accept="image/*"
                onChange={onUpload}
                disabled={ocrBusy || submitting}
                className="mt-2 block w-full text-sm text-neutral-500 file:mr-3 file:rounded-lg file:border-0 file:bg-neutral-200 file:px-3 file:py-1.5 file:text-sm"
              />
              {imagePreview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imagePreview}
                  alt="첨부한 인증 이미지 미리보기"
                  className="mt-3 max-h-44 rounded-lg border border-neutral-200"
                />
              )}
              {ocrBusy && (
                <p className="mt-2 text-xs text-neutral-500">
                  인식 중… {Math.round(ocrProgress * 100)}% (인식 후 거리 칸을
                  확인·수정하세요)
                </p>
              )}
              {ocrError && (
                <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm font-bold text-amber-700 ring-1 ring-amber-300">
                  <span aria-hidden>⚠️</span>
                  <span className="break-all">{ocrError}</span>
                </p>
              )}
              {!ocrBusy && imageFile && (
                <p className="mt-2 text-xs text-green-600">
                  ✓ 인증 이미지 첨부됨 — 같은 이미지 중복은 자동 차단돼요
                </p>
              )}
            </div>

            <button
              onClick={handleSubmit}
              disabled={submitting || ocrBusy || !imageFile || !distanceValid}
              className="mt-5 w-full rounded-xl py-3 font-bold text-white transition disabled:opacity-50"
              style={{ backgroundColor: crew.primary }}
            >
              {submitting
                ? "업로드 중…"
                : justAdded
                  ? "✓ 추가됨!"
                  : !imageFile
                    ? "인증 이미지를 먼저 첨부하세요"
                    : !distanceValid
                      ? "거리를 입력하세요"
                      : "기록 추가"}
                </button>
              </>
            )}
          </div>

          {/* 내 기록 */}
          {memberId && (
            <div className="mt-6">
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="font-bold">
                  {myName ? `${myName}님 ` : ""}이번 시즌 기록
                </h2>
                <span className="text-sm text-neutral-500">
                  합계{" "}
                  <span className="tnum font-bold text-neutral-800">
                    {formatKm(myTotal)}
                  </span>{" "}
                  km · {myRuns.length}회
                </span>
              </div>
              {myRuns.length === 0 ? (
                <p className="rounded-xl border border-dashed border-neutral-200 p-4 text-center text-sm text-neutral-400">
                  아직 기록이 없어요. 위에서 첫 기록을 추가해 보세요!
                </p>
              ) : (
                <ul className="divide-y divide-neutral-100 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
                  {myRuns.map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center justify-between px-4 py-3 text-sm"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        {r.image_url && (
                          <a
                            href={r.image_url}
                            target="_blank"
                            rel="noreferrer"
                            className="shrink-0"
                            title="인증 이미지 보기"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={r.image_url}
                              alt="인증"
                              className="h-10 w-10 rounded-md border border-neutral-200 object-cover"
                            />
                          </a>
                        )}
                        <div className="min-w-0">
                          <span className="tnum font-bold">
                            {formatKm(Number(r.distance_km))} km
                          </span>
                          <span className="ml-2 text-neutral-400">
                            {formatDateDot(r.run_date)}
                          </span>
                          {r.note && (
                            <span className="ml-2 truncate text-neutral-400">
                              {r.note}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => handleDelete(r.id)}
                        className="shrink-0 text-xs text-neutral-400 hover:text-red-500"
                      >
                        삭제
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

async function sha256Hex(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
