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
  Tabs,
  ProgressBar,
  asArray,
  formatDate,
} from "@/components/ui";
import { api } from "@/lib/api";

type CandidateMatch = {
  id: string;
  jobId: string;
  job?: { id: string; title: string; slug?: string };
  overallScore: number;
  skillScore: number;
  experienceScore: number;
  responsibilityScore: number;
  qualificationScore: number;
  domainScore: number;
  strengths: string[];
  gaps: string[];
  missingRequirements: string[];
  evidence: unknown[];
  recommendation: string;
  status: string;
};

type CandidateDetail = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  location?: string | null;
  yearsOfExperience: number;
  currentJobTitle?: string | null;
  currentCompany?: string | null;
  linkedinUrl?: string | null;
  portfolioUrl?: string | null;
  status: string;
  createdAt: string;
  normalizedData?: {
    skills?: string[];
    experience?: { title?: string; company?: string; summary?: string }[];
    education?: unknown[];
  };
  resume?: {
    id: string;
    fileName: string;
    fileSize: number;
    fileMimeType: string;
    status: string;
    filePath: string;
    extractedText?: string | null;
    error?: string | null;
  } | null;
  matches?: CandidateMatch[];
  interviews?: {
    id: string;
    status: string;
    jobId?: string;
    createdAt: string;
    startedAt?: string | null;
    endedAt?: string | null;
  }[];
};

