import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { ToastProvider } from "@/lib/toast";
import { Navbar } from "@/components/layout";

export const metadata: Metadata = {
  title: {
    default: "Interviewed — AI Recruitment Platform",
    template: "%s · Interviewed",
  },
  description:
    "AI-assisted recruitment and automated interviewing for HR teams: resume parsing, candidate matching, AI interviews, and structured reports.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <ToastProvider>
            <Navbar />
            <main className="container">{children}</main>
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}