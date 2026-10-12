import { shownDay } from '../../../shared/domain/dayNumber';
import { clockWords } from '../../events/domain/week';
import type { PartyKind } from '../../guests/domain/parties';
import { PHASE_GUESTS } from '../../hud/domain/seasonWords';
import { THOUGHT_LABELS, thoughtLine } from '../../hud/domain/thoughtWords';
import { quoteOf, type Review } from '../../sim/domain/reviews';
import {
  firstDayOf,
  lastNightOf,
  PHASE_WORDS,
  phaseOfSeasonDay,
  SEASON_DAYS,
  type SeasonPhase,
  type SeasonReport,
} from '../../sim/domain/season';
import { isComplaint, type ThoughtKind, type ThoughtTally } from '../../sim/domain/thoughts';
import type { Edition, EditionPhoto } from './edition';
import { factsOf, storiesOf, toneOf, voiceFacts, whole, type Facts, type Tone } from './stories';
import {
  COMPLAINT_ADS,
  FILLER_ADS,
  fill,
  fits,
  KICKERS,
  pick,
  PRICE_EARS,
  ROOMS_AD,
  seedOf,
  WEATHER_EARS,
  WORDING,
  write,
  type Ad,
} from './wording';

export interface Figure {
  readonly label: string;
  readonly value: string;
  readonly note: string;
}

export interface Brief {
  readonly title: string;
  readonly text: string;
}

export interface Letter {
  readonly quote: string;
  readonly stars: number;
  readonly by: string;
}

export interface Caption {
  readonly lead: string;
  readonly text: string;
}

export interface OutlookPhase {
  readonly label: string;
  readonly days: number;
  readonly busy: boolean;
}

export interface FrontPage {
  readonly tone: Tone;
  readonly masthead: string;
  readonly ears: { readonly weather: string; readonly edition: Brief };
  readonly dateline: readonly [string, string, string];
  readonly kicker: string | null;
  readonly headline: string;
  readonly deck: string;
  readonly caption: Caption | null;
  readonly story: readonly string[];
  readonly figures: readonly Figure[];
  readonly outlook: {
    readonly title: string;
    readonly phases: readonly OutlookPhase[];
    readonly text: string;
  };
  readonly letters: readonly Letter[];
  readonly briefs: readonly Brief[];
  readonly desk: { readonly title: string; readonly items: readonly Brief[] };
  readonly ads: readonly Ad[];
  readonly foot: readonly string[];
}

const LETTERS = 3;

const ADS = 2;

const DESK_ITEMS = 2;

// Salts, one per slot, so two slots of one edition never draw the same way.
const SALT = {
  headline: 1,
  deck: 2,
  paragraph: 3,
  kicker: 4,
  weather: 5,
  price: 6,
  caption: 7,
  ad: 8,
} as const;

const minus = (text: string): string => text.replace('-', '−');

const signedWhole = (value: number): string =>
  minus(Math.round(value).toLocaleString('en-US', { signDisplay: 'exceptZero' }));

const arrow = (change: number): string => (change > 0 ? '▲' : '▼');

export function starsNote(now: number | null, before: number | null | undefined): string {
  if (now === null || before === null || before === undefined) return '';
  const change = Math.round((now - before) * 10) / 10;
  return change === 0 ? '' : `${arrow(change)} ${Math.abs(change).toFixed(1)}`;
}

export function percentNote(now: number, before: number | undefined): string {
  if (before === undefined || before <= 0) return '';
  const change = Math.round(((now - before) / before) * 100);
  return change === 0 ? '' : `${arrow(change)} ${Math.abs(change)} %`;
}

export function amountNote(now: number, before: number | undefined): string {
  if (before === undefined) return '';
  const change = Math.round(now - before);
  return change === 0 ? '' : `${arrow(change)} ${whole(Math.abs(change))}`;
}

const mastheadOf = (name: string, tone: Tone): string =>
  `The ${name.replace(/^the\s+/i, '')} ${tone === 'tabloid' ? 'Bugle' : 'Courier'}`;

