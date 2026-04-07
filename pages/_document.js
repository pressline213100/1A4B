
import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="zh-TW">
      <Head>
        {/* Tailwind Play CDN for immediate previewing */}
        <script src="https://cdn.tailwindcss.com"></script>
        {/* Inter Font from Google Fonts */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="true" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
        {/* Custom Tailwind Config for specialized gradients */}
        <script dangerouslySetInnerHTML={{ __html: `
          tailwind.config = {
            theme: {
              extend: {
                fontFamily: {
                  sans: ['Inter', 'ui-sans-serif', 'system-ui'],
                },
                animation: {
                  'bounce-slow': 'bounce 3s infinite',
                }
              }
            }
          }
        `}} />
        <style dangerouslySetInnerHTML={{ __html: `
          body { font-family: 'Inter', sans-serif; }
          .font-mono { font-family: 'Fira Code', 'Courier New', monospace; }
        `}} />
      </Head>
      <body className="bg-slate-950 text-slate-50 antialiased">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
