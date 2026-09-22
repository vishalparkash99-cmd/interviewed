"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout";
import { Card, Spinner, EmptyState, Badge, Button } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";

type OrgRow = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  trialInterviewLimit: number;
  createdAt: string;
  members: number;
  interviews: number;
  completedInterviews: number;
  used: number;
  blocked: boolean;
};

type Settings = {
  upgradeUrl: string;
  defaultTrialLimit: number;
};

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const toast = useToast();

  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [settings, setSettings] = useState<Settings>({ upgradeUrl: "", defaultTrialLimit: 5 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [edits, setEdits] = useState<Record<string, { plan: string; trialInterviewLimit: number }>>({});
  const [savingOrg, setSavingOrg] = useState<string | null>(null);

  const isSuperAdmin = user?.role === "super_admin";

  const load = useCallback(async () => {
    setError("");
    try {
      const [orgsRes, settingsRes] = await Promise.all([
        api.get<{ data: OrgRow[] }>("/api/v1/admin/orgs"),
        api.get<{ data: Settings }>("/api/v1/admin/settings"),
      ]);
      setOrgs(orgsRes.data ?? []);
      setSettings(settingsRes.data ?? { upgradeUrl: "", defaultTrialLimit: 5 });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!isSuperAdmin) {
      router.push("/dashboard");
      return;
    }
    load();
  }, [authLoading, isSuperAdmin, load, router]);

  const saveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      const res = await api.patch<{ data: Settings }>("/api/v1/admin/settings", settings);
      setSettings(res.data);
      toast.success("Settings saved");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSavingSettings(false);
    }
  };

  const saveOrg = async (org: OrgRow) => {
    const edit = edits[org.id];
    if (!edit) return;
    setSavingOrg(org.id);
    try {
      const body: Partial<{ plan: string; trialInterviewLimit: number }> = {};
      if (edit.plan !== org.plan) body.plan = edit.plan;
      if (edit.trialInterviewLimit !== org.trialInterviewLimit) body.trialInterviewLimit = edit.trialInterviewLimit;
      await api.patch(`/api/v1/admin/orgs/${org.id}`, body);
      toast.success(`${org.name} updated`);
      await load();
      setEdits((prev) => {
        const next = { ...prev };
        delete next[org.id];
        return next;
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) toast.error("Not authorized to change plans");
      else toast.error((err as Error).message);
    } finally {
      setSavingOrg(null);
    }
  };

  if (authLoading) {
    return (
      <AppShell title="Admin" subtitle="Platform administration">
        <Spinner label="Loading..." />
      </AppShell>
    );
  }

  if (!isSuperAdmin) {
    return (
      <AppShell title="Admin" subtitle="Platform administration">
        <EmptyState title="Access denied" message="Only platform administrators can view this page." />
      </AppShell>
    );
  }

  return (
    <AppShell title="Admin" subtitle="Platform administration">
      {loading && <Spinner label="Loading admin data..." />}
      {!loading && error && <EmptyState title="Could not load admin data" message={error} />}

      {!loading && !error && (
        <>
          <div style={{ marginBottom: 24 }}>
            <Card title="Platform settings">
              <form onSubmit={saveSettings}>
              <label className="form-label">
                Upgrade payment link (Razorpay / Stripe)
                <input
                  type="url"
                  className="input"
                  value={settings.upgradeUrl}
                  placeholder="https://rzp.io/l/..."
                  onChange={(e) => setSettings((s) => ({ ...s, upgradeUrl: e.target.value }))}
                  required={false}
                />
              </label>
              <label className="form-label">
                Default free trial limit (per new org)
                <input
                  type="number"
                  className="input"
                  min={0}
                  max={1000}
                  value={settings.defaultTrialLimit}
                  onChange={(e) => setSettings((s) => ({ ...s, defaultTrialLimit: Number(e.target.value) || 0 }))}
                />
              </label>
              <div className="mt-2">
                <Button type="submit" variant="primary" loading={savingSettings}>
                  Save settings
                </Button>
              </div>
            </form>
          </Card>
          </div>

          <Card title={`Organizations (${orgs.length})`}>
            <table className="table">
              <thead>
                <tr>
                  <th>Organization</th>
                  <th>Plan</th>
                  <th>Trial limit</th>
                  <th>Used</th>
                  <th>Interviews</th>
                  <th>Members</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {orgs.map((org) => {
                  const edit = edits[org.id];
                  const plan = edit?.plan ?? org.plan;
                  const limit = edit?.trialInterviewLimit ?? org.trialInterviewLimit;
                  return (
                    <tr key={org.id}>
                      <td>
                        <div className="strong">{org.name}</div>
                        <div className="muted small">{org.slug}</div>
                      </td>
                      <td>
                        <Badge variant={plan === "unlimited" ? "success" : "warning"}>{plan}</Badge>
                      </td>
                      <td>
                        <input
                          className="input input-sm"
                          style={{ width: 80 }}
                          type="number"
                          min={0}
                          max={1000}
                          value={limit}
                          disabled={plan === "unlimited"}
                          onChange={(e) =>
                            setEdits((prev) => ({
                              ...prev,
                              [org.id]: { plan, trialInterviewLimit: Number(e.target.value) || 0 },
                            }))
                          }
                        />
                      </td>
                      <td>{org.used}</td>
                      <td>
                        {org.interviews}
                        <span className="muted small"> ({org.completedInterviews} completed)</span>
                      </td>
                      <td>{org.members}</td>
                      <td className="text-right">
                        <div className="flex" style={{ gap: 8, justifyContent: "flex-end" }}>
                          <select
                            className="select select-sm"
                            value={plan}
                            onChange={(e) =>
                              setEdits((prev) => ({
                                ...prev,
                                [org.id]: { plan: e.target.value, trialInterviewLimit: limit },
                              }))
                            }
                          >
                            <option value="trial">trial</option>
                            <option value="unlimited">unlimited</option>
                          </select>
                          <Button variant="secondary" size="sm" loading={savingOrg === org.id} disabled={!edit} onClick={() => saveOrg(org)}>
                            Save
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </AppShell>
  );
}