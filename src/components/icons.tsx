import type { ReactNode, SVGProps } from "react";

/**
 * Ícones autorais — traço 1.7, cantos arredondados, grade 24×24.
 * Desenhados para o PrintFlow (sem dependências externas).
 */
const P: Record<string, ReactNode> = {
  gauge: (
    <>
      <path d="M12 15.5 15.8 9" />
      <path d="M4.5 19a9.5 9.5 0 1 1 15 0" />
      <circle cx="12" cy="15.5" r="1.6" />
    </>
  ),
  receipt: (
    <>
      <path d="M6 3h12v18l-2-1.4L14 21l-2-1.4L10 21l-2-1.4L6 21Z" />
      <path d="M9.5 8h5M9.5 11.5h5M9.5 15h3" />
    </>
  ),
  quote: (
    <>
      <path d="M14 3H7a1.5 1.5 0 0 0-1.5 1.5v15A1.5 1.5 0 0 0 7 21h10a1.5 1.5 0 0 0 1.5-1.5V7.5Z" />
      <path d="M14 3v4.5h4.5M9.5 12h5M9.5 15.5h5M9.5 8.5H11" />
    </>
  ),
  orders: (
    <>
      <path d="M9 4.5h6M9 4.5A1.5 1.5 0 0 0 7.5 6v13A1.5 1.5 0 0 0 9 20.5h6a1.5 1.5 0 0 0 1.5-1.5V6A1.5 1.5 0 0 0 15 4.5M9 4.5V3.8A1.3 1.3 0 0 1 10.3 2.5h3.4A1.3 1.3 0 0 1 15 3.8v.7" />
      <path d="m9.8 12.6 1.7 1.7 3-3.3" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M3.5 19.5c.6-3.2 2.7-4.8 5.5-4.8s4.9 1.6 5.5 4.8" />
      <path d="M15.5 5.7a3.2 3.2 0 0 1 0 5.7M17.6 14.9c1.7.6 2.7 2.1 3 4.1" />
    </>
  ),
  kanban: (
    <>
      <rect x="3.5" y="4" width="5" height="16" rx="1.2" />
      <rect x="10" y="4" width="5" height="10" rx="1.2" />
      <rect x="16.5" y="4" width="4" height="13" rx="1.2" />
    </>
  ),
  printer: (
    <>
      <path d="M7 8V3.5h10V8" />
      <rect x="3.5" y="8" width="17" height="8.5" rx="1.6" />
      <path d="M7 13.5h10v7H7Z" />
      <path d="M17.3 10.8h.01" />
    </>
  ),
  droplet: (
    <>
      <path d="M12 3.2s6.3 6.6 6.3 11a6.3 6.3 0 0 1-12.6 0c0-4.4 6.3-11 6.3-11Z" />
      <path d="M9.2 14.2a3 3 0 0 0 2.2 3" />
    </>
  ),
  tag: (
    <>
      <path d="m12.6 2.9 8 8a1.7 1.7 0 0 1 0 2.4l-7.3 7.3a1.7 1.7 0 0 1-2.4 0l-8-8V4.6a1.7 1.7 0 0 1 1.7-1.7Z" />
      <circle cx="7.6" cy="7.6" r="1.4" />
    </>
  ),
  sheets: (
    <>
      <path d="M8 3.5h9.5v13" />
      <path d="M6.5 6.5H16v14H6.5Z" />
      <path d="M9.5 11h3.5M9.5 14.5h3.5" />
    </>
  ),
  scissors: (
    <>
      <circle cx="6.5" cy="6.5" r="2.6" />
      <circle cx="6.5" cy="17.5" r="2.6" />
      <path d="M8.8 8.2 20 17M8.8 15.8 20 7" />
    </>
  ),
  boxes: (
    <>
      <path d="M3.5 8 12 3.5 20.5 8v8L12 20.5 3.5 16Z" />
      <path d="M3.5 8 12 12.5 20.5 8M12 12.5v8" />
    </>
  ),
  wallet: (
    <>
      <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11v3" />
      <path d="M4 7.5V17a2.5 2.5 0 0 0 2.5 2.5h12A1.5 1.5 0 0 0 20 18V9.5a1.5 1.5 0 0 0-1.5-1.5H6.5A2.5 2.5 0 0 1 4 7.5Z" />
      <path d="M16.2 13.7h.01" />
    </>
  ),
  chart: (
    <>
      <path d="M4 4v15.5h16" />
      <path d="M8 15.5v-4M12 15.5V8M16 15.5v-6.5" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3.1" />
      <path d="M12 2.8 13.6 5h2.7l.9 2.5 2.4 1.2-.4 2.7 1.7 2.1-1.7 2.1.4 2.7-2.4 1.2-.9 2.5h-2.7L12 21.2 10.4 19H7.7l-.9-2.5-2.4-1.2.4-2.7L3.1 12l1.7-2.1-.4-2.7 2.4-1.2L7.7 5h2.7Z" />
    </>
  ),
  search: (
    <>
      <circle cx="10.8" cy="10.8" r="6.3" />
      <path d="m15.5 15.5 5 5" />
    </>
  ),
  bell: (
    <>
      <path d="M18 9.5a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6" />
      <path d="M10 19a2.2 2.2 0 0 0 4 0" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  x: <path d="m6 6 12 12M18 6 6 18" />,
  check: <path d="m4.5 12.5 5 5 10-11" />,
  "chevron-down": <path d="m6 9.5 6 6 6-6" />,
  "chevron-right": <path d="m9.5 6 6 6-6 6" />,
  "chevron-left": <path d="m14.5 6-6 6 6 6" />,
  pencil: (
    <>
      <path d="M14.5 5 19 9.5 8 20.5l-4.7 1L4.5 16.7Z" />
      <path d="m13 6.5 4.5 4.5" />
    </>
  ),
  trash: (
    <>
      <path d="M4.5 6.5h15M9.5 6V4.5A1.5 1.5 0 0 1 11 3h2a1.5 1.5 0 0 1 1.5 1.5V6" />
      <path d="M6.5 6.5 7.4 20a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4l.9-13.5" />
      <path d="M10 10.5v7M14 10.5v7" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3.5 22 20H2Z" />
      <path d="M12 9.5v5M12 17.3h.01" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5M12 7.6h.01" />
    </>
  ),
  "arrow-right": <path d="M4 12h16m-6-6 6 6-6 6" />,
  mail: (
    <>
      <path d="M3.5 5.5h17v13a1.5 1.5 0 0 1-1.5 1.5h-14a1.5 1.5 0 0 1-1.5-1.5Z" />
      <path d="m3.5 5.5 8.5 6.5 8.5-6.5" />
    </>
  ),
  calendar: (
    <>
      <path d="M8 3.5v2M16 3.5v2M3.5 7.5h17v11a1.5 1.5 0 0 1-1.5 1.5h-14a1.5 1.5 0 0 1-1.5-1.5Z" />
      <path d="M3.5 11.5h17" />
    </>
  ),
  "arrow-up-right": <path d="M7 17 17 7M8.5 7H17v8.5" />,
  phone: (
    <path d="M5 4h4l1.5 4.5-2.2 1.7a12.5 12.5 0 0 0 5.5 5.5l1.7-2.2L20 15v4a1.5 1.5 0 0 1-1.6 1.5C10.4 20 4 13.6 3.5 5.6A1.5 1.5 0 0 1 5 4Z" />
  ),
  whatsapp: (
    <>
      <path d="M12 3.5a8.5 8.5 0 0 0-7.3 12.8L3.5 20.5l4.3-1.1A8.5 8.5 0 1 0 12 3.5Z" />
      <path d="M9.3 8.8c.3 2.7 3.2 5.6 5.9 5.9l.9-1.6-2-1.2-.9.7c-.7-.4-1.4-1.1-1.8-1.8l.7-.9-1.2-2Z" />
    </>
  ),
  truck: (
    <>
      <path d="M3.5 6.5H15V17H3.5Z" />
      <path d="M15 10h3.6l2 3.4V17H15" />
      <circle cx="7" cy="17.8" r="1.9" />
      <circle cx="17.4" cy="17.8" r="1.9" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2.5" />
    </>
  ),
  download: <path d="M12 4v10.5m0 0 4-4m-4 4-4-4M4.5 19.5h15" />,
  eye: (
    <>
      <path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  layers: (
    <>
      <path d="m12 3 9 4.7L12 12.4 3 7.7Z" />
      <path d="m4.6 11.5-1.6.9 9 4.7 9-4.7-1.6-.9M4.6 15.7 3 16.6l9 4.7 9-4.7-1.6-.9" />
    </>
  ),
  palette: (
    <>
      <path d="M12 3a9 9 0 0 0 0 18c1.3 0 2-.8 2-1.8 0-.9-.6-1.4-.6-2.2 0-1 .8-1.8 2-1.8H17a4.8 4.8 0 0 0 4-4.2A9 9 0 0 0 12 3Z" />
      <circle cx="7.6" cy="10.2" r="1.1" />
      <circle cx="11" cy="7.3" r="1.1" />
      <circle cx="15.4" cy="8.2" r="1.1" />
    </>
  ),
  calc: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="1.8" />
      <path d="M8.5 7h7" />
      <path d="M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01M8.5 15h.01M12 15h.01M15.5 15h.01M8.5 18h.01M12 18h.01M15.5 18h.01" />
    </>
  ),
  filter: <path d="M4 5.5h16l-6.2 7.2v5.1L10.2 20v-7.3Z" />,
  grip: (
    <path d="M9 5.5h.01M9 12h.01M9 18.5h.01M15 5.5h.01M15 12h.01M15 18.5h.01" />
  ),
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </>
  ),
  file: (
    <>
      <path d="M14 3H7a1.8 1.8 0 0 0-1.8 1.8v14.4A1.8 1.8 0 0 0 7 21h10a1.8 1.8 0 0 0 1.8-1.8V7.8Z" />
      <path d="M14 3v5h4.8" />
    </>
  ),
  external: (
    <>
      <path d="M13.5 5H19v5.5" />
      <path d="M19 5 10.5 13.5" />
      <path d="M19 14v5a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 4 19V6.5A1.5 1.5 0 0 1 5.5 5H10" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 12a8 8 0 1 1-2.5-5.8" />
      <path d="M20 3.5V7h-3.5" />
    </>
  ),
  "circle-check": (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.5 12.3 2.4 2.4 4.6-5" />
    </>
  ),
  "circle-x": (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m9.3 9.3 5.4 5.4M14.7 9.3l-5.4 5.4" />
    </>
  ),
  send: <path d="M20.5 3.5 3.5 10.6l7 2.4 2.4 7Z M20.5 3.5 10.5 13" />,
  building: (
    <>
      <rect x="5" y="3.5" width="14" height="17" rx="1.2" />
      <path d="M9 7.5h.01M15 7.5h.01M9 11h.01M15 11h.01M9 14.5h.01M15 14.5h.01M10 20.5v-3h4v3" />
    </>
  ),
  person: (
    <>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.8 20.2c.9-3.9 3.6-5.8 7.2-5.8s6.3 1.9 7.2 5.8" />
    </>
  ),
  ruler: (
    <>
      <rect x="2.8" y="9" width="18.4" height="6" rx="1" transform="rotate(-45 12 12)" />
      <path d="m8.5 12.5 1.5 1.5M11 10l1.5 1.5M13.5 7.5 15 9" />
    </>
  ),
};

export type IconName = keyof typeof P;

export function Icon({
  name,
  size = 18,
  strokeWidth = 1.7,
  ...rest
}: { name: IconName; size?: number; strokeWidth?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {P[name] ?? null}
    </svg>
  );
}

/** Marca de registro CMYK — logo do PrintFlow */
export function RegistrationMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle cx="13" cy="13" r="8" stroke="#22d3ee" strokeWidth="2.4" />
      <circle cx="19" cy="13" r="8" stroke="#f43f8e" strokeWidth="2.4" opacity="0.9" />
      <circle cx="16" cy="18.5" r="8" stroke="#facc15" strokeWidth="2.4" opacity="0.9" />
      <circle cx="16" cy="15" r="1.6" fill="#fff" />
    </svg>
  );
}
