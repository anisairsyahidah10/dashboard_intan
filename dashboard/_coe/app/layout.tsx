import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://dashboard-pemantauan-coe-ai.mdhafeez.chatgpt.site'),
  title: 'Dashboard Pemantauan 17 Inisiatif COE AI',
  description: 'Pemantauan portfolio Inisiatif 1 hingga 17 berdasarkan tarikh sasaran, pelaksanaan sebenar dan status aktiviti.',
  openGraph: {
    title: 'Dashboard Pemantauan 17 Inisiatif COE AI',
    description: 'Portfolio Inisiatif 1–17: tarikh sasaran, pelaksanaan sebenar dan status aktiviti.',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Dashboard Pemantauan Inisiatif COE AI' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Dashboard Pemantauan 17 Inisiatif COE AI',
    description: 'Portfolio Inisiatif 1–17: tarikh sasaran, pelaksanaan sebenar dan status aktiviti.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ms">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
