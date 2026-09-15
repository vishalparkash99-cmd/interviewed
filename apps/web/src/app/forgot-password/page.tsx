"use client";
import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/v1/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json()) as { error?: string };
      if (res.ok) {
        setSent(true);
      } else {
        setError(data.error || "Something went wrong");
      }
    } catch {
      setError("Network error");
    }
    setLoading(false);
  };

  return (
    <div className="portal-layout" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: "24px 16px" }}>
      <div className="card" style={{ width: "100%", maxWidth: 400 }}>
        {sent ? (
          <div className="text-center">
            <div style={{ fontSize: 40, marginBottom: 12 }}>&#9993;</div>
            <h2 style={{ marginBottom: 8 }}>Check your email</h2>
            <p className="success-msg" style={{ marginBottom: 4 }}>
              If an account exists for <strong>{email}</strong>, we&apos;ve sent a password reset link.
            </p>
            <p className="text-muted" style={{ marginBottom: 20 }}>
              Check your inbox and follow the instructions.
            </p>
            <Link href="/login" className="btn btn-primary btn-block">
              Back to Sign In
            </Link>
          </div>
        ) : (
          <>
            <h1 className="text-center" style={{ marginBottom: 4 }}>Forgot password?</h1>
            <p className="text-muted text-center" style={{ marginBottom: 20 }}>
              Enter your account email and we&apos;ll send you a reset link.
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

              <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
                {loading ? (
                  <span style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
                    <span className="spinner" /> Sending…
                  </span>
                ) : (
                  "Send reset link"
                )}
              </button>
            </form>

            <hr className="divider" />

            <p className="text-muted text-center">
              <Link href="/login" className="link">Back to Sign In</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
