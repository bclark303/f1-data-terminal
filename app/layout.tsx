import type { Metadata } from "next";
import "./globals.css";
import "./windowing.css";
import "./g-force.css";
import "./video-sync.css";
import "./live.css";

export const metadata: Metadata = {
  title: "F1 Data Terminal",
  description: "Replay and live Formula 1 timing and telemetry terminal",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
