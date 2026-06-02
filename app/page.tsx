import Link from "next/link";
import { crew } from "@/lib/crew";
import { features } from "@/lib/features";

export default function Home() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <section className="mb-10 text-center">
        <div className="mb-3 text-5xl">{crew.logoEmoji}</div>
        <h1 className="text-2xl font-bold">{crew.name} 크루 앱</h1>
        <p className="mt-2 text-neutral-500">{crew.tagline}</p>
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        {features.map((f) => {
          const card = (
            <div
              className={`flex h-full flex-col rounded-2xl border p-5 transition ${
                f.status === "ready"
                  ? "border-neutral-200 bg-white hover:border-neutral-400 hover:shadow-sm"
                  : "border-dashed border-neutral-200 bg-neutral-100"
              }`}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-2xl">{f.emoji}</span>
                {f.status === "soon" && (
                  <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-[11px] text-neutral-500">
                    준비중
                  </span>
                )}
              </div>
              <h2 className="font-semibold">{f.title}</h2>
              <p className="mt-1 text-sm text-neutral-500">{f.desc}</p>
            </div>
          );

          return f.status === "ready" ? (
            <Link key={f.href} href={f.href}>
              {card}
            </Link>
          ) : (
            <div key={f.href} className="cursor-default">
              {card}
            </div>
          );
        })}
      </div>

      <p className="mt-8 text-center text-xs text-neutral-400">
        운영비 0원 · 정적 사이트 · 단계별로 기능이 추가됩니다
      </p>
    </div>
  );
}
