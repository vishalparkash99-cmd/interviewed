"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout";
import { StatusBadge, Spinner, EmptyState, Button } from "@/components/ui";
import { api } from "@/lib/api";
import type { JobStatus } from "@interviewed/types";

type JobRow = {
  id: string;
  title: string;
  department?: string | null;
  location?: string | null;
  employmentType: string;
  status: JobStatus;
  createdAt: string;
  _count?: { interviews: number; matches: number };
};

type JobsResponse = {
  data: JobRow[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
};

export default function JobsPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [pagination, setPagination] = useState({ page: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get<JobsResponse>(`/api/v1/jobs?page=${page}&limit=50`);
      setJobs(res.data ?? []);
      setPagination({ page: res.pagination?.page ?? 1, total: res.pagination?.total ?? 0 });
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
      title="Jobs"
      subtitle="Post openings, review candidates, and manage interviews"
      actions={<Link href="/jobs/new">Create Job</Link>}
    >
      {loading && <Spinner label="Loading jobs..." />}
      {!loading && error && <EmptyState title="Could not load jobs" message={error} />}

      {!loading && !error && jobs.length === 0 && (
        <EmptyState
          title="No jobs yet"
          message="Create your first job to start collecting candidates and running AI matching."
          action={
            <Link href="/jobs/new" className="btn btn-primary">
              Create Job
            </Link>
          }
        />
      )}

      {!loading && !error && jobs.length > 0 && (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Department</th>
                  <th>Location</th>
                  <th>Employment Type</th>
                  <th>Status</th>
                  <th className="text-secondary">Matches</th>
                  <th className="text-secondary">Interviews</th>
                  <th className="actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id} className="row-link" onClick={() => router.push(`/jobs/${job.id}`)}>
                    <td>
                      <div className="font-bold">{job.title}</div>
                      <div className="text-light" style={{ fontSize: 12 }}>
                        Created {new Date(job.createdAt).toLocaleDateString()}
                      </div>
                    </td>
                    <td>{job.department || "—"}</td>
                    <td>{job.location || "—"}</td>
                    <td className="text-secondary">{job.employmentType}</td>
                    <td>
                      <StatusBadge status={job.status} />
                    </td>
                    <td className="text-secondary">{job._count?.matches ?? 0}</td>
                    <td className="text-secondary">{job._count?.interviews ?? 0}</td>
                    <td className="actions">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/jobs/${job.id}`);
                        }}
                      >
                        View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pagination.total > 50 && (
            <div className="flex mt-4 text-secondary">
              <span>
                Page {pagination.page} · {pagination.total} jobs
              </span>
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}