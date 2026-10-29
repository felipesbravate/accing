import '../src/ui/theme.css';
import { splashScript } from '../src/mirror/splash-script.js';

// Home-screen web app: manifest (app/manifest.js), icons and iOS launch images in public/icons (scripts/make-app-icons.mjs).
const launch = [
  [375, 667, 2], [375, 812, 3], [390, 844, 3], [393, 852, 3], [414, 896, 2], [414, 896, 3], [428, 926, 3], [430, 932, 3], [402, 874, 3], [440, 956, 3],
].map(([w, h, r]) => ({
  url: `/icons/launch-${w * r}x${h * r}.png`,
  media: `(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${r}) and (orientation: portrait)`,
}));

export const metadata = {
  title: 'Accing',
  description: 'Your daily fashion mirror',
  robots: { index: false, follow: false },
  icons: { icon: [{ url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }], apple: '/icons/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: 'Accing', statusBarStyle: 'default', startupImage: launch },
};
export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#F9F9FB' };

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: splashScript }} />
        <link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}
