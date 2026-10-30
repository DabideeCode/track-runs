import type { ComponentType, ReactNode, SVGProps } from 'react';
import type { PieceType } from '@/domain/types';
import { cn } from '@/lib/utils';

/*
 * Palette item icons (Requirements 10.2, 30.6).
 *
 * Drawn for this project in the lucide-react style used by every other icon:
 * a 24 × 24 view box, no fill, `currentColor` stroke of width 2 with round
 * caps and joins. Each icon shows its item from above or the side so it reads
 * at 24 px.
 */

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  /** Width and height in CSS pixels. Default 24, as in lucide-react. */
  size?: number | string;
}

/** Shared lucide-style wrapper. Decorative by default (`aria-hidden`). */
function IconBase({ size = 24, className, children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={cn('lucide', className)}
      {...props}
    >
      {children}
    </svg>
  );
}

function makeIcon(name: string, body: ReactNode): ComponentType<IconProps> {
  const Icon = (props: IconProps) => (
    <IconBase data-icon={name} {...props}>
      {body}
    </IconBase>
  );
  Icon.displayName = `${name}Icon`;
  return Icon;
}

/** Two rails with three sleepers, running north to south. */
export const StraightTrackIcon = makeIcon(
  'StraightTrack',
  <path d="M9 3v18M15 3v18M6 7h12M6 12h12M6 17h12" />,
);

/** Quarter-circle rails from the south edge to the east edge, as at 0°. */
export const CurvedTrackIcon = makeIcon(
  'CurvedTrack',
  <path d="M9 21a12 12 0 0 1 12-12M15 21a6 6 0 0 1 6-6M10.4 10.4l7.1 7.1M6.2 15.6l7.8 3.4M15.6 6.2l3.4 7.8" />,
);

/** Arched tunnel mouth over the ground line. */
export const TunnelIcon = makeIcon(
  'Tunnel',
  <path d="M2 20h20M4 20v-8a8 8 0 0 1 16 0v8M9 20v-7a3 3 0 0 1 6 0v7" />,
);

/** Platform shelter with a pitched roof and a clock. */
export const StationIcon = makeIcon(
  'Station',
  <>
    <path d="M3 10l9-6 9 6M5 10v7M19 10v7M2 17h20M5 21h14" />
    <circle cx="12" cy="11" r="2" />
  </>,
);

/** Rails ending at a stop block. */
export const BufferStopIcon = makeIcon(
  'BufferStop',
  <>
    <path d="M9 21v-11M15 21v-11M6 16h12" />
    <rect x="5" y="4" width="14" height="6" rx="2" />
  </>,
);

/** House with a pitched roof and a door. */
export const ToyHouseIcon = makeIcon(
  'ToyHouse',
  <path d="M3 10l9-7 9 7M5 9v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 21v-6h4v6" />,
);

/** Two-tier conifer with a trunk. */
export const PineTreeIcon = makeIcon('PineTree', <path d="M12 2l-6 8h3l-4 6h14l-4-6h3zM12 16v6" />);

/** Round crown on a straight trunk. */
export const RoundTreeIcon = makeIcon(
  'RoundTree',
  <>
    <circle cx="12" cy="9" r="6" />
    <path d="M12 15v7M9 22h6" />
  </>,
);

/** Gentle grassy mound. */
export const HillIcon = makeIcon('Hill', <path d="M2 19c4-9 7-12 10-12s6 3 10 12zM9 12.5l3-2 3 2" />);

/** Side view of a small car. */
export const ToyCarIcon = makeIcon(
  'ToyCar',
  <>
    <path d="M5 17H3v-4l2-5h9l3 5h3a1 1 0 0 1 1 1v3h-2M9 17h6M6 13h11" />
    <circle cx="7" cy="17" r="2" />
    <circle cx="17" cy="17" r="2" />
  </>,
);

/** Cassette tape with two reels and the tape window. */
export const CassetteTapeIcon = makeIcon(
  'CassetteTape',
  <>
    <rect x="2" y="5" width="20" height="14" rx="2" />
    <circle cx="8" cy="11" r="2" />
    <circle cx="16" cy="11" r="2" />
    <path d="M10 11h4M6 19l2-4h8l2 4" />
  </>,
);

/** Three stacked toy blocks. */
export const BuildingBlocksIcon = makeIcon(
  'BuildingBlocks',
  <>
    <rect x="3" y="13" width="8" height="8" rx="1.5" />
    <rect x="13" y="13" width="8" height="8" rx="1.5" />
    <rect x="8" y="3" width="8" height="8" rx="1.5" />
  </>,
);

/** Icon for each palette item, keyed by the catalogue `type`. */
export const PALETTE_ICONS: Readonly<Record<PieceType, ComponentType<IconProps>>> = {
  straight: StraightTrackIcon,
  curve: CurvedTrackIcon,
  tunnel: TunnelIcon,
  station: StationIcon,
  buffer: BufferStopIcon,
  house: ToyHouseIcon,
  pineTree: PineTreeIcon,
  roundTree: RoundTreeIcon,
  hill: HillIcon,
  car: ToyCarIcon,
  cassette: CassetteTapeIcon,
  blocks: BuildingBlocksIcon,
};

/** Renders the palette icon for `type`. */
export function PaletteIcon({ type, ...props }: IconProps & { type: PieceType }) {
  const Icon = PALETTE_ICONS[type];
  return <Icon {...props} />;
}
