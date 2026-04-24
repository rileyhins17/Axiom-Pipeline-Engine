"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState, type ComponentType } from "react";
import { BadgeCheck, LockKeyhole } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

  return (
    <main className="flex min-h-[calc(100vh-6rem)] items-center justify-center px-4 py-10">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/70 shadow-[0_28px_100px_rgba(0,0,0,0.28)] lg:grid-cols-[minmax(0,1fr)_460px]">
        <section className="flex min-h-[460px] flex-col justify-between border-b border-white/10 bg-black/20 p-6 lg:border-b-0 lg:border-r">
          <BrandMark className="w-full max-w-[340px] py-2" imageClassName="h-12" />
          <div className="max-w-xl">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-300">Axiom Pipeline Engine</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white md:text-5xl">Provision internal access.</h1>
            <p className="mt-4 text-sm leading-6 text-zinc-400">
              Accounts are limited to pre-approved Axiom operator emails. After registration you will enter the command workspace.
            </p>
          </div>
          <div className="grid gap-2 text-xs text-zinc-500 sm:grid-cols-2">
            <Signal icon={BadgeCheck} title="Approved emails only" />
            <Signal icon={LockKeyhole} title="12 character minimum" />
          </div>
        </section>

        <section className="flex items-center p-5 md:p-8">
          <Card className="w-full border-white/10 bg-transparent shadow-none">
            <CardHeader className="px-0 pt-0">
              <CardTitle className="text-2xl font-semibold tracking-tight">Create account</CardTitle>
              <CardDescription>Use your Axiom ops identity.</CardDescription>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="space-y-2">
                  <Label htmlFor="name">Full name</Label>
                  <Input id="name" onChange={(event) => setName(event.target.value)} required value={name} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Work email</Label>
                  <Input
                    id="email"
                    autoComplete="email"
                    inputMode="email"
                    onChange={(event) => setEmail(event.target.value)}
                    required
                    type="email"
                    value={email}
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      autoComplete="new-password"
                      minLength={12}
                      onChange={(event) => setPassword(event.target.value)}
                      required
                      type="password"
                      value={password}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm</Label>
                    <Input
                      id="confirmPassword"
                      autoComplete="new-password"
                      minLength={12}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      required
                      type="password"
                      value={confirmPassword}
                    />
                  </div>
                </div>
                {error ? <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p> : null}
                <Button className="w-full" disabled={isSubmitting} type="submit">
                  {isSubmitting ? "Creating account..." : "Create account"}
                </Button>
              </form>
              <p className="mt-4 text-sm text-muted-foreground">
                Already have access?{" "}
                <Link className="text-emerald-400 hover:text-emerald-300" href="/sign-in">
                  Sign in
                </Link>
                .
              </p>
            </CardContent>
          </Card>
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
    <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
      <Icon className="h-3.5 w-3.5 text-emerald-300" />
      <span>{title}</span>
    </div>
  );
}
