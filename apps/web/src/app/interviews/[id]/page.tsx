"use client";

import { useCallback, useEffect, useState } from "react";
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
  Tabs,
  ProgressBar,
  labelize,
  formatDateTime,
  formatDuration,
} from "@/components/ui";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast";

type Evaluation = {
  id: string;
  overallScore: number;
  technicalScore: number;
  roleCompetency: number;
  problemSolving: number;
  practicalExp: number;
  communication: number;
  systemDesign: number;
  resumeValidation: number;
  strengths: string[];
  weaknesses: string[];
  skillGaps: string[];
  concerns: string[];
  recommendation: string;
  aiSummary?: string | null;
  status: string;
};

type PlanSection = {
  section: string;
  title?: string;
  durationMinutes?: number;
  questions?: { text: string; type?: string; difficulty?: string; durationMinutes?: number }[];
};

type InterviewDetail = {
  id: string;
  status: string;
  plan: PlanSection[];
  totalDuration: number;
  elapsedSeconds: number;
  startedAt?: string | null;
  endedAt?: string | null;
  createdAt: string;
  candidate?: { id: string; name: string; email: string; resume?: unknown } | null;
  job?: { id: string; title: string; department?: string | null; organization?: { name?: string } | null } | null;
  questions?: {
    id: string;
    section: string;
    question: string;
    type: string;
    difficulty: string;
    isFollowUp?: boolean;
    sequence?: number;
  }[];
  transcriptSegments?: { id: string; speaker: string; timestamp: string; text: string }[];
  evaluation?: Evaluation | null;
  report?: { id: string; status?: string } | null;
};

type TranscriptSegment = { id: string; speaker: string; timestamp: string; text: string };

type FeedbackRow = {
  id: string;
  questionId: string;
  question: string | null;
  section: string | null;
  sequence: number | null;
  scores: {
    technicalAccuracy: number;
    communicationClarity: number;
    problemSolvingStructure: number;
    pacingAndConciseness: number;
    overallScore: number;
  };
  strengths: string[];
  keyOmissions: string[];
  improvedAnswer: string;
  actionableTips: string[];
  source: string;
  createdAt: string;
};

