"use client";

import { useState, type FormEvent } from "react";
import { createAuthClient } from "better-auth/react";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import { authSchema } from "@/lib/model";
import { Brand } from "./primitives";

export const authClient = createAuthClient();

export function AuthScreen({ onSignedIn }: { onSignedIn: () => Promise<void> }) {
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const input = authSchema.parse({
        action: register ? "register" : "login",
        email: form.get("email"),
        password: form.get("password"),
        ...(register ? { name: form.get("name") } : {}),
      });
      const result = register
        ? await authClient.signUp.email({
            email: input.email,
            password: input.password,
            name: input.name ?? "",
          })
        : await authClient.signIn.email({ email: input.email, password: input.password });
      if (result.error) throw new Error(result.error.message ?? "Unable to sign in");
      await onSignedIn();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to sign in");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-screen">
      <div className="auth-story">
        <Brand />
        <span className="eyebrow">
          <Sparkles size={15} /> YOUR PEOPLE, ONE PLACE
        </span>
        <h1>
          Good company.
          <br />
          Great possibilities<span>.</span>
        </h1>
        <p>A space to share your ideas, find your community, and stay close—even from far away.</p>
        <div className="auth-benefits">
          <span>
            <Check size={17} /> Communities that feel like home
          </span>
          <span>
            <Check size={17} /> Conversations worth having
          </span>
          <span>
            <Check size={17} /> Room for your next big idea
          </span>
        </div>
        <div className="auth-orbit">
          <span>✳</span>
          <i />
          <i />
          <i />
        </div>
      </div>
      <section className="auth-form-card">
        <span className="eyebrow">LET’S GET YOU SETTLED IN</span>
        <h2>{register ? "Find your people." : "Welcome back."}</h2>
        <p>
          {register
            ? "Create your Relay account and start something good."
            : "Your communities are waiting for you."}
        </p>
        <form onSubmit={submit}>
          {register && (
            <label>
              Display name
              <input
                name="name"
                autoComplete="nickname"
                minLength={2}
                maxLength={48}
                required
                placeholder="What should we call you?"
              />
            </label>
          )}
          <label>
            Email address
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete={register ? "new-password" : "current-password"}
              minLength={10}
              maxLength={128}
              required
              placeholder="At least 10 characters"
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="primary-button" disabled={busy}>
            {busy ? "One moment…" : register ? "Create an account" : "Sign in"}
            <ArrowRight size={18} />
          </button>
        </form>
        <p className="auth-switch">
          {register ? "Already have an account?" : "New around here?"}{" "}
          <button
            onClick={() => {
              setRegister(!register);
              setError("");
            }}
          >
            {register ? "Sign in" : "Join Relay"}
          </button>
        </p>
        <p className="fine-print">Independent community software. Not affiliated with Discord.</p>
      </section>
    </main>
  );
}
