// Far enough that a still finger's tap is not taken for a drag, near enough that a stroke
// starts where the finger meant it to.
export const TOUCH_SLOP = 8;

export interface TouchPoint {
  readonly id: number;
  readonly x: number;
  readonly y: number;
}

// A pinch starts with one finger, so nothing is painted until the gesture is plainly one finger.
export type TouchGate =
  | { readonly phase: 'idle' }
  | { readonly phase: 'pending'; readonly start: TouchPoint }
  | { readonly phase: 'stroke'; readonly id: number }
  // Until every finger has lifted: fingers leaving a pinch one at a time never paint.
  | { readonly phase: 'camera' };

export type GateAction = 'none' | 'begin' | 'tap' | 'end' | 'abandon';

export interface GateStep {
  readonly gate: TouchGate;
  readonly action: GateAction;
}

export const IDLE: TouchGate = { phase: 'idle' };
const CAMERA: TouchGate = { phase: 'camera' };

const stay = (gate: TouchGate): GateStep => ({ gate, action: 'none' });

const toCamera = (gate: TouchGate): GateStep => ({
  gate: CAMERA,
  action: gate.phase === 'stroke' ? 'abandon' : 'none',
});

export function gateDown(gate: TouchGate, point: TouchPoint, fingers: number): GateStep {
  if (fingers > 1) return toCamera(gate);
  if (gate.phase === 'idle') return { gate: { phase: 'pending', start: point }, action: 'none' };
  return stay(gate);
}

export function gateMove(gate: TouchGate, point: TouchPoint): GateStep {
  if (gate.phase !== 'pending' || point.id !== gate.start.id) return stay(gate);
  const moved = Math.hypot(point.x - gate.start.x, point.y - gate.start.y);
  if (moved <= TOUCH_SLOP) return stay(gate);
  return { gate: { phase: 'stroke', id: point.id }, action: 'begin' };
}

export function gateUp(gate: TouchGate, point: TouchPoint, fingersLeft: number): GateStep {
  // A finger still down that the gate never saw land is a second finger: no tap.
  if (fingersLeft > 0) return gate.phase === 'camera' ? stay(gate) : toCamera(gate);
  switch (gate.phase) {
    case 'pending':
      return point.id === gate.start.id ? { gate: IDLE, action: 'tap' } : stay(gate);
    case 'stroke':
      return point.id === gate.id ? { gate: IDLE, action: 'end' } : stay(gate);
    case 'camera':
      return stay(IDLE);
    default:
      return stay(gate);
  }
}

// iOS may cancel the first finger as a second lands, which must neither tap nor finish a stroke.
export function gateCancel(gate: TouchGate, fingersLeft: number): GateStep {
  const step = toCamera(gate);
  return fingersLeft > 0 ? step : { ...step, gate: IDLE };
}
