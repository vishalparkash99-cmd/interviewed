"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout";
import { StatusBadge, Button, Spinner, EmptyState } from "@/components/ui";
import { api } from "@/lib/api";

type CandidateRow = {
  id: string;
  name: string;
  email: string;
  currentJobTitle?: string | null;
  currentCompany?: string | null;
  yearsOfExperience?: number;
  status: string;
  createdAt: string;
  resume?: { status?: string } | null;
};

type CandidatesResponse = {
  data: CandidateRow[];
  pagination: { page: number; limit: number; total: number };
};

export default function CandidatesPage() {
  const router = useRouter();
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get<CandidatesResponse>("/api/v1/candidates?limit=50");
      setCandidates(res.data ?? []);
      setTotal(res.pagination?.total ?? 0);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <AppShell
      title="Candidates"
      subtitle={`${total} candidates in your pipeline`}
      actions={
        <Link href="/candidates/upload" className="btn btn-primary">
          Upload Resumes
        </Link>
      }
    >
      {loading && <Spinner label="Loading candidates..." />}
      {!loading && error && <EmptyState title="Could not load candidates" message={error} />}

      {!loading && !error && candidates.length === 0 && (
        <EmptyState
          title="No candidates yet"
          message="Upload resumes and Interviewed will parse them and build candidate profiles automatically."
          action={
            <Link href="/candidates/upload" className="btn btn-primary">
              Upload Resumes
            </Link>
          }
        />
      )}

      {!loading && !error && candidates.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Current Role</th>
                <th>Experience</th>
                <th>Resume</th>
                <th>Status</th>
                <th className="actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => (
                <tr key={c.id} className="row-link" onClick={() => router.push(`/candidates/${c.id}`)}>
                  <td className="font-bold">{c.name}</td>
                  <td>{c.email}</td>
                  <td>
                    {c.currentJobTitle ? (
                      <>
                        {c.currentJobTitle}
                        {c.currentCompany ? ` @ ${c.currentCompany}` : ""}
                      </>
                    ) : (
                      <span className="text-light">—</span>
                    )}
                  </td>
                  <td className="text-secondary">{c.yearsOfExperience ?? 0} yrs</td>
                  <td>
                    {c.resume ? (
                      <StatusBadge status={c.resume.status} map={{ pending: "warning", queued: "warning", processing: "info", parsed: "success", failed: "danger" }} />
                    ) : (
                      <span className="text-light">None</span>
                    )}
                  </td>
                  <td>
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="actions">
                    <Button size="sm" variant="secondary" onClick={() => router.push(`/candidates/${c.id}`)}>
                      View
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}