/** Inline 1.5px stroke icons — no icon dependency, no network fetch. */

type IconProps = { size?: number };

function Svg({ size = 18, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const IconInsights = (p: IconProps) => (
  <Svg {...p}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></Svg>
);

export const IconPipeline = (p: IconProps) => (
  <Svg {...p}><path d="M3 6h5c4 0 4 6 8 6h5M3 18h5c4 0 4-6 8-6M16 12c2 0 3-6 5-6" /></Svg>
);

export const IconInbox = (p: IconProps) => (
  <Svg {...p}><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="M2.5 12h5l1.5 2.5h6L16.5 12h5" /></Svg>
);

export const IconArchive = (p: IconProps) => (
  <Svg {...p}><rect x="2.5" y="4" width="19" height="4.5" rx="1.5" /><path d="M4.5 8.5V19a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5V8.5M10 12.5h4" /></Svg>
);

export const IconScan = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5a8.5 8.5 0 0 1 8.5 8.5" /></Svg>
);

export const IconSettings = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="3" /></Svg>
);

export const IconLock = (p: IconProps) => (
  <Svg {...p}><rect x="4.5" y="10.5" width="15" height="10" rx="2" /><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" /></Svg>
);

export const IconUpload = (p: IconProps) => (
  <Svg {...p}><path d="M12 19V5M6 11l6-6 6 6" /></Svg>
);

export const IconDocument = (p: IconProps) => (
  <Svg {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></Svg>
);

export const IconWarning = (p: IconProps) => (
  <Svg {...p}><path d="M12 3.5 21 19H3z" /><path d="M12 9.5v4M12 16.5h.01" /></Svg>
);

export const IconCheck = (p: IconProps) => (
  <Svg {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></Svg>
);

export const IconCross = (p: IconProps) => (
  <Svg {...p}><path d="M6 6l12 12M18 6L6 18" /></Svg>
);

export const IconArrowRight = (p: IconProps) => (
  <Svg {...p}><path d="M4 12h16M14 6l6 6-6 6" /></Svg>
);

export const IconSearch = (p: IconProps) => (
  <Svg {...p}><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></Svg>
);

export const IconExternal = (p: IconProps) => (
  <Svg {...p}><path d="M14 4h6v6M20 4l-8.5 8.5" /><path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" /></Svg>
);

export const IconChevron = (p: IconProps) => (
  <Svg {...p}><path d="m7 10 5 5 5-5" /></Svg>
);

export const IconSidebar = (p: IconProps) => (
  <Svg {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></Svg>
);

export const IconBookmark = (p: IconProps) => (
  <Svg {...p}><path d="M6 4.5h12v16l-6-4.5-6 4.5z" /></Svg>
);

export const IconStop = (p: IconProps) => (
  <Svg {...p}><rect x="6" y="6" width="12" height="12" rx="2" /></Svg>
);

export const IconPin = (p: IconProps) => (
  <Svg {...p}><path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></Svg>
);

export const IconPlus = (p: IconProps) => (
  <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>
);

/* An update is available — an arrow into a tray, the same shape as the upload
   icon turned around. */
export const IconDownload = (p: IconProps) => (
  <Svg {...p}><path d="M12 3v12M7.5 10.5 12 15l4.5-4.5M4 17v2.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V17" /></Svg>
);

export const IconList = (p: IconProps) => (
  <Svg {...p}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></Svg>
);

export const IconUser = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.8-3.6 3.7-5.5 7-5.5s6.2 1.9 7 5.5" /></Svg>
);
