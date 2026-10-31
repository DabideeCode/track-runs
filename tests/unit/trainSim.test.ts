import { describe, expect, it } from 'vitest';
import type { Route } from '@/domain/route';
import { createTrain, isMoving, stepTrain, trainLimits, type TrainInput, type TrainState } from '@/domain/trainSim';

const line = (length: number, stationS = 0.5): Route => ({ kind: 'line', length, stationS, segments: [] });
const loop = (length: number): Route => ({ kind: 'loop', length, stationS: 0.5, segments: [] });

const auto: TrainInput = { drive: 'auto', forward: false, reverse: false };
const manual = (forward: boolean, reverse: boolean): TrainInput => ({ drive: 'manual', forward, reverse });

const STEP = 1 / 60;

function run(train: TrainState, route: Route, input: TrainInput, seconds: number) {
  let bumps = 0;
  for (let t = 0; t < seconds; t += STEP) if (stepTrain(train, route, input, STEP).bump) bumps++;
  return bumps;
}

describe('trainLimits', () => {
  it('stops the leading vehicle at each end when the train fits', () => {
    expect(trainLimits(line(6))).toEqual({ min: 2.25, max: 5.55 });
    expect(trainLimits(line(2.95))?.min).toBe(2.25);
  });

  it('uses the locomotive alone on a line too short for the train', () => {
    expect(trainLimits(line(2.8))?.min).toBe(0.45);
    expect(trainLimits(line(2.8))?.max).toBeCloseTo(2.35);
    expect(trainLimits(line(1))?.max).toBeCloseTo(0.55);
  });

  it('has no limits on a loop', () => {
    expect(trainLimits(loop(6))).toBeNull();
  });
});

describe('Auto driving', () => {
  it('reaches 1.5 tiles per second', () => {
    const train = createTrain(line(20));
    run(train, line(20), auto, 1);
    expect(train.speed).toBeCloseTo(1.5);
    expect(train.direction).toBe('forward');
  });

  it('counts as moving from the first moment', () => {
    expect(isMoving(createTrain(line(20)), 'auto')).toBe(true);
  });

  it('eases to a stop exactly at the limit, with a bump', () => {
    const route = line(6, 4.5);
    const train = createTrain(route);
    let peak = 0;
    let previous = Infinity;
    let eased = false;
    let bumps = 0;
    for (let t = 0; t < 1.5 && !bumps; t += STEP) {
      bumps += stepTrain(train, route, auto, STEP).bump ? 1 : 0;
      peak = Math.max(peak, train.speed);
      if (train.speed < previous && train.speed > 0 && train.speed < 1.4) eased = true;
      previous = train.speed;
    }
    expect(bumps).toBe(1);
    expect(eased).toBe(true);
    expect(train.s).toBeCloseTo(5.55);
    expect(train.speed).toBe(0);
    expect(isMoving(train, 'auto')).toBe(false);
  });

  it('pauses for 1 second, then runs the opposite way', () => {
    const route = line(6, 5.2);
    const train = createTrain(route);
    run(train, route, auto, 0.6);
    expect(train.phase).toBe('pausing');
    expect(train.direction).toBe('forward');
    run(train, route, auto, 0.7);
    expect(train.direction).toBe('forward');
    run(train, route, auto, 0.5);
    expect(train.direction).toBe('reverse');
    expect(isMoving(train, 'auto')).toBe(true);
    expect(train.s).toBeLessThan(5.55);
  });

  it('shuttles between both ends indefinitely', () => {
    const route = line(6, 3);
    const train = createTrain(route);
    let seenMin = Infinity;
    let seenMax = -Infinity;
    for (let t = 0; t < 40; t += STEP) {
      stepTrain(train, route, auto, STEP);
      seenMin = Math.min(seenMin, train.s);
      seenMax = Math.max(seenMax, train.s);
    }
    expect(seenMin).toBeCloseTo(2.25);
    expect(seenMax).toBeCloseTo(5.55);
  });

  it('never stops on a loop', () => {
    const route = loop(6);
    const train = createTrain(route);
    expect(run(train, route, auto, 60)).toBe(0);
    expect(train.speed).toBeCloseTo(1.5);
  });

  it('shuttles on a lone station without locking up', () => {
    const route = line(1);
    const train = createTrain(route);
    let directions = new Set<string>();
    for (let t = 0; t < 6; t += STEP) {
      stepTrain(train, route, auto, STEP);
      directions = directions.add(train.direction);
    }
    expect(directions).toEqual(new Set(['forward', 'reverse']));
  });

  it('leaves a spawn with carriages overhanging the far end', () => {
    const route = line(6, 0.5);
    const train = createTrain(route);
    expect(train.s).toBeLessThan(trainLimits(route)!.min);
    run(train, route, auto, 2);
    expect(train.s).toBeGreaterThan(2);
  });
});

