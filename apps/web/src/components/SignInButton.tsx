/* The one place an action asks for an account. With sign-in configured it is a
   button that opens the Privy modal; without it, one short line saying why the
   action is not available, so a read-only site never offers a dead button. */
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Button, type ButtonProps } from "./ui/button";

export function SignInButton({
  label = "Sign in",
  size = "sm",
  variant,
  className,
}: {
  label?: string;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
  className?: string;
}) {
  const { signIn, busy, canSignIn, unavailableReason, error } = useAuth();

  if (!canSignIn) {
    return (
      <p className={cn("text-[14px] text-ink-subtle", className)} role="note">
        {unavailableReason}
      </p>
    );
  }

  return (
    <div className={cn("inline-flex flex-col items-start gap-1.5", className)}>
      <Button size={size} variant={variant} onClick={() => void signIn()} disabled={busy}>
        {busy ? "Signing in" : label}
      </Button>
      {error && (
        <p className="text-[13px] text-ink-subtle" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
