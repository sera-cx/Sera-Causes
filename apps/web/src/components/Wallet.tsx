import { shortAddress } from "@/lib/rules";
import { DEMO_WALLET } from "@/lib/mock/state";
import { cn } from "@/lib/utils";

export function Wallet({ address, className, you = true }: { address: string; className?: string; you?: boolean }) {
  const isMe = address === DEMO_WALLET;
  return (
    <span className={cn("font-mono text-[12.5px] tnum", className)} title={address}>
      {isMe && you ? "you" : shortAddress(address)}
    </span>
  );
}
