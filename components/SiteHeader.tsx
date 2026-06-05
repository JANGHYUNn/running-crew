import Link from "next/link";
import { crew } from "@/lib/crew";

export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-neutral-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-bold">
          <span className="text-xl">{crew.logoEmoji}</span>
          <span style={{ color: crew.primary }}>{crew.name}</span>
        </Link>
        <span className="hidden text-xs text-neutral-400 sm:inline">
          {crew.tagline}
        </span>
      </div>
    </header>
  );
}
