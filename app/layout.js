import '../src/ui/theme.css';

export const metadata = { title: 'Accing', description: 'Your daily fashion mirror', robots: { index: false, follow: false } };
export const viewport = { width: 'device-width', initialScale: 1, themeColor: '#F7F7F7' };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}
