import type { TabIconProps } from './TabIcon';

// Inline paths avoid a separate font download and private-use glyph fallback on web.
export function TabIcon({ name, focused, color, size }: TabIconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24"
      aria-hidden="true" focusable="false" fill="none" stroke={color} strokeWidth={focused ? 2.4 : 1.8}
      strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block', flexShrink: 0 }}>
      {name === 'time' ? <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></> : null}
      {name === 'calendar' ? <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 10h18M7 14h2m6 0h2M7 17h2m6 0h2" /></> : null}
      {name === 'folder' ? <path d="M3 7V5a2 2 0 0 1 2-2h4l3 4h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" fill={focused ? color : 'none'} fillOpacity={focused ? 0.16 : 1} /> : null}
      {name === 'options' ? <><path d="M3 6h4m6 0h8M3 12h10m6 0h2M3 18h4m6 0h8" /><circle cx="10" cy="6" r="3" /><circle cx="16" cy="12" r="3" /><circle cx="10" cy="18" r="3" /></> : null}
    </svg>
  );
}
