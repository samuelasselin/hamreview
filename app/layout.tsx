import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "FlowReview",
  description: "Review AI-generated code by data flow.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
