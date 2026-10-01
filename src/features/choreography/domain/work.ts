import { RESTING } from '../../crowd/domain/crowd';
import { DRAWN_POSE, poseWith } from '../../rendering/domain/poses';
import { mix } from '../../sim/domain/night';
import { WORK, type Cast } from './casting';

// An animator's phrase: a few seconds of one move, then another, hashed.
const PHRASE = 2.4;
const SHOW_MOVES = [DRAWN_POSE.cheer, DRAWN_POSE.hop, DRAWN_POSE.strike] as const;
const STRIKE_BEAT = 0.6;
// A lifeguard looks this far either side of the water, once in about eighteen seconds, and
// now and then raises the whistle for a moment.
const SWEEP = 0.7;
const SWEEP_RATE = 0.35;
const WHISTLE_EVERY = 20;
const WHISTLE_FOR = 1.5;
const WHISTLES = 3;
// Short of straight up, where the reach would also lift the body.
const WHISTLE_REACH = 0.95;
// A broom's slow stroke, and the step either way a sweeper shuffles while at it.
const BROOM_BEAT = 1.6;
const SHUFFLE = 0.6;
const SHUFFLE_RATE = 0.9;
// Kneeling is a standing figure sunk by an adult's legs; the hammer goes in bursts.
const KNEEL = 1.5;
const BURST_EVERY = 2;
const BURST_FOR = 0.8;
const HAMMER_BEAT = 0.25;

const unit = (hash: number): number => hash / 4_294_967_296;

const phaseOf = (worker: number): number => unit(mix(mix(worker) + 1));

const share = (time: number, period: number): number => {
  const turns = time / period;
  return turns - Math.floor(turns);
};

function stand(cast: Cast, worker: number): void {
  cast.x[worker] = cast.workX[worker]!;
  cast.y[worker] = cast.workY[worker]!;
  cast.z[worker] = cast.workZ[worker]!;
  cast.heading[worker] = cast.workHeading[worker]!;
}

// Facing the mean of the venue's visitors where any are drawn, the way the art faces them if not.
function faceAudience(staff: Cast, worker: number, guests: Cast | null): void {
  const venue = staff.lastVenue[worker]!;
  const visitors = guests?.venues[venue]?.visitors;
  if (!guests || !visitors) return;
  let x = 0;
  let z = 0;
  let count = 0;
  for (let index = visitors.start; index < visitors.start + visitors.count; index++) {
    const person = guests.heldBy[index]!;
    if (person < 0) continue;
    x += guests.x[person]!;
    z += guests.z[person]!;
    count++;
  }
  if (count === 0) return;
  staff.heading[worker] = Math.atan2(x / count - staff.x[worker]!, z / count - staff.z[worker]!);
}

function show(staff: Cast, worker: number, guests: Cast | null, clock: number): void {
  stand(staff, worker);
  faceAudience(staff, worker, guests);
  const phrase = Math.floor(clock / PHRASE + phaseOf(worker));
  const move = SHOW_MOVES[mix(mix(worker) + phrase) % SHOW_MOVES.length]!;
  staff.pose[worker] =
    move === DRAWN_POSE.strike ? poseWith(move, share(clock, STRIKE_BEAT)) : move;
}

function watch(staff: Cast, worker: number, clock: number): void {
  stand(staff, worker);
  const phase = phaseOf(worker) * 2 * Math.PI;
  staff.heading[worker]! += SWEEP * Math.sin(clock * SWEEP_RATE + phase);
  const window = Math.floor(clock / WHISTLE_EVERY);
  const whistles = mix(mix(worker) + window) % WHISTLES === 0;
  const blowing = whistles && clock - window * WHISTLE_EVERY < WHISTLE_FOR;
  const place = staff.places[staff.placeOf[worker]!];
  staff.pose[worker] = blowing
    ? poseWith(DRAWN_POSE.reach, WHISTLE_REACH)
    : (place?.pose ?? RESTING.standing);
}

function sweep(staff: Cast, worker: number, clock: number): void {
  stand(staff, worker);
  const heading = staff.workHeading[worker]!;
  const step = SHUFFLE * Math.sin(clock * SHUFFLE_RATE + phaseOf(worker) * 2 * Math.PI);
  staff.x[worker]! += Math.cos(heading) * step;
  staff.z[worker]! -= Math.sin(heading) * step;
  staff.pose[worker] = poseWith(
    DRAWN_POSE.strike,
    share(clock + phaseOf(worker) * BROOM_BEAT, BROOM_BEAT),
  );
}

function mend(staff: Cast, worker: number, clock: number): void {
  stand(staff, worker);
  staff.y[worker]! -= KNEEL;
  const time = clock + phaseOf(worker) * BURST_EVERY;
  const hammering = share(time, BURST_EVERY) * BURST_EVERY < BURST_FOR;
  staff.pose[worker] = hammering
    ? poseWith(DRAWN_POSE.strike, share(time, HAMMER_BEAT))
    : RESTING.standing;
}

// Every frame: the staff at work at a venue, drawn at it working; the guests' cast says who the
// animator plays to.
export function performWork(staff: Cast, guests: Cast | null, clock: number): void {
  for (let worker = 0; worker < staff.work.length; worker++) {
    const work = staff.work[worker];
    if (work === WORK.show) show(staff, worker, guests, clock);
    else if (work === WORK.watch) watch(staff, worker, clock);
    else if (work === WORK.sweep) sweep(staff, worker, clock);
    else if (work === WORK.mend) mend(staff, worker, clock);
  }
}
