"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

type Mode = "login" | "signup";

/** Email + password with Supabase Auth. Email confirmation is off, so sign-up returns a session. */
export function AuthForm({ mode }: { mode: Mode }) {
  const { t } = useI18n();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);

  function message(err: { message: string; status?: number; code?: string }): string {
    const m = err.message.toLowerCase();
    if (err.code === "invalid_credentials" || m.includes("invalid login credentials")) return t.auth.invalidCredentials;
    if (err.code === "user_already_exists" || m.includes("already registered")) return t.auth.alreadyRegistered;
    if (err.code === "weak_password" || m.includes("password should be")) return t.auth.weakPassword;
    if (err.status === 429 || m.includes("rate limit")) return t.auth.rateLimited;
    return err.message || t.common.genericError;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    const supabase = createClient();
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: `${window.location.origin}/app` },
        });
        if (error) throw error;
        if (!data.session) {
          // Only if email confirmation gets turned back on in the project.
          toast.info(t.auth.checkEmail);
          setPending(false);
          return;
        }
        toast.success(t.auth.welcome);
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      }
      // The session cookie is set: the proxy and the server components see it on this navigation.
      router.replace("/app");
      router.refresh();
    } catch (err) {
      setPending(false);
      const e = err as { message?: string; status?: number; code?: string };
      toast.error(message({ message: e.message ?? "", status: e.status, code: e.code }));
    }
  }

  const signup = mode === "signup";
  return (
    <div className="grid gap-7">
      <div className="grid gap-1.5">
        <h1 className="text-2xl font-semibold tracking-[-0.025em]">{signup ? t.auth.signupTitle : t.auth.loginTitle}</h1>
        <p className="text-[0.9375rem] text-pretty text-muted-foreground">{signup ? t.auth.signupSubtitle : t.auth.loginSubtitle}</p>
      </div>
      <form onSubmit={submit} className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="email">{t.auth.email}</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            placeholder={t.auth.emailPlaceholder}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">{t.auth.password}</Label>
          <Input
            id="password"
            type="password"
            autoComplete={signup ? "new-password" : "current-password"}
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-describedby={signup ? "password-hint" : undefined}
          />
          {signup && (
            <p id="password-hint" className="text-xs text-muted-foreground">
              {t.auth.passwordHint}
            </p>
          )}
        </div>
        <Button type="submit" size="lg" className="mt-1 w-full" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {signup ? t.auth.submitSignup : t.auth.submitLogin}
        </Button>
      </form>
      <p className="text-sm text-muted-foreground">
        {signup ? t.auth.haveAccount : t.auth.noAccount}{" "}
        <Link href={signup ? "/login" : "/signup"} className="font-medium text-primary-ink underline-offset-4 hover:underline">
          {signup ? t.auth.logIn : t.auth.createAccount}
        </Link>
      </p>
    </div>
  );
}
