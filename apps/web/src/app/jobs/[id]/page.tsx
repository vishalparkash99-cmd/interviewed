"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout";
import { useToast } from "@/lib/toast";
import {
  Card,
  Button,
  Badge,
  StatusBadge,
  RecommendationBadge,
  Spinner,
  EmptyState,
  Tabs,
  Select,
  ProgressBar,
  Icon,
  asArray,
  labelize,
  formatDate,
} from "@/components/ui";
import { api } from "@/lib/api";

type JobDetail = {
  id: string;
  title: string;
  slug: string;
  description: string;
  department?: string | null;
  location?: string | null;
  employmentType: string;
  experienceMinYears: number;
  experienceMaxYears: number;
  status: string;
  domain?: string | null;
  requiredSkills?: string[];
  preferredSkills?: string[];
  rolesResponsibilities?: unknown[];
  requiredQualifications?: string[];
  preferredQualifications?: string[];
  interviewDuration?: number;
  interviewDifficulty?: string;
  shortlistCount?: number;
  minimumScreeningScore?: number;
  scoringWeights?: Record<string, unknown>;
  createdAt?: string;
  organization?: { name?: string } | null;
  interviews?: { id: string; status: string; createdAt: string }[];
};

type CandidateLite = { id: string; name: string; email: string };

type RankRow = {
  rank: number;
  matchId: string;
  candidate: {
    id: string;
    name: string;
    email: string;
    currentJobTitle?: string | null;
    currentCompany?: string | null;
  };
  scores: {
    overall: number;
    skill: number;
    experience: number;
    responsibility: number;
    qualification: number;
    domain: number;
  };
  strengths: string[];
  gaps: string[];
  missingRequirements: string[];
  recommendation: string;
  status: string;
};

function responsibilityText(item: unknown): string {
  if (typeof item === "string") return item;
  if (item && typeof item === "object") {
    const o = item as Record<string, unknown>;
    const title = String(o.title ?? o.label ?? "");
    const desc = o.description ? String(o.description) : "";
    return desc ? `${title} — ${desc}` : title;
  }
  return "";
}

