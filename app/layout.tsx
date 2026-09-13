import type { Metadata } from "next";
import "./globals.css";
import "./windowing.css";
import "./g-force.css";

export const metadata: Metadata = {
  title: "F1 Data Terminal",
  description: "Replay-synchronized Formula 1 timing and telemetry terminal",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
