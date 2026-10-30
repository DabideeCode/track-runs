import { describe, expect, it } from 'vitest';
import {
  createTrainState,
  stepTrain,
  travelLimits,
  type TrainInput,
  type TrainLimits,
  type TrainSimState,
} from '@/domain/trainSim';
import type { Route } from '@/domain/route';

const DT = 1 / 120;
const auto: TrainInput = { driveMode: 'auto', forwardHeld: false, reverseHeld: false };
const manual = (forwardHeld: boolean, reverseHeld = false): TrainInput => ({
  driveMode: 'manual',
  forwardHeld,
  reverseHeld,
});

function run(state: TrainSimState, limits: TrainLimits, seconds: number, input: TrainInput) {
  let bumps = 0;
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    if (stepTrain(state, limits, DT, input)) bumps += 1;
  }
  return bumps;
}

const open: TrainLimits = { minS: -10, maxS: 10 };
const free: TrainLimits = { minS: -Infinity, maxS: Infinity };

describe('travelLimits', () => {
  const route = (sMin: number, sMax: number, closed = false) => ({ sMin, sMax, closed }) as Route;

  it('stops the nose at the far end and the rear at the near end', () => {
    expect(travelLimits(route(-5, 5))).toEqual({ minS: -2.75, maxS: 4.55 });
  });

  it('never needs the train to go behind spawn (D-09)', () => {
    expect(travelLimits(route(-0.5, 0.5))).toEqual({ minS: 0, maxS: 0.5 - 0.45 });
  });

  it('has no limits on a closed route', () => {
    expect(travelLimits(route(-0.5, 7, true))).toEqual({ minS: -Infinity, maxS: Infinity });
  });
});

describe('Auto', () => {
  it('reaches and holds 1.5 tiles per second', () => {
    const state = createTrainState();
    run(state, open, 1, auto);
    expect(state.velocity).toBeCloseTo(1.5);
  });

  it('runs indefinitely on a closed loop', () => {
    const state = createTrainState();
    expect(run(state, free, 60, auto)).toBe(0);
    expect(state.velocity).toBeCloseTo(1.5);
    expect(state.s).toBeCloseTo(1.5 * 60 - 0.375, 0);
  });

  it('eases to a stop, pauses 1 second, then runs the other way', () => {
    const state = createTrainState();
    const limits = { minS: -3, maxS: 3 };
    let steps = 0;
    while (!stepTrain(state, limits, DT, auto) && steps < 2000) steps += 1;
    expect(steps).toBeLessThan(2000);
    expect(state.s).toBe(3);
    expect(state.velocity).toBe(0);
    expect(state.direction).toBe('forward');

    run(state, limits, 0.9, auto);
    expect(state.velocity).toBe(0);
    run(state, limits, 0.3, auto);
    expect(state.direction).toBe('reverse');
    expect(state.velocity).toBeLessThan(0);
  });

  it('slows before the limit rather than stopping dead', () => {
    const state = createTrainState();
    const limits = { minS: -3, maxS: 3 };
    let peakDrop = 0;
    let previous = 0;
    for (let i = 0; i < 480 && state.s < 3; i += 1) {
      stepTrain(state, limits, DT, auto);
      peakDrop = Math.max(peakDrop, previous - state.velocity);
      previous = state.velocity;
    }
    expect(peakDrop).toBeLessThan(0.1);
  });

  it('turns back at a limit it starts on without a bump', () => {
    const state = createTrainState();
    expect(run(state, { minS: 0, maxS: 0 }, 0.2, auto)).toBe(0);
    expect(state.pauseLeft).toBeGreaterThan(0);
  });
});

describe('Manual', () => {
  it('reaches top speed within 1 second from rest', () => {
    const state = createTrainState();
    run(state, open, 1, manual(true));
    expect(state.velocity).toBe(2);
  });

  it('reaches top speed within 1 second from full reverse', () => {
    const state = createTrainState();
    run(state, open, 1, manual(false, true));
    expect(state.velocity).toBe(-2);
    run(state, open, 1, manual(true));
    expect(state.velocity).toBe(2);
  });

  it('stops within 0.5 seconds of release', () => {
    const state = createTrainState();
    run(state, open, 1, manual(true));
    run(state, open, 0.5, manual(false));
    expect(state.velocity).toBe(0);
  });

  it('treats both keys held as neither', () => {
    const state = createTrainState();
    run(state, open, 1, manual(true));
    run(state, open, 0.5, manual(true, true));
    expect(state.velocity).toBe(0);
  });

  it('refuses to pass a dead end, in that direction only', () => {
    const state = createTrainState();
    const limits = { minS: -1, maxS: 1 };
    expect(run(state, limits, 3, manual(true))).toBe(1);
    expect(state.s).toBe(1);
    expect(state.velocity).toBe(0);
    expect(run(state, limits, 1, manual(true))).toBe(0);
    expect(state.s).toBe(1);
    run(state, limits, 0.3, manual(false, true));
    expect(state.s).toBeLessThan(1);
  });

  it('does not overrun a dead end after release', () => {
    const state = createTrainState();
    const limits = { minS: -5, maxS: 1.5 };
    run(state, limits, 0.95, manual(true));
    run(state, limits, 1, manual(false));
    expect(state.s).toBeLessThanOrEqual(1.5);
  });
});

describe('switching styles', () => {
  it('ends the pause and stays stopped when switched to Manual', () => {
    const state = createTrainState();
    state.pauseLeft = 0.5;
    run(state, open, 0.5, manual(false));
    expect(state.pauseLeft).toBe(0);
    expect(state.velocity).toBe(0);
  });

  it('turns back when switched to Auto at a dead end', () => {
    const state = createTrainState();
    const limits = { minS: -1, maxS: 1 };
    state.s = 1;
    run(state, limits, 1.2, auto);
    expect(state.direction).toBe('reverse');
    expect(state.s).toBeLessThan(1);
  });
});
