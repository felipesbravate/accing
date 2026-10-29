// Web app manifest: what Android and desktop Chrome use when Accing is added to the home screen.
// Background is primitive blue-100, the splash colour in Figma, so the system splash and ours match.
export default function manifest() {
  return {
    name: 'Accing',
    short_name: 'Accing',
    description: 'Your daily fashion mirror',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#E7E7F7',
    theme_color: '#F9F9FB',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
