import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Project Governance Workspace",
  description: "Local-first project governance workspace for .pmgov files.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
