"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState, type ComponentType } from "react";
import { BadgeCheck, LockKeyhole } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

export default function SignUpPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    const { error } = await authClient.signUp.email({
      name,
      email,
      password,
    });
    setIsSubmitting(false);

    if (error) {
      setError(error.message || "Unable to create account.");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  const inputCls =
    "h-11 border-white/[0.1] bg-white/[0.025] focus-visible:border-emerald-400/40 focus-visible:ring-emerald-400/30";
  const labelCls = "text-[11px] uppercase tracking-[0.16em] text-zinc-400";

  return (
    <main className="relative flex min-h-[calc(100vh-3rem)] items-center justify-center px-4 py-10">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-emerald-400/10 blur-[140px]" />
        <div className="absolute bottom-0 right-0 h-[380px] w-[520px] rounded-full bg-cyan-400/8 blur-[120px]" />
      </div>
      <div className="relative grid w-full max-w-5xl overflow-hidden rounded-3xl border border-white/[0.09] bg-gradient-to-b from-white/[0.025] to-black/40 shadow-[0_40px_120px_rgba(0,0,0,0.5)] backdrop-blur-xl lg:grid-cols-[minmax(0,1fr)_500px]">
        <section className="relative flex min-h-[480px] flex-col justify-between overflow-hidden border-b border-white/[0.08] bg-gradient-to-br from-emerald-500/[0.04] via-transparent to-cyan-500/[0.03] p-7 lg:border-b-0 lg:border-r lg:p-9">
          <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-emerald-400/[0.08] blur-3xl" />
          <BrandMark className="relative w-full max-w-[340px] py-2" imageClassName="h-12" />
          <div className="relative max-w-xl">
            <span className="v2-pill v2-pill-accent">
              <span className="v2-dot text-emerald-400" />
              New operator
            </span>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.05] tracking-[-0.025em] text-white md:text-[44px]">
              Provision{" "}
              <span className="bg-gradient-to-r from-emerald-300 via-emerald-200 to-cyan-300 bg-clip-text text-transparent">
                internal access.
              </span>
            </h1>
            <p className="mt-5 max-w-md text-sm leading-6 text-zinc-400">
              Accounts are limited to pre-approved Axiom operator emails. After registration you will enter the command workspace.
            </p>
          </div>
          <div className="relative grid gap-2 text-xs text-zinc-500 sm:grid-cols-2">
            <Signal icon={BadgeCheck} title="Approved emails only" />
            <Signal icon={LockKeyhole} title="12 character minimum" />
          </div>
        </section>

        <section className="flex items-center p-6 md:p-9">
          <div className="w-full">
            <div className="mb-7">
              <h2 className="text-2xl font-semibold tracking-[-0.022em] text-white">Create account</h2>
              <p className="mt-1.5 text-sm text-zinc-400">Use your Axiom ops identity.</p>
            </div>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="name" className={labelCls}>Full name</Label>
                <Input
                  id="name"
                  onChange={(event) => setName(event.target.value)}
                  required
                  value={name}
                  className={inputCls}
                  placeholder="Ada Lovelace"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className={labelCls}>Work email</Label>
                <Input
                  id="email"
                  autoComplete="email"
                  inputMode="email"
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  type="email"
                  value={email}
                  className={inputCls}
                  placeholder="you@axiom.com"
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="password" className={labelCls}>Password</Label>
                  <Input
                    id="password"
                    autoComplete="new-password"
                    minLength={12}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    type="password"
                    value={password}
                    className={inputCls}
                    placeholder="••••••••"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword" className={labelCls}>Confirm</Label>
                  <Input
                    id="confirmPassword"
                    autoComplete="new-password"
                    minLength={12}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    required
                    type="password"
                    value={confirmPassword}
                    className={inputCls}
                    placeholder="••••••••"
                  />
                </div>
              </div>
              {error ? (
                <p className="flex items-center gap-2 rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-200">
                  <span className="size-1.5 shrink-0 rounded-full bg-rose-400" />
                  {error}
                </p>
              ) : null}
              <Button className="h-11 w-full text-[13px]" disabled={isSubmitting} type="submit">
                {isSubmitting ? "Creating account…" : "Create account →"}
              </Button>
            </form>
            <div className="mt-6 border-t border-white/[0.06] pt-4 text-center text-sm text-zinc-500">
              Already have access?{" "}
              <Link className="font-medium text-emerald-300 hover:text-emerald-200" href="/sign-in">
                Sign in
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function Signal({
  icon: Icon,
  title,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-2 backdrop-blur-sm transition-colors hover:border-emerald-400/25 hover:bg-emerald-400/[0.04]">
      <Icon className="h-3.5 w-3.5 text-emerald-300" />
      <span className="font-medium text-zinc-300">{title}</span>
    </div>
  );
}