function datelineOf(edition: Edition): readonly [string, string, string] {
  const { report } = edition;
  const days = `Days ${shownDay(report.startedOn)}–${shownDay(lastNightOf(report))}`;
  const covered =
    report.days < SEASON_DAYS
      ? `Covers ${report.days} of ${SEASON_DAYS} days`
      : `${SEASON_DAYS} days covered`;
  return [`Day ${shownDay(edition.printedOn)}`, `Season ${report.number} · ${days}`, covered];
}

const CAPTION_LEADS: readonly string[] = [
  'The last evening.',
  'Before the last guests left.',
  'From the management’s window.',
];

function captionOf(photo: EditionPhoto | null, seed: number): Caption | null {
  if (photo === null) return null;
  const at = clockWords(photo.minute);
  switch (photo.from) {
    case 'player':
      return {
        lead: pick(CAPTION_LEADS, seed, SALT.caption),
        text: `Photographed by the management on day ${shownDay(photo.day)} at ${at}.`,
      };
    case 'guests':
      return {
        lead: `Guests’ favourite view: ${photo.subject}.`,
        text: `From where they took it most, at ${at}.`,
      };
    case 'camera':
      return {
        lead: 'The resort.',
        text: `Photographed by the management on day ${shownDay(photo.day)} at ${at}.`,
      };
  }
}

const sumWhere = (report: SeasonReport, keep: (amount: number) => boolean): number =>
  Object.values(report.money).reduce((sum, amount) => (keep(amount) ? sum + amount : sum), 0);

const stars = (value: number | null): string => (value === null ? '–' : `${value.toFixed(1)} ★`);

const figure = (label: string, value: string, note = ''): Figure => ({ label, value, note });

function ratingFigures({ report, previous }: Edition, tone: Tone): readonly Figure[] {
  return [
    figure(
      'Mean rating',
      stars(report.meanStars),
      starsNote(report.meanStars, previous?.meanStars),
    ),
    tone === 'tabloid'
      ? figure('Worst day', stars(report.worstStars))
      : figure('Best day', stars(report.bestStars)),
  ];
}

function guestFigures({ report, previous }: Edition): readonly Figure[] {
  const turned = report.turnedAway > 0 ? [figure('Turned away', whole(report.turnedAway))] : [];
  const mean = report.meanReview === null ? '' : `mean ${report.meanReview.toFixed(1)}`;
  const busiest =
    report.busiest && report.busiest.value > 0
      ? [figure('Busiest day', whole(report.busiest.value), `day ${shownDay(report.busiest.day)}`)]
      : [];
  return [
    figure('Guests arrived', whole(report.arrived), percentNote(report.arrived, previous?.arrived)),
    ...turned,
    figure('Reviews', whole(report.reviews), mean),
    ...busiest,
  ];
}

function moneyFigures({ report, previous, mode }: Edition): readonly Figure[] {
  if (mode !== 'tycoon') return [];
  return [
    figure('Takings', whole(sumWhere(report, (amount) => amount > 0))),
    figure('Costs', signedWhole(sumWhere(report, (amount) => amount < 0))),
    figure('Season result', signedWhole(report.net), amountNote(report.net, previous?.net)),
    figure('In the bank', whole(report.balance)),
  ];
}

const figuresOf = (edition: Edition, tone: Tone): readonly Figure[] => [
  ...ratingFigures(edition, tone),
  ...guestFigures(edition),
  ...moneyFigures(edition),
];

const OUTLOOK_PHASES: readonly SeasonPhase[] = ['early', 'holidays', 'late'];

const OUTLOOK_CLOSE: { readonly [tone in Tone]: string } = {
  broadsheet: 'Time to build before the crowds.',
  tabloid: 'A quiet start, and time to clean up.',
};

function outlookOf(edition: Edition, tone: Tone): FrontPage['outlook'] {
  const next = edition.season + 1;
  const phases = OUTLOOK_PHASES.map((phase) => ({
    label: PHASE_WORDS[phase],
    days: Array.from({ length: SEASON_DAYS }, (_, at) => at + 1).filter(
      (day) => phaseOfSeasonDay(day) === phase,
    ).length,
    busy: phase === 'holidays',
  }));
  return {
    title: `Outlook: season ${next}`,
    phases,
    text: [
      `Season ${next} opens on the next check-in with the early season.`,
      PHASE_GUESTS.early,
      `Families come for the school holidays from day ${firstDayOf('holidays')}.`,
      OUTLOOK_CLOSE[tone],
    ].join(' '),
  };
}

