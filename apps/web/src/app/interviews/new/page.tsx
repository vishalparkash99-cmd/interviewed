"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout";
import { Select, Card, Button, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

type Candidate = { id: string; name: string; email: string };
type Job = { id: string; title: string; slug: string };

type Blocked = { used: number; limit: number; upgradeUrl: string };

const DURATIONS = [
  { value: "15", label: "15 minutes" },
  { value: "30", label: "30 minutes" },
  { value: "45", label: "45 minutes" },
  { value: "60", label: "60 minutes" },
  { value: "90", label: "90 minutes" },
];

export default function NewInterviewPage() {
  const router = useRouter();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [candidateId, setCandidateId] = useState("");
  const [jobId, setJobId] = useState("");
  const [duration, setDuration] = useState("45");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState<Blocked | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const prefillJob = params.get("job") || "";
    const prefillCandidate = params.get("candidate") || "";
    if (prefillJob) setJobId(prefillJob);
    if (prefillCandidate) setCandidateId(prefillCandidate);

    Promise.all([api.get<{ data: Candidate[] }>("/api/v1/candidates?limit=200"), api.get<{ data: Job[] }>("/api/v1/jobs?limit=200")])
      .then(([cRes, jRes]) => {
        setCandidates(cRes.data ?? []);
        setJobs(jRes.data ?? []);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const res = await api.post<{ id: string }>("/api/v1/interviews", {
        candidateId,
        jobId,
        duration: Number(duration) || 45,
      });
      router.push(`/interviews/${res.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        const used = (err.payload?.used as number) ?? 0;
        const limit = (err.payload?.limit as number) ?? 0;
        setBlocked({ used, limit, upgradeUrl: (err.payload?.upgradeUrl as string) ?? "" });
      } else {
        setError((err as Error).message);
      }
      setSaving(false);
    }
  };

  return (
    <AppShell
      title="Create Interview"
      subtitle="Schedule an AI-generated interview for a candidate and job"
      actions={<Link href="/interviews">All Interviews</Link>}
    >
      {loading && <Spinner label="Loading..." />}

      {!loading && blocked && (
        <div className="grid grid-2 items-start">
          <Card title="Free trial limit reached">
            <p>
              Your organization has used all <strong>{blocked.limit}</strong> free interviews
              ({blocked.used} created). Upgrade to the Unlimited plan to keep scheduling interviews.
            </p>
            <div className="flex" style={{ gap: 8, marginTop: 16 }}>
              {blocked.upgradeUrl ? (
                <a href={blocked.upgradeUrl} target="_blank" rel="noreferrer" className="btn btn-primary">
                  Upgrade to Unlimited
                </a>
              ) : (
                <span className="btn btn-primary">Talk to your administrator to upgrade</span>
              )}
              <Link href="/interviews" className="btn btn-secondary">
                Back to Interviews
              </Link>
            </div>
          </Card>
          <Card title="Need more interviews?">
            <p>
              The unlimited plan unlocks unlimited interview sessions for your team. Contact your
              platform administrator or use the upgrade link provided above.
            </p>
          </Card>
        </div>
      )}

      {!loading && !blocked && (
        <div className="grid grid-2 items-start">
          <Card title="New interview">
            {error && <div className="error-box">{error}</div>}
            <form onSubmit={create}>
              <Select
                label="Candidate *"
                value={candidateId}
                onChange={(e) => setCandidateId(e.target.value)}
                options={[
                  { value: "", label: candidates.length ? "Select a candidate" : "No candidates available" },
                  ...candidates.map((c) => ({ value: c.id, label: `${c.name} — ${c.email}` })),
                ]}
              />
              <Select
                label="Job *"
                value={jobId}
                onChange={(e) => setJobId(e.target.value)}
                options={[
                  { value: "", label: jobs.length ? "Select a job" : "No jobs available" },
                  ...jobs.map((j) => ({ value: j.id, label: j.title })),
                ]}
              />
              <Select
                label="Duration"
                options={DURATIONS}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
              <div className="flex-between mt-4">
                <Link href="/interviews" className="btn btn-secondary">
                  Cancel
                </Link>
                <Button type="submit" variant="primary" loading={saving} disabled={saving || !candidateId || !jobId}>
                  Create Interview
                </Button>
              </div>
            </form>
          </Card>

          <Card title="How it works">
            <ul className="list-plain">
              <li>
                <strong>AI Planning</strong> — An interview plan is generated automatically based on the job
                description, required skills, and the candidate&apos;s resume.
              </li>
              <li>
                <strong>Invite the candidate</strong> — Once the interview is created, you can invite the
                candidate via a secure token link.
              </li>
              <li>
                <strong>Evaluation</strong> — After the interview, use the Evaluate button to generate a
                structured AI evaluation and report.
              </li>
            </ul>
          </Card>
        </div>
      )}
    </AppShell>
  );
}