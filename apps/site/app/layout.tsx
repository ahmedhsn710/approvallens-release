import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "ApprovalLens — Proof before permission",
  description:
    "An independent review layer for coding agents. Inspect the action. Check the policy. Keep the decision.",
  openGraph: {
    title: "ApprovalLens — Proof before permission",
    description:
      "Policy-first review for AI coding agents. Hosted MCP and a native Cursor guard.",
  },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
