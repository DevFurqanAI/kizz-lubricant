"use client";

import { useState } from "react";
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

    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (res?.error) {
      setError("Invalid email or password.");
      setLoading(false);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-white text-ink flex flex-col">
      {/* Brass keyline — the one line of color on a pure white page */}
      <div className="h-[3px] w-full bg-gradient-to-r from-brass via-brass-dark to-brass" />

      <div className="flex-1 grid lg:grid-cols-[1.1fr_1fr]">
        {/* Brand panel */}
        <section className="hidden lg:flex flex-col justify-between p-14 border-r border-line">
          <div className="rise">
            <span className="inline-block font-display font-bold tracking-[0.14em] text-[15px] border-2 border-brass rounded-md px-3 py-1.5 -rotate-1 select-none">
              Kizz Lubricants
            </span>
          </div>

          <div className="max-w-md">
            <p className="rise rise-1 font-mono text-[11px] tracking-[0.3em] text-brass-dark uppercase mb-6">
              Business Lead · Admin
            </p>
            <h1 className="rise rise-2 font-display font-semibold uppercase leading-[1.04] text-[clamp(2.6rem,4.5vw,4rem)] tracking-tight">
              Every drum,
              <br />
              every rupee,
              <br />
              <span className="text-brass">one ledger.</span>
            </h1>
            <p className="rise rise-3 mt-6 text-ink-soft text-[15px] leading-relaxed">
              Sales, purchasing, expenses, salary aur customer balances — live and safe.
            </p>
          </div>

          <p className="font-mono text-[11px] text-ink-soft/70 tracking-wide">
            Kizz LUBRICANTS © {new Date().getFullYear()}
          </p>
        </section>

        {/* Login panel */}
        <section className="flex items-center justify-center px-6 py-16">
          <div className="w-full max-w-[400px]">
            <div className="lg:hidden mb-10 text-center">
              <span className="inline-block font-display font-bold tracking-[0.14em] text-sm border-2 border-brass rounded-md px-3 py-1.5 -rotate-1">
                Kizz Lubricants
              </span>
            </div>

            <div className="rise bg-white border border-line-strong rounded-2xl shadow-card p-8 sm:p-10">
              <p className="font-mono text-[11px] tracking-[0.3em] text-brass-dark uppercase">
                Admin access
              </p>
              <h2 className="mt-2 font-display font-semibold uppercase text-2xl tracking-wide">
                Sign in
              </h2>

              <div className="mt-8 space-y-5">
                <div>
                  <label
                    htmlFor="email"
                    className="block text-[11.5px] font-semibold uppercase tracking-wider text-ink-soft mb-2"
                  >
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                    placeholder="admin@newstar.com"
                    className="w-full rounded-lg border border-line-strong bg-white px-4 py-3 text-[15px] placeholder:text-ink-soft/40 transition-colors focus:border-brass"
                  />
                </div>

                <div>
                  <label
                    htmlFor="password"
                    className="block text-[11.5px] font-semibold uppercase tracking-wider text-ink-soft mb-2"
                  >
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
                      className="w-full rounded-lg border border-line-strong bg-white px-4 py-3 pr-16 text-[15px] placeholder:text-ink-soft/40 transition-colors focus:border-brass"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[11px] uppercase tracking-wider text-ink-soft hover:text-brass-dark"
                    >
                      {showPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>

                {error && (
                  <p
                    role="alert"
                    className="text-[13px] text-danger bg-danger/5 border border-danger/20 rounded-lg px-3.5 py-2.5"
                  >
                    {error}
                  </p>
                )}

                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={loading}
                  className="w-full rounded-lg bg-ink text-white font-semibold text-[15px] py-3.5 transition-all hover:bg-black active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed"
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
