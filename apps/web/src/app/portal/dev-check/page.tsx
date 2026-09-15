"use client";
import { useState } from "react";
import Link from "next/link";

export default function DevCheckPage() {
  const [consentChecked, setConsentChecked] = useState(false);
  const returnLink = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("returnTo") || "/portal/interview"
    : "/portal/interview";

  return (
    <div className="portal-layout">
      <div className="interview-container" style={{ maxWidth: 480, paddingTop: 40 }}>
        <div className="card">
          <h2 style={{ marginBottom: 4 }}>Device &amp; Environment Check</h2>
          <p className="text-muted" style={{ marginBottom: 20 }}>
            Confirm you&apos;re ready before starting your interview.
          </p>

          <div className="section-label">System Check</div>
          <ul className="info-list">
            <li>Stable internet connection</li>
            <li>Modern browser (Chrome, Firefox, or Edge)</li>
            <li>Keyboard available for typing answers</li>
            <li>Quiet, well-lit environment</li>
          </ul>

          <hr className="divider" />

          <div className="section-label">Recording Consent</div>
          <div className="consent-box">
            <p style={{ marginBottom: 12 }}>
              Your interview responses may be recorded and transcribed for
              evaluation by the hiring team. By checking below, you confirm that
              you understand and consent to this recording.
            </p>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={consentChecked}
                onChange={(e) => setConsentChecked(e.target.checked)}
              />
              I consent to the recording and processing of my interview responses
            </label>
          </div>

          <div style={{ marginTop: 24, display: "flex", gap: 12 }}>
            <a href="/portal" className="btn btn-secondary" style={{ flex: 1 }}>
              Back
            </a>
            <Link
              href={consentChecked ? returnLink : "#"}
              className="btn btn-primary"
              style={{
                flex: 1,
                pointerEvents: consentChecked ? "auto" : "none",
                opacity: consentChecked ? 1 : 0.45,
              }}
            >
              Begin Interview
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
