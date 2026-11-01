import React from 'react';

type P = { size?: number };

const Svg = ({ size = 24, children, fill }: P & { children: React.ReactNode; fill?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke={fill ? 'none' : 'currentColor'} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

export const IconToday = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4.200" />
    <path d="M12 2.800v2.400M12 18.800v2.400M2.800 12h2.400M18.800 12h2.400M5.500 5.500l1.700 1.700M16.800 16.800l1.700 1.700M5.500 18.500l1.700-1.700M16.800 7.200l1.700-1.700" />
  </Svg>
);
export const IconProgram = (p: P) => (
  <Svg {...p}>
    <rect x="3.500" y="5" width="17" height="15.500" rx="3.500" />
    <path d="M3.500 10h17M8 3v4M16 3v4M8 14h3M8 17h6" />
  </Svg>
);
export const IconFood = (p: P) => (
  <Svg {...p}>
    <path d="M12 3c.5 3.300 5.500 5.600 5.500 10.800a5.500 5.500 0 0 1-11 0c0-2 .9-3.500 2-4.700.2 1.700 1 2.600 2.100 2.900C10.200 9 10.700 5.600 12 3z" />
  </Svg>
);
export const IconChart = (p: P) => (
  <Svg {...p}>
    <path d="M3.500 17.500l5.200-5.500 3.800 3 7.500-8.500" />
    <path d="M15 6.500h5v5" />
  </Svg>
);
export const IconCoach = (p: P) => (
  <Svg {...p}>
    <path d="M11 3.500l1.900 5.100 5.100 1.900-5.100 1.900L11 17.500l-1.900-5.100L4 10.500l5.100-1.900z" />
    <path d="M18.500 15.500l.8 2.200 2.200.8-2.200.8-.8 2.200-.8-2.200-2.200-.8 2.200-.8z" />
  </Svg>
);
export const IconCheck = (p: P) => (
  <Svg {...p}>
    <path d="M5 12.800l4.600 4.700L19 7" />
  </Svg>
);
export const IconClose = (p: P) => (
  <Svg {...p}>
    <path d="M6.500 6.500l11 11M17.500 6.500l-11 11" />
  </Svg>
);
export const IconDown = (p: P) => (
  <Svg {...p}>
    <path d="M6 9.500l6 6 6-6" />
  </Svg>
);
export const IconChevron = (p: P) => (
  <Svg {...p}>
    <path d="M9.500 6l6 6-6 6" />
  </Svg>
);
export const IconMore = (p: P) => (
  <Svg {...p} fill>
    <circle cx="5.500" cy="12" r="1.900" />
    <circle cx="12" cy="12" r="1.900" />
    <circle cx="18.500" cy="12" r="1.900" />
  </Svg>
);
export const IconPlus = (p: P) => (
  <Svg {...p}>
    <path d="M12 5.500v13M5.500 12h13" />
  </Svg>
);
export const IconSkip = (p: P) => (
  <Svg {...p}>
    <path d="M5 6l9 6-9 6zM18.500 6v12" />
  </Svg>
);
export const IconSwap = (p: P) => (
  <Svg {...p}>
    <path d="M4 8.500h13.500M14 5l3.500 3.500L14 12M20 15.500H6.500M10 12l-3.500 3.500L10 19" />
  </Svg>
);
export const IconUndo = (p: P) => (
  <Svg {...p}>
    <path d="M8.500 5L4.500 9l4 4" />
    <path d="M4.500 9H14a5.500 5.500 0 0 1 0 11h-3" />
  </Svg>
);
export const IconGear = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19 13.300l1.700 1.200-1.800 3.100-2-.8a7.400 7.400 0 0 1-2.200 1.300l-.3 2.100h-3.600l-.3-2.100a7.400 7.400 0 0 1-2.200-1.300l-2 .8-1.800-3.100L5 13.300a7.400 7.400 0 0 1 0-2.600L3.300 9.500l1.800-3.100 2 .8a7.400 7.400 0 0 1 2.200-1.300l.3-2.100h3.600l.3 2.100a7.400 7.400 0 0 1 2.200 1.300l2-.8 1.800 3.100L19 10.700a7.400 7.400 0 0 1 0 2.600z" />
  </Svg>
);
export const IconList = (p: P) => (
  <Svg {...p}>
    <path d="M9 6.500h11M9 12h11M9 17.500h11" />
    <path d="M4.500 6.500h.01M4.500 12h.01M4.500 17.500h.01" strokeWidth="2.800" />
  </Svg>
);
export const IconCopy = (p: P) => (
  <Svg {...p}>
    <rect x="8.500" y="8.500" width="12" height="12" rx="3" />
    <path d="M15.500 5.500a2 2 0 0 0-2-2h-7a3 3 0 0 0-3 3v7a2 2 0 0 0 2 2" />
  </Svg>
);
export const IconLink = (p: P) => (
  <Svg {...p}>
    <path d="M10 14a4 4 0 0 0 5.700 0l3-3a4 4 0 0 0-5.700-5.700l-1 1" />
    <path d="M14 10a4 4 0 0 0-5.700 0l-3 3A4 4 0 0 0 11 18.700l1-1" />
  </Svg>
);
export const IconMoon = (p: P) => (
  <Svg {...p}>
    <path d="M19.500 14.300A8 8 0 0 1 9.700 4.500a8 8 0 1 0 9.800 9.800z" />
  </Svg>
);
export const IconHeart = (p: P) => (
  <Svg {...p}>
    <path d="M12 20s-7.500-4.600-7.500-10.200A4.300 4.300 0 0 1 12 7.200a4.300 4.300 0 0 1 7.500 2.600C19.500 15.400 12 20 12 20z" />
  </Svg>
);
export const IconBack = (p: P) => (
  <Svg {...p}>
    <path d="M14.500 6l-6 6 6 6" />
  </Svg>
);
