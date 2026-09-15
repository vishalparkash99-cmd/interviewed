"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout";
import { Select, Card, Button, Spinner } from "@/components/ui";
import { api } from "@/lib/api";

type Candidate = { id: string; name: string; email: string };
type Job = { id: string; title: string; slug: string };

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
      setError((err as Error).message);
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

      {!loading && (
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