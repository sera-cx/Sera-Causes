import { ExternalLink } from "lucide-react";
import { fmtDate } from "@/lib/format";
import type { RecordEvent } from "@/lib/types";
import { Wallet } from "./Wallet";

const EXPLORER = "https://sepolia.etherscan.io/tx/";

export function RecordList({ events, limit }: { events: RecordEvent[]; limit?: number }) {
  const list = limit ? events.slice(0, limit) : events;
  if (list.length === 0) return <p className="text-[14.5px] text-ink-muted">Nothing on the record yet.</p>;
  return (
    <ol className="divide-y divide-rule border-y border-rule">
      {list.map((e) => (
        <li key={e.id} className="grid gap-1 py-3 sm:grid-cols-[150px_1fr_auto] sm:gap-4 sm:items-baseline">
          <time dateTime={e.at} className="font-mono text-[12px] text-ink-subtle tnum">
            {fmtDate(e.at, true)}
          </time>
          <div className="text-[14.5px] leading-snug">
            <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-subtle mr-2">{e.type.replace("_", " ")}</span>
            {e.summary}
            {e.by && (
              <span className="text-ink-muted">
                {" "}
                by <Wallet address={e.by} />
              </span>
            )}
          </div>
          {e.txHash ? (
            <a href={`${EXPLORER}${e.txHash}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-mono text-[11px] text-sera-text hover:underline" aria-label={`Transaction ${e.txHash.slice(0, 10)}`}>
              tx {e.txHash.slice(0, 8)} <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          ) : (
            <span className="font-mono text-[11px] text-ink-subtle">off-chain, signed</span>
          )}
        </li>
      ))}
    </ol>
  );
}
