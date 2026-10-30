/**
 * Unit tests for the train runtime (task 11.1).
 *
 * Requirements 17.2, 17.9, 18.3, 18.5, 26.1 to 26.5, 39.13, 39.14, 39.20 and 7.10.
 * The audio port is a recording fake; the train itself is the real pure
 * simulation from `src/domain/train.ts`.
 */
import { describe, expect, it } from 'vitest';
import type { AudioPort, OneShotEvent } from '@/audio/types';
import type { AudioSettings, Piece, PieceType, Rotation, SoundEvent } from '@/domain/types';
import { buildTrackGraph, distanceToDeadEnd } from '@/domain/trackGraph';
import { TrainRuntime, type BlurTarget, type ParkedSource } from '@/runtime/TrainRuntime';

type Call =
  | { kind: 'play'; event: OneShotEvent }
  | { kind: 'startChug'; speed: number | undefined }
  | { kind: 'setChugLevel'; speed: number }
  | { kind: 'stopChug' };

class RecordingAudio implements AudioPort {
  calls: Call[] = [];
  log: SoundEvent[] = [];
  play(event: OneShotEvent): void {
    this.log.push(event);
    this.calls.push({ kind: 'play', event });
  }
  startChug(speed?: number): void {
    this.log.push('chug');
    this.calls.push({ kind: 'startChug', speed });
  }
  setChugLevel(speed: number): void {
    this.calls.push({ kind: 'setChugLevel', speed });
  }
  stopChug(): void {
    this.calls.push({ kind: 'stopChug' });
  }
  apply(_settings: AudioSettings): void {}
  getLog(): SoundEvent[] {
    return [...this.log];
  }
  count(kind: Call['kind']): number {
    return this.calls.filter((c) => c.kind === kind).length;
  }
}

const FRAME = 1 / 60;

function piece(id: string, type: PieceType, gridX: number, gridZ: number, rotation: Rotation = 0): Piece {
  return { id, type, gridX, gridZ, rotation };
}

/** A closed 4 × 4 rectangle (columns 4 to 7, rows 4 to 7) with the station on the west side. */
function loop(): Piece[] {
  return [
    piece('c1', 'curve', 4, 4, 0),
    piece('t1', 'straight', 5, 4, 90),
    piece('t2', 'straight', 6, 4, 90),
    piece('c2', 'curve', 7, 4, 90),
    piece('r1', 'straight', 7, 5, 0),
    piece('r2', 'straight', 7, 6, 0),
    piece('c3', 'curve', 7, 7, 180),
    piece('b1', 'straight', 6, 7, 90),
    piece('b2', 'straight', 5, 7, 90),
    piece('c4', 'curve', 4, 7, 270),
    piece('l1', 'straight', 4, 6, 0),
    piece('st', 'station', 4, 5, 0),
  ];
}

/** A long north–south line: station at row 7 with straights from row 2 to row 13 and open ends. */
function line(): Piece[] {
  const ps: Piece[] = [];
  for (let z = 2; z <= 13; z++) ps.push(piece(z === 7 ? 'st' : `s${z}`, z === 7 ? 'station' : 'straight', 8, z, 0));
  return ps;
}

function ticks(rt: TrainRuntime, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / FRAME); i++) rt.tick(FRAME);
}

