"use client";
import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (!token) {
      setError("Missing reset token in the link.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/v1/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = (await res.json()) as { error?: string };
      if (res.ok) {
        setDone(true);
      } else {
        setError(data.error || "Could not reset password");
      }
    } catch {
      setError("Network error");
    }
    setLoading(false);
  };

  return (
    <div className="portal-layout" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: "24px 16px" }}>
      <div className="card" style={{ width: "100%", maxWidth: 400 }}>
        {done ? (
          <div className="text-center">
            <div style={{ fontSize: 40, marginBottom: 12 }}>&#10003;</div>
            <h2 style={{ marginBottom: 8 }}>Password updated</h2>
            <p className="text-muted" style={{ marginBottom: 20 }}>
              Your password has been changed. You can now sign in with your new password.
            </p>
            <Link href="/login" className="btn btn-primary btn-block">
              Sign In
            </Link>
          </div>
        ) : (
          <>
            <h1 className="text-center" style={{ marginBottom: 4 }}>Reset password</h1>
            <p className="text-muted text-center" style={{ marginBottom: 20 }}>
              Enter your new password below.
            </p>

            {!token && <div className="error-msg">This link is missing a reset token.</div>}
            {error && <div className="error-msg">{error}</div>}

            <form onSubmit={handleSubmit}>
              <div className="field">
                <label className="label" htmlFor="password">New password</label>
                <input
                  id="password"
                  className="input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  minLength={6}
                  required
                  autoComplete="new-password"
                />
              </div>

              <div className="field">
                <label className="label" htmlFor="confirmPassword">Confirm new password</label>
                <input
                  id="confirmPassword"
                  className="input"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat your password"
                  minLength={6}
                  required
                  autoComplete="new-password"
                />
              </div>

              <button type="submit" className="btn btn-primary btn-block" disabled={loading || !token}>
                {loading ? (
                  <span style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
                    <span className="spinner" /> Updating…
                  </span>
                ) : (
                  "Update password"
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

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="portal-layout" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
          <span className="spinner" />
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
