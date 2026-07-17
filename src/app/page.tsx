"use client";

import { useState } from "react";
import Image from "next/image";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!email || !password) {
      setError("Email and password are both required.");
      return;
    }
    setLoading(true);
    setError(null);

    const res = await signIn("credentials", { email, password, redirect: false });

    if (res?.error) {
      setError("Invalid email or password.");
      setLoading(false);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-canvas text-ink flex flex-col">
      <div className="flex-1 grid lg:grid-cols-[1.05fr_1fr]">
        {/* Brand panel — soft lavender, matching the app language */}
        <section className="relative hidden lg:flex flex-col justify-between p-14 bg-accent-tint border-r border-accent/15 overflow-hidden">
          {/* faint accent bloom, no gradient on content */}
          <div className="pointer-events-none absolute -left-24 -bottom-24 w-96 h-96 rounded-full bg-accent/15 blur-[120px]" />

          <div className="rise relative flex items-center gap-2.5">
            <Image
              src="/logo.png"
              alt="Kizz Lubricants"
              width={54}
              height={54}
              priority
              className="flex-shrink-0 w-[54px] h-[54px] rounded-lg object-contain"
            />
            <span className="text-[20px] font-semibold tracking-tight text-ink">Kizz Lubricants</span>
          </div>

          <div className="relative max-w-md">
            <p className="rise rise-1 eyebrow text-accent-ink/70">Business ledger</p>
            <h1 className="rise rise-2 mt-4 text-[clamp(2.2rem,3.6vw,3.1rem)] font-semibold leading-[1.06] tracking-tightest text-ink">
              Every drum, every rupee,
              <br />
              <span className="text-accent">one ledger.</span>
            </h1>
            <p className="rise rise-3 mt-5 text-muted text-[15px] leading-relaxed">
              Sales, purchasing, expenses, salary and customer balances — live and safe.
            </p>
          </div>

          <p className="relative text-[12px] text-muted">
            Kizz Lubricants © {new Date().getFullYear()}
          </p>
        </section>

        {/* Login panel */}
        <section className="flex items-center justify-center px-6 py-16">
          <div className="w-full max-w-[400px]">
            <div className="lg:hidden rise mb-8 flex items-center gap-2.5">
              <span className="grid place-items-center w-9 h-9 rounded-[10px] bg-accent text-white font-semibold shadow-accent-glow">
                K
              </span>
              <span className="text-[15px] font-semibold tracking-tight">Kizz Lubricants</span>
            </div>
            <div className="rise card shadow-pop p-8 sm:p-10">
              <p className="eyebrow">Admin access</p>
              <h2 className="mt-2 text-[22px] font-semibold">Sign in</h2>
              <p className="mt-1 text-sm text-muted">Welcome back. Enter your details to continue.</p>

              <div className="mt-7 space-y-5">
                <div>
                  <label htmlFor="email" className="label">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                    placeholder="admin@kizz.com"
                    className="input"
                  />
                </div>

                <div>
                  <label htmlFor="password" className="label">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                      placeholder="••••••••"
                      className="input pr-14"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] font-medium text-muted hover:text-ink"
                    >
                      {showPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>

                {error && (
                  <p
                    role="alert"
                    className="text-[13px] text-danger bg-danger-tint border border-danger/20 rounded-lg px-3.5 py-2.5"
                  >
                    {error}
                  </p>
                )}

                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={loading}
                  className="btn-primary w-full py-3 active:scale-[0.99]"
                >
                  {loading ? "Signing in…" : "Sign in to dashboard"}
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
