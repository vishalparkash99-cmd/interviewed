"use client";

import { useState } from "react";
import { Card, Button, Input, Icon } from "@/components/ui";
import { api } from "@/lib/api";
import Link from "next/link";

type JoinResponse = {
  interview?: {
    id: string;
    status: string;
    totalDuration?: number;
    recordingConsent?: boolean;
    recordingDisclosed?: boolean;
  } | null;
  candidate?: { id: string; name: string; email: string } | null;
  job?: { id: string; title: string; organization?: string } | null;
  error?: string;
};

export default function PortalPage() {
  const [token, setToken] = useState("");
  const [info, setInfo] = useState<JoinResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await api.post<JoinResponse>("/api/v1/interviews/candidate/join", {
        interviewToken: token.trim(),
      });
      setInfo(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container" style={{ maxWidth: 560 }}>
      <div className="flex" style={{ justifyContent: "center", gap: 10, textAlign: "center", margin: "32px 0 24px" }}>
        <span className="brand-mark" style={{ width: 32, height: 32, borderRadius: 8, background: "#0071e3", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>
          I
        </span>
        <h1 style={{ fontSize: 24 }}>Interview Portal</h1>
      </div>

      {info?.candidate && info?.job && info?.interview ? (
        <Card title={`Welcome, ${info.candidate.name}`} subtitle={info.job.title}>
          <div className="kv">
            <div className="kv-item">
              <div className="kv-label">Candidate</div>
              <div className="kv-value">{info.candidate.name}</div>
            </div>
            <div className="kv-item">
              <div className="kv-label">Email</div>
              <div className="kv-value">{info.candidate.email}</div>
            </div>
            <div className="kv-item">
              <div className="kv-label">Job</div>
              <div className="kv-value">{info.job.title}</div>
            </div>
            <div className="kv-item">
              <div className="kv-label">Organization</div>
              <div className="kv-value">{info.job.organization ?? "—"}</div>
            </div>
            <div className="kv-item">
              <div className="kv-label">Duration</div>
              <div className="kv-value">{info.interview.totalDuration ? `${info.interview.totalDuration} minutes` : "—"}</div>
            </div>
            <div className="kv-item">
              <div className="kv-label">Status</div>
              <div className="kv-value">{info.interview.status.replace("_", " ")}</div>
            </div>
          </div>

          <div className="notice mt-4">
            <Icon name="mic" />
            <div>
              <strong>Device requirements</strong>
              <ul>
                <li>Computer with microphone and speakers</li>
                <li>Stable internet connection</li>
                <li>Updated browser (Chrome recommended)</li>
              </ul>
            </div>
          </div>

          <div className="notice">
            <Icon name="check" />
            <div>
              <strong>Recording disclosure</strong>
              <p>
                This interview may be recorded for quality assurance{info.interview.recordingDisclosed ? "" : " once you provide consent"}.
                {info.interview.recordingConsent && " You have provided recording consent."}
              </p>
            </div>
          </div>

          <Link href={`/portal/interview?token=${token}`} className="btn btn-primary btn-block mt-4">
            Enter Interview
          </Link>
        </Card>
      ) : (
        <Card title="Join your interview" subtitle="Enter the secure token from your invitation email">
          <form onSubmit={join}>
            <Input
              label="Interview token"
              placeholder="Paste your interview token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required
              autoFocus
            />
            {error && <div className="error-box">{error}</div>}
            <Button type="submit" variant="primary" className="btn-block" loading={loading}>
              {loading ? "Verifying..." : "Join Interview"}
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}