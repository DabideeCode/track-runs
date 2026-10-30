import type { ReactNode, SVGProps } from 'react';
import type { PieceType } from '@/domain/types';

function Icon({ children, ...props }: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const SaveIcon = () => (
  <Icon>
    <path d="M5 4h11l3 3v13H5z" />
    <path d="M8 4v5h7V4M8 20v-6h8v6" />
  </Icon>
);

export const BackIcon = () => (
  <Icon>
    <path d="M10 6l-6 6 6 6M4 12h16" />
  </Icon>
);

export const ResetViewIcon = () => (
  <Icon>
    <path d="M4 9V4h5M20 15v5h-5M4 4l5 5M20 20l-5-5" />
    <circle cx="12" cy="12" r="2" />
  </Icon>
);

export const FlipIcon = () => (
  <Icon>
    <path d="M7 4l-4 4 4 4M3 8h14M17 12l4 4-4 4M21 16H7" />
  </Icon>
);

export const DeleteIcon = () => (
  <Icon>
    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5" />
  </Icon>
);

export const VolumeIcon = () => (
  <Icon>
    <path d="M4 9v6h4l5 4V5L8 9zM16.5 9a4 4 0 010 6M19 6.5a8 8 0 010 11" />
  </Icon>
);

export const MuteIcon = () => (
  <Icon>
    <path d="M4 9v6h4l5 4V5L8 9zM17 9.5l4 5M21 9.5l-4 5" />
  </Icon>
);

export const RenameIcon = () => (
  <Icon>
    <path d="M4 20l1-5L16 4l4 4L9 19zM13.5 6.5l4 4" />
  </Icon>
);

export const PlusIcon = () => (
  <Icon>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const LowQualityIcon = () => (
  <Icon>
    <path d="M4 20h3v-5H4zM10.5 20h3V10h-3zM17 20h3V4h-3z" />
  </Icon>
);

const TRACK_BED = { fill: 'var(--color-honey)', stroke: 'var(--color-honey-deep)', strokeWidth: 1.5 };
const PAINT = { strokeWidth: 1.5, stroke: 'var(--color-ink-soft)' };

const PIECE_ICONS: Record<PieceType, ReactNode> = {
  straight: (
    <>
      <rect x="7" y="2" width="10" height="20" rx="1.5" {...TRACK_BED} />
      <path d="M10 3v18M14 3v18" stroke="var(--color-honey-deep)" strokeWidth="1.5" />
    </>
  ),
  curve: (
    <>
      <path d="M7 22a15 15 0 0115-15v10a5 5 0 00-5 5z" {...TRACK_BED} />
      <path d="M10.5 22A11.5 11.5 0 0122 10.5M13.5 22A8.5 8.5 0 0122 13.5" stroke="var(--color-honey-deep)" strokeWidth="1.5" />
    </>
  ),
  tunnel: (
    <>
      <path d="M3 21V12a9 9 0 0118 0v9z" fill="var(--color-dusty)" {...PAINT} />
      <path d="M8 21v-8a4 4 0 018 0v8z" fill="var(--color-ink-soft)" stroke="none" />
    </>
  ),
  station: (
    <>
      <path d="M3 9l9-5 9 5z" fill="var(--color-terracotta)" {...PAINT} />
      <path d="M6 9v12M18 9v12" stroke="var(--color-ink-soft)" strokeWidth="2" />
      <rect x="3" y="17" width="18" height="4" rx="1" {...TRACK_BED} />
    </>
  ),
  buffer: (
    <>
      <rect x="7" y="6" width="10" height="16" rx="1.5" {...TRACK_BED} />
      <rect x="5" y="2" width="14" height="6" rx="1.5" fill="var(--color-terracotta)" {...PAINT} />
    </>
  ),
  house: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="1" fill="var(--color-cream)" {...PAINT} />
      <path d="M3 12l9-8 9 8z" fill="var(--color-terracotta)" {...PAINT} />
      <rect x="10" y="15" width="4" height="6" fill="var(--color-dusty)" stroke="none" />
    </>
  ),
  pineTree: (
    <>
      <rect x="10.5" y="17" width="3" height="5" fill="var(--color-honey-deep)" stroke="none" />
      <path d="M12 2l7 15H5z" fill="var(--color-sage)" {...PAINT} />
    </>
  ),
  roundTree: (
    <>
      <rect x="10.8" y="14" width="2.4" height="8" fill="var(--color-honey-deep)" stroke="none" />
      <circle cx="12" cy="9" r="7" fill="var(--color-sage)" {...PAINT} />
    </>
  ),
  hill: <path d="M2 20c3-9 7-13 11-13s7 5 9 13z" fill="var(--color-sage)" {...PAINT} />,
  car: (
    <>
      <path d="M3 16v-3l3-1 2-4h8l2 4 3 1v3z" fill="var(--color-dusty)" {...PAINT} />
      <circle cx="7.5" cy="17" r="2.2" fill="var(--color-ink-soft)" stroke="none" />
      <circle cx="16.5" cy="17" r="2.2" fill="var(--color-ink-soft)" stroke="none" />
    </>
  ),
  cassette: (
    <>
      <rect x="2" y="6" width="20" height="13" rx="1.5" fill="var(--color-ink-soft)" stroke="none" />
      <rect x="4" y="8" width="16" height="7" rx="1" fill="var(--color-cream)" stroke="none" />
      <circle cx="8.5" cy="11.5" r="2" fill="var(--color-ink-soft)" stroke="none" />
      <circle cx="15.5" cy="11.5" r="2" fill="var(--color-ink-soft)" stroke="none" />
    </>
  ),
  blocks: (
    <>
      <rect x="3" y="13" width="8" height="8" rx="1" fill="var(--color-terracotta)" {...PAINT} />
      <rect x="13" y="13" width="8" height="8" rx="1" fill="var(--color-dusty)" {...PAINT} />
      <rect x="8" y="4" width="8" height="8" rx="1" fill="var(--color-sage)" {...PAINT} />
    </>
  ),
};

export function PieceIcon({ type }: { type: PieceType }) {
  return (
    <svg viewBox="0 0 24 24" width="30" height="30" fill="none" aria-hidden="true">
      {PIECE_ICONS[type]}
    </svg>
  );
}
