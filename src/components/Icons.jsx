// Набор иконок (inline SVG, цвет = currentColor)
const base = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

const make = (paths) =>
  function Icon({ size = 18, ...rest }) {
    return (
      <svg {...base} width={size} height={size} {...rest}>
        {paths}
      </svg>
    );
  };

export const IconHome = make(
  <>
    <path d="M3 11.5 12 4l9 7.5" />
    <path d="M5.5 10v9.5h13V10" />
    <path d="M10 19.5v-5h4v5" />
  </>
);
export const IconMods = make(
  <>
    <path d="M12 3 3.5 7.5 12 12l8.5-4.5L12 3Z" />
    <path d="M3.5 12 12 16.5 20.5 12" />
    <path d="M3.5 16.5 12 21l8.5-4.5" />
  </>
);
export const IconSystems = make(
  <>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
    <path d="M17 13.5v7M13.5 17h7" />
  </>
);
export const IconSettings = make(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1.1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1Z" />
  </>
);
export const IconMinimize = make(<path d="M6 12h12" />);
export const IconClose = make(<path d="m6 6 12 12M18 6 6 18" />);
export const IconPlay = make(<path d="M8 5.5v13l10.5-6.5L8 5.5Z" fill="currentColor" />);
export const IconRefresh = make(
  <>
    <path d="M20 11a8 8 0 0 0-14.8-4.2L4 8.5" />
    <path d="M4 3.5v5h5" />
    <path d="M4 13a8 8 0 0 0 14.8 4.2l1.2-1.7" />
    <path d="M20 20.5v-5h-5" />
  </>
);
export const IconExternal = make(
  <>
    <path d="M14 4h6v6" />
    <path d="M20 4 11 13" />
    <path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
  </>
);
export const IconUsers = make(
  <>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
    <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 20a6.5 6.5 0 0 0-2.4-5" />
  </>
);
export const IconSignal = make(
  <>
    <path d="M4 20v-3M9 20v-7M14 20V9M19 20V5" />
  </>
);
export const IconMap = make(
  <>
    <path d="m3.5 6.5 5.5-2.5 6 2.5 5.5-2.5v13.5L15 20l-6-2.5-5.5 2.5V6.5Z" />
    <path d="M9 4v13.5M15 6.5V20" />
  </>
);
export const IconCheck = make(<path d="m5 12.5 4.5 4.5L19 7.5" />);
export const IconAlert = make(
  <>
    <path d="M12 3.5 2.5 20h19L12 3.5Z" />
    <path d="M12 10v4.5M12 17.5v.01" />
  </>
);
export const IconDownload = make(
  <>
    <path d="M12 4v11" />
    <path d="m7 10.5 5 5 5-5" />
    <path d="M4.5 19.5h15" />
  </>
);
export const IconFolder = make(<path d="M3.5 6.5a1 1 0 0 1 1-1h5l2 2.5h8a1 1 0 0 1 1 1v9.5a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-12Z" />);
export const IconSearch = make(
  <>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.2-4.2" />
  </>
);
export const IconLink = make(
  <>
    <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1" />
    <path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" />
  </>
);
export const IconShield = make(<path d="M12 3 4.5 6v5.5c0 4.6 3.1 8.4 7.5 9.5 4.4-1.1 7.5-4.9 7.5-9.5V6L12 3Z" />);
export const IconTarget = make(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r="0.8" fill="currentColor" />
  </>
);
export const IconShuttle = make(
  <>
    <path d="M12 2.5c2.5 2.6 3.5 6 3.5 9.5v4.5h-7V12c0-3.5 1-6.9 3.5-9.5Z" />
    <path d="M8.5 13 5 16.5v3l3.5-1.5M15.5 13l3.5 3.5v3L15.5 18" />
    <path d="M10.5 19.5 12 22l1.5-2.5" />
  </>
);
export const IconPanel = make(
  <>
    <rect x="3" y="4" width="18" height="14" rx="2" />
    <path d="M3 8.5h18M7.5 12.5h4M7.5 15h7" />
  </>
);
export const IconBackpack = make(
  <>
    <path d="M7 8a5 5 0 0 1 10 0v12H7V8Z" />
    <path d="M9.5 4.5V3h5v1.5M7 13h10M10 13v2.5h4V13" />
  </>
);
export const IconVisor = make(
  <>
    <path d="M4 10.5C4 6.4 7.6 3.5 12 3.5s8 2.9 8 7v3.5c0 1-1 1.5-2 1.5h-3l-1.5 3h-3L9 15.5H6c-1 0-2-.5-2-1.5v-3.5Z" />
    <path d="M7 10h10" />
  </>
);
export const IconMedic = make(
  <>
    <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
    <path d="M12 8v8M8 12h8" />
  </>
);
export const IconHolo = make(
  <>
    <ellipse cx="12" cy="18.5" rx="7.5" ry="2.5" />
    <path d="M7.5 17 12 4l4.5 13" />
    <path d="M9.2 12h5.6" />
  </>
);
export const IconUser = make(
  <>
    <circle cx="12" cy="8" r="4" />
    <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
  </>
);

export const IconHeadset = make(
  <>
    <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
    <path d="M4 14.5a1.5 1.5 0 0 1 1.5-1.5H7v6H5.5A1.5 1.5 0 0 1 4 17.5v-3ZM20 14.5a1.5 1.5 0 0 0-1.5-1.5H17v6h1.5a1.5 1.5 0 0 0 1.5-1.5v-3Z" />
  </>
);

export function IconDiscord({ size = 18, ...rest }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden {...rest}>
      <path d="M19.6 5.3A17.6 17.6 0 0 0 15.3 4l-.55 1.1a16.3 16.3 0 0 0-5.5 0L8.7 4a17.5 17.5 0 0 0-4.36 1.34C1.6 9.4.85 13.4 1.22 17.3a17.7 17.7 0 0 0 5.35 2.7l1.15-1.86a11.4 11.4 0 0 1-1.8-.87l.44-.34a12.6 12.6 0 0 0 11.28 0l.44.34c-.57.34-1.18.63-1.8.87l1.15 1.86a17.6 17.6 0 0 0 5.35-2.7c.44-4.52-.75-8.48-3.18-12ZM8.5 14.9c-1.05 0-1.92-.97-1.92-2.15s.85-2.16 1.92-2.16 1.94.98 1.92 2.16c0 1.18-.85 2.15-1.92 2.15Zm7 0c-1.05 0-1.92-.97-1.92-2.15s.85-2.16 1.92-2.16 1.94.98 1.92 2.16c0 1.18-.84 2.15-1.92 2.15Z" />
    </svg>
  );
}

export function IconSteam({ size = 18, ...rest }) {
  return (
    <svg {...base} width={size} height={size} {...rest}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="15.5" cy="9.5" r="2.5" />
      <path d="m13.4 11 -4.2 3.1" />
      <circle cx="8.2" cy="14.8" r="1.6" />
    </svg>
  );
}
