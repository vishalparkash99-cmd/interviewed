"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout";
import { StatusBadge, Button, Spinner, EmptyState, formatDate } from "@/components/ui";
import { api } from "@/lib/api";

type InterviewRow = {
  id: string;
  status: string;
  totalDuration?: number;
  createdAt: string;
  startedAt?: string | null;
  candidate?: { id: string; name: string; email: string } | null;
  job?: { id: string; title: string } | null;
};

type InterviewsResponse = {
  data: InterviewRow[];
  pagination: { page: number; limit: number; total: number };
};

export default function InterviewsPage() {
  const router = useRouter();
  const [interviews, setInterviews] = useState<InterviewRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get<InterviewsResponse>("/api/v1/interviews?limit=50");
      setInterviews(res.data ?? []);
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
      title="Interviews"
      subtitle={`${total} interviews`}
      actions={<Link href="/interviews/new">Create Interview</Link>}
    >
      {loading && <Spinner label="Loading interviews..." />}
      {!loading && error && <EmptyState title="Could not load interviews" message={error} />}

      {!loading && !error && interviews.length === 0 && (
        <EmptyState
          title="No interviews scheduled"
          message="Create an interview to generate an AI plan and invite a candidate."
          action={
            <Link href="/interviews/new" className="btn btn-primary">
              Create Interview
            </Link>
          }
        />
      )}

      {!loading && !error && interviews.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Candidate</th>
                <th>Job</th>
                <th>Status</th>
                <th>Duration</th>
                <th>Date</th>
                <th className="actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {interviews.map((iv) => (
                <tr key={iv.id} className="row-link" onClick={() => router.push(`/interviews/${iv.id}`)}>
                  <td className="font-bold">{iv.candidate?.name ?? "—"}</td>
                  <td>{iv.job?.title ?? "—"}</td>
                  <td>
                    <StatusBadge status={iv.status} />
                  </td>
                  <td className="text-secondary">{iv.totalDuration ? `${iv.totalDuration} min` : "—"}</td>
                  <td className="text-secondary">{formatDate(iv.createdAt)}</td>
                  <td className="actions">
                    <Button size="sm" variant="secondary" onClick={() => router.push(`/interviews/${iv.id}`)}>
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