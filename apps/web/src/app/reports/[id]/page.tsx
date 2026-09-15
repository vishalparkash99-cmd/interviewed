"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout";
import {
  Card,
  Button,
  Badge,
  StatusBadge,
  RecommendationBadge,
  Spinner,
  EmptyState,
  Textarea,
  ProgressBar,
  formatDate,
  formatDateTime,
} from "@/components/ui";
import { api } from "@/lib/api";

type ReportDetail = {
  id: string;
  status: string;
  candidateInfo?: Record<string, unknown>;
  jobInfo?: Record<string, unknown>;
  resumeMatchScore: number;
  interviewScore: number;
  competencyScores?: Record<string, number>;
  interviewSummary?: string;
  strengths?: unknown[];
  weaknesses?: unknown[];
  skillGaps?: unknown[];
  evidence?: unknown[];
  keyQa?: unknown[];
  concerns?: unknown[];
  aiRecommendation?: string;
  hrDecision?: Record<string, unknown> | null;
  hrDecisionAt?: string | null;
  createdAt: string;
  interview?: {
    id: string;
    status?: string;
    candidate?: { id: string; name: string; email: string };
    job?: { id: string; title: string; department?: string | null; location?: string | null };
  };
};

function itemText(item: unknown): string {
  if (typeof item === "string") return item;
  if (item && typeof item === "object") {
    const o = item as Record<string, unknown>;
    const question = typeof o.question === "string" ? o.question : "";
    const answer = typeof o.answer === "string" ? o.answer : typeof o.score === "string" || typeof o.score === "number" ? String(o.score) : "";
    const score = typeof o.score === "number" ? o.score : null;
    const title = typeof o.title === "string" ? o.title : "";
    const text = typeof o.text === "string" ? o.text : "";
    if (question && answer) return `Q: ${question}\nA: ${answer}${score != null ? ` (${score}/100)` : ""}`;
    return title || text || [question, answer].filter(Boolean).join(" · ") || JSON.stringify(o);
  }
  return "";
}

function keyQaItem(item: unknown): { question: string; answer: string } {
  if (item && typeof item === "object") {
    const o = item as Record<string, unknown>;
    return {
      question: typeof o.question === "string" ? o.question : "—",
      answer: typeof o.answer === "string" ? o.answer : "—",
    };
  }
  return { question: itemText(item), answer: "—" };
}

