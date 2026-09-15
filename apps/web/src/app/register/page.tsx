"use client";
import { useState } from "react";
import Link from "next/link";

type RegisterResponse = {
  message?: string;
  user?: { email: string };
  devVerifyUrl?: string;
  error?: string;
};

export default function RegisterPage() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<RegisterResponse | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/v1/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName, email, password, companyName }),
      });
      const data = (await res.json()) as RegisterResponse;
      if (res.ok) {
        try {
          localStorage.setItem("interviewed.pendingEmail", email);
        } catch {
          // ignore storage errors
        }
        setDone(data);
      } else {
        setError(data.error || "Registration failed");
      }
    } catch {
      setError("Network error");
    }
    setLoading(false);
  };

  if (done) {
    return (
      <div className="portal-layout" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: "24px 16px" }}>
        <div className="card" style={{ maxWidth: 440, width: "100%", textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>&#9993;</div>
          <h2 style={{ marginBottom: 8 }}>Check your email</h2>
          <p className="success-msg" style={{ marginBottom: 4 }}>
            {done.message || "Registration successful."}
          </p>
          <p className="text-muted" style={{ marginBottom: 16 }}>
            We&apos;ve sent a verification link to <strong>{done.user?.email}</strong>.
          </p>

          {done.devVerifyUrl && (
            <div className="consent-box" style={{ marginBottom: 16 }}>
              <p className="text-muted" style={{ marginBottom: 6 }}>
                Dev mode: email delivery is mocked. Use this link to verify now:
              </p>
              <a href={done.devVerifyUrl} className="link" style={{ wordBreak: "break-all" }}>
                {done.devVerifyUrl}
              </a>
            </div>
          )}

          <Link href="/login" className="btn btn-primary btn-block">
            Go to Sign In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="portal-layout" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: "24px 16px" }}>
      <div className="card" style={{ width: "100%", maxWidth: 440 }}>
        <h1 className="text-center" style={{ marginBottom: 4 }}>Create your account</h1>
        <p className="text-muted text-center" style={{ marginBottom: 24 }}>
          Get started with AI-assisted hiring
        </p>

        {error && <div className="error-msg">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div style={{ display: "flex", gap: 12 }}>
            <div className="field" style={{ flex: 1 }}>
              <label className="label" htmlFor="firstName">First name</label>
              <input id="firstName" className="input" type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Jane" required />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label className="label" htmlFor="lastName">Last name</label>
              <input id="lastName" className="input" type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Doe" required />
            </div>
          </div>

          <div className="field">
            <label className="label" htmlFor="email">Work email</label>
            <input id="email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@company.com" required autoComplete="email" />
          </div>

          <div className="field">
            <label className="label" htmlFor="company">Company name</label>
            <input id="company" className="input" type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Acme Corporation" required />
          </div>

          <div className="field">
            <label className="label" htmlFor="password">Password</label>
            <input id="password" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" minLength={6} required autoComplete="new-password" />
          </div>

          <div className="field">
            <label className="label" htmlFor="confirmPassword">Confirm password</label>
            <input id="confirmPassword" className="input" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Repeat your password" minLength={6} required autoComplete="new-password" />
          </div>

          <button type="submit" className="btn btn-primary btn-block" disabled={loading} style={{ marginTop: 4 }}>
            {loading ? (
              <span style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
                <span className="spinner" /> Creating account…
              </span>
            ) : (
              "Sign Up"
            )}
          </button>
        </form>

        <hr className="divider" />

        <p className="text-muted text-center">
          Already have an account?{" "}
          <Link href="/login" className="link">Sign In</Link>
        </p>
      </div>
    </div>
  );
}