export default function CandidateDetailPage() {
  const params = useParams<{ id: string }>();
  const candidateId = params.id;

  const [tab, setTab] = useState("profile");
  const [candidate, setCandidate] = useState<CandidateDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [resumeUrl, setResumeUrl] = useState("");
  const [resumeError, setResumeError] = useState("");

  useEffect(() => {
    api
      .get<CandidateDetail>(`/api/v1/candidates/${candidateId}`)
      .then(setCandidate)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [candidateId]);

  const openResume = async () => {
    if (!candidate?.resume) return;
    setResumeError("");
    try {
      const res = await api.get<{ signedUrl?: string }>(`/api/v1/resumes/${candidate.resume.id}`);
      if (res.signedUrl) {
        setResumeUrl(res.signedUrl);
        window.open(res.signedUrl, "_blank");
      } else {
        setResumeError("No signed URL available for this resume.");
      }
    } catch (e) {
      setResumeError((e as Error).message);
    }
  };

  if (loading) {
    return (
      <AppShell title="Candidate">
        <Spinner label="Loading candidate..." />
      </AppShell>
    );
  }

  if (error || !candidate) {
    return (
      <AppShell title="Candidate">
        <EmptyState title="Could not load candidate" message={error || "Candidate not found"} />
      </AppShell>
    );
  }

  const normalized = candidate.normalizedData ?? {};
  const skills = normalized.skills ?? [];
  const experience = normalized.experience ?? [];
  const resume = candidate.resume;
  const textPreview = resume?.extractedText ? `${resume.extractedText.slice(0, 600)}…` : "";
  const matches = candidate.matches ?? [];

  return (
    <AppShell
      title={candidate.name}
      subtitle={candidate.email}
      actions={
        <>
          <Link href="/candidates" className="btn btn-secondary btn-sm">
            All Candidates
          </Link>
          <StatusBadge status={candidate.status} />
        </>
      }
    >
      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: "profile", label: "Profile" },
          { key: "resume", label: resume ? "Resume" : "Resume (none)" },
          { key: "matches", label: `AI Match (${matches.length})` },
          { key: "interviews", label: `Interviews (${candidate.interviews?.length ?? 0})` },
        ]}
      />

      {tab === "profile" && (
        <div className="grid grid-2 items-start">
          <Card title="Contact">
            <div className="kv">
              <div className="kv-item">
                <div className="kv-label">Email</div>
                <div className="kv-value">{candidate.email}</div>
              </div>
              <div className="kv-item">
                <div className="kv-label">Phone</div>
                <div className="kv-value">{candidate.phone || "—"}</div>
              </div>
              <div className="kv-item">
                <div className="kv-label">Location</div>
                <div className="kv-value">{candidate.location || "—"}</div>
              </div>
              <div className="kv-item">
                <div className="kv-label">Years of experience</div>
                <div className="kv-value">{candidate.yearsOfExperience ?? 0}</div>
              </div>
              <div className="kv-item">
                <div className="kv-label">Current job title</div>
                <div className="kv-value">{candidate.currentJobTitle || "—"}</div>
              </div>
              <div className="kv-item">
                <div className="kv-label">Current company</div>
                <div className="kv-value">{candidate.currentCompany || "—"}</div>
              </div>
              <div className="kv-item">
                <div className="kv-label">LinkedIn</div>
                <div className="kv-value">
                  {candidate.linkedinUrl ? (
                    <a href={candidate.linkedinUrl} target="_blank" rel="noreferrer">
                      Open profile
                    </a>
                  ) : (
                    "—"
                  )}
                </div>
              </div>
              <div className="kv-item">
                <div className="kv-label">Created</div>
                <div className="kv-value">{formatDate(candidate.createdAt)}</div>
              </div>
            </div>
          </Card>

          <div>
            <Card title="Skills">
              {skills.length > 0 ? (
                skills.map((s) => (
                  <span key={s} className="chip">
                    {s}
                  </span>
                ))
              ) : (
                <span className="text-secondary">No parsed skills yet (pending resume parsing).</span>
              )}
            </Card>

            <Card title="Experience">
              {experience.length > 0 ? (
                <ul className="list-plain">
                  {experience.map((exp, i) => (
                    <li key={i}>
                      <div className="font-bold">
                        {[exp.title, exp.company].filter(Boolean).join(" @ ")}
                      </div>
                      {exp.summary && <div className="text-secondary mt-1">{exp.summary}</div>}
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-secondary">No parsed experience yet.</span>
              )}
            </Card>
          </div>
        </div>
      )}

      {tab === "resume" && (
        <Card title={resume ? resume.fileName : "Resume"}>
          {!resume ? (
            <EmptyState title="No resume on file" message="Upload a resume to create a parseable candidate profile." />
          ) : (
            <>
              <div className="flex flex-wrap mb-4">
                <Badge variant="secondary">{resume.fileMimeType}</Badge>
                <StatusBadge
                  status={resume.status}
                  map={{ pending: "warning", queued: "warning", processing: "info", parsed: "success", failed: "danger" }}
                />
                <Button variant="secondary" onClick={openResume}>
                  View resume
                </Button>
              </div>
              {resumeUrl && (
                <div className="notice">
                  <span>
                    <a href={resumeUrl} target="_blank" rel="noreferrer">
                      Open in new tab
                    </a>
                  </span>
                </div>
              )}
              {resumeError && <div className="error-box">{resumeError}</div>}

              <div className="section-label" style={{ marginTop: 0 }}>
                Extracted text preview
              </div>
              {textPreview ? (
                <pre
                  style={{
                    whiteSpace: "pre-wrap",
                    background: "#fafafa",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: 12,
                    fontSize: 13,
                    color: "#3a3a3c",
                  }}
                >
                  {textPreview}
                </pre>
              ) : (
                <p className="text-secondary">
                  {resume.status === "parsed" ? "No extracted text available." : "Text extraction is in progress."}
                </p>
              )}
            </>
          )}
        </Card>
      )}

      {tab === "matches" &&
        (matches.length === 0 ? (
          <EmptyState
            title="No AI matches yet"
            message="Generate a match from the job page to see the candidate's scored fit."
          />
        ) : (
          matches.map((m) => (
            <Card
              key={m.id}
              title={m.job?.title || `Match #${m.id.slice(0, 8)}`}
              actions={
                <>
                  <StatusBadge status={m.status} />
                  <RecommendationBadge recommendation={m.recommendation} />
                </>
              }
            >
              <div className="grid grid-2">
                <div>
                  <div className="score-row">
                    <div className="score-label">
                      <span>Overall match</span>
                      <span className="score-value">{m.overallScore.toFixed(1)} / 100</span>
                    </div>
                    <div className="progress">
                      <div
                        className="progress-fill"
                        style={{ width: `${Math.min(100, m.overallScore)}%` }}
                      />
                    </div>
                  </div>
                  <ProgressBar label="Skill" value={m.skillScore} />
                  <ProgressBar label="Experience" value={m.experienceScore} />
                  <ProgressBar label="Responsibility" value={m.responsibilityScore} />
                  <ProgressBar label="Qualification" value={m.qualificationScore} />
                  <ProgressBar label="Domain" value={m.domainScore} />
                </div>
                <div>
                  {m.strengths?.length > 0 && (
                    <>
                      <div className="section-label" style={{ marginTop: 0 }}>Strengths</div>
                      <ul>
                        {m.strengths.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    </>
                  )}
                  {m.gaps?.length > 0 && (
                    <>
                      <div className="section-label">Gaps</div>
                      <ul>
                        {m.gaps.map((g, i) => (
                          <li key={i}>{g}</li>
                        ))}
                      </ul>
                    </>
                  )}
                  {m.missingRequirements?.length > 0 && (
                    <>
                      <div className="section-label">Missing requirements</div>
                      <ul>
                        {m.missingRequirements.map((g, i) => (
                          <li key={i}>{g}</li>
                        ))}
                      </ul>
                    </>
                  )}
                  {m.evidence?.length > 0 && (
                    <>
                      <div className="section-label">Evidence</div>
                      <ul>
                        {asArray(m.evidence).slice(0, 8).map((e, i) => (
                          <li key={i}>{e}</li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              </div>
              <div className="divider" />
              <div className="flex flex-wrap">
                {m.job && (
                  <Link href={`/jobs/${m.job.id}`} className="btn btn-secondary btn-sm">
                    View Job
                  </Link>
                )}
                <Link href={`/interviews/new?candidate=${candidateId}&job=${m.jobId}`} className="btn btn-primary btn-sm">
                  Schedule Interview
                </Link>
              </div>
            </Card>
          ))
        ))}

      {tab === "interviews" &&
        ((candidate.interviews?.length ?? 0) === 0 ? (
          <EmptyState
            title="No interviews yet"
            message="Schedule an AI interview for this candidate to get structured evaluation."
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Scheduled</th>
                  <th>Started</th>
                  <th>Ended</th>
                  <th className="actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(candidate.interviews ?? []).map((iv) => (
                  <tr key={iv.id}>
                    <td>
                      <StatusBadge status={iv.status} />
                    </td>
                    <td>{formatDate(iv.createdAt)}</td>
                    <td>{iv.startedAt ? formatDate(iv.startedAt) : "—"}</td>
                    <td>{iv.endedAt ? formatDate(iv.endedAt) : "—"}</td>
                    <td className="actions">
                      <Link href={`/interviews/${iv.id}`} className="btn btn-secondary btn-sm">
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </AppShell>
  );
}