export default function ReportDetailPage() {
  const params = useParams<{ id: string }>();
  const reportId = params.id;

  const [report, setReport] = useState<ReportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState<"" | "approved" | "rejected">("");
  const [decisionError, setDecisionError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get<ReportDetail>(`/api/v1/reports/${reportId}`);
      setReport(r);
      setNote((r.hrDecision?.note as string) ?? "");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId]);

  const decide = async (decision: "approved" | "rejected") => {
    setSaving(decision);
    setDecisionError("");
    setSaveMessage("");
    try {
      await api.post(`/api/v1/reports/${reportId}/decision`, {
        decision,
        note: note.trim() || undefined,
        hire: decision === "approved",
      });
      setSaveMessage(decision === "approved" ? "Candidate approved for hire." : "Candidate rejected.");
      load();
    } catch (e) {
      setDecisionError((e as Error).message);
    } finally {
      setSaving("");
    }
  };

  if (loading) {
    return (
      <AppShell title="Report">
        <Spinner label="Loading report..." />
      </AppShell>
    );
  }

  if (error || !report) {
    return (
      <AppShell title="Report">
        <EmptyState title="Could not load report" message={error || "Report not found"} />
      </AppShell>
    );
  }

  const competencies = report.competencyScores ?? {};
  const candidateName = report.interview?.candidate?.name ?? String(report.candidateInfo?.name ?? "Candidate");
  const jobTitle = report.interview?.job?.title ?? String(report.jobInfo?.title ?? "Job");
  const hrDecision = report.hrDecision;

  return (
    <AppShell
      title="HR Report"
      subtitle="Automated evaluation summary for human review"
      actions={
        <>
          <Link href="/reports" className="btn btn-secondary btn-sm">
            All Reports
          </Link>
          <StatusBadge status={report.status} />
        </>
      }
    >
      <div className="grid grid-2 items-start">
        <Card title="Candidate">
          <div className="kv">
            <div className="kv-item">
              <div className="kv-label">Name</div>
              <div className="kv-value">
                {report.interview?.candidate ? (
                  <Link href={`/candidates/${report.interview.candidate.id}`}>{candidateName}</Link>
                ) : (
                  candidateName
                )}
              </div>
            </div>
            <div className="kv-item">
              <div className="kv-label">Email</div>
              <div className="kv-value">{report.interview?.candidate?.email ?? "—"}</div>
            </div>
          </div>
        </Card>

        <Card title="Job">
          <div className="kv">
            <div className="kv-item">
              <div className="kv-label">Title</div>
              <div className="kv-value">
                {report.interview?.job ? <Link href={`/jobs/${report.interview.job.id}`}>{jobTitle}</Link> : jobTitle}
              </div>
            </div>
            <div className="kv-item">
              <div className="kv-label">Department / Location</div>
              <div className="kv-value">
                {String(report.interview?.job?.department || report.jobInfo?.department || "—")}
                {" / "}
                {String(report.interview?.job?.location || "—")}
              </div>
            </div>
            <div className="kv-item">
              <div className="kv-label">Report created</div>
              <div className="kv-value">{formatDate(report.createdAt)}</div>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-2 items-start">
        <Card title="Scores">
          <div className="grid grid-2" style={{ marginBottom: 12 }}>
            <div className="flex" style={{ flexDirection: "column", alignItems: "center", padding: 12, background: "#fafafa", borderRadius: 10 }}>
              <span className="text-light" style={{ fontSize: 12 }}>
                Resume Match
              </span>
              <span className="font-bold" style={{ fontSize: 30, color: "#248a3d" }}>
                {report.resumeMatchScore.toFixed(1)}
              </span>
            </div>
            <div className="flex" style={{ flexDirection: "column", alignItems: "center", padding: 12, background: "#fafafa", borderRadius: 10 }}>
              <span className="text-light" style={{ fontSize: 12 }}>
                Interview
              </span>
              <span className="font-bold" style={{ fontSize: 30, color: "#0071e3" }}>
                {report.interviewScore.toFixed(1)}
              </span>
            </div>
          </div>
          <div className="section-label" style={{ marginTop: 0 }}>
            Competencies
          </div>
          {Object.keys(competencies).length === 0 ? (
            <p className="text-secondary">No competency scores recorded.</p>
          ) : (
            Object.entries(competencies).map(([key, value]) => (
              <ProgressBar key={key} label={key} value={Number(value)} />
            ))
          )}
        </Card>

        <Card title="Summary">
          <p style={{ whiteSpace: "pre-wrap" }}>{report.interviewSummary || "No summary written."}</p>
          <div className="mt-4">
            <Badge variant="secondary">AI Recommendation</Badge>{" "}
            <RecommendationBadge recommendation={report.aiRecommendation} />
          </div>
        </Card>
      </div>

      <div className="grid grid-2 items-start">
        {report.strengths && report.strengths.length > 0 && (
          <Card title="Strengths">
            <ul>
              {report.strengths.map((s, i) => (
                <li key={i}>{itemText(s)}</li>
              ))}
            </ul>
          </Card>
        )}
        {report.weaknesses && report.weaknesses.length > 0 && (
          <Card title="Weaknesses">
            <ul>
              {report.weaknesses.map((s, i) => (
                <li key={i}>{itemText(s)}</li>
              ))}
            </ul>
          </Card>
        )}
        {report.skillGaps && report.skillGaps.length > 0 && (
          <Card title="Skill Gaps">
            <ul>
              {report.skillGaps.map((s, i) => (
                <li key={i}>{itemText(s)}</li>
              ))}
            </ul>
          </Card>
        )}
        {report.evidence && report.evidence.length > 0 && (
          <Card title="Evidence">
            <ul>
              {report.evidence.map((s, i) => (
                <li key={i}>{itemText(s)}</li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      {report.keyQa && report.keyQa.length > 0 && (
        <Card title="Key Q&A">
          {report.keyQa.map((item, i) => {
            const { question, answer } = keyQaItem(item);
            return (
              <div key={i} style={{ marginBottom: 12 }}>
                <div className="font-bold">{question}</div>
                <div className="text-secondary mt-1">{answer}</div>
              </div>
            );
          })}
        </Card>
      )}

      {report.concerns && report.concerns.length > 0 && (
        <Card title="Concerns">
          <ul>
            {report.concerns.map((s, i) => (
              <li key={i}>{itemText(s)}</li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="HR Decision" subtitle="Record your hiring decision — AI recommendations are advisory only">
        {decisionError && <div className="error-box">{decisionError}</div>}
        {saveMessage && <div className="success-box">{saveMessage}</div>}

        {hrDecision && (hrDecision.decision || hrDecision.hire !== undefined) && (
          <div className="notice">
            <div>
              <strong>
                Current decision:{" "}
                {typeof hrDecision.decision === "string"
                  ? hrDecision.decision === "approved"
                    ? "Hire"
                    : hrDecision.decision === "rejected"
                      ? "Reject"
                      : hrDecision.decision === "review"
                        ? "Under Review"
                        : hrDecision.decision
                  : hrDecision.hire
                    ? "Hire"
                    : "Rejected"}
                {" "}
                {hrDecision.note ? `— ${String(hrDecision.note)}` : ""}
              </strong>
              {hrDecision.at ? <div className="text-light" style={{ fontSize: 12 }}>Recorded {formatDateTime(String(hrDecision.at))}</div> : null}
            </div>
          </div>
        )}

        <Textarea
          label="Note"
          placeholder="Add context for this decision..."
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
        />
        <div className="flex flex-wrap">
          <Button variant="primary" loading={saving === "approved"} disabled={saving !== ""} onClick={() => decide("approved")}>
            Hire Candidate
          </Button>
          <Button variant="danger" loading={saving === "rejected"} disabled={saving !== ""} onClick={() => decide("rejected")}>
            Reject Candidate
          </Button>
        </div>
      </Card>
    </AppShell>
  );
}