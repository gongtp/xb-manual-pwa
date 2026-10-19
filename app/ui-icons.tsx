import type { SVGProps } from "react";

export type IconName =
  | "alert"
  | "check"
  | "chevron-down"
  | "chevron-left"
  | "chevron-right"
  | "clock"
  | "close"
  | "conflict"
  | "database"
  | "download"
  | "edit"
  | "file"
  | "gift"
  | "info"
  | "link"
  | "list"
  | "map"
  | "notebook"
  | "plus"
  | "refresh"
  | "search"
  | "shield-check"
  | "upload"
  | "users";

type IconProps = SVGProps<SVGSVGElement> & {
  name: IconName;
  size?: number;
};

export function UiIcon({ name, size = 18, ...props }: IconProps) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    ...props,
  };

  switch (name) {
    case "search":
      return <svg {...common}><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>;
    case "download":
      return <svg {...common}><path d="M12 3v11" /><path d="m8 10 4 4 4-4" /><path d="M5 20h14" /></svg>;
    case "upload":
      return <svg {...common}><path d="M12 16V5" /><path d="m8 9 4-4 4 4" /><path d="M5 20h14" /></svg>;
    case "plus":
      return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>;
    case "database":
      return <svg {...common}><ellipse cx="12" cy="5" rx="7" ry="3" /><path d="M5 5v6c0 1.7 3.1 3 7 3s7-1.3 7-3V5" /><path d="M5 11v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" /></svg>;
    case "file":
      return <svg {...common}><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v5h5M9 12h6M9 16h6" /></svg>;
    case "list":
      return <svg {...common}><path d="M9 6h10M9 12h10M9 18h10" /><circle cx="5" cy="6" r="1" /><circle cx="5" cy="12" r="1" /><circle cx="5" cy="18" r="1" /></svg>;
    case "notebook":
      return <svg {...common}><path d="M6 3h12v18H6z" /><path d="M9 3v18M12 8h3M12 12h3" /></svg>;
    case "users":
      return <svg {...common}><circle cx="9" cy="8" r="3" /><path d="M3.5 20c.3-4 2.1-6 5.5-6s5.2 2 5.5 6" /><path d="M15 5.5a3 3 0 0 1 0 5.8M16 14c2.7.5 4.2 2.4 4.5 5" /></svg>;
    case "gift":
      return <svg {...common}><path d="M4 10h16v11H4zM3 6h18v4H3zM12 6v15" /><path d="M12 6H8.5A2.5 2.5 0 1 1 11 3.5ZM12 6h3.5A2.5 2.5 0 1 0 13 3.5Z" /></svg>;
    case "map":
      return <svg {...common}><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z" /><path d="M9 3v15M15 6v15" /></svg>;
    case "refresh":
      return <svg {...common}><path d="M20 7v5h-5" /><path d="M4 17v-5h5" /><path d="M6.1 8.5A7 7 0 0 1 18.5 7L20 9M4 15l1.5 2A7 7 0 0 0 18 15.5" /></svg>;
    case "chevron-down":
      return <svg {...common}><path d="m7 9 5 5 5-5" /></svg>;
    case "chevron-left":
      return <svg {...common}><path d="m15 18-6-6 6-6" /></svg>;
    case "chevron-right":
      return <svg {...common}><path d="m9 18 6-6-6-6" /></svg>;
    case "info":
      return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>;
    case "edit":
      return <svg {...common}><path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10z" /><path d="m14 7 3 3" /></svg>;
    case "shield-check":
      return <svg {...common}><path d="M12 3 5 6v5c0 4.8 2.8 8.1 7 10 4.2-1.9 7-5.2 7-10V6z" /><path d="m9 12 2 2 4-4" /></svg>;
    case "clock":
      return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
    case "close":
      return <svg {...common}><path d="m7 7 10 10M17 7 7 17" /></svg>;
    case "link":
      return <svg {...common}><path d="M10 13a4 4 0 0 0 5.7.1l2.1-2.1a4 4 0 0 0-5.7-5.7L11 6.4" /><path d="M14 11a4 4 0 0 0-5.7-.1L6.2 13a4 4 0 1 0 5.7 5.7l1.1-1.1" /></svg>;
    case "check":
      return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="m8 12 2.7 2.7L16.5 9" /></svg>;
    case "alert":
      return <svg {...common}><path d="M12 3 2.8 20h18.4z" /><path d="M12 9v5M12 17h.01" /></svg>;
    case "conflict":
      return <svg {...common}><path d="M8 4 4 8l4 4M16 20l4-4-4-4" /><path d="M4 8h8a4 4 0 0 1 4 4v0M20 16h-8a4 4 0 0 1-4-4v0" /></svg>;
    default:
      return null;
  }
}

export function ArchiveLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path d="m5 4 18 18-7 7L1 14V4ZM43 4h4v10L32 29l-7-7ZM5 44H1V34l15-15 7 7ZM43 44 25 26l7-7 15 15v10Z" fill="currentColor" />
      <path d="m20 24 4-4 4 4-4 4Z" fill="#20232b" />
    </svg>
  );
}

export function HeaderScenery() {
  return (
    <svg className="header-scenery" viewBox="0 0 620 90" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="scene-fade" x1="0" x2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
          <stop offset=".45" stopColor="#edf7f5" stopOpacity=".45" />
          <stop offset="1" stopColor="#d8eeea" stopOpacity=".9" />
        </linearGradient>
        <linearGradient id="scene-ink" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#5ea9a0" stopOpacity=".62" />
          <stop offset="1" stopColor="#187f74" stopOpacity=".14" />
        </linearGradient>
      </defs>
      <rect width="620" height="90" fill="url(#scene-fade)" />
      <path d="M240 82c52-25 93-15 135-29 45-15 85-9 129 5 36 12 72 7 116-8v40H240Z" fill="#b7dcd6" opacity=".45" />
      <path d="M440 78 466 57l13 8 13-20 11 9 12-35 11 33 13-6 14 20 12-8 25 20Z" fill="url(#scene-ink)" />
      <path d="m515 54 3-34 4-17 4 17 3 34M503 55l6-19 8 8M540 56l-7-21-7 9" stroke="#278b81" strokeWidth="1.2" opacity=".55" />
      <path d="M270 78c18-18 32-19 48-3 18-23 37-23 58 1 17-18 34-17 48 2" fill="none" stroke="#83beb7" strokeWidth="2" opacity=".4" />
      <circle cx="582" cy="26" r="3" fill="#3a968c" opacity=".45" />
      <circle cx="597" cy="16" r="1.8" fill="#3a968c" opacity=".35" />
    </svg>
  );
}
