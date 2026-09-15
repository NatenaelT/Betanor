import type { Metadata } from "next";

import { BETANOR_LOGO_DATA_URI } from "@/lib/brand-assets";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Betanor | Technology You Can Rely On",
    template: "%s | Betanor",
  },
  description:
    "Betanor General Trading P.L.C. — technology consulting, implementation, and support.",
  icons: {
    icon: BETANOR_LOGO_DATA_URI,
    shortcut: BETANOR_LOGO_DATA_URI,
    apple: BETANOR_LOGO_DATA_URI,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
