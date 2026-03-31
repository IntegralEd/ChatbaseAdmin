import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ChatbaseAdmin',
  description: 'Internal ops app for reviewing Chatbase conversations and managing training changes',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
