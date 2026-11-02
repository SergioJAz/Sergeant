import { ScrollViewStyleReset, useServerDocumentContext } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

// Static web document only. App data remains in the existing browser store.
export default function Root({ children }: PropsWithChildren) {
  const { headNodes, bodyNodes, htmlAttributes, bodyAttributes } = useServerDocumentContext();
  const base = process.env.EXPO_BASE_URL ?? '';
  return (
    <html lang="en" {...htmlAttributes}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta name="theme-color" content="#16213E" />
        <link rel="manifest" href={`${base}/manifest.webmanifest`} crossOrigin="use-credentials" />
        <link rel="apple-touch-icon" href={`${base}/icons/icon-192.png`} />
        <ScrollViewStyleReset />
        {headNodes}
      </head>
      <body {...bodyAttributes}>
        {children}
        {bodyNodes}
        <script defer src={`${base}/register-sw.js`} />
      </body>
    </html>
  );
}