describe('TrainRuntime', () => {
  it('the test loop is closed', () => {
    const g = buildTrackGraph(loop());
    expect(distanceToDeadEnd(g, { pieceId: 'st', s: 0.5, heading: 1 }, Infinity)).toBe(Infinity);
  });

  it('snapshot and poses are null without a station', () => {
    const rt = new TrainRuntime(new RecordingAudio());
    expect(rt.snapshot()).toBeNull();
    expect(rt.poses()).toBeNull();
    rt.syncParked([piece('a', 'straight', 3, 3)], 0);
    expect(rt.snapshot()).toBeNull();
    expect(rt.poses()).toBeNull();
  });

  it('enterPlay without a station does nothing', () => {
    const audio = new RecordingAudio();
    const rt = new TrainRuntime(audio);
    rt.enterPlay([piece('a', 'straight', 3, 3)], 0);
    expect(rt.isPlaying()).toBe(false);
    expect(audio.calls).toEqual([]);
  });

  it('in Build mode the parked train follows the connected source', () => {
    let state: ParkedSource = { pieces: loop(), startFacing: 0 };
    const rt = new TrainRuntime(new RecordingAudio(), { source: () => state });
    expect(rt.snapshot()).toEqual({ pieceId: 'st', progress: 0.5, moving: false, direction: 'forward', speed: 0 });
    const facing0 = rt.poses()![0]!;
    // Station rotated 0°, facing 0: the locomotive faces north (−z).
    expect(facing0.tangent.z).toBeCloseTo(-1);

    const v0 = rt.getVersion();
    state = { ...state, startFacing: 180 };
    expect(rt.getVersion()).toBeGreaterThan(v0);
    expect(rt.poses()![0]!.tangent.z).toBeCloseTo(1);

    // Moving the station (a new pieces array) moves the parked train.
    state = { pieces: [piece('st', 'station', 10, 10, 90)], startFacing: 0 };
    const snap = rt.snapshot()!;
    expect(snap.pieceId).toBe('st');
    expect(snap.progress).toBe(0.5);
    const loco = rt.poses()![0]!;
    expect(loco.x).toBeCloseTo(10 - 7.5);
    expect(loco.z).toBeCloseTo(10 - 7.5);

    // Deleting the station removes the train.
    state = { pieces: [], startFacing: 0 };
    expect(rt.snapshot()).toBeNull();
  });

  it('syncParked notifies subscribers when the build state changes', () => {
    const rt = new TrainRuntime(new RecordingAudio());
    let calls = 0;
    const off = rt.subscribe(() => calls++);
    const pieces = loop();
    rt.syncParked(pieces, 0);
    rt.syncParked(pieces, 0); // unchanged: no notification
    rt.syncParked(pieces, 180);
    expect(calls).toBe(2);
    off();
    rt.syncParked(pieces, 0);
    expect(calls).toBe(2);
  });

  it('enterPlay on a loop logs whistle and starts the chug', () => {
    const audio = new RecordingAudio();
    const rt = new TrainRuntime(audio);
    rt.enterPlay(loop(), 0);
    expect(rt.isPlaying()).toBe(true);
    expect(rt.getDriveMode()).toBe('auto');
    expect(audio.getLog()).toEqual(['whistle', 'chug']);
    expect(audio.calls[1]).toEqual({ kind: 'startChug', speed: 0 });
  });

  it('ticking moves the train and sets the chug level from the speed', () => {
    const audio = new RecordingAudio();
    const rt = new TrainRuntime(audio);
    rt.enterPlay(loop(), 0);
    const start = rt.poses()![0]!;
    const v0 = rt.getVersion();
    ticks(rt, 1);
    const snap = rt.snapshot()!;
    expect(snap.moving).toBe(true);
    expect(snap.direction).toBe('forward');
    expect(snap.speed).toBeCloseTo(1.5);
    expect(rt.getVersion()).toBeGreaterThan(v0);
    const now = rt.poses()![0]!;
    expect(Math.hypot(now.x - start.x, now.z - start.z)).toBeGreaterThan(0.5);

    const levels = audio.calls.filter((c): c is Extract<Call, { kind: 'setChugLevel' }> => c.kind === 'setChugLevel');
    expect(levels.length).toBe(60);
    // Speed in tiles per second (D-32), not speed / 2.
    expect(levels.at(-1)!.speed).toBeCloseTo(1.5);
    // The loop never stops: chug logged once, no bump, no stop.
    ticks(rt, 10);
    expect(audio.getLog()).toEqual(['whistle', 'chug']);
    expect(audio.count('stopChug')).toBe(0);
  });

  it('exitPlay stops the chug and parks the train at the station again', () => {
    const audio = new RecordingAudio();
    const pieces = loop();
    const rt = new TrainRuntime(audio, { source: () => ({ pieces, startFacing: 0 }) });
    rt.enterPlay(pieces, 0);
    ticks(rt, 2);
    expect(rt.snapshot()!.pieceId).not.toBe('st');
    rt.exitPlay();
    expect(rt.isPlaying()).toBe(false);
    expect(audio.count('stopChug')).toBe(1);
    expect(rt.snapshot()).toEqual({ pieceId: 'st', progress: 0.5, moving: false, direction: 'forward', speed: 0 });
    // Ticks in Build mode do nothing.
    const before = audio.calls.length;
    ticks(rt, 1);
    expect(audio.calls.length).toBe(before);
    expect(rt.snapshot()!.moving).toBe(false);
    // A second exitPlay is a no-op.
    rt.exitPlay();
    expect(audio.count('stopChug')).toBe(1);
  });

  it('switching to Manual with no key held brakes to a stop and stops the chug', () => {
    const audio = new RecordingAudio();
    const rt = new TrainRuntime(audio);
    rt.enterPlay(loop(), 0);
    ticks(rt, 1);
    rt.setDriveMode('manual');
    expect(rt.getDriveMode()).toBe('manual');
    ticks(rt, 0.5);
    const snap = rt.snapshot()!;
    expect(snap.moving).toBe(false);
    expect(snap.speed).toBe(0);
    expect(audio.count('stopChug')).toBe(1);
    // No dead end on a loop, so no bump.
    expect(audio.getLog()).not.toContain('bump');
  });

  it('held keys drive the train in Manual mode', () => {
    const audio = new RecordingAudio();
    const rt = new TrainRuntime(audio);
    rt.enterPlay(loop(), 0);
    rt.setDriveMode('manual');
    ticks(rt, 0.5); // stop
    rt.setKeys({ s: true });
    expect(rt.getKeys()).toEqual({ w: false, s: true });
    ticks(rt, 1);
    let snap = rt.snapshot()!;
    expect(snap.direction).toBe('reverse');
    expect(snap.speed).toBeCloseTo(2);
    rt.setKeys({ s: false });
    ticks(rt, 0.5);
    rt.setKeys({ w: true });
    ticks(rt, 1);
    snap = rt.snapshot()!;
    expect(snap.direction).toBe('forward');
    expect(snap.speed).toBeCloseTo(2);
    // Two departures more than 3 s apart from the first whistle: logged chug for each start.
    expect(audio.getLog().filter((e) => e === 'chug').length).toBe(3);
  });

  it('keys are ignored in Auto mode', () => {
    const rt = new TrainRuntime(new RecordingAudio());
    rt.enterPlay(loop(), 0);
    rt.setKeys({ s: true });
    ticks(rt, 1);
    const snap = rt.snapshot()!;
    expect(snap.direction).toBe('forward');
    expect(snap.speed).toBeCloseTo(1.5);
  });

  it('blur and exitPlay release the held keys', () => {
    const rt = new TrainRuntime(new RecordingAudio());
    const listeners = new Set<() => void>();
    const target: BlurTarget = {
      addEventListener: (_t, l) => listeners.add(l),
      removeEventListener: (_t, l) => listeners.delete(l),
    };
    const detach = rt.bindBlur(target);
    rt.setKeys({ w: true, s: true });
    for (const l of listeners) l();
    expect(rt.getKeys()).toEqual({ w: false, s: false });
    detach();
    expect(listeners.size).toBe(0);

    rt.enterPlay(loop(), 0);
    rt.setKeys({ w: true });
    rt.exitPlay();
    expect(rt.getKeys()).toEqual({ w: false, s: false });
  });

  it('forwards bump and chug stop at a dead end in Auto mode', () => {
    const audio = new RecordingAudio();
    const rt = new TrainRuntime(audio);
    rt.enterPlay(line(), 0);
    // Facing north from row 7: the open end at row 2's north edge (z = −6) is 5.05 tiles ahead of the front.
    ticks(rt, 5);
    const log = audio.getLog();
    expect(log.filter((e) => e === 'bump').length).toBe(1);
    expect(audio.count('stopChug')).toBeGreaterThanOrEqual(1);
    // After the 1 s pause the train reverses and departs again.
    ticks(rt, 2);
    const snap = rt.snapshot()!;
    expect(snap.direction).toBe('reverse');
    expect(snap.moving).toBe(true);
  });

  it('the running train ignores later build-state changes (setting changes cannot disturb it)', () => {
    let state: ParkedSource = { pieces: loop(), startFacing: 0 };
    const rt = new TrainRuntime(new RecordingAudio(), { source: () => state });
    rt.enterPlay(state.pieces, 0);
    ticks(rt, 1);
    const before = rt.snapshot()!;
    state = { pieces: state.pieces, startFacing: 180 };
    expect(rt.snapshot()).toEqual(before);
  });
});