export default function JobDetailPage() {
  const params = useParams<{ id: string }>();
  const jobId = params.id;
  const toast = useToast();

  const [tab, setTab] = useState("overview");
  const [job, setJob] = useState<JobDetail | null>(null);
  const [ranking, setRanking] = useState<RankRow[]>([]);
  const [candidates, setCandidates] = useState<CandidateLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingRanking, setLoadingRanking] = useState(false);
  const [error, setError] = useState("");

  const [selectedCandidate, setSelectedCandidate] = useState("");
  const [generating, setGenerating] = useState(false);

  const loadRanking = useCallback(async () => {
    setLoadingRanking(true);
    try {
      const res = await api.get<{ ranking: RankRow[] }>(`/api/v1/matches/ranking/${jobId}`);
      setRanking(res.ranking ?? []);
    } catch {
      setRanking([]);
    } finally {
      setLoadingRanking(false);
    }
  }, [jobId]);

  useEffect(() => {
    api
      .get<JobDetail>(`/api/v1/jobs/${jobId}`)
      .then((j) => setJob(j))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));

    api
      .get<{ data: CandidateLite[] }>("/api/v1/candidates?limit=100")
      .then((res) => setCandidates(res.data ?? []))
      .catch(() => {});
  }, [jobId]);

  useEffect(() => {
    if (tab === "candidates") {
      loadRanking();
    }
  }, [tab, loadRanking]);

  const decide = async (matchId: string, decision: "approved" | "rejected") => {
    try {
      await api.post(`/api/v1/matches/${matchId}/decide`, { decision });
      toast.success(`Match ${decision}.`);
      loadRanking();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const generate = async () => {
    if (!selectedCandidate) {
      toast.error("Select a candidate first.");
      return;
    }
    setGenerating(true);
    try {
      const res = await api.post<{ status: string }>("/api/v1/matches/generate", {
        candidateId: selectedCandidate,
        jobId,
      });
      toast.success(`Matching job queued for candidate (${res.status}). Scores will appear once processed.`);
      setSelectedCandidate("");
      setTimeout(() => loadRanking(), 3000);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <AppShell title="Job">
        <Spinner label="Loading job..." />
      </AppShell>
    );
  }

  if (error || !job) {
    return (
      <AppShell title="Job" actions={<Link href="/jobs">Back to Jobs</Link>}>
        <EmptyState title="Could not load job" message={error || "Job not found"} />
      </AppShell>
    );
  }

  const weights = job.scoringWeights ?? {};
  const responsibilities = (job.rolesResponsibilities ?? []).map(responsibilityText).filter(Boolean);
  const interviewCount = job.interviews?.length ?? 0;

  return (
    <AppShell
      title={job.title}
      subtitle={`${job.department || "General"} · ${job.location || "Remote / Anywhere"} · ${labelize(job.employmentType)}`}
      actions={
        <>
          <Link href={`/interviews?job=${job.id}`} className="btn btn-secondary btn-sm">
            <Icon name="mic" /> Interviews ({interviewCount})
          </Link>
          <Link href="/jobs" className="btn btn-secondary btn-sm">
            All Jobs
          </Link>
        </>
      }
    >
      <div className="flex mb-4">
        <StatusBadge status={job.status} />
        <Badge variant="secondary">{labelize(job.employmentType)}</Badge>
        {job.domain && <Badge variant="info">{job.domain}</Badge>}
      </div>

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: "overview", label: "Overview" },
          { key: "candidates", label: `Candidates (${ranking.length})` },
        ]}
      />

      {tab === "overview" && (
        <div className="grid grid-2 items-start">
          <div>
            <Card title="Description">
              <p style={{ whiteSpace: "pre-wrap" }}>{job.description}</p>

              {responsibilities.length > 0 && (
                <>
                  <div className="section-label">Roles & Responsibilities</div>
                  <ul className="list-plain">
                    {responsibilities.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </>
              )}
            </Card>

            <Card title="Skills & Qualifications">
              <div className="section-label" style={{ marginTop: 0 }}>
                Required skills
              </div>
              {asArray(job.requiredSkills).map((s) => (
                <span key={s} className="chip">
                  {s}
                </span>
              ))}
              <div className="section-label">Preferred skills</div>
              {asArray(job.preferredSkills).map((s) => (
                <span key={s} className="chip">
                  {s}
                </span>
              ))}
              <div className="section-label">Required qualifications</div>
              <ul className="list-plain">
                {asArray(job.requiredQualifications).map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
              <div className="section-label">Preferred qualifications</div>
              <ul className="list-plain">
                {asArray(job.preferredQualifications).map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </Card>
          </div>

          <div>
            <Card title="Job details" subtitle="Configuration for screening and interviewing">
              <div className="kv">
                <div className="kv-item">
                  <div className="kv-label">Experience</div>
                  <div className="kv-value">
                    {job.experienceMinYears}–{job.experienceMaxYears} yrs
                  </div>
                </div>
                <div className="kv-item">
                  <div className="kv-label">Interview duration</div>
                  <div className="kv-value">{job.interviewDuration ?? 45} min</div>
                </div>
                <div className="kv-item">
                  <div className="kv-label">Interview difficulty</div>
                  <div className="kv-value">{labelize(job.interviewDifficulty)}</div>
                </div>
                <div className="kv-item">
                  <div className="kv-label">Shortlist count</div>
                  <div className="kv-value">{job.shortlistCount ?? 10}</div>
                </div>
                <div className="kv-item">
                  <div className="kv-label">Min screening score</div>
                  <div className="kv-value">{job.minimumScreeningScore ?? 60}</div>
                </div>
                <div className="kv-item">
                  <div className="kv-label">Created</div>
                  <div className="kv-value">{formatDate(job.createdAt)}</div>
                </div>
                <div className="kv-item">
                  <div className="kv-label">Organization</div>
                  <div className="kv-value">{job.organization?.name ?? "—"}</div>
                </div>
              </div>
            </Card>

            <Card title="Scoring weights" subtitle="How AI evaluates candidate fit">
              {[
                ["technical", "Technical"],
                ["experience", "Experience"],
                ["responsibilities", "Responsibilities"],
                ["qualification", "Qualification"],
                ["domain", "Domain"],
              ].map(([key, label]) => (
                <ProgressBar key={key} label={label} value={Number(weights[key] ?? 0)} max={100} color="#0071e3" />
              ))}
            </Card>

            <Card title="Next steps">
              <div className="flex flex-wrap">
                <Button
                  variant="primary"
                  onClick={() => {
                    setTab("candidates");
                    loadRanking();
                  }}
                >
                  View Candidate Matches
                </Button>
                <Link href={`/interviews/new?job=${job.id}`} className="btn btn-secondary">
                  Schedule Interview
                </Link>
              </div>
            </Card>
          </div>
        </div>
      )}

      {tab === "candidates" && (
        <>
          <Card title="Generate AI Matches" subtitle="Run the matching engine against a candidate to produce a scored fit report">
            <div className="flex flex-wrap">
              <div style={{ flex: 1, minWidth: 260 }}>
                <Select
                  label="Candidate"
                  value={selectedCandidate}
                  onChange={(e) => setSelectedCandidate(e.target.value)}
                  options={[{ value: "", label: candidates.length ? "Select a candidate..." : "No candidates available" }, ...candidates.map((c) => ({ value: c.id, label: `${c.name} — ${c.email}` }))]}
                />
              </div>
              <div className="flex" style={{ alignItems: "flex-end", marginBottom: 16 }}>
                <Button variant="primary" onClick={generate} loading={generating} disabled={generating}>
                  {generating ? "Queuing..." : "Generate Match"}
                </Button>
              </div>
            </div>
            <div className="text-secondary" style={{ fontSize: 12 }}>
              The job must have at least one uploaded candidate to match. Processing happens in the background.
            </div>
          </Card>

          {loadingRanking && <Spinner label="Refreshing rankings..." />}

          {!loadingRanking && ranking.length === 0 && (
            <EmptyState
              title="No matches yet"
              message="Generate a match to see a scored rank of candidates for this job."
            />
          )}

          {!loadingRanking && ranking.length > 0 && (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Candidate</th>
                    <th>Match Score</th>
                    <th>Recommendation</th>
                    <th>Status</th>
                    <th className="actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((m) => (
                    <tr key={m.matchId}>
                      <td className="font-bold">{m.rank}</td>
                      <td>
                        <Link href={`/candidates/${m.candidate.id}`} className="font-bold">
                          {m.candidate.name}
                        </Link>
                        <div className="text-light" style={{ fontSize: 12 }}>
                          {m.candidate.currentJobTitle && m.candidate.currentCompany
                            ? `${m.candidate.currentJobTitle} @ ${m.candidate.currentCompany}`
                            : m.candidate.email}
                        </div>
                      </td>
                      <td>
                        <div className="font-bold" style={{ color: "#248a3d" }}>
                          {m.scores.overall.toFixed(0)}
                        </div>
                        <div className="text-light" style={{ fontSize: 11 }}>
                          skill {m.scores.skill.toFixed(0)} · exp {m.scores.experience.toFixed(0)} · resp {m.scores.responsibility.toFixed(0)} · qual {m.scores.qualification.toFixed(0)} · dom {m.scores.domain.toFixed(0)}
                        </div>
                      </td>
                      <td>
                        <RecommendationBadge recommendation={m.recommendation} />
                      </td>
                      <td>
                        <StatusBadge status={m.status} />
                      </td>
                      <td className="actions">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setSelectedCandidate(m.candidate.id);
                            const el = document.getElementById("match-detail");
                            el?.scrollIntoView({ behavior: "smooth" });
                          }}
                        >
                          Details
                        </Button>
                        {m.status === "pending" && (
                          <>
                            <Button size="sm" variant="primary" onClick={() => decide(m.matchId, "approved")}>
                              Approve
                            </Button>
                            <Button size="sm" variant="danger" onClick={() => decide(m.matchId, "rejected")}>
                              Reject
                            </Button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!loadingRanking &&
            ranking
              .filter((m) => m.candidate.id === selectedCandidate)
              .map((m) => (
                <div key={`detail-${m.matchId}`} id="match-detail">
                  <Card title={`Score breakdown — ${m.candidate.name}`} actions={<StatusBadge status={m.status} />}>
                    <div className="grid grid-2">
                      <div>
                        <ProgressBar label="Skill" value={m.scores.skill} />
                        <ProgressBar label="Experience" value={m.scores.experience} />
                        <ProgressBar label="Responsibility" value={m.scores.responsibility} />
                        <ProgressBar label="Qualification" value={m.scores.qualification} />
                        <ProgressBar label="Domain" value={m.scores.domain} />
                      </div>
                      <div>
                        <div className="flex mb-2">
                          <span className="text-secondary" style={{ width: 120 }}>Overall</span>
                          <span className="font-bold" style={{ fontSize: 18 }}>
                            {m.scores.overall.toFixed(1)}
                          </span>
                        </div>
                        {m.strengths?.length > 0 && (
                          <>
                            <div className="section-label" style={{ marginTop: 0 }}>Strengths</div>
                            <ul className="list-plain">
                              {m.strengths.map((s, i) => (
                                <li key={i}>{s}</li>
                              ))}
                            </ul>
                          </>
                        )}
                        {m.gaps?.length > 0 && (
                          <>
                            <div className="section-label">Gaps</div>
                            <ul className="list-plain">
                              {m.gaps.map((g, i) => (
                                <li key={i}>{g}</li>
                              ))}
                            </ul>
                          </>
                        )}
                        {m.missingRequirements?.length > 0 && (
                          <>
                            <div className="section-label">Missing requirements</div>
                            <ul className="list-plain">
                              {m.missingRequirements.map((g, i) => (
                                <li key={i}>{g}</li>
                              ))}
                            </ul>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="divider" />
                    <div className="flex flex-wrap">
                      <Button variant="primary" onClick={() => decide(m.matchId, "approved")}>
                        Approve — Shortlist
                      </Button>
                      <Button variant="danger" onClick={() => decide(m.matchId, "rejected")}>
                        Reject
                      </Button>
                      <Link href={`/interviews/new?job=${jobId}&candidate=${m.candidate.id}`} className="btn btn-secondary">
                        Schedule Interview
                      </Link>
                    </div>
                  </Card>
                </div>
              ))}
        </>
      )}
    </AppShell>
  );
}