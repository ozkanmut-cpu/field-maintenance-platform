import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Field Maintenance Admin',
  description: 'Field Maintenance yönetim paneli',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
