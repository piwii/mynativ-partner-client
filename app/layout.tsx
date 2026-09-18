import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
    title: "myNativ · Partner Desk",
    description: "Client partenaire myNativ : dossiers, devis, propositions et messagerie.",
    icons: {
        icon: "/favicon.svg",
        shortcut: "/favicon.svg",
    },
};
export default function RootLayout({ children, }: Readonly<{
    children: React.ReactNode;
}>) {
    return (<html lang="fr">
      <body className="antialiased">{children}</body>
    </html>);
}
