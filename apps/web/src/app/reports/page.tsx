"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout";
import { StatusBadge, RecommendationBadge, Button, Spinner, EmptyState, formatDate } from "@/components/ui";
import { api } from "@/lib/api";

type ReportRow = {
  id: string;
  status: string;
  createdAt: string;
  resumeMatchScore?: number;
  interviewScore?: number;
  aiRecommendation?: string;
  interview?: {
    id: string;
    status?: string;
    candidate?: { id: string; name: string; email: string };
    job?: { id: string; title: string };
  };
};

type ReportDetail = {
  id: string;
  status: string;
  resumeMatchScore: number;
  interviewScore: number;
  aiRecommendation: string;
  createdAt: string;
};

export default function ReportsPage() {
  const router = useRouter();
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await api.get<{ data: ReportRow[] }>("/api/v1/reports?limit=50");
        const rows = res.data ?? [];

        const enriched = await Promise.all(
          rows.slice(0, 25).map(async (row) => {
            try {
              const detail = await api.get<ReportDetail>(`/api/v1/reports/${row.id}`);
              return { ...row, ...detail };
            } catch {
              return row;
            }
          })
        );
        setReports(rows.length > 0 ? enriched : []);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <AppShell title="Reports" subtitle="Structured AI reports for completed interviews">
      {loading && <Spinner label="Loading reports..." />}
      {!loading && error && <EmptyState title="Could not load reports" message={error} />}

      {!loading && !error && reports.length === 0 && (
        <EmptyState
          title="No reports yet"
          message="Complete interviews, then click Evaluate and Generate Report to compile HR reports."
        />
      )}

      {!loading && !error && reports.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Candidate</th>
                <th>Job</th>
                <th>Match Score</th>
                <th>Interview Score</th>
                <th>AI Recommendation</th>
                <th>Status</th>
                <th>Created</th>
                <th className="actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id} className="row-link" onClick={() => router.push(`/reports/${r.id}`)}>
                  <td className="font-bold">{r.interview?.candidate?.name ?? "—"}</td>
                  <td>{r.interview?.job?.title ?? "—"}</td>
                  <td>{typeof r.resumeMatchScore === "number" ? r.resumeMatchScore.toFixed(1) : "—"}</td>
                  <td>{typeof r.interviewScore === "number" ? r.interviewScore.toFixed(1) : "—"}</td>
                  <td>
                    <RecommendationBadge recommendation={r.aiRecommendation} />
                  </td>
                  <td>
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="text-secondary">{formatDate(r.createdAt)}</td>
                  <td className="actions">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => router.push(`/reports/${r.id}`)}
                    >
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