"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout";
import { Input, Select, Textarea, Button, Card } from "@/components/ui";
import { api } from "@/lib/api";

const EMPLOYMENT_TYPES = ["fulltime", "parttime", "contract", "internship"] as const;
const DIFFICULTIES = ["easy", "medium", "hard"] as const;

function parseList(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

const WEIGHT_LABELS: { key: string; label: string }[] = [
  { key: "technical", label: "Technical" },
  { key: "experience", label: "Experience" },
  { key: "responsibilities", label: "Responsibilities" },
  { key: "qualification", label: "Qualification" },
  { key: "domain", label: "Domain" },
];

export default function NewJobPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    title: "",
    description: "",
    department: "",
    location: "",
    employmentType: "fulltime",
    experienceMinYears: "0",
    experienceMaxYears: "0",
    requiredSkills: "",
    preferredSkills: "",
    rolesResponsibilities: "",
    requiredQualifications: "",
    preferredQualifications: "",
    domain: "",
    interviewDuration: "45",
    interviewDifficulty: "medium",
    shortlistCount: "10",
    minimumScreeningScore: "60",
    weights: { technical: "30", experience: "25", responsibilities: "25", qualification: "10", domain: "10" } as Record<string, string>,
  });

  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));
  const setWeight = (key: string, value: string) =>
    setForm((f) => ({ ...f, weights: { ...f.weights, [key]: value } }));

  const toNumber = (v: string, fallback: number): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      department: form.department.trim() || undefined,
      location: form.location.trim() || undefined,
      employmentType: form.employmentType,
      experienceMinYears: toNumber(form.experienceMinYears, 0),
      experienceMaxYears: toNumber(form.experienceMaxYears, 0),
      requiredSkills: parseList(form.requiredSkills),
      preferredSkills: parseList(form.preferredSkills),
      rolesResponsibilities: parseList(form.rolesResponsibilities),
      requiredQualifications: parseList(form.requiredQualifications),
      preferredQualifications: parseList(form.preferredQualifications),
      domain: form.domain.trim() || undefined,
      interviewDuration: toNumber(form.interviewDuration, 45),
      interviewDifficulty: form.interviewDifficulty,
      shortlistCount: toNumber(form.shortlistCount, 10),
      minimumScreeningScore: toNumber(form.minimumScreeningScore, 60),
      scoringWeights: {
        technical: toNumber(form.weights.technical, 30),
        experience: toNumber(form.weights.experience, 25),
        responsibilities: toNumber(form.weights.responsibilities, 25),
        qualification: toNumber(form.weights.qualification, 10),
        domain: toNumber(form.weights.domain, 10),
      },
    };

    try {
      const created = await api.post<{ id: string }>("/api/v1/jobs", payload);
      router.push(`/jobs/${created.id}`);
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  };

  return (
    <AppShell
      title="Create Job"
      subtitle="Describe the role — AI will screen resumes and generate interviews from this profile"
      actions={<Link href="/jobs">Back to Jobs</Link>}
    >
      <form onSubmit={handleSubmit}>
        {error && <div className="error-box">{error}</div>}

        <div className="grid grid-2 items-start">
          <div>
            <Card title="Basic information" subtitle="The essentials every job posting needs">
              <Input
                label="Job title *"
                placeholder="e.g. Senior Frontend Engineer"
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                required
              />
              <div className="grid grid-2">
                <Input
                  label="Department"
                  placeholder="e.g. Engineering"
                  value={form.department}
                  onChange={(e) => set("department", e.target.value)}
                />
                <Input
                  label="Location"
                  placeholder="e.g. Remote / Berlin"
                  value={form.location}
                  onChange={(e) => set("location", e.target.value)}
                />
              </div>
              <Select
                label="Employment type"
                options={EMPLOYMENT_TYPES}
                value={form.employmentType}
                onChange={(e) => set("employmentType", e.target.value)}
              />
              <Input
                label="Domain / Industry"
                placeholder="e.g. Fintech, SaaS, Healthcare"
                value={form.domain}
                onChange={(e) => set("domain", e.target.value)}
              />
              <Textarea
                label="Description *"
                placeholder="Describe the role, team, and responsibilities"
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                required
                rows={4}
              />
              <div className="grid grid-2">
                <Input
                  label="Min experience (years)"
                  type="number"
                  min={0}
                  value={form.experienceMinYears}
                  onChange={(e) => set("experienceMinYears", e.target.value)}
                />
                <Input
                  label="Max experience (years)"
                  type="number"
                  min={0}
                  value={form.experienceMaxYears}
                  onChange={(e) => set("experienceMaxYears", e.target.value)}
                />
              </div>
            </Card>

            <Card title="Skills & qualifications" subtitle="Comma-separated lists make it easy for the AI matcher">
              <Input
                label="Required skills"
                hint="Comma separated, e.g. TypeScript, React, Node.js"
                placeholder="TypeScript, React, Node.js"
                value={form.requiredSkills}
                onChange={(e) => set("requiredSkills", e.target.value)}
              />
              <Input
                label="Preferred skills"
                hint="Comma separated"
                placeholder="GraphQL, AWS, Docker"
                value={form.preferredSkills}
                onChange={(e) => set("preferredSkills", e.target.value)}
              />
              <Textarea
                label="Roles & responsibilities"
                hint="One item per line"
                placeholder={"Lead feature development\nMentor junior engineers\n..."}
                value={form.rolesResponsibilities}
                onChange={(e) => set("rolesResponsibilities", e.target.value)}
                rows={4}
              />
              <Input
                label="Required qualifications"
                hint="Comma separated"
                placeholder="BSc in Computer Science, 5+ years..."
                value={form.requiredQualifications}
                onChange={(e) => set("requiredQualifications", e.target.value)}
              />
              <Input
                label="Preferred qualifications"
                hint="Comma separated"
                placeholder="MSc, Prior fintech experience..."
                value={form.preferredQualifications}
                onChange={(e) => set("preferredQualifications", e.target.value)}
              />
            </Card>
          </div>

          <div>
            <Card title="Interview setup" subtitle="How the automated AI interview should run">
              <div className="grid grid-2">
                <Input
                  label="Interview duration (min)"
                  type="number"
                  min={5}
                  max={180}
                  value={form.interviewDuration}
                  onChange={(e) => set("interviewDuration", e.target.value)}
                />
                <Select
                  label="Difficulty"
                  options={DIFFICULTIES}
                  value={form.interviewDifficulty}
                  onChange={(e) => set("interviewDifficulty", e.target.value)}
                />
              </div>
              <div className="grid grid-2">
                <Input
                  label="Shortlist count"
                  type="number"
                  min={1}
                  value={form.shortlistCount}
                  onChange={(e) => set("shortlistCount", e.target.value)}
                />
                <Input
                  label="Minimum screening score"
                  type="number"
                  min={0}
                  max={100}
                  value={form.minimumScreeningScore}
                  onChange={(e) => set("minimumScreeningScore", e.target.value)}
                />
              </div>
            </Card>

            <Card title="Scoring weights" subtitle="How the matcher weights each dimension when scoring candidates">
              <div className="grid grid-2">
                {WEIGHT_LABELS.map((w) => (
                  <Input
                    key={w.key}
                    label={`${w.label} (%)`}
                    type="number"
                    min={0}
                    max={100}
                    value={form.weights[w.key]}
                    onChange={(e) => setWeight(w.key, e.target.value)}
                  />
                ))}
              </div>
            </Card>

            <Card>
              <div className="flex-between">
                <Link href="/jobs" className="btn btn-secondary">
                  Cancel
                </Link>
                <Button type="submit" variant="primary" loading={saving} disabled={saving}>
                  {saving ? "Creating..." : "Create Job"}
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </form>
    </AppShell>
  );
}