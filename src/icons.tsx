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

export const IconMoon = (p: P) => (
  <svg {...base(p)}>
    <path d="M19.5 14.2A7.6 7.6 0 0 1 9.8 4.5a7.6 7.6 0 1 0 9.7 9.7Z" />
  </svg>
);

export const IconCalendar = (p: P) => (
  <svg {...base({ size: 16, ...p })}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
    <path d="M3.5 9.5h17M8 3v4M16 3v4" />
  </svg>
);

export const IconCheckSquare = (p: P) => (
  <svg {...base({ size: 16, ...p })}>
    <rect x="4" y="4" width="16" height="16" rx="4" />
    <path d="m8.5 12.2 2.4 2.4 4.8-5" />
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
