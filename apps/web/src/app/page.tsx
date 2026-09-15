import Link from "next/link";

const FEATURES = [
  {
    title: "Resume Parsing",
    description:
      "Drop PDF or Word resumes and Interviewed extracts skills, experience, and qualifications into structured candidate profiles.",
  },
  {
    title: "AI Matching",
    description:
      "Each candidate is scored against job requirements across five weighted dimensions — skill, experience, responsibility, qualification, and domain.",
  },
  {
    title: "Automated Interviews",
    description:
      "Generate structured interview plans, invite candidates with secure links, and capture responses — all without manual scheduling.",
  },
  {
    title: "Structured Reports",
    description:
      "Get competency scores, evidence, key Q&A, and a clear AI recommendation so HR can make the final, informed decision.",
  },
];

export default function HomePage() {
  return (
    <div>
      <section style={{ textAlign: "center", padding: "72px 20px 40px" }}>
        <h1 style={{ fontSize: 44, fontWeight: 700, letterSpacing: "-0.03em", marginBottom: 12, maxWidth: 720, marginLeft: "auto", marginRight: "auto" }}>
          AI-assisted recruitment and automated interviewing
        </h1>
        <p style={{ fontSize: 18, color: "#6e6e73", maxWidth: 600, margin: "0 auto 32px" }}>
          Interviewed parses resumes, ranks candidates against your job requirements, and runs
          structured AI interviews — giving HR a complete, evidence-backed report.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/register" className="btn btn-primary btn-lg">
            Sign Up
          </Link>
          <Link href="/login" className="btn btn-secondary btn-lg">
            Sign In
          </Link>
        </div>
        <p className="text-light mt-4" style={{ fontSize: 12 }}>
          HR teams and recruiters · Free trial available · GDPR-aware by design
        </p>
      </section>

      <section className="divider" style={{ maxWidth: 900, marginLeft: "auto", marginRight: "auto" }} />

      <section style={{ padding: "32px 0 48px" }}>
        <div className="grid grid-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="card" style={{ marginBottom: 0 }}>
              <div className="card-title" style={{ marginBottom: 6 }}>
                {f.title}
              </div>
              <div className="text-secondary" style={{ fontSize: 13, lineHeight: 1.55 }}>
                {f.description}
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer style={{ borderTop: "1px solid #e5e5ea", padding: "24px 0 8px", textAlign: "center", color: "#86868b", fontSize: 13 }}>
        <div className="nav-brand" style={{ justifyContent: "center", marginBottom: 8 }}>
          <span className="brand-mark">I</span>
          Interviewed
        </div>
        <p>AI recruitment platform for modern HR teams.</p>
      </footer>
    </div>
  );
}