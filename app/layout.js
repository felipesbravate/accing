import '../src/ui/theme.css';
import { cookies } from 'next/headers';
import Splash from '../src/mirror/Splash.jsx';
import { splashScript } from '../src/mirror/splash-script.js';
import { knownName } from '../src/server/login-steps.js';

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

// The splash is in the layout, so it is in the very first bytes of HTML: on a home-screen launch it covers the screen
// while the server still works on the page (auth, today's looks), instead of a blank page. The name comes from this
// device's sign-in cookie (no database call).
export default async function RootLayout({ children }) {
  const name = knownName(await cookies());
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: splashScript }} />
        <link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700&display=swap" />
      </head>
      <body>
        <Splash name={name} />
        {children}
      </body>
    </html>
  );
}
