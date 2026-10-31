import type { ComponentProps, ReactNode } from 'react';
import type { PieceType } from '@/domain/types';

type IconProps = ComponentProps<'svg'>;

function Icon({ children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

const make = (paths: ReactNode) => (props: IconProps) => <Icon {...props}>{paths}</Icon>;

export const PlayIcon = make(<path d="M8 5.5v13l10.5-6.5z" />);
export const HammerIcon = make(
  <>
    <path d="M14 7 7.5 13.5" />
    <path d="m5 16 3 3" />
    <path d="M12 5h5l3 3-3 3-4-4z" />
    <path d="m9 12-5.5 5.5a1.5 1.5 0 0 0 2 2.2L11 14" />
  </>,
);
export const SaveIcon = make(
  <>
    <path d="M5 4.5h11l3.5 3.5V19a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1z" />
    <path d="M8 4.5v5h7v-5" />
    <path d="M8 20v-6h8v6" />
  </>,
);
export const BackIcon = make(
  <>
    <path d="M10 6 4.5 12l5.5 6" />
    <path d="M5 12h14.5" />
  </>,
);
export const TrashIcon = make(
  <>
    <path d="M4.5 7h15" />
    <path d="M9.5 7V4.5h5V7" />
    <path d="m6.5 7 1 12.5h9l1-12.5" />
    <path d="M10 11v5" />
    <path d="M14 11v5" />
  </>,
);
export const FlipIcon = make(
  <>
    <path d="M4 9h14" />
    <path d="m15 5.5 3.5 3.5L15 12.5" />
    <path d="M20 15H6" />
    <path d="m9 11.5L5.5 15 9 18.5" />
  </>,
);
export const ResetViewIcon = make(
  <>
    <path d="M5 12a7 7 0 1 0 2.2-5.1" />
    <path d="M4.5 4.5v4h4" />
    <circle cx="12" cy="12" r="1.5" />
  </>,
);
export const AutoIcon = make(
  <>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 12l3.5-3.5" />
    <path d="M12 7v-.5" />
    <path d="M7 12h-.5" />
    <path d="M17 12h.5" />
  </>,
);
export const ManualIcon = make(
  <>
    <path d="M8 12V6.5a1.5 1.5 0 0 1 3 0V11" />
    <path d="M11 10.5v-1a1.5 1.5 0 0 1 3 0V11" />
    <path d="M14 10.5a1.5 1.5 0 0 1 3 0V15a5.5 5.5 0 0 1-5.5 5.5h-.8a5 5 0 0 1-3.8-1.8L4.8 16a1.6 1.6 0 0 1 2.3-2.2L8 14.5" />
  </>,
);
export const SpeakerOnIcon = make(
  <>
    <path d="M4.5 9.5v5h3.5l4.5 4v-13l-4.5 4z" />
    <path d="M16 9a4 4 0 0 1 0 6" />
    <path d="M18.5 6.5a7.5 7.5 0 0 1 0 11" />
  </>,
);
export const SpeakerOffIcon = make(
  <>
    <path d="M4.5 9.5v5h3.5l4.5 4v-13l-4.5 4z" />
    <path d="m16 9.5 5 5" />
    <path d="m21 9.5-5 5" />
  </>,
);
export const MusicIcon = make(
  <>
    <path d="M9.5 17.5V6l10-2v11.5" />
    <circle cx="7" cy="17.5" r="2.5" />
    <circle cx="17" cy="15.5" r="2.5" />
  </>,
);
export const EffectsIcon = make(
  <>
    <path d="M5 12h2l2-6 3 12 2.5-8 1.5 2h3.5" />
  </>,
);
export const PlusIcon = make(
  <>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </>,
);
export const PencilIcon = make(
  <>
    <path d="m5 19 1-4L16.5 4.5a1.8 1.8 0 0 1 2.6 0l.4.4a1.8 1.8 0 0 1 0 2.6L9 18z" />
    <path d="m14.5 6.5 3 3" />
  </>,
);
export const FeatherIcon = make(
  <>
    <path d="M19.5 4.5c-6.5 0-12 4-12 10.5v1.5h1.5c6.5 0 10.5-5.5 10.5-12z" />
    <path d="m4.5 19.5 9-9" />
  </>,
);

const StraightIcon = make(
  <>
    <path d="M9 3.5v17" />
    <path d="M15 3.5v17" />
    <path d="M9 8h6" />
    <path d="M9 16h6" />
  </>,
);
const CurveIcon = make(
  <>
    <path d="M6 20.5C6 12 12 6 20.5 6" />
    <path d="M12.5 20.5c0-4.5 3.5-8 8-8" />
  </>,
);
const TunnelIcon = make(
  <>
    <path d="M3.5 20V12a8.5 8.5 0 0 1 17 0v8z" />
    <path d="M8 20v-7.5a4 4 0 0 1 8 0V20" />
  </>,
);
const StationIcon = make(
  <>
    <path d="M3.5 10 12 4.5l8.5 5.5" />
    <path d="M6 10v6" />
    <path d="M18 10v6" />
    <path d="M3.5 16h17" />
    <path d="M3.5 20h17" />
  </>,
);
const BufferIcon = make(
  <>
    <path d="M9 9v11.5" />
    <path d="M15 9v11.5" />
    <rect x="6" y="4" width="12" height="5" rx="1.2" />
  </>,
);
const HouseIcon = make(
  <>
    <path d="M4 11.5 12 5l8 6.5" />
    <path d="M6.5 10v9.5h11V10" />
    <path d="M10.5 19.5v-5h3v5" />
  </>,
);
const PineTreeIcon = make(
  <>
    <path d="M12 3.5 6 16.5h12z" />
    <path d="M12 16.5v4" />
  </>,
);
const RoundTreeIcon = make(
  <>
    <circle cx="12" cy="9.5" r="6" />
    <path d="M12 15.5v5" />
  </>,
);
const HillIcon = make(
  <>
    <path d="M3 19c2.5-6.5 5.5-10 9-10s6.5 3.5 9 10z" />
  </>,
);
const CarIcon = make(
  <>
    <path d="M4 15.5v-2.5l2.5-1 2-4h6l2.5 4 2.5 1v2.5z" />
    <circle cx="8" cy="16.5" r="1.8" />
    <circle cx="16" cy="16.5" r="1.8" />
  </>,
);
const CassetteIcon = make(
  <>
    <rect x="3.5" y="6" width="17" height="12" rx="1.5" />
    <circle cx="9" cy="12" r="1.8" />
    <circle cx="15" cy="12" r="1.8" />
  </>,
);
const BlocksIcon = make(
  <>
    <rect x="4" y="12.5" width="7.5" height="7.5" rx="1" />
    <rect x="12.5" y="12.5" width="7.5" height="7.5" rx="1" />
    <rect x="8.25" y="4" width="7.5" height="7.5" rx="1" />
  </>,
);

export const PIECE_ICONS: Record<PieceType, (props: IconProps) => ReactNode> = {
  straight: StraightIcon,
  curve: CurveIcon,
  tunnel: TunnelIcon,
  station: StationIcon,
  buffer: BufferIcon,
  house: HouseIcon,
  pineTree: PineTreeIcon,
  roundTree: RoundTreeIcon,
  hill: HillIcon,
  car: CarIcon,
  cassette: CassetteIcon,
  blocks: BlocksIcon,
};
