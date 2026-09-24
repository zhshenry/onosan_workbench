import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 20, ...rest }: P): SVGProps<SVGSVGElement> {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    ...rest,
  };
}

export const LogoMark = (p: P) => (
  // 移植自上游 src/ui.tsx 的 BrandMark(圆环 + 轨道圆点,悬停旋转),填充色用工作台主题变量
  <svg {...base({ size: 28, ...p })} viewBox="0 0 24 24" focusable="false">
    <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.7" />
    <g className="logo-orbit">
      <circle cx="17.15" cy="6.85" r="2.15" fill="var(--acc)" stroke="none" />
    </g>
  </svg>
);

export const IconHome = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 11.2 12 4.4l8 6.8V19a1 1 0 0 1-1 1h-4.6v-5.2h-4.8V20H5a1 1 0 0 1-1-1Z" />
  </svg>
);

export const IconDocs = (p: P) => (
  <svg {...base(p)}>
    <path d="M7 3.5h6.5L19 9v10.5a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1Z" />
    <path d="M13.5 3.5V9H19" />
    <path d="M9.5 13h5.5M9.5 16.5h5.5" />
  </svg>
);

export const IconGlobe = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8.2" />
    <ellipse cx="12" cy="12" rx="3.6" ry="8.2" />
    <path d="M4.4 9.4h15.2M4.4 14.6h15.2" />
  </svg>
);

export const IconTerminal = (p: P) => (
  <svg {...base(p)}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
    <path d="m7.5 9.5 3 2.8-3 2.8M13 15.4h4" />
  </svg>
);

export const IconPalette = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.3 0 2-.8 2-1.8 0-.9-.6-1.4-.6-2.2 0-1 .8-1.8 2-1.8h1.8c1.9 0 3.3-1.5 3.3-3.4C20.5 6.7 16.7 3.5 12 3.5Z" />
    <circle cx="8" cy="9" r="1.15" fill="currentColor" stroke="none" />
    <circle cx="12.5" cy="7" r="1.15" fill="currentColor" stroke="none" />
    <circle cx="16.5" cy="9.5" r="1.15" fill="currentColor" stroke="none" />
    <circle cx="7.5" cy="13.8" r="1.15" fill="currentColor" stroke="none" />
  </svg>
);

export const IconMoon = (p: P) => (
  <svg {...base(p)}>
    <path d="M19.5 14.2A7.6 7.6 0 0 1 9.8 4.5a7.6 7.6 0 1 0 9.7 9.7Z" />
  </svg>
);

export const IconSearch = (p: P) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-3.8-3.8" />
  </svg>
);

export const IconBell = (p: P) => (
  <svg {...base(p)}>
    <path d="M18 9.8a6 6 0 1 0-12 0c0 4.2-1.8 5.8-1.8 5.8h15.6S18 14 18 9.8Z" />
    <path d="M10.2 19a2 2 0 0 0 3.6 0" />
  </svg>
);