const PARTY_WORDS: { readonly [kind in PartyKind]: (review: Review) => string } = {
  family: (review) => `The ${review.family} family`,
  couple: (review) => `${review.name}, with a partner`,
  friends: (review) => `${review.name} and friends`,
  solo: (review) => `${review.name}, travelling alone`,
};

const nightsWords = (nights: number): string => `${nights} ${nights === 1 ? 'night' : 'nights'}`;

const sentence = (text: string): string => (/[.!?]$/.test(text) ? text : `${text}.`);

// The subject belongs to the complaint; a praise is worded without one, but for a photo's.
function quoteLine(review: Review): string {
  const quoted = quoteOf(review);
  if (quoted === null) return review.stars >= 4 ? 'No complaints.' : 'Nothing to add.';
  const subject = quoted === review.complaint ? review.subject : (review.praiseSubject ?? null);
  return sentence(thoughtLine(quoted, subject));
}

// The happiest, the crossest and one more, each review once, in that order.
function lettersOf(reviews: readonly Review[]): readonly Letter[] {
  const best = reviews.reduce<Review | null>(
    (top, each) => (top && top.stars >= each.stars ? top : each),
    null,
  );
  const worst = reviews.reduce<Review | null>(
    (low, each) => (low && low.stars <= each.stars ? low : each),
    null,
  );
  const chosen = [best, worst, ...reviews].filter((review): review is Review => review !== null);
  const unique = chosen.filter(
    (review, at) => chosen.findIndex((each) => each.party === review.party) === at,
  );
  return unique.slice(0, LETTERS).map((review) => ({
    quote: quoteLine(review),
    stars: review.stars,
    by: `${PARTY_WORDS[review.partyKind](review)}, ${nightsWords(review.nights)}`,
  }));
}

function briefsOf(edition: Edition): readonly Brief[] {
  const { report } = edition;
  const briefs: Brief[] = [];
  const events = report.events;
  if (events && events.held > 0) {
    const fireworks = events.fireworks
      ? ` ${whole(events.fireworks)} of them ended in fireworks.`
      : '';
    const called = events.called > 0 ? ` ${whole(events.called)} were called off.` : '';
    briefs.push({
      title: 'Shows',
      text: `${whole(events.held)} shows drew ${whole(events.audience)} guests in all.${fireworks}${called}`,
    });
  }
  if (report.photos) {
    const favourite = report.topSpot ? ` Favourite subject: ${report.topSpot.subject}.` : '';
    briefs.push({
      title: 'Photos',
      text: `Guests took ${whole(report.photos)} photos.${favourite}`,
    });
  }
  if (report.busiest && report.busiest.value > 0) {
    briefs.push({
      title: 'Crowds',
      text: `The busiest day was day ${shownDay(report.busiest.day)}, with ${whole(report.busiest.value)} guests on the plot.`,
    });
  }
  briefs.push({
    title: 'Comings and goings',
    text: `${whole(report.arrived)} guests arrived and ${whole(report.left)} checked out over ${whole(report.days)} days.`,
  });
  return briefs;
}

const DESK_ADVICE: { readonly [kind in ThoughtKind]?: string } = {
  'queue-too-long': 'A second one nearby would help.',
  closed: 'Longer opening hours, perhaps.',
  'nothing-for': 'Something new to build for it.',
  'no-bed': 'More beds, before the next season.',
  filthy: 'More cleaners, or more often.',
  littered: 'More bins and more cleaners.',
  broken: 'A mechanic on the staff.',
  hurt: 'Shade on the beach and a lifeguard at the water.',
  'no-step-free': 'Ramps, and paths without steps.',
  'called-off': 'A covered stage for the rain.',
  'not-worth-it': 'A look at the prices.',
  shabby: 'A renovation is overdue.',
  renovating: 'Fewer closures at once.',
};

const DESK_TITLE: { readonly [tone in Tone]: string } = {
  broadsheet: 'From the complaints desk',
  tabloid: 'Our verdict',
};

const QUIET_DESK: { readonly [tone in Tone]: Brief } = {
  broadsheet: { title: 'Quiet', text: 'No complaint stood out this season. The desk had a rest.' },
  tabloid: { title: 'Well', text: 'Nobody complained much. We are as surprised as you are.' },
};

