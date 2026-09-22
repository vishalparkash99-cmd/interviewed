"use client";
import { useState } from "react";
import Link from "next/link";
import { useToast } from "@/lib/toast";

type LoginResponse = {
  error?: string;
  code?: string;
};

export default function LoginPage() {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showResend, setShowResend] = useState(false);
  const [resendMsg, setResendMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setShowResend(false);
    setLoading(true);
    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json()) as LoginResponse;
      if (res.ok) {
        toast.success("Welcome back!");
        setTimeout(() => {
          window.location.href = "/dashboard";
        }, 300);
      } else {
        const message = data.error || "Login failed";
        setError(message);
        toast.error(message);
        if (data.code === "EMAIL_NOT_VERIFIED") {
          setShowResend(true);
        }
      }
    } catch {
      setError("Network error");
      toast.error("Network error");
    }
    setLoading(false);
  };

  const resendVerification = async () => {
    setResendMsg("");
    setLoading(true);
    try {
      const res = await fetch("/api/v1/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json()) as { message?: string; error?: string };
      const msg = data.message || data.error || "Check your email for the verification link.";
      setResendMsg(msg);
      toast.info(msg);
    } catch {
      setResendMsg("Network error while resending verification.");
      toast.error("Network error while resending verification.");
    }
    setLoading(false);
  };

  return (
    <div className="portal-layout" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: "24px 16px" }}>
      <div className="card" style={{ width: "100%", maxWidth: 400 }}>
        <h1 className="text-center" style={{ marginBottom: 4 }}>Welcome back</h1>
        <p className="text-muted text-center" style={{ marginBottom: 24 }}>
          Sign in to your Interviewed account
        </p>

        {error && <div className="error-msg">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label className="label" htmlFor="email">Email</label>
            <input
              id="email"
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
              autoComplete="email"
            />
          </div>

          <div className="field">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label className="label" htmlFor="password" style={{ marginBottom: 0 }}>Password</label>
              <Link href="/forgot-password" className="link">Forgot password?</Link>
            </div>
            <input
              id="password"
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              autoComplete="current-password"
              style={{ marginTop: 6 }}
            />
          </div>

          <button type="submit" className="btn btn-primary btn-block" disabled={loading} style={{ marginTop: 4 }}>
            {loading ? (
              <span style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
                <span className="spinner" /> Signing in…
              </span>
            ) : (
              "Sign In"
            )}
          </button>
        </form>

        {showResend && (
          <div className="consent-box" style={{ marginTop: 16, textAlign: "center" }}>
            <p className="text-muted" style={{ marginBottom: 8 }}>Email not verified?</p>
            <button className="btn btn-secondary btn-sm" onClick={resendVerification} disabled={loading}>
              {loading ? "Sending…" : "Resend verification email"}
            </button>
            {resendMsg && <p className="success-msg" style={{ marginTop: 8 }}>{resendMsg}</p>}
          </div>
        )}

        <hr className="divider" />

        <p className="text-muted text-center">
          New to Interviewed?{" "}
          <Link href="/register" className="link">Create an account</Link>
        </p>

        <div className="consent-box" style={{ marginTop: 16 }}>
          <p className="text-muted text-center" style={{ fontSize: 12 }}>
            <strong>Shared demo:</strong> <strong>admin@acme.com</strong> / <strong>admin123</strong>
          </p>
          <p className="text-muted text-center" style={{ fontSize: 12, marginTop: 6 }}>
            This workspace is shared — do not upload real candidate data.{" "}
            <Link href="/register" className="link">Create a free account</Link>{" "}
            for your own private workspace.
          </p>
        </div>
      </div>
    </div>
  );
}
