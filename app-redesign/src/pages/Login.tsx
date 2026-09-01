import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { Loader2, ShieldCheck } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { useAuth } from "@/state/auth";
import { ApiError } from "@/lib/api";

export default function Login() {
  const nav = useNavigate();
  const location = useLocation();
  const { signIn, signUp } = useAuth();

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // /analyze 등 보호된 경로에서 밀려왔으면 로그인 후 원래 가려던 곳으로 되돌린다.
  const from = (location.state as { from?: string } | null)?.from ?? "/";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === "signup") await signUp(email.trim(), password);
      else await signIn(email.trim(), password);
      nav(from, { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "알 수 없는 오류가 발생했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center px-5 py-16">
      <div className="mb-8 text-center">
        <span className="mx-auto grid size-11 place-items-center rounded-2xl bg-brand-500">
          <ShieldCheck className="size-5 text-white" strokeWidth={2.5} />
        </span>
        <h1 className="mt-4 text-[22px] font-bold tracking-[-0.02em]">
          {mode === "login" ? "로그인" : "회원가입"}
        </h1>
        <p className="mt-1.5 text-[13.5px] text-ink-500">
          {mode === "login" ? "계속하려면 로그인하세요." : "이메일과 비밀번호만 있으면 됩니다."}
        </p>
      </div>

      <Card className="p-6 sm:p-7">
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-[13px] font-semibold">
              이메일
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="h-11 w-full rounded-xl border border-line bg-white px-3.5 text-[14.5px] outline-none placeholder:text-ink-300 focus:border-brand-400"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1.5 block text-[13px] font-semibold">
              비밀번호
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="6자 이상"
              className="h-11 w-full rounded-xl border border-line bg-white px-3.5 text-[14.5px] outline-none placeholder:text-ink-300 focus:border-brand-400"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-stop-50 px-3.5 py-2.5 text-[13px] text-stop-700">
              {error}
            </p>
          )}

          <Button type="submit" size="lg" full disabled={busy}>
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : mode === "login" ? (
              "로그인"
            ) : (
              "가입하고 시작하기"
            )}
          </Button>
        </form>
      </Card>

      <button
        onClick={() => {
          setMode((m) => (m === "login" ? "signup" : "login"));
          setError(null);
        }}
        className="mt-5 text-center text-[13.5px] text-ink-500 hover:text-ink-900"
      >
        {mode === "login" ? (
          <>
            계정이 없으신가요? <span className="font-semibold text-brand-600">회원가입</span>
          </>
        ) : (
          <>
            이미 계정이 있으신가요? <span className="font-semibold text-brand-600">로그인</span>
          </>
        )}
      </button>
    </div>
  );
}