function deskOf(edition: Edition, tone: Tone): FrontPage['desk'] {
  const complaints = (edition.report.voices ?? []).filter((voice) => isComplaint(voice.kind));
  const items = complaints
    .slice(0, DESK_ITEMS)
    .map((voice) => deskItem(voice, edition.report.days));
  return { title: DESK_TITLE[tone], items: items.length > 0 ? items : [QUIET_DESK[tone]] };
}

function deskItem(voice: ThoughtTally, days: number): Brief {
  const advice = DESK_ADVICE[voice.kind];
  const heard = `“${thoughtLine(voice.kind, voice.subject)}”, heard ${whole(voice.count)} times over ${whole(days)} days.`;
  return { title: THOUGHT_LABELS[voice.kind], text: advice ? `${heard} ${advice}` : heard };
}

function adsOf(edition: Edition, facts: Facts, seed: number): readonly Ad[] {
  const wanted: { readonly ad: Ad; readonly facts: Facts }[] = [];
  if (edition.report.turnedAway > 0) {
    wanted.push({ ad: ROOMS_AD, facts: { ...facts, turned: whole(edition.report.turnedAway) } });
  }
  for (const voice of edition.report.voices ?? []) {
    const ad = isComplaint(voice.kind) ? COMPLAINT_ADS[voice.kind] : undefined;
    if (ad && !wanted.some((each) => each.ad.title === ad.title)) {
      wanted.push({ ad, facts: { ...facts, ...voiceFacts(voice) } });
    }
  }
  const filled = wanted
    .filter(({ ad, facts: known }) => fits(ad.text, known))
    .map(({ ad, facts: known }) => ({ title: ad.title, text: fill(ad.text, known) }));
  const first = pick(
    FILLER_ADS.map((_, at) => at),
    seed,
    SALT.ad,
  );
  const fillers = FILLER_ADS.map((_, at) => FILLER_ADS[(first + at) % FILLER_ADS.length]!);
  return [...filled, ...fillers].slice(0, ADS);
}

function reviewsParagraph(edition: Edition): string {
  const { report } = edition;
  if (report.reviews === 0 || report.meanReview === null)
    return 'Nobody wrote a review this season.';
  return `Of ${whole(report.reviews)} reviews, the mean was ${report.meanReview.toFixed(1)} stars.`;
}

export function frontPageOf(edition: Edition): FrontPage {
  const tone = toneOf(edition);
  const seed = seedOf(edition.gameId, edition.season);
  const stories = storiesOf(edition);
  const lead = stories[0]!;
  const words = WORDING[lead.kind][tone];
  // The quiet story only ever leads: below another it would repeat what the lead said.
  const told = stories.filter((story, at) => at === 0 || story.kind !== 'season-closes');
  const paragraphs = told.slice(0, 3).flatMap((story, at) => {
    const text = write(
      WORDING[story.kind][tone].paragraph,
      story.facts,
      seed,
      SALT.paragraph + at * 16,
    );
    return text === null ? [] : [text];
  });
  const facts = factsOf(edition);
  return {
    tone,
    masthead: mastheadOf(edition.resortName, tone),
    ears: {
      weather: pick(WEATHER_EARS[tone], seed, SALT.weather),
      edition: {
        title: `Season ${edition.season} edition`,
        text: pick(PRICE_EARS[tone], seed, SALT.price),
      },
    },
    dateline: datelineOf(edition),
    kicker: tone === 'tabloid' ? pick(KICKERS, seed, SALT.kicker) : null,
    headline: write(words.headline, lead.facts, seed, SALT.headline) ?? `Season ${edition.season}`,
    deck: write(words.deck, lead.facts, seed, SALT.deck) ?? '',
    caption: captionOf(edition.photo, seed),
    story: [...paragraphs, reviewsParagraph(edition)],
    figures: figuresOf(edition, tone),
    outlook: outlookOf(edition, tone),
    letters: lettersOf(edition.reviews),
    briefs: briefsOf(edition),
    desk: deskOf(edition, tone),
    ads: adsOf(edition, facts, seed),
    foot: [
      `Printed when season ${edition.season} closed · Day ${shownDay(edition.printedOn)}`,
      'Page 1',
    ],
  };
}
