"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [status, setStatus] = useState<"loading" | "success" | "error" | "missing">("loading");
  const [message, setMessage] = useState("");
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (!token) {
      setStatus("missing");
      setMessage("No verification token found in the link.");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/v1/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = (await res.json()) as { message?: string; error?: string };
        if (!cancelled) {
          if (res.ok) {
            setStatus("success");
            setMessage(data.message || "Email verified successfully.");
          } else {
            setStatus("error");
            setMessage(data.error || "Verification failed.");
          }
        }
      } catch {
        if (!cancelled) {
          setStatus("error");
          setMessage("Network error while verifying your email.");
        }
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  return (
    <div className="portal-layout" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: "24px 16px" }}>
      <div className="card" style={{ maxWidth: 440, width: "100%", textAlign: "center" }}>
        <h1 className="text-center" style={{ marginBottom: 16 }}>Email Verification</h1>

        {status === "loading" && (
          <div style={{ padding: "20px 0" }}>
            <span className="spinner" />
            <p className="text-muted" style={{ marginTop: 12 }}>Verifying your email…</p>
          </div>
        )}

        {status === "success" && (
          <>
            <div style={{ fontSize: 40, marginBottom: 12, color: "var(--color-success)" }}>&#10003;</div>
            <p className="success-msg" style={{ marginBottom: 20 }}>{message}</p>
            <Link href="/login" className="btn btn-primary btn-block">
              Sign In
            </Link>
          </>
        )}

        {status === "error" && (
          <>
            <div style={{ fontSize: 40, marginBottom: 12, color: "var(--color-danger)" }}>!</div>
            <p style={{ color: "var(--color-danger)", marginBottom: 16 }}>{message}</p>
            <button
              className="btn btn-secondary btn-block"
              disabled={resending}
              onClick={async () => {
                setResending(true);
                try {
                  const email = localStorage.getItem("interviewed.pendingEmail") || "";
                  const res = await fetch("/api/v1/auth/resend-verification", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email }),
                  });
                  const data = (await res.json()) as { message?: string; error?: string };
                  if (res.ok) {
                    setMessage("A new verification link has been sent.");
                  } else {
                    setMessage(data.error || "Could not resend verification.");
                  }
                } catch {
                  setMessage("Network error while resending.");
                }
                setResending(false);
              }}
              style={{ marginBottom: 12 }}
            >
              {resending ? "Sending…" : "Resend verification email"}
            </button>
            <Link href="/login" className="link">Back to Sign In</Link>
          </>
        )}

        {status === "missing" && (
          <>
            <p style={{ color: "var(--color-danger)", marginBottom: 20 }}>{message}</p>
            <Link href="/login" className="btn btn-primary btn-block">
              Back to Sign In
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="portal-layout" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
          <span className="spinner" />
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
