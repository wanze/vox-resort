import { shownDay } from '../../../shared/domain/dayNumber';
import { thoughtLine } from '../../hud/domain/thoughtWords';
import type { SeasonReport } from '../../sim/domain/season';
import { isComplaint, type ThoughtTally } from '../../sim/domain/thoughts';
import type { Edition } from './edition';

export type Tone = 'broadsheet' | 'tabloid';

export const STORY_KINDS = [
  'record-season',
  'best-ever-stars',
  'in-the-red',
  'turned-away',
  'busiest-day',
  'best-day',
  'stars-slump',
  'loudest-complaint',
  'loudest-praise',
  'fireworks',
  'photos',
  'first-season',
  'season-closes',
] as const;

export type StoryKind = (typeof STORY_KINDS)[number];

// Already in words: a template only ever pastes them in.
export type Facts = { readonly [key: string]: string };

export interface Story {
  readonly kind: StoryKind;
  readonly weight: number;
  readonly facts: Facts;
}

const TABLOID_BELOW = 3;

const TURNED_AWAY_SHARE = 0.05;

const SLUMP = 0.5;

export function toneOf(edition: Edition): Tone {
  const { meanStars, net } = edition.report;
  if (meanStars !== null && meanStars < TABLOID_BELOW) return 'tabloid';
  return edition.mode === 'tycoon' && net < 0 ? 'tabloid' : 'broadsheet';
}

export const whole = (value: number): string => Math.round(value).toLocaleString('en-US');

export const starsWords = (value: number | null): string =>
  value === null ? 'no' : value.toFixed(1);

const ORDINALS = [
  'first',
  'second',
  'third',
  'fourth',
  'fifth',
  'sixth',
  'seventh',
  'eighth',
  'ninth',
  'tenth',
];

const ordinal = (value: number): string => {
  const named = ORDINALS[value - 1];
  if (named) return named;
  const tens = value % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][value % 10] ?? 'th');
  return `${value}${suffix}`;
};

const tycoon = (edition: Edition): boolean => edition.mode === 'tycoon';

// Profit and loss are separate facts, so a template only reads as black or red where it is.
function moneyFacts(report: SeasonReport): Facts {
  return {
    balance: whole(report.balance),
    ...(report.net > 0 ? { profit: whole(report.net) } : {}),
    ...(report.net < 0 ? { loss: whole(-report.net) } : {}),
  };
}

function previousFacts(previous: SeasonReport): Facts {
  return {
    previousStars: starsWords(previous.meanStars),
    previousArrived: whole(previous.arrived),
  };
}

export function factsOf(edition: Edition): Facts {
  const { report, previous } = edition;
  return {
    name: edition.resortName,
    season: String(report.number),
    ordinal: ordinal(report.number),
    days: whole(report.days),
    stars: starsWords(report.meanStars),
    arrived: whole(report.arrived),
    reviews: whole(report.reviews),
    ...(previous ? previousFacts(previous) : {}),
    ...(tycoon(edition) ? moneyFacts(report) : {}),
  };
}

const diff = (now: number | null, before: number | null | undefined): number | null =>
  now === null || before === null || before === undefined
    ? null
    : Math.round((now - before) * 10) / 10;

// A venue for every subject but a need's, which reads as a word like "hunger".
const whereOf = (voice: ThoughtTally): string =>
  voice.kind === 'nothing-for' ? 'the resort' : (voice.subject ?? 'the resort');

export function voiceFacts(voice: ThoughtTally): Facts {
  return {
    voice: thoughtLine(voice.kind, voice.subject),
    where: whereOf(voice),
    times: whole(voice.count),
  };
}

const loudestOf = (edition: Edition, complaint: boolean): ThoughtTally | undefined =>
  edition.report.voices?.find((voice) => isComplaint(voice.kind) === complaint);

// Each rule is a candidate and its weight; the heaviest leads the paper. The fixed weights put a
// season's verdict (a record, a loss, a slump, a first) above anything that happened in it.
const RULES: readonly ((edition: Edition) => readonly [StoryKind, number, Facts] | null)[] = [
  ({ report, previous, mode }) => {
    if (!previous || report.meanStars === null || previous.meanStars === null) return null;
    if (report.meanStars <= previous.meanStars) return null;
    const better =
      mode === 'tycoon'
        ? report.net > previous.net && report.net >= 0
        : report.arrived > previous.arrived;
    return better
      ? ['record-season', 100, { starsUp: starsWords(diff(report.meanStars, previous.meanStars)) }]
      : null;
  },
  (edition) => (tycoon(edition) && edition.report.net < 0 ? ['in-the-red', 95, {}] : null),
  ({ report, previous }) => {
    const change = diff(report.meanStars, previous?.meanStars);
    return change !== null && change <= -SLUMP
      ? ['stars-slump', 92, { starsDown: starsWords(-change) }]
      : null;
  },
  ({ report, bestBefore }) =>
    bestBefore !== null && report.meanStars !== null && report.meanStars > bestBefore
      ? ['best-ever-stars', 85, { bestBefore: starsWords(bestBefore) }]
      : null,
  ({ previous }) => (previous ? null : ['first-season', 80, {}]),
  ({ report }) => {
    const share = report.arrived > 0 ? report.turnedAway / report.arrived : 0;
    if (report.turnedAway === 0 || share < TURNED_AWAY_SHARE) return null;
    return [
      'turned-away',
      60 + Math.min(30, share * 100),
      { turned: whole(report.turnedAway), share: `${Math.round(share * 100)} %` },
    ];
  },
  (edition) => {
    const voice = loudestOf(edition, true);
    if (!voice) return null;
    const perDay = voice.count / Math.max(1, edition.report.days);
    return ['loudest-complaint', 50 + Math.min(30, perDay), voiceFacts(voice)];
  },
  ({ report }) => {
    const fireworks = report.events?.fireworks ?? 0;
    if (fireworks === 0) return null;
    return [
      'fireworks',
      45,
      {
        fireworks: whole(fireworks),
        shows: whole(report.events!.held),
        audience: whole(report.events!.audience),
      },
    ];
  },
  (edition) => {
    const voice = loudestOf(edition, false);
    return voice ? ['loudest-praise', 40, voiceFacts(voice)] : null;
  },
  ({ report }) =>
    report.busiest && report.busiest.value > 0
      ? [
          'busiest-day',
          35,
          {
            busyDay: String(shownDay(report.busiest.day)),
            busyGuests: whole(report.busiest.value),
          },
        ]
      : null,
  (edition) => {
    const best = edition.report.best;
    if (!tycoon(edition) || !best || best.value <= 0) return null;
    return [
      'best-day',
      30,
      { bestDay: String(shownDay(best.day)), bestTakings: whole(best.value) },
    ];
  },
  ({ report }) =>
    report.topSpot
      ? ['photos', 25, { photos: whole(report.photos ?? 0), spot: report.topSpot.subject }]
      : null,
  // Always there, so a season with nothing to tell still has a headline.
  () => ['season-closes', 0, {}],
];

// Best first; a tie keeps the order of RULES.
export function storiesOf(edition: Edition): readonly Story[] {
  const shared = factsOf(edition);
  return RULES.flatMap((rule) => {
    const found = rule(edition);
    return found ? [{ kind: found[0], weight: found[1], facts: { ...shared, ...found[2] } }] : [];
  }).toSorted((a, b) => b.weight - a.weight);
}
