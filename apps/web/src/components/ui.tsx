"use client";

import type {
  ReactNode,
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type BadgeVariant = "primary" | "secondary" | "success" | "warning" | "danger" | "info";

type VariantMap = Record<string, BadgeVariant>;

const DEFAULT_STATUS_VARIANTS: VariantMap = {
  active: "success",
  completed: "success",
  approved: "success",
  parsed: "success",
  success: "success",
  strong_match: "success",
  strong: "success",
  hire: "success",
  positive: "success",
  sent: "success",
  shortlisted: "success",
  hired: "success",

  scheduled: "info",
  draft: "info",
  pending: "info",
  queued: "warning",
  processing: "info",
  in_progress: "warning",
  paused: "warning",
  paused_aus: "warning",
  review: "warning",
  neutral: "info",
  medium: "warning",

  rejected: "danger",
  cancelled: "danger",
  failed: "danger",
  archived: "danger",
  closed: "danger",
  reject: "danger",
  negative: "danger",
  danger: "danger",

  default: "secondary",
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export function labelize(value?: string | null): string {
  if (!value) return "—";
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatDate(value?: string | Date | null): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function formatDateTime(value?: string | Date | null): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export function formatDuration(minutes?: number | null): string {
  if (minutes == null) return "—";
  return `${minutes} min`;
}

export function formatBytes(bytes?: number | null): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function scoreColor(value?: number | null): BadgeVariant {
  const v = typeof value === "number" ? value : 0;
  if (v >= 70) return "success";
  if (v >= 50) return "warning";
  return "danger";
}

export function scoreHex(value?: number | null): string {
  const v = typeof value === "number" ? value : 0;
  if (v >= 70) return "#248a3d";
  if (v >= 50) return "#b25000";
  return "#d70015";
}

export function asArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => (typeof v === "string" ? v : JSON.stringify(v)));
  }
  if (typeof value === "string" && value.length > 0) return [value];
  return [];
}

/* ------------------------------------------------------------------ */
/* Primitives                                                          */
/* ------------------------------------------------------------------ */

export function Badge({
  variant = "info",
  className = "",
  children,
}: {
  variant?: BadgeVariant;
  className?: string;
  children: ReactNode;
}) {
  return <span className={`badge badge-${variant} ${className}`.trim()}>{children}</span>;
}

export function StatusBadge({
  status,
  map,
  className = "",
}: {
  status?: string | null;
  map?: VariantMap;
  className?: string;
}) {
  if (!status) return <Badge variant="secondary">—</Badge>;
  const resolved = map?.[status] ?? DEFAULT_STATUS_VARIANTS[status] ?? DEFAULT_STATUS_VARIANTS[status.toLowerCase()] ?? "secondary";
  return (
    <Badge variant={resolved} className={className}>
      {labelize(status)}
    </Badge>
  );
}

export function RecommendationBadge({ recommendation }: { recommendation?: string | null }) {
  if (!recommendation || recommendation === "pending") {
    return <Badge variant="secondary">Pending</Badge>;
  }
  const normalized = recommendation.toLowerCase();
  const variant: BadgeVariant = /strong|recommend|hire|positive/.test(normalized)
    ? "success"
    : /weak|reject|negative|no/.test(normalized)
      ? "danger"
      : "info";
  return <Badge variant={variant}>{labelize(recommendation)}</Badge>;
}

export function Card({
  title,
  subtitle,
  actions,
  children,
  className = "",
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`card ${className}`.trim()}>
      {(title || actions) && (
        <div className="card-header">
          <div>
            {title && <div className="card-title">{title}</div>}
            {subtitle && <div className="card-subtitle">{subtitle}</div>}
          </div>
          {actions && <div>{actions}</div>}
        </div>
      )}
      <div className="card-body">{children}</div>
    </div>
  );
}

export function Button({
  variant = "secondary",
  size,
  loading = false,
  type = "button",
  className = "",
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "lg";
  loading?: boolean;
}) {
  const classes = ["btn", `btn-${variant}`, size ? `btn-${size}` : "", loading ? "btn-loading" : "", className]
    .filter(Boolean)
    .join(" ");
  return (
    <button type={type} className={classes} disabled={disabled || loading} {...rest}>
      {loading && <span className="spinner spinner-sm" aria-hidden />}
      {children}
    </button>
  );
}

export function Input({
  label,
  hint,
  className = "",
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string }) {
  return (
    <div className="field">
      {label && <label className="field-label">{label}</label>}
      <input className={`input ${className}`.trim()} {...rest} />
      {hint && <div className="field-hint">{hint}</div>}
    </div>
  );
}

