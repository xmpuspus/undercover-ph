import type { ReactNode, SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 18, children, ...rest }: P & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const SunIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Svg>
);

export const RainIcon = (p: P) => (
  <Svg {...p}>
    <path d="M7 15a4 4 0 0 1-.6-8 5.5 5.5 0 0 1 10.6 1.5A3.5 3.5 0 0 1 17 15H7z" />
    <path d="M8 18l-1 2.5M12 18l-1 2.5M16 18l-1 2.5" />
  </Svg>
);

export const UmbrellaIcon = (p: P) => (
  <Svg {...p}>
    <path d="M3 12a9 9 0 0 1 18 0H3z" />
    <path d="M12 12v7a2 2 0 0 1-4 0" />
  </Svg>
);

export const MoonIcon = (p: P) => (
  <Svg {...p}>
    <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
  </Svg>
);

export const PinIcon = (p: P) => (
  <Svg {...p}>
    <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
    <circle cx="12" cy="9.5" r="2.5" />
  </Svg>
);

export const TargetIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="7" />
    <circle cx="12" cy="12" r="2.5" fill="currentColor" />
  </Svg>
);

export const LocateIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="6" />
    <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
  </Svg>
);

export const CloseIcon = (p: P) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);

export const BackIcon = (p: P) => (
  <Svg {...p}>
    <path d="M15 5l-7 7 7 7" />
  </Svg>
);

export const ChevronRight = (p: P) => (
  <Svg {...p}>
    <path d="M9 5l7 7-7 7" />
  </Svg>
);

export const ChevronDown = (p: P) => (
  <Svg {...p}>
    <path d="M6 9l6 6 6-6" />
  </Svg>
);

export const ArrowRight = (p: P) => (
  <Svg {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
);

export const CalendarIcon = (p: P) => (
  <Svg {...p}>
    <rect x="4" y="5" width="16" height="15" rx="2" />
    <path d="M4 10h16M9 3v4M15 3v4" />
  </Svg>
);

export const ClockIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 8v4l3 2" />
  </Svg>
);

export const WalkIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="13" cy="4.5" r="1.8" />
    <path d="M10 21l2-6 3 3v3M8 12l3-4 3 2 3 3M11 8l-1 6" />
  </Svg>
);

export const StepFreeIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="11" cy="4.5" r="1.8" />
    <path d="M11 8v6h5l2 5" />
    <path d="M8 11a5 5 0 1 0 6.5 7" />
  </Svg>
);

export const StairsIcon = (p: P) => (
  <Svg {...p}>
    <path d="M3 20h5v-4h4v-4h4V8h5" />
  </Svg>
);

export const BridgeIcon = (p: P) => (
  <Svg {...p}>
    <path d="M2 9h20M4 9v11M20 9v11M2 13h20" />
    <path d="M8 13v7M16 13v7" />
  </Svg>
);

export const UnderpassIcon = (p: P) => (
  <Svg {...p}>
    <path d="M3 20V11a9 9 0 0 1 18 0v9" />
    <path d="M7 20v-8a5 5 0 0 1 10 0v8" />
  </Svg>
);

export const IndoorIcon = (p: P) => (
  <Svg {...p}>
    <path d="M3 10l9-6 9 6v10H3z" />
    <path d="M10 20v-6h4v6" />
  </Svg>
);

export const CrossingIcon = (p: P) => (
  <Svg {...p}>
    <path d="M4 4v16M20 4v16M8 7h8M8 12h8M8 17h8" />
  </Svg>
);

export const AlertIcon = (p: P) => (
  <Svg {...p}>
    <path d="M12 3l9.5 17h-19z" />
    <path d="M12 10v4M12 17.5v.5" />
  </Svg>
);

export const ListIcon = (p: P) => (
  <Svg {...p}>
    <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />
  </Svg>
);

export const RoofIcon = (p: P) => (
  <Svg {...p}>
    <path d="M2 11l10-6 10 6" />
    <path d="M5 11v9M19 11v9" />
  </Svg>
);

// Shade from a building or tree: a block in front of the sun.
export const ShadeIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="16" cy="8" r="3.5" />
    <path d="M16 2.5v1M21.5 8h-1M19.9 4.1l-.7.7" />
    <rect x="4" y="9" width="8" height="12" rx="1" fill="currentColor" fillOpacity="0.15" />
    <path d="M2 21h20" />
  </Svg>
);

export const PlayIcon = (p: P) => (
  <Svg {...p}>
    <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" />
  </Svg>
);

export const PauseIcon = (p: P) => (
  <Svg {...p}>
    <path d="M8 5v14M16 5v14" strokeWidth={3} />
  </Svg>
);

// The undercover.ph mark from favicon.svg. The sun dot takes the colour of the hour.
export const BrandMark = ({ size = 40, sun = "#FACC15" }: { size?: number; sun?: string }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="shrink-0">
    <rect width="64" height="64" rx="14" fill="#2563EB" />
    <path d="M12 34a20 20 0 0 1 40 0z" fill="#fff" />
    <path d="M32 34v14a4 4 0 0 1-8 0" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
    <circle cx="46" cy="14" r="5" fill={sun} />
  </svg>
);
