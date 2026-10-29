import type { PieceType } from '@/game/types'

// One icon style for all 12 items: flat painted-wood fills with a soft ink outline, drawn on a 48-unit grid.
const INK = '#5a4636'
const C = {
  birch: '#e8d2a8',
  groove: '#a07a52',
  honey: '#d9a35b',
  walnut: '#9a6c48',
  sage: '#9fb38f',
  sageDeep: '#6f8a62',
  dusty: '#7f9bb8',
  dustyDeep: '#5d7895',
  terracotta: '#c4704f',
  cream: '#f3e8d2',
  slate: '#6f7883',
  charcoal: '#4a4340',
}

const stroke = { stroke: INK, strokeWidth: 1.6, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const }

const Rail = ({ y1 = 4, y2 = 44 }: { y1?: number; y2?: number }) => (
  <>
    <rect x={15} y={y1} width={18} height={y2 - y1} rx={3} fill={C.birch} {...stroke} />
    <line x1={20} y1={y1 + 2} x2={20} y2={y2 - 2} stroke={C.groove} strokeWidth={2} />
    <line x1={28} y1={y1 + 2} x2={28} y2={y2 - 2} stroke={C.groove} strokeWidth={2} />
  </>
)

const icons: Record<PieceType, React.ReactNode> = {
  straight: <Rail />,
  curve: (
    <>
      <path d="M15 44 A29 29 0 0 1 44 15 L44 33 A11 11 0 0 0 33 44 Z" fill={C.birch} {...stroke} />
      <path d="M20 44 A24 24 0 0 1 44 20" fill="none" stroke={C.groove} strokeWidth={2} />
      <path d="M28 44 A16 16 0 0 1 44 28" fill="none" stroke={C.groove} strokeWidth={2} />
    </>
  ),
  tunnel: (
    <>
      <Rail />
      <path d="M8 36 V22 A16 16 0 0 1 40 22 V36 Z" fill={C.sage} {...stroke} />
      <path d="M15 36 V24 A9 9 0 0 1 33 24 V36 Z" fill={C.walnut} {...stroke} />
    </>
  ),
  station: (
    <>
      <Rail />
      <rect x={31} y={12} width={11} height={26} rx={2.5} fill={C.honey} {...stroke} />
      <path d="M10 13 L42 13 L44 8 L12 8 Z" fill={C.terracotta} {...stroke} />
    </>
  ),
  buffer: (
    <>
      <Rail y1={14} />
      <rect x={12} y={5} width={24} height={11} rx={3} fill={C.walnut} {...stroke} />
      <circle cx={19} cy={18} r={2.6} fill={C.terracotta} {...stroke} strokeWidth={1.2} />
      <circle cx={29} cy={18} r={2.6} fill={C.terracotta} {...stroke} strokeWidth={1.2} />
    </>
  ),
  house: (
    <>
      <rect x={11} y={21} width={26} height={21} rx={2.5} fill={C.cream} {...stroke} />
      <path d="M7 23 L24 8 L41 23 Z" fill={C.terracotta} {...stroke} />
      <rect x={15} y={30} width={6} height={12} rx={1.5} fill={C.dustyDeep} {...stroke} strokeWidth={1.2} />
      <rect x={26} y={28} width={6} height={6} rx={1.2} fill={C.sage} {...stroke} strokeWidth={1.2} />
    </>
  ),
  pineTree: (
    <>
      <rect x={21.5} y={36} width={5} height={8} rx={1.5} fill={C.walnut} {...stroke} />
      <path d="M24 4 L36 22 H12 Z" fill={C.sageDeep} {...stroke} />
      <path d="M24 14 L39 37 H9 Z" fill={C.sageDeep} {...stroke} />
    </>
  ),
  roundTree: (
    <>
      <rect x={22} y={26} width={4} height={16} rx={1.5} fill={C.walnut} {...stroke} />
      <rect x={17} y={41} width={14} height={4} rx={1.5} fill={C.honey} {...stroke} strokeWidth={1.2} />
      <circle cx={24} cy={18} r={12} fill={C.sage} {...stroke} />
    </>
  ),
  hill: (
    <>
      <path d="M4 38 C10 16, 38 16, 44 38 Z" fill={C.sage} {...stroke} />
      <circle cx={34} cy={34} r={2.5} fill={C.honey} />
      <circle cx={15} cy={33} r={2} fill={C.terracotta} />
    </>
  ),
  car: (
    <>
      <rect x={7} y={22} width={34} height={11} rx={5} fill={C.dusty} {...stroke} />
      <path d="M15 22 L18 14 H30 L33 22 Z" fill={C.cream} {...stroke} />
      <circle cx={15} cy={34} r={4.5} fill={C.charcoal} {...stroke} strokeWidth={1.2} />
      <circle cx={33} cy={34} r={4.5} fill={C.charcoal} {...stroke} strokeWidth={1.2} />
    </>
  ),
  cassette: (
    <>
      <rect x={5} y={12} width={38} height={24} rx={3} fill={C.slate} {...stroke} />
      <rect x={9} y={15} width={30} height={11} rx={1.5} fill={C.cream} />
      <rect x={9} y={15} width={30} height={2.5} fill={C.terracotta} />
      <circle cx={17} cy={22} r={3} fill={C.charcoal} />
      <circle cx={31} cy={22} r={3} fill={C.charcoal} />
      <path d="M14 36 L17 31 H31 L34 36" fill="none" {...stroke} strokeWidth={1.2} />
    </>
  ),
  blocks: (
    <>
      <rect x={6} y={26} width={17} height={17} rx={2.5} fill={C.cream} {...stroke} />
      <rect x={25} y={26} width={17} height={17} rx={2.5} fill={C.cream} {...stroke} />
      <rect x={15.5} y={8} width={17} height={17} rx={2.5} fill={C.cream} {...stroke} transform="rotate(8 24 16.5)" />
      <text x={14.5} y={39} fontSize={11} fontWeight={900} textAnchor="middle" fill={C.terracotta} fontFamily="Nunito, system-ui, sans-serif">A</text>
      <text x={33.5} y={39} fontSize={11} fontWeight={900} textAnchor="middle" fill={C.dustyDeep} fontFamily="Nunito, system-ui, sans-serif">B</text>
      <text x={24} y={21} fontSize={11} fontWeight={900} textAnchor="middle" fill={C.sageDeep} fontFamily="Nunito, system-ui, sans-serif" transform="rotate(8 24 16.5)">C</text>
    </>
  ),
}

export function PieceIcon({ type, className }: { type: PieceType; className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      {icons[type]}
    </svg>
  )
}
