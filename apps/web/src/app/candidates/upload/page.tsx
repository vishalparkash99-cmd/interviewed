"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout";
import { StatusBadge, Button, Badge, EmptyState, formatBytes, formatDate } from "@/components/ui";
import { api } from "@/lib/api";

type UploadRow = {
  name: string;
  size: number;
  status: "idle" | "uploading" | "done" | "error";
  error?: string;
  candidateId?: string;
};

type ResumeListItem = {
  id: string;
  fileName: string;
  fileSize: number;
  fileMimeType: string;
  status: string;
  error?: string | null;
  createdAt: string;
  candidate: { id: string; name: string; email: string; status: string } | null;
};

const RESUME_STATUS_MAP = {
  pending: "warning",
  queued: "warning",
  processing: "info",
  parsed: "success",
  failed: "danger",
} as const;

export default function UploadCandidatesPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [rows, setRows] = useState<UploadRow[]>([]);
  const [resumes, setResumes] = useState<ResumeListItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadResumes = useCallback(async () => {
    try {
      const res = await api.get<{ data: ResumeListItem[] }>("/api/v1/resumes?limit=50");
      setResumes(res.data ?? []);
    } catch {
      // keep current list
    }
  }, []);

  useEffect(() => {
    loadResumes();
  }, [loadResumes]);

  const updateRow = (name: string, patch: Partial<UploadRow>) =>
    setRows((prev) => prev.map((r) => (r.name === name ? { ...r, ...patch } : r)));

  const uploadFile = async (row: UploadRow, file: File) => {
    updateRow(row.name, { status: "uploading" });
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await api.post<{ candidate?: { id: string }; resume?: { id: string } }>(
        "/api/v1/resumes/upload",
        form
      );
      updateRow(row.name, { status: "done", candidateId: res.candidate?.id });
    } catch (e) {
      updateRow(row.name, { status: "error", error: (e as Error).message });
    }
  };

  const handleFiles = async (fileList: FileList | File[]) => {
    setError("");
    const files = Array.from(fileList).filter(
      (f) => /\.(pdf|docx?|txt)$/i.test(f.name) || f.type.startsWith("application/pdf") || f.type.includes("word") || f.type.startsWith("text/")
    );

    const newRows: UploadRow[] = files.map((f) => ({
      name: f.name,
      size: f.size,
      status: "idle",
    }));
    if (newRows.length === 0) {
      setError("Please choose .pdf, .docx, or .doc files.");
      return;
    }
    setRows((prev) => [...newRows, ...prev]);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const row = newRows[i];
      // eslint-disable-next-line no-await-in-loop
      await uploadFile(row, file);
    }
    loadResumes();
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  return (
    <AppShell
      title="Upload Resumes"
      subtitle="Drop PDF or Word documents — Interviewed parses them into candidate profiles"
      actions={<Link href="/candidates">Back to Candidates</Link>}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,.doc,.txt"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) handleFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {error && <div className="error-box">{error}</div>}

      <div
        className={`upload-zone ${dragging ? "dragging" : ""}`.trim()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
      >
        <div className="font-bold mb-2" style={{ fontSize: 16 }}>
          Drop resumes here or click to browse
        </div>
        <div className="text-secondary">Supported: PDF, DOCX, DOC, TXT — multiple files allowed</div>
      </div>

      {rows.length > 0 && (
        <div className="mt-4 mb-6">
          {rows.map((row) => (
            <div key={row.name} className="file-row">
              <div className="file-meta">
                <div className="file-name">{row.name}</div>
                <div className="file-size">{formatBytes(row.size)}</div>
              </div>
              {row.status === "idle" && <Badge variant="secondary">Waiting</Badge>}
              {row.status === "uploading" && <Badge variant="info">Uploading…</Badge>}
              {row.status === "done" && (
                <Badge variant="success">
                  {row.candidateId ? "Uploaded" : "Queued for parsing"}
                </Badge>
              )}
              {row.status === "error" && <Badge variant="danger">{row.error || "Failed"}</Badge>}
            </div>
          ))}
        </div>
      )}

      <div className="flex-between mb-4">
        <div>
          <h2 style={{ fontSize: 16 }}>Recent resumes</h2>
          <div className="text-light" style={{ fontSize: 12 }}>
            Refresh to see the latest parse status
          </div>
        </div>
        <Button
          variant="secondary"
          loading={refreshing}
          onClick={() => {
            setRefreshing(true);
            loadResumes().finally(() => setRefreshing(false));
          }}
        >
          Refresh
        </Button>
      </div>

      {resumes.length === 0 ? (
        <EmptyState title="No resumes uploaded yet" message="Upload a resume above to get started." />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>File</th>
                <th>Candidate</th>
                <th>Size</th>
                <th>Parse Status</th>
                <th>Uploaded</th>
              </tr>
            </thead>
            <tbody>
              {resumes.map((resume) => (
                <tr key={resume.id}>
                  <td className="font-bold">{resume.fileName}</td>
                  <td>
                    {resume.candidate ? (
                      <Link href={`/candidates/${resume.candidate.id}`}>
                        {resume.candidate.name}
                      </Link>
                    ) : (
                      <span className="text-light">—</span>
                    )}
                    {resume.candidate && (
                      <div className="text-light" style={{ fontSize: 12 }}>
                        {resume.candidate.email}
                      </div>
                    )}
                  </td>
                  <td className="text-secondary">{formatBytes(resume.fileSize)}</td>
                  <td>
                    <StatusBadge status={resume.status} map={RESUME_STATUS_MAP} />
                    {resume.error && (
                      <div className="text-danger" style={{ fontSize: 12 }}>
                        {resume.error}
                      </div>
                    )}
                  </td>
                  <td className="text-secondary">{formatDate(resume.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}