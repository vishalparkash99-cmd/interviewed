"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { Icon } from "@/components/ui";

const NAV_LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: "chart" },
  { href: "/jobs", label: "Jobs", icon: "briefcase" },
  { href: "/candidates", label: "Candidates", icon: "users" },
  { href: "/interviews", label: "Interviews", icon: "mic" },
  { href: "/reports", label: "Reports", icon: "file" },
] as const;

export function Navbar() {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const displayName = user ? `${user.firstName} ${user.lastName}`.trim() || user.email : "";

  const handleLogout = async () => {
    await logout();
    router.push("/");
    router.refresh();
  };

  return (
    <nav className="navbar">
      <div className="nav-inner">
        <Link href="/" className="nav-brand">
          <span className="brand-mark">I</span>
          Interviewed
        </Link>

        {user && !loading && (
          <div className="nav-links">
            {NAV_LINKS.map((link) => {
              const active =
                pathname === link.href ||
                (link.href !== "/dashboard" && pathname.startsWith(`${link.href}/`)) ||
                (link.href === "/dashboard" && pathname === "/");
              return (
                <Link key={link.href} href={link.href} className={active ? "active" : ""}>
                  {link.label}
                </Link>
              );
            })}
          </div>
        )}

        <div className="nav-links">
          {loading ? null : user ? (
            <div className="nav-user">
              <span>{displayName}</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={handleLogout}>
                Sign Out
              </button>
            </div>
          ) : (
            <>
              <Link href="/login">Sign In</Link>
              <Link href="/register" className="btn btn-primary btn-sm">
                Sign Up
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

export function AppShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="shell">
      <aside className="sidebar">
        <nav>
          {NAV_LINKS.map((link) => {
            const active =
              pathname === link.href ||
              (link.href !== "/dashboard" && pathname.startsWith(`${link.href}/`));
            return (
              <Link key={link.href} href={link.href} className={`side-link ${active ? "active" : ""}`.trim()}>
                <span className="side-icon">
                  <Icon name={link.icon} />
                </span>
                {link.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className="shell-main">
        {(title || actions) && (
          <div className="page-header">
            <div>
              {title && <div className="page-title">{title}</div>}
              {subtitle && <div className="page-subtitle">{subtitle}</div>}
            </div>
            {actions && <div className="flex">{actions}</div>}
          </div>
        )}
        {children}
      </main>
    </div>
  );
}