describe('Manual driving', () => {
  it('reaches 2 tiles per second within 1 second of W', () => {
    const train = createTrain(line(40, 5));
    run(train, line(40, 5), manual(true, false), 1);
    expect(train.speed).toBeCloseTo(2);
    expect(train.direction).toBe('forward');
  });

  it('moves in reverse on S', () => {
    const route = line(40, 20);
    const train = createTrain(route);
    run(train, route, manual(false, true), 1);
    expect(train.direction).toBe('reverse');
    expect(train.s).toBeLessThan(20);
    expect(train.speed).toBeCloseTo(2);
  });

  it('stops within 0.5 seconds of release', () => {
    const route = line(40, 5);
    const train = createTrain(route);
    run(train, route, manual(true, false), 1);
    run(train, route, manual(false, false), 0.5);
    expect(train.speed).toBe(0);
    expect(isMoving(train, 'manual')).toBe(false);
  });

  it('treats W and S together as no key', () => {
    const route = line(40, 5);
    const train = createTrain(route);
    run(train, route, manual(true, false), 1);
    run(train, route, manual(true, true), 0.5);
    expect(train.speed).toBe(0);
  });

  it('brakes before changing direction', () => {
    const route = line(40, 20);
    const train = createTrain(route);
    run(train, route, manual(true, false), 1);
    stepTrain(train, route, manual(false, true), STEP);
    expect(train.direction).toBe('forward');
    run(train, route, manual(false, true), 0.6);
    expect(train.direction).toBe('reverse');
  });

  it('stops at a limit and will not go further, bumping once', () => {
    const route = line(6, 5);
    const train = createTrain(route);
    expect(run(train, route, manual(true, false), 3)).toBe(1);
    expect(train.s).toBeCloseTo(5.55);
    expect(train.speed).toBe(0);
    run(train, route, manual(true, false), 1);
    expect(train.s).toBeCloseTo(5.55);
  });

  it('still moves away from the limit on the opposite key', () => {
    const route = line(6, 5);
    const train = createTrain(route);
    run(train, route, manual(true, false), 2);
    run(train, route, manual(false, true), 0.5);
    expect(train.s).toBeLessThan(5.55);
  });

  it('stays still with no key held', () => {
    const route = line(6, 3);
    const train = createTrain(route);
    run(train, route, manual(false, false), 1);
    expect(train.s).toBe(3);
  });
});

describe('switching styles', () => {
  it('stops within 0.5 seconds when switched to Manual with no key', () => {
    const route = line(40, 5);
    const train = createTrain(route);
    run(train, route, auto, 1);
    run(train, route, manual(false, false), 0.5);
    expect(train.speed).toBe(0);
  });

  it('carries on in the current direction at 1.5 when switched to Auto', () => {
    const route = line(40, 30);
    const train = createTrain(route);
    run(train, route, manual(false, true), 1);
    run(train, route, auto, 1);
    expect(train.direction).toBe('reverse');
    expect(train.speed).toBeCloseTo(1.5);
  });
});

describe('time steps', () => {
  it('stays accurate at 4 fps and clamps longer gaps', () => {
    const route = line(100, 10);
    const train = createTrain(route);
    for (let i = 0; i < 8; i++) stepTrain(train, route, auto, 0.25);
    expect(train.s - 10).toBeGreaterThan(2.7);
    expect(train.s - 10).toBeLessThan(3);

    const before = train.s;
    stepTrain(train, route, auto, 30);
    expect(train.s - before).toBeLessThan(0.4);
  });
});