export const IconPlus = (p: P) => (
  <svg {...base(p)} strokeWidth={2}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconCalendar = (p: P) => (
  <svg {...base({ size: 16, ...p })}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
    <path d="M3.5 9.5h17M8 3v4M16 3v4" />
  </svg>
);

export const IconCalendarPlus = (p: P) => (
  <svg {...base({ size: 15, ...p })}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
    <path d="M3.5 9.5h17M8 3v4M16 3v4M12 12.5v5M9.5 15h5" />
  </svg>
);

export const IconCheckSquare = (p: P) => (
  <svg {...base({ size: 16, ...p })}>
    <rect x="4" y="4" width="16" height="16" rx="4" />
    <path d="m8.5 12.2 2.4 2.4 4.8-5" />
  </svg>
);

export const IconCheck = (p: P) => (
  <svg {...base({ size: 12, strokeWidth: 3, ...p })}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);

export const IconChevronRight = (p: P) => (
  <svg {...base({ size: 14, strokeWidth: 2, ...p })}>
    <path d="m9 5 7 7-7 7" />
  </svg>
);

export const IconArrowRight = (p: P) => (
  <svg {...base({ size: 13, strokeWidth: 2, ...p })}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

export const IconExternal = (p: P) => (
  <svg {...base({ size: 14, ...p })}>
    <path d="M14 4.5h5.5V10M19.5 4.5 11 13" />
    <path d="M19.5 13.5v5a1.5 1.5 0 0 1-1.5 1.5H5.5A1.5 1.5 0 0 1 4 18.5V6a1.5 1.5 0 0 1 1.5-1.5h5" />
  </svg>
);

export const IconLock = (p: P) => (
  <svg {...base({ size: 13, ...p })}>
    <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
    <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
  </svg>
);

export const IconStar = (p: P) => (
  <svg {...base({ size: 15, ...p })}>
    <path d="m12 4 2.5 5.2 5.5.7-4 3.9.9 5.6-4.9-2.7L7.1 19.4 8 13.8 4 9.9l5.5-.7Z" />
  </svg>
);

export const IconShield = (p: P) => (
  <svg {...base({ size: 13, ...p })}>
    <path d="M12 3.5 5 6v5.5c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6Z" />
    <path d="m9 11.8 2.2 2.2 4-4.2" />
  </svg>
);

export const IconBack = (p: P) => (
  <svg {...base({ size: 15, strokeWidth: 1.9, ...p })}>
    <path d="M15 5l-7 7 7 7" />
  </svg>
);

export const IconForward = (p: P) => (
  <svg {...base({ size: 15, strokeWidth: 1.9, ...p })}>
    <path d="m9 5 7 7-7 7" />
  </svg>
);

export const IconRefresh = (p: P) => (
  <svg {...base({ size: 14, strokeWidth: 1.9, ...p })}>
    <path d="M20 12a8 8 0 1 1-2.4-5.7M20 3.8v3.4h-3.4" />
  </svg>
);

export const IconCollapse = (p: P) => (
  <svg {...base({ size: 16, strokeWidth: 1.7, ...p })}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
    <path d="M9.5 4.5v15M14.5 10l-2 2 2 2" />
  </svg>
);

export const IconSearchBig = (p: P) => (
  <svg {...base({ size: 17, strokeWidth: 1.8, ...p })} stroke="#4a6379">
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-3.8-3.8" />
  </svg>
);

export const IconIsolated = (p: P) => (
  <svg {...base({ size: 14, strokeWidth: 1.8, ...p })}>
    <circle cx="12" cy="12" r="8.2" />
    <path d="m8.8 12.4 2.2 2.2 4.4-4.8" />
  </svg>
);

export const IconListLines = (p: P) => (
  <svg {...base({ size: 15, strokeWidth: 1.8, ...p })}>
    <path d="M4 7h16M4 12h10M4 17h7" />
  </svg>
);

export const IconChevronDown = (p: P) => (
  <svg {...base({ size: 13, strokeWidth: 2, ...p })}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

export const IconVideo = (p: P) => (
  <svg {...base({ size: 18, ...p })}>
    <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
    <path d="m10 9.5 4.5 2.5L10 14.5Z" />
  </svg>
);

export const IconWeb = (p: P) => (
  <svg {...base({ size: 18, ...p })}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
    <path d="M3.5 9h17M7 6.8h.01M9.6 6.8h.01" />
  </svg>
);

export const IconGamepad = (p: P) => (
  <svg {...base({ size: 18, ...p })}>
    <path d="M6.5 8h11a4 4 0 0 1 4 4.2l-.4 4.3a2.4 2.4 0 0 1-4.2 1.4L15 16H9l-1.9 1.9a2.4 2.4 0 0 1-4.2-1.4l-.4-4.3A4 4 0 0 1 6.5 8Z" />
    <path d="M8.5 11v3M7 12.5h3M15.5 11.5h.01M17.5 13.5h.01" />
  </svg>
);

export const IconBagua = (p: P) => (
  <svg {...base({ size: 18, ...p })}>
    <circle cx="12" cy="12" r="8.2" />
    <path d="M12 3.8v16.4M3.8 12h16.4M6.2 6.2l11.6 11.6M17.8 6.2 6.2 17.8" />
  </svg>
);

export const IconDownload = (p: P) => (
  <svg {...base({ size: 15, strokeWidth: 1.8, ...p })}>
    <path d="M12 15V4M7.5 8 12 3.5 16.5 8" />
    <path d="M4.5 15.5v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3" />
  </svg>
);

export const IconZoomOut = (p: P) => (
  <svg {...base({ size: 13, strokeWidth: 2, ...p })}>
    <path d="M5 12h14" />
  </svg>
);

export const IconZoomIn = (p: P) => (
  <svg {...base({ size: 13, strokeWidth: 2, ...p })}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