export function Select({
  label,
  hint,
  options = [],
  className = "",
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  hint?: string;
  options?: readonly (string | { value: string; label: string })[];
}) {
  return (
    <div className="field">
      {label && <label className="field-label">{label}</label>}
      <select className={`select ${className}`.trim()} {...rest}>
        {options.map((opt) => {
          if (typeof opt === "string") {
            return (
              <option key={opt} value={opt}>
                {labelize(opt)}
              </option>
            );
          }
          return (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          );
        })}
        {children}
      </select>
      {hint && <div className="field-hint">{hint}</div>}
    </div>
  );
}

export function Textarea({
  label,
  hint,
  className = "",
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; hint?: string }) {
  return (
    <div className="field">
      {label && <label className="field-label">{label}</label>}
      <textarea className={`textarea ${className}`.trim()} {...rest} />
      {hint && <div className="field-hint">{hint}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  icon,
  dashed = false,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  dashed?: boolean;
}) {
  return (
    <div className={`stat-card ${dashed ? "dashed" : ""}`.trim()}>
      <div>
        <div className="stat-label">{label}</div>
        <div className="stat-value">{value}</div>
      </div>
      {icon && <div className="stat-icon">{icon}</div>}
    </div>
  );
}

export function Spinner({ label, size = "md" }: { label?: string; size?: "sm" | "md" | "lg" }) {
  return (
    <div className="spinner-wrap">
      <span className={`spinner ${size === "lg" ? "spinner-lg" : ""}`.trim()} aria-hidden />
      {label && <span>{label}</span>}
    </div>
  );
}

export function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-title">{title}</div>
      {message && <div className="empty-message">{message}</div>}
      {action && <div>{action}</div>}
    </div>
  );
}

export function ProgressBar({
  label,
  value,
  max = 100,
  color,
}: {
  label?: string;
  value: number;
  max?: number;
  color?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className="score-row">
      {label && (
        <div className="score-label">
          <span>{label}</span>
          <span className="score-value">
            {Number.isFinite(value) ? value.toFixed(1) : "0"} / {max}
          </span>
        </div>
      )}
      <div className="progress">
        <div className="progress-fill" style={{ width: `${pct}%`, background: color ?? scoreHex(value) }} />
      </div>
    </div>
  );
}

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: readonly { key: string; label: ReactNode }[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          role="tab"
          aria-selected={active === tab.key}
          className={`tab ${active === tab.key ? "active" : ""}`.trim()}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function Icon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    briefcase: (
      <>
        <rect x="3" y="7" width="18" height="13" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M3 12h18" stroke="currentColor" strokeWidth="1.8" />
      </>
    ),
    users: (
      <>
        <circle cx="9" cy="8" r="3.4" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M3.5 19v-1.5a5.5 5.5 0 0 1 11 0V19" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M16 5.4a3.4 3.4 0 0 1 0 5.2M18 19v-1.5c0-1.4-.5-2.7-1.4-3.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
      </>
    ),
    filter: (
      <>
        <path d="M4 5h16l-6.5 7.5V19l-3-1.5v-5L4 5z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </>
    ),
    star: (
      <path
        d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.9L12 17l-5.2 2.7 1-5.9-4.3-4.1 5.9-.9z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    ),
    calendar: (
      <>
        <rect x="3.5" y="5" width="17" height="16" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M3.5 9.5h17M8 3v4M16 3v4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </>
    ),
    check: (
      <path d="M4.5 12.5l5 5 10-11" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    ),
    file: (
      <>
        <path d="M5 3.5a1.5 1.5 0 0 1 1.5-1.5h7L19 7.5V20a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 20V3.5z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M13.5 2v6h5.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </>
    ),
    mic: (
      <>
        <rect x="9" y="3" width="6" height="11" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M9 21h6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </>
    ),
    chart: (
      <>
        <path d="M4 20h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <rect x="6" y="11" width="3" height="6" rx="1" fill="currentColor" opacity="0.85" />
        <rect x="11" y="7" width="3" height="10" rx="1" fill="currentColor" opacity="0.7" />
        <rect x="16" y="9" width="3" height="8" rx="1" fill="currentColor" opacity="0.55" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M12 2.8v2.5M12 18.7v2.5M2.8 12h2.5M18.7 12h2.5M5.5 5.5l1.8 1.8M16.7 16.7l1.8 1.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </>
    ),
  };
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden data-icon={name}>
      {paths[name] ?? null}
    </svg>
  );
}