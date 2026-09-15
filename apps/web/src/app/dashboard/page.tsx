"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout";
import { StatCard, Icon, Spinner, EmptyState } from "@/components/ui";
import { api } from "@/lib/api";

type DashboardSummary = {
  jobs: { total: number; active: number; closed: number; draft: number };
  candidates: { total: number; screened: number; shortlisted: number; hired: number; rejected: number; archived: number; active: number };
  interviews: { scheduled: number; inProgress: number; completed: number; cancelled: number; total: number };
  matches: { pending: number; approved: number; rejected: number };
  emailsSent: number;
};

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<DashboardSummary>("/api/v1/dashboard/summary")
      .then(setSummary)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AppShell title="Dashboard" subtitle="Overview of your hiring pipeline">
      {loading && <Spinner label="Loading dashboard..." />}

      {!loading && error && (
        <EmptyState title="Could not load dashboard" message={error} />
      )}

      {!loading && summary && (
        <>
          <div className="stat-grid">
            <StatCard label="Active Jobs" value={summary.jobs.active} icon={<Icon name="briefcase" />} dashed />
            <StatCard label="Total Candidates" value={summary.candidates.total} icon={<Icon name="users" />} dashed />
            <StatCard label="Screening" value={summary.candidates.screened} icon={<Icon name="filter" />} dashed />
            <StatCard label="Shortlisted" value={summary.candidates.shortlisted} icon={<Icon name="star" />} dashed />
            <StatCard label="Interviews Scheduled" value={summary.interviews.scheduled} icon={<Icon name="calendar" />} dashed />
            <StatCard label="Interviews Completed" value={summary.interviews.completed} icon={<Icon name="check" />} dashed />
          </div>

          <div className="divider" />

          <div className="grid grid-3">
            <div className="card">
              <div className="card-title">Jobs</div>
              <div className="card-subtitle">Total {summary.jobs.total} · {summary.jobs.draft} draft · {summary.jobs.closed} closed</div>
              <Link href="/jobs" className="btn btn-secondary btn-sm mt-2">
                Manage Jobs
              </Link>
            </div>
            <div className="card">
              <div className="card-title">Candidates</div>
              <div className="card-subtitle">
                {summary.candidates.screened} screening · {summary.candidates.shortlisted} shortlisted · {summary.candidates.hired} hired
              </div>
              <Link href="/candidates" className="btn btn-secondary btn-sm mt-2">
                View Candidates
              </Link>
            </div>
            <div className="card">
              <div className="card-title">Interviews</div>
              <div className="card-subtitle">
                {summary.interviews.scheduled} scheduled · {summary.interviews.inProgress} in progress · {summary.interviews.completed} completed
              </div>
              <div className="flex mt-2">
                <Link href="/interviews" className="btn btn-secondary btn-sm">
                  Interviews
                </Link>
                <Link href="/jobs" className="btn btn-secondary btn-sm">
                  Matches: {summary.matches.pending} pending
                </Link>
              </div>
            </div>
          </div>

          <div className="card mt-4">
            <div className="card-header">
              <div className="card-title">Quick Links</div>
              <Link href="/jobs/new" className="btn btn-primary btn-sm">
                Create a Job
              </Link>
            </div>
            <div className="flex flex-wrap">
              <Link href="/candidates/upload" className="btn btn-secondary btn-sm">
                Upload Resumes
              </Link>
              <Link href="/interviews/new" className="btn btn-secondary btn-sm">
                Schedule Interview
              </Link>
              <Link href="/reports" className="btn btn-secondary btn-sm">
                HR Reports
              </Link>
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}