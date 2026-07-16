import { useEffect, useState } from 'react';

/**
 * Public smart download link — the QR code on printed materials points here
 * (https://dashboard.taximeiafert.com/get). Phones are redirected straight
 * to their store; desktop (or unknown) visitors see both store buttons.
 */
const APP_STORE_URL = 'https://apps.apple.com/app/id6786225522';
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.taximelafert';

type Platform = 'ios' | 'android' | 'other';

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  // Modern iPads report as "Macintosh" but expose multi-touch
  const isIpadOs = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  if (/iPhone|iPad|iPod/.test(ua) || isIpadOs) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'other';
}

export default function GetAppPage() {
  const [platform] = useState<Platform>(detectPlatform);

  useEffect(() => {
    if (platform === 'ios') window.location.replace(APP_STORE_URL);
    if (platform === 'android') window.location.replace(PLAY_STORE_URL);
  }, [platform]);

  // Shown on desktop, or briefly on phones while the store opens
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
      <div className="text-center max-w-sm w-full">
        <p className="text-6xl mb-4">🚕</p>
        <h1 className="text-2xl font-bold text-white mb-2">TaxiMeIAfert</h1>
        <p className="text-slate-400 text-sm mb-8">
          {platform === 'other'
            ? 'Download the app for your phone:'
            : 'Taking you to the store…'}
        </p>

        <div className="space-y-3">
          <a
            href={APP_STORE_URL}
            className="flex items-center justify-center gap-3 w-full py-3.5 rounded-xl bg-white text-slate-900 font-semibold hover:bg-slate-200 transition-colors"
          >
            <span className="text-xl"></span>
            Download on the App Store
          </a>
          <a
            href={PLAY_STORE_URL}
            className="flex items-center justify-center gap-3 w-full py-3.5 rounded-xl bg-emerald-500 text-white font-semibold hover:bg-emerald-600 transition-colors"
          >
            <span className="text-xl">▶</span>
            Get it on Google Play
          </a>
        </div>
      </div>
    </div>
  );
}
