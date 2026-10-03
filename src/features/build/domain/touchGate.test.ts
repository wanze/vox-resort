import { describe, expect, it } from 'vitest';
import {
  gateCancel,
  gateDown,
  gateMove,
  gateUp,
  IDLE,
  TOUCH_SLOP,
  type GateAction,
  type TouchGate,
} from './touchGate';

const at = (id: number, x: number, y = 0) => ({ id, x, y });

// Runs a script of events and collects every action that was not 'none'.
type Event =
  | { readonly down: [number, number]; readonly fingers: number }
  | { readonly move: [number, number] }
  | { readonly up: [number, number]; readonly left: number }
  | { readonly cancel: number; readonly left: number };

function play(events: readonly Event[], from: TouchGate = IDLE) {
  let gate = from;
  const actions: GateAction[] = [];
  for (const event of events) {
    const step =
      'down' in event
        ? gateDown(gate, at(...event.down), event.fingers)
        : 'move' in event
          ? gateMove(gate, at(...event.move))
          : 'up' in event
            ? gateUp(gate, at(...event.up), event.left)
            : gateCancel(gate, event.left);
    gate = step.gate;
    if (step.action !== 'none') actions.push(step.action);
  }
  return { gate, actions };
}

describe('touchGate', () => {
  it('takes a still press and release for a tap', () => {
    const { gate, actions } = play([
      { down: [1, 100], fingers: 1 },
      { move: [1, 102] },
      { up: [1, 102], left: 0 },
    ]);
    expect(actions).toEqual(['tap']);
    expect(gate.phase).toBe('idle');
  });

  it('begins a stroke once, when the finger passes the slop', () => {
    const { gate, actions } = play([
      { down: [1, 100], fingers: 1 },
      { move: [1, 100 + TOUCH_SLOP + 1] },
      { move: [1, 140] },
      { move: [1, 180] },
      { up: [1, 180], left: 0 },
    ]);
    expect(actions).toEqual(['begin', 'end']);
    expect(gate.phase).toBe('idle');
  });

  it('stays pending while the finger moves within the slop', () => {
    const { gate, actions } = play([
      { down: [1, 100], fingers: 1 },
      { move: [1, 100 + TOUCH_SLOP] },
    ]);
    expect(actions).toEqual([]);
    expect(gate.phase).toBe('pending');
  });

  it('hands a second finger during a press to the camera without painting', () => {
    const { gate, actions } = play([
      { down: [1, 100], fingers: 1 },
      { down: [2, 200], fingers: 2 },
    ]);
    expect(actions).toEqual([]);
    expect(gate.phase).toBe('camera');
  });

  it('abandons a stroke when a second finger lands', () => {
    const { gate, actions } = play([
      { down: [1, 100], fingers: 1 },
      { move: [1, 130] },
      { down: [2, 200], fingers: 2 },
    ]);
    expect(actions).toEqual(['begin', 'abandon']);
    expect(gate.phase).toBe('camera');
  });

  it('never taps or begins while the fingers of a pinch lift one at a time', () => {
    const { gate, actions } = play([
      { down: [1, 100], fingers: 1 },
      { down: [2, 200], fingers: 2 },
      { move: [1, 60] },
      { move: [2, 260] },
      { up: [2, 260], left: 1 },
      { move: [1, 20] },
      { up: [1, 20], left: 0 },
    ]);
    expect(actions).toEqual([]);
    expect(gate.phase).toBe('idle');
  });

  it('taps again once a pinch has fully lifted', () => {
    const pinched = play([
      { down: [1, 100], fingers: 1 },
      { down: [2, 200], fingers: 2 },
      { up: [1, 100], left: 1 },
      { up: [2, 200], left: 0 },
    ]);
    const { actions } = play(
      [
        { down: [3, 50], fingers: 1 },
        { up: [3, 50], left: 0 },
      ],
      pinched.gate,
    );
    expect(actions).toEqual(['tap']);
  });

  it('never taps when the first finger is cancelled as a second lands', () => {
    const { gate, actions } = play([
      { down: [1, 100], fingers: 1 },
      { down: [2, 200], fingers: 2 },
      { cancel: 1, left: 1 },
      { up: [2, 200], left: 0 },
    ]);
    expect(actions).toEqual([]);
    expect(gate.phase).toBe('idle');
  });

  it('never taps on a cancelled press, nor on an up with a finger the gate never saw', () => {
    expect(
      play([
        { down: [1, 100], fingers: 1 },
        { cancel: 1, left: 0 },
      ]).actions,
    ).toEqual([]);
    const { gate, actions } = play([
      { down: [1, 100], fingers: 1 },
      { up: [1, 100], left: 1 },
    ]);
    expect(actions).toEqual([]);
    expect(gate.phase).toBe('camera');
  });

  it('abandons a stroke whose finger is cancelled', () => {
    const { gate, actions } = play([
      { down: [1, 100], fingers: 1 },
      { move: [1, 130] },
      { cancel: 1, left: 0 },
    ]);
    expect(actions).toEqual(['begin', 'abandon']);
    expect(gate.phase).toBe('idle');
  });
});
