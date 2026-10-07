import type { Metadata, Viewport } from "next";
import type { CSSProperties } from "react";

import { CustomerChatWidget } from "@/components/portal/customer-chat-widget";
import { AppDialogProvider } from "@/components/ui/app-dialog-provider";
import { FieldTooltips } from "@/components/ui/field-tooltips";
import { PwaRuntime } from "@/components/pwa/pwa-runtime";
import { loadCachedStyleSettings } from "@/lib/public-cache";
import { googleFontsHref } from "@/lib/style-settings";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Betanor | Technology You Can Rely On",
    template: "%s | Betanor",
  },
  description:
    "Betanor General Trading P.L.C. — technology consulting, implementation, and support.",
  applicationName: "Betanor Digital Business Platform",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Betanor",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/betanor-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/betanor-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: "/apple-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0b264f",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const styleSettings = await loadCachedStyleSettings();
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
      <body className="min-h-full flex flex-col" style={style}>
        <AppDialogProvider><PwaRuntime>{children}<CustomerChatWidget /><FieldTooltips /></PwaRuntime></AppDialogProvider>
      </body>
    </html>
  );
}