export default function InterviewDetailPage() {
  const params = useParams<{ id: string }>();
  const interviewId = params.id;
  const toast = useToast();

  const [tab, setTab] = useState("overview");
  const [interview, setInterview] = useState<InterviewDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState<{ link: string; expiresAt?: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptSegment[] | null>(null);
  const [feedback, setFeedback] = useState<FeedbackRow[] | null>(null);
  const [rescheduleMinutes, setRescheduleMinutes] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const iv = await api.get<InterviewDetail>(`/api/v1/interviews/${interviewId}`);
      setInterview(iv);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [interviewId]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interviewId]);

  useEffect(() => {
    if (tab === "transcript") {
      api
        .get<{ data: TranscriptSegment[] }>(`/api/v1/interviews/${interviewId}/transcript`)
        .then((res) => setTranscript(res.data ?? []))
        .catch((e: Error) => toast.error(e.message));
    }
    if (tab === "feedback") {
      api
        .get<{ data: FeedbackRow[] }>(`/api/v1/interviews/${interviewId}/feedback`)
        .then((res) => setFeedback(res.data ?? []))
        .catch((e: Error) => toast.error(e.message));
    }
  }, [tab, interviewId]);

  const doAction = async (action: string, path: string, successText: string, body?: unknown) => {
    setBusy(true);
    try {
      await api.post(path, body ?? {});
      toast.success(successText);
      load();
    } catch (e) {
      toast.error(`${action}: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const inviteCandidate = async () => {
    setBusy(true);
    try {
      const res = await api.post<{ link: string; expiresAt?: string }>(`/api/v1/interviews/${interviewId}/invite`);
      setInvite(res);
      setCopied(false);
      toast.success("Invitation link generated.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    if (!invite?.link) return;
    try {
      await navigator.clipboard.writeText(invite.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable
    }
  };

  const sendReminder = async () => {
    setBusy(true);
    try {
      const res = await api.post<{ link: string; expiresAt?: string }>(`/api/v1/interviews/${interviewId}/remind`);
      setInvite(res);
      setCopied(false);
      toast.success("Reminder sent. New invitation link generated.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const reschedule = async () => {
    const minutes = Number(rescheduleMinutes);
    if (!Number.isFinite(minutes) || minutes < 5 || minutes > 180) {
      toast.error("Enter a duration between 5 and 180 minutes.");
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<{ link: string; expiresAt?: string }>(`/api/v1/interviews/${interviewId}/reschedule`, { duration: minutes });
      setInvite(res);
      setCopied(false);
      toast.success("Interview rescheduled. New invitation link sent.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <AppShell title="Interview">
        <Spinner label="Loading interview..." />
      </AppShell>
    );
  }

  if (error || !interview) {
    return (
      <AppShell title="Interview">
        <EmptyState title="Could not load interview" message={error || "Interview not found"} />
      </AppShell>
    );
  }

  const status = interview.status;
  const sections = Array.isArray(interview.plan) ? interview.plan : [];
  const questions = interview.questions ?? [];
  const evaluation = interview.evaluation ?? null;
  const report = interview.report ?? null;

  return (
    <AppShell
      title={`Interview with ${interview.candidate?.name ?? "Candidate"}`}
      subtitle={
        interview.job
          ? `${interview.job.title}${interview.job.organization?.name ? ` · ${interview.job.organization.name}` : ""} · ${formatDuration(interview.totalDuration)}`
          : formatDuration(interview.totalDuration)
      }
      actions={
        <>
          <Link href="/interviews" className="btn btn-secondary btn-sm">
            All Interviews
          </Link>
          <StatusBadge status={status} />
        </>
      }
    >
      <Card title="Actions" subtitle="Manage this interview lifecycle">
        <div className="flex flex-wrap">
          <Button variant="secondary" onClick={inviteCandidate} loading={busy}>
            Invite Candidate
          </Button>
          {(status === "scheduled" || status === "in_progress") && (
            <Button variant="primary" disabled={busy} onClick={() => doAction("Start", `/api/v1/interviews/${interviewId}/start`, "Interview started.")}>
              Start
            </Button>
          )}
          {(status === "scheduled" || status === "in_progress") && (
            <Button variant="secondary" disabled={busy} onClick={() => doAction("End", `/api/v1/interviews/${interviewId}/end`, "Interview ended.")}>
              End
            </Button>
          )}
          {(status === "scheduled" || status === "in_progress") && (
            <Button variant="secondary" disabled={busy} onClick={sendReminder}>
              Send Reminder
            </Button>
          )}
          {status === "scheduled" && (
            <span className="flex items-center gap-2">
              <input
                type="number"
                min={5}
                max={180}
                value={rescheduleMinutes}
                onChange={(e) => setRescheduleMinutes(e.target.value)}
                placeholder="Duration (min)"
                className="input"
                style={{ width: 140 }}
              />
              <Button variant="secondary" disabled={busy} onClick={reschedule}>
                Reschedule
              </Button>
            </span>
          )}
          {(status === "scheduled" || status === "in_progress") && (
            <Button variant="danger" disabled={busy} onClick={() => doAction("Cancel", `/api/v1/interviews/${interviewId}/cancel`, "Interview cancelled.")}>
              Cancel
            </Button>
          )}
          {status === "completed" && !evaluation && (
            <Button variant="secondary" disabled={busy} onClick={() => doAction("Evaluate", `/api/v1/interviews/${interviewId}/evaluate`, "Evaluation queued.")}>
              Evaluate
            </Button>
          )}
          {status === "completed" && !report && (
            <Button variant="secondary" disabled={busy} onClick={() => doAction("Generate Report", `/api/v1/interviews/${interviewId}/generate-report`, "Report generation queued.")}>
              Generate Report
            </Button>
          )}
          {evaluation && (
            <Link href={`/candidates/${interview.candidate?.id ?? ""}`} className="btn btn-ghost btn-sm">
              Evaluation available
            </Link>
          )}
        </div>

        {invite && (
          <div className="mt-4">
            <div className="copy-row">
              <div className="copy-value" title={invite.link}>
                {invite.link}
              </div>
              <Button size="sm" onClick={copyLink} disabled={copied}>
                {copied ? "Copied!" : "Copy"}
              </Button>
            </div>
            {invite.expiresAt && (
              <div className="text-light mt-1" style={{ fontSize: 12 }}>
                Link expires {formatDateTime(invite.expiresAt)}
              </div>
            )}
          </div>
        )}
      </Card>

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: "overview", label: "Overview" },
          { key: "plan", label: `Plan (${sections.length})` },
          { key: "questions", label: `Questions (${questions.length})` },
          { key: "transcript", label: "Transcript" },
          { key: "feedback", label: "Feedback" },
          { key: "evaluation", label: "Evaluation" },
          { key: "report", label: "Report" },
        ]}
      />

      {tab === "overview" && (
        <div className="grid grid-2 items-start">
          <Card title="Details">
            <div className="kv">
              <div className="kv-item">
                <div className="kv-label">Candidate</div>
                <div className="kv-value">{interview.candidate?.name ?? "—"}</div>
              </div>
              <div className="kv-item">
                <div className="kv-label">Candidate email</div>
                <div className="kv-value">{interview.candidate?.email ?? "—"}</div>
              </div>
              <div className="kv-item">
                <div className="kv-label">Job</div>
                <div className="kv-value">
                  {interview.job ? <Link href={`/jobs/${interview.job.id}`}>{interview.job.title}</Link> : "—"}
                </div>
              </div>
              <div className="kv-item">
                <div className="kv-label">Department</div>
                <div className="kv-value">{interview.job?.department ?? "—"}</div>
              </div>
              <div className="kv-item">
                <div className="kv-label">Status</div>
                <div className="kv-value">
                  <StatusBadge status={status} />
                </div>
              </div>
              <div className="kv-item">
                <div className="kv-label">Duration</div>
                <div className="kv-value">{formatDuration(interview.totalDuration)}</div>
              </div>
              <div className="kv-item">
                <div className="kv-label">Elapsed</div>
                <div className="kv-value">{interview.elapsedSeconds ? `${Math.round(interview.elapsedSeconds / 60)} min` : "—"}</div>
              </div>
              <div className="kv-item">
                <div className="kv-label">Created</div>
                <div className="kv-value">{formatDateTime(interview.createdAt)}</div>
              </div>
              <div className="kv-item">
                <div className="kv-label">Started</div>
                <div className="kv-value">{interview.startedAt ? formatDateTime(interview.startedAt) : "—"}</div>
              </div>
              <div className="kv-item">
                <div className="kv-label">Ended</div>
                <div className="kv-value">{interview.endedAt ? formatDateTime(interview.endedAt) : "—"}</div>
              </div>
            </div>
          </Card>

          <Card title="Status" subtitle="Lifecycle helpers">
            <ul className="list-plain">
              <li>
                <strong>Scheduled</strong> — candidate can join via the invitation link.
              </li>
              <li>
                <strong>In progress</strong> — the interview window is open.
              </li>
              <li>
                <strong>Completed</strong> — evaluate answers and generate the HR report.
              </li>
              <li>
                <strong>Cancelled</strong> — the interview is no longer runnable.
              </li>
            </ul>
            {evaluation && (
              <div className="notice">
                Evaluation is available. Score: <strong>{evaluation.overallScore.toFixed(1)} / 100</strong>
              </div>
            )}
            {report && (
              <div className="notice">
                Report is ready:{" "}
                <Link href={`/reports/${report.id}`} className="font-bold">
                  View report
                </Link>
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === "plan" &&
        (sections.length === 0 ? (
          <EmptyState title="No interview plan" message="The AI could not generate a plan for this interview yet. Try recreating the interview, or check the job description." />
        ) : (
          sections.map((section, i) => (
            <Card
              key={`${section.section}-${i}`}
              title={section.title || labelize(section.section)}
              actions={
                section.durationMinutes ? <Badge variant="secondary">{formatDuration(section.durationMinutes)}</Badge> : undefined
              }
            >
              {(section.questions ?? []).map((q, qi) => (
                <div key={qi} className="score-row" style={{ marginBottom: 6 }}>
                  <div className="flex flex-wrap" style={{ gap: 8 }}>
                    <span>{q.text}</span>
                    {q.difficulty && <Badge variant={q.difficulty === "hard" ? "danger" : q.difficulty === "medium" ? "warning" : "info"}>{labelize(q.difficulty)}</Badge>}
                    {q.type && <Badge variant="secondary">{labelize(q.type)}</Badge>}
                  </div>
                </div>
              ))}
            </Card>
          ))
        ))}

      {tab === "questions" &&
        (questions.length === 0 ? (
          <EmptyState title="No questions" message="Questions are generated when the interview plan is built." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Section</th>
                  <th>Question</th>
                  <th>Type</th>
                  <th>Difficulty</th>
                </tr>
              </thead>
              <tbody>
                {questions.map((q, i) => (
                  <tr key={q.id}>
                    <td className="text-secondary">{(q.sequence ?? i) + 1}</td>
                    <td>{q.section}</td>
                    <td>{q.question}</td>
                    <td className="text-secondary">{q.type}</td>
                    <td>
                      <Badge variant={q.difficulty === "hard" ? "danger" : q.difficulty === "medium" ? "warning" : "info"}>
                        {labelize(q.difficulty)}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      {tab === "transcript" && (
        <Card>
          {transcript === null && <Spinner label="Loading transcript..." />}
          {transcript && transcript.length === 0 && (
            <EmptyState title="No transcript yet" message="Transcript segments appear once the interview takes place." />
          )}
          {transcript && transcript.length > 0 && (
            <div className="transcript">
              {transcript.map((seg) => (
                <div key={seg.id} style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", display: "flex", gap: 12 }}>
                  <Badge variant={seg.speaker === "candidate" ? "success" : "info"}>{labelize(seg.speaker)}</Badge>
                  <div style={{ flex: 1 }}>
                    <div className="text-light" style={{ fontSize: 11 }}>
                      {formatDateTime(seg.timestamp)}
                    </div>
                    <div style={{ fontSize: 14 }}>{seg.text}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === "feedback" && (
        <div>
          {feedback === null && <Spinner label="Loading feedback..." />}
          {feedback !== null && feedback.length === 0 && (
            <EmptyState
              title="No diagnostic feedback yet"
              message="Per-question feedback is generated when the interview is evaluated. Use the Evaluate button once the interview is completed."
            />
          )}
          {feedback !== null &&
            feedback.length > 0 &&
            feedback.map((fb) => (
              <Card
                key={fb.id}
                title={fb.question || "Question"}
                subtitle={
                  fb.section
                    ? `${labelize(fb.section)}${fb.sequence != null ? ` · Q${(fb.sequence ?? 0) + 1}` : ""}${
                        fb.source === "deterministic" ? " · heuristic estimate" : ""
                      }`
                    : undefined
                }
                actions={
                  <Badge variant={fb.scores.overallScore >= 70 ? "success" : fb.scores.overallScore >= 50 ? "warning" : "danger"}>
                    {fb.scores.overallScore} / 100
                  </Badge>
                }
              >
                <div className="grid grid-2">
                  <ProgressBar label="Technical accuracy" value={fb.scores.technicalAccuracy} />
                  <ProgressBar label="Communication clarity" value={fb.scores.communicationClarity} />
                  <ProgressBar label="Problem-solving structure" value={fb.scores.problemSolvingStructure} />
                  <ProgressBar label="Pacing & conciseness" value={fb.scores.pacingAndConciseness} />
                </div>

                {fb.strengths.length > 0 && (
                  <>
                    <h4 className="mt-4">Strengths</h4>
                    <ul>{fb.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
                  </>
                )}

                {fb.keyOmissions.length > 0 && (
                  <>
                    <h4 className="mt-4">Key omissions</h4>
                    <ul>{fb.keyOmissions.map((s, i) => <li key={i}>{s}</li>)}</ul>
                  </>
                )}

                {fb.improvedAnswer && (
                  <>
                    <h4 className="mt-4">Top 1% sample answer</h4>
                    <div style={{ whiteSpace: "pre-wrap", padding: "12px 14px", background: "var(--color-bg-soft, #f7f7f8)", border: "1px solid var(--border)", borderRadius: 8 }}>
                      {fb.improvedAnswer}
                    </div>
                  </>
                )}

                {fb.actionableTips.length > 0 && (
                  <>
                    <h4 className="mt-4">Actionable tips</h4>
                    <ul>{fb.actionableTips.map((s, i) => <li key={i}>{s}</li>)}</ul>
                  </>
                )}
              </Card>
            ))}
        </div>
      )}

      {tab === "evaluation" &&
        (!evaluation ? (
          <EmptyState
            title="Not evaluated yet"
            message="Once the interview is completed, use the Evaluate button to produce an AI evaluation."
          />
        ) : (
          <div className="grid grid-2 items-start">
            <Card title="Scores" actions={<RecommendationBadge recommendation={evaluation.recommendation} />}>
              <ProgressBar label="Overall" value={evaluation.overallScore} />
              <ProgressBar label="Technical" value={evaluation.technicalScore} />
              <ProgressBar label="Role competency" value={evaluation.roleCompetency} />
              <ProgressBar label="Problem solving" value={evaluation.problemSolving} />
              <ProgressBar label="Practical experience" value={evaluation.practicalExp} />
              <ProgressBar label="Communication" value={evaluation.communication} />
              <ProgressBar label="System design" value={evaluation.systemDesign} />
              <ProgressBar label="Resume validation" value={evaluation.resumeValidation} />
            </Card>
            <div>
              <Card title="AI Summary">
                <p style={{ whiteSpace: "pre-wrap" }}>{evaluation.aiSummary || "No summary available."}</p>
              </Card>
            </div>
            <Card title="Strengths">
              <ul>{evaluation.strengths?.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </Card>
            <Card title="Areas for improvement">
              <ul>{evaluation.weaknesses?.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </Card>
            <Card title="Skill gaps">
              <ul>{evaluation.skillGaps?.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </Card>
            <Card title="Concerns">
              <ul>{evaluation.concerns?.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </Card>
          </div>
        ))}

      {tab === "report" &&
        (!report ? (
          <EmptyState
            title="No report yet"
            message="After evaluation, use the Generate Report button to compile the full HR report."
          />
        ) : (
          <Card title="Full HR report" actions={<StatusBadge status={report.status} />}>
            <p>
              The structured report for this interview is ready. It includes the resume match score, interview
              score, competencies, strengths, evidence, key Q&amp;A, and an AI recommendation.
            </p>
            <Link href={`/reports/${report.id}`} className="btn btn-primary mt-4">
              View Report
            </Link>
          </Card>
        ))}
    </AppShell>
  );
}