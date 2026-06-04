"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { crew } from "@/lib/crew";
import { supabaseReady } from "@/lib/supabase";
import {
  createMember,
  createSeason,
  createTeam,
  deleteMember,
  deleteSeason,
  deleteTeam,
  listMembers,
  listSeasons,
  listTeams,
  updateMember,
  updateSeason,
  type Member,
  type Season,
  type Team,
} from "@/lib/challenge";
import { formatDateDot, todayISO } from "@/lib/format";
import SupabaseNotice from "@/components/SupabaseNotice";

// 관리 화면 진입 PIN. 빌드 시 인라인됨(약한 보호 — 실수 삭제 방지용).
// TODO: PIN 게이트 임시 비활성화(더 고민 후 재활성화). 아래 게이트 블록과 함께 주석 해제.
// const ADMIN_PIN = process.env.NEXT_PUBLIC_ADMIN_PIN ?? "";

export default function AdminPage() {
  // PIN 게이트 임시 비활성화
  // const [unlocked, setUnlocked] = useState(ADMIN_PIN.length === 0);
  // const [pinInput, setPinInput] = useState("");

  const [seasons, setSeasons] = useState<Season[]>([]);
  const [seasonId, setSeasonId] = useState("");
  const [teams, setTeams] = useState<Team[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // 새 시즌 폼
  const init = monthRange(todayISO());
  const [sName, setSName] = useState(init.name);
  const [sStart, setSStart] = useState(init.start);
  const [sEnd, setSEnd] = useState(init.end);
  const [newTeam, setNewTeam] = useState("");
  const [showNewSeason, setShowNewSeason] = useState(false);
  const [showEditSeason, setShowEditSeason] = useState(false);

  // 선택 시즌 수정용(언컨트롤드 + key 리셋 → 상태 동기화 effect 불필요)
  const editNameRef = useRef<HTMLInputElement>(null);
  const editStartRef = useRef<HTMLInputElement>(null);
  const editEndRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!supabaseReady) return;
    reloadSeasons().finally(() => setLoading(false));
    // 마운트 시 1회만 — reloadSeasons 는 안정적 의존성 불필요
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!seasonId) return;
    reloadTeamsAndMembers(seasonId);
  }, [seasonId]);

  async function reloadSeasons() {
    const list = await listSeasons();
    setSeasons(list);
    // 자동 선택하지 않음 → 처음엔 시즌 '목록'에 머무름. 없어진 시즌만 해제.
    if (seasonId && !list.some((s) => s.id === seasonId)) setSeasonId("");
  }

  async function reloadTeamsAndMembers(sid: string) {
    const t = await listTeams(sid);
    setTeams(t);
    setMembers(await listMembers(t.map((x) => x.id)));
  }

  async function run<T>(fn: () => Promise<T>) {
    setBusy(true);
    try {
      return await fn();
    } catch (e) {
      alert(e instanceof Error ? e.message : "작업 실패");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateSeason() {
    if (!sName.trim()) return alert("시즌 이름을 입력하세요.");
    if (sStart > sEnd) return alert("시작일이 종료일보다 늦습니다.");
    await run(async () => {
      const s = await createSeason(sName.trim(), sStart, sEnd);
      await reloadSeasons();
      setSeasonId(s.id);
      setShowNewSeason(false);
    });
  }

  async function handleUpdateSeason() {
    const name = editNameRef.current?.value.trim() ?? "";
    const start = editStartRef.current?.value ?? "";
    const end = editEndRef.current?.value ?? "";
    if (!name) return alert("시즌 이름을 입력하세요.");
    if (!start || !end) return alert("시작일·종료일을 입력하세요.");
    if (start > end) return alert("시작일이 종료일보다 늦습니다.");
    await run(async () => {
      await updateSeason(seasonId, { name, start_date: start, end_date: end });
      await reloadSeasons();
      setShowEditSeason(false);
      alert("시즌이 수정되었습니다.");
    });
  }

  async function handleDeleteSeason() {
    if (!confirm("이 시즌과 모든 조·기록이 삭제됩니다. 계속할까요?")) return;
    await run(async () => {
      await deleteSeason(seasonId);
      setSeasonId("");
      setShowEditSeason(false);
      setTeams([]);
      setMembers([]);
      await reloadSeasons();
    });
  }

  async function handleAddTeam() {
    if (!newTeam.trim()) return;
    await run(async () => {
      await createTeam(seasonId, newTeam.trim());
      setNewTeam("");
      await reloadTeamsAndMembers(seasonId);
    });
  }

  async function handleDeleteTeam(id: string) {
    if (!confirm("이 조와 소속 조원·기록이 삭제됩니다.")) return;
    await run(async () => {
      await deleteTeam(id);
      await reloadTeamsAndMembers(seasonId);
    });
  }

  async function handleAddMembers(teamId: string, raw: string) {
    const names = raw
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (names.length === 0) return;
    await run(async () => {
      for (const name of names) await createMember(teamId, name);
      await reloadTeamsAndMembers(seasonId);
    });
  }

  async function handleMoveMember(id: string, teamId: string) {
    await run(async () => {
      await updateMember(id, { team_id: teamId });
      await reloadTeamsAndMembers(seasonId);
    });
  }

  async function handleDeleteMember(id: string) {
    await run(async () => {
      await deleteMember(id);
      await reloadTeamsAndMembers(seasonId);
    });
  }

  if (!supabaseReady) return <SupabaseNotice />;

  // --- PIN 게이트 임시 비활성화 (나중에 재활성화하려면 위 ADMIN_PIN/상태와 함께 주석 해제) ---
  // if (!unlocked) {
  //   return (
  //     <div className="mx-auto max-w-sm px-4 py-16">
  //       <Link href="/challenge" className="text-sm text-neutral-400">
  //         ← 리더보드
  //       </Link>
  //       <h1 className="mb-2 mt-4 text-xl font-bold">🔒 관리자 확인</h1>
  //       <p className="mb-5 text-sm text-neutral-500">
  //         시즌·조 관리는 관리자 PIN이 필요합니다.
  //       </p>
  //       <form
  //         onSubmit={(e) => {
  //           e.preventDefault();
  //           if (pinInput === ADMIN_PIN) setUnlocked(true);
  //           else alert("PIN이 올바르지 않습니다.");
  //         }}
  //       >
  //         <input
  //           type="password"
  //           inputMode="numeric"
  //           value={pinInput}
  //           onChange={(e) => setPinInput(e.target.value)}
  //           className="input mb-3"
  //           placeholder="PIN 입력"
  //           autoFocus
  //         />
  //         <button
  //           type="submit"
  //           className="w-full rounded-xl py-3 font-bold text-white"
  //           style={{ backgroundColor: crew.primary }}
  //         >
  //           확인
  //         </button>
  //       </form>
  //     </div>
  //   );
  // }

  const selectedSeason = seasons.find((s) => s.id === seasonId);
  const today = todayISO();

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/challenge" className="text-sm text-neutral-400">
        ← 리더보드
      </Link>
      <h1 className="mb-6 mt-2 text-xl font-bold">⚙️ 시즌 · 조 관리</h1>

      {loading && <p className="py-10 text-center text-neutral-400">불러오는 중…</p>}

      {!loading && (
        <>
          {/* 시즌 목록 — 카드 탭하면 상세로 */}
          {!seasonId && (
            <section className="mb-6">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-bold">시즌</h2>
                <button
                  onClick={() => setShowNewSeason((v) => !v)}
                  className={`rounded-lg border px-3 py-1.5 text-xs ${
                    showNewSeason
                      ? "border-neutral-400 text-neutral-800"
                      : "border-neutral-200 text-neutral-600 hover:bg-neutral-50"
                  }`}
                >
                  + 새 시즌 추가
                </button>
              </div>

              {seasons.length > 0 && (
                <ul className="space-y-2">
                  {seasons.map((s) => {
                    const active =
                      s.start_date <= today && today <= s.end_date;
                    return (
                      <li key={s.id}>
                        <button
                          onClick={() => setSeasonId(s.id)}
                          className="flex w-full items-center justify-between rounded-2xl border border-neutral-200 bg-white p-4 text-left transition hover:border-neutral-400 hover:shadow-sm"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold">{s.name}</span>
                              {active && (
                                <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">
                                  진행 중
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 text-xs text-neutral-400">
                              {formatDateDot(s.start_date)}~
                              {formatDateDot(s.end_date)}
                            </p>
                          </div>
                          <span className="text-lg text-neutral-300">›</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {(showNewSeason || seasons.length === 0) && (
                <div className="mt-3 rounded-2xl border border-neutral-200 bg-white p-5">
                  <p className="mb-2 text-xs font-medium text-neutral-500">
                    새 시즌 만들기
                  </p>
                  <input
                    value={sName}
                    onChange={(e) => setSName(e.target.value)}
                    className="input mb-2"
                    placeholder="2026년 6월"
                  />
                  <div className="mb-2 grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      value={sStart}
                      onChange={(e) => setSStart(e.target.value)}
                      className="input"
                    />
                    <input
                      type="date"
                      value={sEnd}
                      onChange={(e) => setSEnd(e.target.value)}
                      className="input"
                    />
                  </div>
                  <button
                    onClick={handleCreateSeason}
                    disabled={busy}
                    className="w-full rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-50"
                    style={{ backgroundColor: crew.primary }}
                  >
                    시즌 추가
                  </button>
                </div>
              )}
            </section>
          )}

          {/* 선택 시즌 상세: 헤더 + 수정 */}
          {seasonId && selectedSeason && (
            <section className="mb-6 rounded-2xl border border-neutral-200 bg-white p-5">
              <button
                onClick={() => {
                  setSeasonId("");
                  setShowEditSeason(false);
                }}
                className="mb-3 text-sm text-neutral-400"
              >
                ← 시즌 목록
              </button>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-bold">{selectedSeason.name}</h2>
                  <p className="mt-0.5 text-xs text-neutral-400">
                    {formatDateDot(selectedSeason.start_date)}~
                    {formatDateDot(selectedSeason.end_date)}
                  </p>
                </div>
                <button
                  onClick={() => setShowEditSeason((v) => !v)}
                  className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-xs ${
                    showEditSeason
                      ? "border-neutral-400 text-neutral-800"
                      : "border-neutral-200 text-neutral-600 hover:bg-neutral-50"
                  }`}
                >
                  수정
                </button>
              </div>

              {showEditSeason && (
                <div
                  key={seasonId}
                  className="mt-3 rounded-xl border border-neutral-200 p-3"
                >
                  <p className="mb-2 text-xs font-medium text-neutral-500">
                    시즌 수정 (이름·기간)
                  </p>
                  <input
                    ref={editNameRef}
                    defaultValue={selectedSeason.name}
                    className="input mb-2"
                    placeholder="시즌 이름"
                  />
                  <div className="mb-2 grid grid-cols-2 gap-2">
                    <input
                      ref={editStartRef}
                      type="date"
                      defaultValue={selectedSeason.start_date}
                      className="input"
                    />
                    <input
                      ref={editEndRef}
                      type="date"
                      defaultValue={selectedSeason.end_date}
                      className="input"
                    />
                  </div>
                  <button
                    onClick={handleUpdateSeason}
                    disabled={busy}
                    className="w-full rounded-xl bg-neutral-900 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                  >
                    변경 저장
                  </button>
                  <button
                    onClick={handleDeleteSeason}
                    disabled={busy}
                    className="mt-2 w-full rounded-xl border border-neutral-200 py-2 text-xs text-neutral-500 hover:text-red-500"
                  >
                    이 시즌 삭제
                  </button>
                </div>
              )}
            </section>
          )}

          {/* 조 + 조원 */}
          {seasonId && (
            <section className="rounded-2xl border border-neutral-200 bg-white p-5">
              <h2 className="mb-3 text-sm font-bold">조 · 조원</h2>
              <div className="mb-3 flex items-center gap-2">
                <input
                  value={newTeam}
                  onChange={(e) => setNewTeam(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddTeam()}
                  className="input"
                  placeholder="새 조 이름 (예: 1조)"
                />
                <button
                  onClick={handleAddTeam}
                  disabled={busy}
                  className="shrink-0 rounded-xl bg-neutral-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                >
                  조 추가
                </button>
              </div>

              {teams.length === 0 && (
                <p className="py-6 text-center text-sm text-neutral-400">
                  조를 추가해 주세요.
                </p>
              )}

              <div className="space-y-4">
                {teams.map((t) => (
                  <TeamCard
                    key={t.id}
                    team={t}
                    teams={teams}
                    members={members.filter((m) => m.team_id === t.id)}
                    busy={busy}
                    onDeleteTeam={() => handleDeleteTeam(t.id)}
                    onAddMembers={(raw) => handleAddMembers(t.id, raw)}
                    onMoveMember={handleMoveMember}
                    onDeleteMember={handleDeleteMember}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function TeamCard({
  team,
  teams,
  members,
  busy,
  onDeleteTeam,
  onAddMembers,
  onMoveMember,
  onDeleteMember,
}: {
  team: Team;
  teams: Team[];
  members: Member[];
  busy: boolean;
  onDeleteTeam: () => void;
  onAddMembers: (raw: string) => void;
  onMoveMember: (id: string, teamId: string) => void;
  onDeleteMember: (id: string) => void;
}) {
  const [raw, setRaw] = useState("");
  return (
    <div className="rounded-xl border border-neutral-200 p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-bold">
          {team.name}{" "}
          <span className="text-xs font-normal text-neutral-400">
            {members.length}명
          </span>
        </span>
        <button
          onClick={onDeleteTeam}
          disabled={busy}
          className="text-xs text-neutral-400 hover:text-red-500"
        >
          조 삭제
        </button>
      </div>

      <ul className="mb-3 space-y-1">
        {members.map((m) => (
          <li key={m.id} className="flex items-center gap-2 text-sm">
            <span className="flex-1 truncate">{m.name}</span>
            <select
              value={m.team_id}
              onChange={(e) => onMoveMember(m.id, e.target.value)}
              disabled={busy}
              className="rounded-lg border border-neutral-200 px-2 py-1 text-xs text-neutral-500"
              title="조 이동"
            >
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => onDeleteMember(m.id)}
              disabled={busy}
              className="text-xs text-neutral-400 hover:text-red-500"
            >
              ✕
            </button>
          </li>
        ))}
        {members.length === 0 && (
          <li className="text-sm text-neutral-400">조원이 없습니다</li>
        )}
      </ul>

      <div className="flex items-start gap-2">
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={1}
          className="input resize-y"
          placeholder="이름 추가 (여러 명은 줄바꿈/쉼표로)"
        />
        <button
          onClick={() => {
            onAddMembers(raw);
            setRaw("");
          }}
          disabled={busy}
          className="shrink-0 rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50"
        >
          추가
        </button>
      </div>
    </div>
  );
}

/** YYYY-MM-DD → 그 달의 시즌 기본값 { name, start, end } */
function monthRange(iso: string): { name: string; start: string; end: string } {
  const [y, m] = iso.split("-").map(Number);
  const last = new Date(y, m, 0).getDate(); // m은 1~12, day 0 = 이전달 말일 = m월 말일
  const mm = String(m).padStart(2, "0");
  return {
    name: `${y}년 ${m}월`,
    start: `${y}-${mm}-01`,
    end: `${y}-${mm}-${String(last).padStart(2, "0")}`,
  };
}
