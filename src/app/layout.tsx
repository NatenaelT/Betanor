import type { Metadata } from "next";
import type { CSSProperties } from "react";

import { BETANOR_LOGO_DATA_URI } from "@/lib/brand-assets";
import { createClient } from "@/lib/supabase/server";
import { googleFontsHref, loadStyleSettings } from "@/lib/style-settings";
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

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const styleSettings = await loadStyleSettings(await createClient());
  const radiusByScale = { compact: "0.5rem", medium: "0.75rem", soft: "1rem" } as const;
  const style = {
    "--betanor-font-family": `'${styleSettings.font_family}', Aptos, Arial, Helvetica, sans-serif`,
    "--betanor-heading-font-family": `'${styleSettings.heading_font_family}', var(--betanor-font-family)`,
    "--betanor-navy": styleSettings.primary_color,
    "--betanor-blue": styleSettings.primary_color,
    "--betanor-gold": styleSettings.accent_color,
    "--betanor-surface": styleSettings.surface_color,
    "--betanor-text": styleSettings.text_color,
    "--betanor-nav-bg": styleSettings.nav_color,
    "--betanor-nav-text": styleSettings.nav_text_color,
    "--betanor-nav-hover": styleSettings.primary_color,
    "--betanor-nav-active": styleSettings.primary_color,
    "--betanor-nav-edge": styleSettings.accent_color,
    "--betanor-header-bg": styleSettings.header_color,
    "--betanor-header-text": styleSettings.header_text_color,
    "--betanor-footer-bg": styleSettings.footer_color,
    "--betanor-footer-text": styleSettings.footer_text_color,
    "--betanor-button-bg": styleSettings.button_color,
    "--betanor-button-text": styleSettings.button_text_color,
    "--betanor-field-background": styleSettings.field_background_color,
    "--betanor-field-text": styleSettings.field_text_color,
    "--betanor-field-border": styleSettings.field_border_color,
    "--betanor-field-focus": styleSettings.field_focus_color,
    "--betanor-radius-md": radiusByScale[styleSettings.radius_scale],
  } as CSSProperties;
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={googleFontsHref(styleSettings)} />
      </head>
      <body className="min-h-full flex flex-col" style={style}>{children}</body>
    </html>
  );
}
