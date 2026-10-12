import { fnv, mix, unitAt } from '../../random/domain/hash';
import type { ThoughtKind } from '../../sim/domain/thoughts';
import type { Facts, StoryKind, Tone } from './stories';

export interface Templates {
  readonly headline: readonly string[];
  readonly deck: readonly string[];
  readonly paragraph: readonly string[];
}

// A template whose placeholders a season lacks is passed over, so money lines never reach a
// sandbox, and "in the black" never reaches a loss. Every slot keeps one that needs no money.
export const WORDING: { readonly [kind in StoryKind]: { readonly [tone in Tone]: Templates } } = {
  'record-season': {
    broadsheet: {
      headline: [
        'Record season for {name}',
        '{name} has its best season yet',
        'Best summer yet at {name}',
      ],
      deck: [
        'The resort closes its {ordinal} season on {stars} stars, up from {previousStars}, and {profit} in the black.',
        'Guests rated the {ordinal} season {stars} stars, up from {previousStars}. {arrived} came through the gate.',
      ],
      paragraph: [
        '{name} closed its {ordinal} season with the best figures in its short history. Guests rated the resort {stars} stars across the {days} days, up from {previousStars} last season, and the books closed {profit} in the black.',
        'It was the best season {name} has had. The mean rating rose by {starsUp} to {stars}, and {arrived} guests arrived over the {days} days, against {previousArrived} the season before.',
      ],
    },
    tabloid: {
      headline: ['Better, but only just', 'Up from the bottom', '{name} crawls up the table'],
      deck: [
        'Stars up {starsUp} to {stars} · Still nothing to write home about',
        '{stars} stars is a record for {name}. Think about that.',
      ],
      paragraph: [
        '{name} managed its best season yet, which says less than the management would like. The mean rating crept up from {previousStars} to {stars}.',
        'Up {starsUp} on last season, to {stars} stars. {arrived} guests came; most of them, we hear, have opinions.',
      ],
    },
  },
  'best-ever-stars': {
    broadsheet: {
      headline: [
        'Guests give {name} its best marks',
        '{stars} stars, a new high for {name}',
        'Top marks on the boardwalk',
      ],
      deck: [
        'The mean rating of {stars} beats the {bestBefore} of the resort’s best season so far.',
        'No season has rated higher: {stars} stars over {days} days.',
      ],
      paragraph: [
        'No season at {name} has been rated higher. The mean of {stars} stars beats the {bestBefore} that stood as the record until now.',
        'The rating of {stars} stars is a new high for the resort; the best before it was {bestBefore}.',
      ],
    },
    tabloid: {
      headline: [
        'Best ever? Says who',
        'A record nobody asked for',
        '{stars} stars and still moaning',
      ],
      deck: [
        'A record {stars} stars, and the bar is low · The old best was {bestBefore}',
        'The highest rating {name} has had is {stars}. We checked.',
      ],
      paragraph: [
        'Technically a record: {stars} stars beats the old high of {bestBefore}. Technically.',
        'The guests gave {stars} stars, the best the resort has managed. The bar, it must be said, was {bestBefore}.',
      ],
    },
  },
  'in-the-red': {
    broadsheet: {
      headline: [
        '{name} closes the season in the red',
        'A loss of {loss} for {name}',
        'Books close {loss} short',
      ],
      deck: [
        'The {ordinal} season cost more than it earned: {loss} in the red, with {balance} left in the bank.',
        'A season of {stars} stars ends {loss} short of breaking even.',
      ],
      paragraph: [
        'The {ordinal} season ended {loss} in the red. The resort has {balance} in the bank as it closes for the break.',
        'Takings did not cover the wages and the building this season. The books closed {loss} short, and the management has a break to find the money.',
      ],
    },
    tabloid: {
      headline: ['Money pit!', '{name} sinks {loss}', 'Where did the money go?'],
      deck: [
        'Resort loses {loss} · {stars} stars · {balance} left in the kitty',
        'A season in the red: {loss} gone, and the guests not happy either',
      ],
      paragraph: [
        '{name} limped out of its {ordinal} season {loss} in the red. Guests did not hold back, and nor did the bills.',
        'The sums do not add up. {loss} lost over {days} days, and {balance} left to start the next season with.',
      ],
    },
  },
  'turned-away': {
    broadsheet: {
      headline: [
        'Full up: {turned} guests turned away',
        'No room at {name}',
        'Every bed taken at {name}',
      ],
      deck: [
        '{turned} guests found every bed already taken, {share} of those who came.',
        'Demand ran ahead of the beds: {turned} were sent home at the gate.',
      ],
      paragraph: [
        'Not everyone got in. {turned} guests were turned away at the gate for want of a bed, {share} of the {arrived} who did arrive. Management has the break to build.',
        'The beds ran out before the guests did: {turned} were turned away over the season.',
      ],
    },
    tabloid: {
      headline: ['Sorry, we’re full!', '{turned} sent packing', 'No beds, no welcome'],
      deck: [
        '{turned} holidaymakers turned away at the gate · “Nowhere to sleep”',
        'Beds gone, guests gone: {turned} turned back',
      ],
      paragraph: [
        '{turned} would-be guests were sent packing at the gate this season. Nobody thought to build more beds.',
        'For {turned} people the holiday ended at the gate. That is {share} of everyone who got in.',
      ],
    },
  },
  'busiest-day': {
    broadsheet: {
      headline: [
        '{busyGuests} on the plot on day {busyDay}',
        'A crowd at {name}',
        'Busy days at {name}',
      ],
      deck: [
        'The busiest day of the season brought {busyGuests} guests to the plot at once.',
        'Day {busyDay} was the season’s busiest, with {busyGuests} guests.',
      ],
      paragraph: [
        'On day {busyDay}, the busiest of the season, {busyGuests} guests were on the plot at once.',
        'The crowds peaked on day {busyDay}, when {busyGuests} guests filled the paths and the beach.',
      ],
    },
    tabloid: {
      headline: ['Crush on the beach', 'Packed like sardines', '{busyGuests} and counting'],
      deck: [
        '{busyGuests} guests squeezed in on day {busyDay} · Elbows out on the sand',
        'Day {busyDay}: {busyGuests} people, one beach',
      ],
      paragraph: [
        'On day {busyDay} {busyGuests} guests fought for a spot on the sand.',
        'The worst crush came on day {busyDay}: {busyGuests} people on the plot at once.',
      ],
    },
  },
  'best-day': {
    broadsheet: {
      headline: [
        'Takings of {bestTakings} in a day',
        'A good day for the till',
        'Day {bestDay} fills the till',
      ],
      deck: [
        'The best day of the season, day {bestDay}, took {bestTakings}.',
        'Day {bestDay} brought in {bestTakings}, the most of any day.',
      ],
      paragraph: [
        'Day {bestDay} brought the best takings of the season, {bestTakings}.',
        'The till did best on day {bestDay}, when the resort took {bestTakings}.',
      ],
    },
    tabloid: {
      headline: ['One good day', 'Cash in, for once', 'The day the till rang'],
      deck: [
        'Day {bestDay} took {bestTakings} · The rest of the season, less so',
        'A single good day: {bestTakings} on day {bestDay}',
      ],
      paragraph: [
        'There was one good day: day {bestDay} took {bestTakings}. It did not last.',
        'The till rang on day {bestDay}, to the tune of {bestTakings}.',
      ],
    },
  },
  'stars-slump': {
    broadsheet: {
      headline: [
        'Rating falls at {name}',
        'A harder season for {name}',
        'Guests less impressed this season',
      ],
      deck: [
        'The mean rating fell by {starsDown} to {stars} stars, from {previousStars} last season.',
        'Guests rated the {ordinal} season {stars} stars, down from {previousStars}.',
      ],
      paragraph: [
        'Guests were harder to please this season. The mean rating fell from {previousStars} to {stars} stars.',
        'The rating slipped by {starsDown} over the season, to {stars} stars.',
      ],
    },
    tabloid: {
      headline: ['Stars slump!', '{name} in freefall', 'Down, down, down'],
      deck: [
        'Stars slump to {stars} · Down {starsDown} on last season',
        'From {previousStars} to {stars} in one season · Guests furious',
      ],
      paragraph: [
        '{name} crashed to {stars} stars this season, down from {previousStars}. Guests did not hold back.',
        'A slump of {starsDown} stars in a single season. The guests have spoken, loudly.',
      ],
    },
  },
  'loudest-complaint': {
    broadsheet: {
      headline: ['Guests speak up about {where}', 'One complaint above the rest', '“{voice}”'],
      deck: [
        'The complaint heard most often this season: “{voice}”, {times} times.',
        '“{voice}” was the season’s most common grumble.',
      ],
      paragraph: [
        '“{voice}” was the complaint most often heard on the boardwalk, {times} times over the season.',
        'Of everything guests grumbled about, one line came up {times} times: “{voice}”.',
      ],
    },
    tabloid: {
      headline: ['Fury at {where}', 'Guests fume!', '“{voice}”'],
      deck: [
        '“{voice}” · Heard {times} times · Management silent',
        'Angry guests had one thing to say, {times} times over',
      ],
      paragraph: [
        '“{voice},” guests told us, {times} times. Nobody listened.',
        'The complaint on everybody’s lips: “{voice}”. We counted {times}.',
      ],
    },
  },
  'loudest-praise': {
    broadsheet: {
      headline: ['Guests love {where}', 'A favourite on the boardwalk', '“{voice}”'],
      deck: [
        '“{voice}”, said {times} times, was the season’s warmest word.',
        'The praise heard most this season: “{voice}”.',
      ],
      paragraph: [
        'There were bright spots. “{voice}” was heard {times} times over the season.',
        'The happiest guests had one thing in common: “{voice}”, said {times} times.',
      ],
    },
    tabloid: {
      headline: ['One thing went right', 'A ray of light', 'They liked something'],
      deck: [
        'Amid the gloom, “{voice}” · {times} happy guests, at least',
        'Not all bad: “{voice}”',
      ],
      paragraph: [
        'There were bright spots. “{voice},” said {times} of them. Hold the front page.',
        'Not everybody was cross: “{voice}” was heard {times} times.',
      ],
    },
  },
  fireworks: {
    broadsheet: {
      headline: [
        'Fireworks light up {name}',
        'Nights to remember on the beach',
        'Rockets over the bay',
      ],
      deck: [
        '{fireworks} fireworks nights and {shows} shows drew {audience} guests in all.',
        'The season’s {shows} shows, {fireworks} with fireworks, played to {audience}.',
      ],
      paragraph: [
        '{fireworks} fireworks nights lit the sky this season, among {shows} shows that drew {audience} guests in all.',
        'The shows played to {audience} guests over the season, and {fireworks} of them ended in fireworks.',
      ],
    },
    tabloid: {
      headline: ['Bangs for your buck', 'Sky-high spending', 'Light up, cheer up'],
      deck: [
        '{fireworks} fireworks nights · {audience} watched · Was it worth it',
        'Rockets, {fireworks} nights of them, and still the guests complain',
      ],
      paragraph: [
        'The management let off fireworks on {fireworks} nights. {audience} guests turned up to {shows} shows.',
        'At least the fireworks went off: {fireworks} nights of them, cheered from the pier.',
      ],
    },
  },
  photos: {
    broadsheet: {
      headline: ['Everybody photographs {spot}', 'The view of the season', 'Say cheese at {name}'],
      deck: [
        'Guests took {photos} photos; the favourite subject was {spot}.',
        '{spot} was the most photographed sight of the season.',
      ],
      paragraph: [
        'Guests took {photos} photos, and {spot} was the favourite subject.',
        '{spot} was the most photographed sight of the season.',
      ],
    },
    tabloid: {
      headline: ['Snap happy', 'Point and shoot', 'Picture this'],
      deck: [
        '{photos} snaps taken · Everybody wants {spot}',
        'The one sight worth a photo: {spot}',
      ],
      paragraph: [
        'Guests took {photos} photos, most of them of {spot}. Presumably to remember something nice.',
        'If you saw one picture this season, it was of {spot}.',
      ],
    },
  },
  'first-season': {
    broadsheet: {
      headline: [
        '{name} opens its doors',
        'A first season on the bay',
        'A new resort for the coast',
      ],
      deck: [
        'The resort’s first season closes on {stars} stars, with {arrived} guests through the gate.',
        '{days} days, {arrived} guests and a first rating of {stars} stars.',
      ],
      paragraph: [
        '{name} closed its first season yesterday. Guests rated it {stars} stars across the {days} days, and {arrived} came through the gate.',
        'The first season is done: {arrived} guests, {days} days, and a mean rating of {stars} stars.',
      ],
    },
    tabloid: {
      headline: ['Opening flop', 'A shaky start', 'Teething troubles at {name}'],
      deck: [
        'First season ends on {stars} stars · {arrived} guests, few smiles',
        'New resort, old problems: {stars} stars from {arrived} guests',
      ],
      paragraph: [
        '{name} opened its doors this season, and {arrived} guests walked through them. They rated it {stars} stars.',
        'A first season at {stars} stars. There is nowhere to go but up.',
      ],
    },
  },
  'season-closes': {
    broadsheet: {
      headline: [
        'Season {season} closes at {name}',
        'A steady season at {name}',
        'Another season on the bay',
      ],
      deck: [
        'The {ordinal} season closes on {stars} stars, with {arrived} guests over {days} days.',
        '{arrived} guests and {stars} stars: the {ordinal} season in short.',
      ],
      paragraph: [
        '{name} closed its {ordinal} season yesterday on {stars} stars, with {arrived} guests over the {days} days.',
        'The {ordinal} season ran its course quietly: {stars} stars, {arrived} guests.',
      ],
    },
    tabloid: {
      headline: ['Nothing to see here', 'Another one bites the dust', 'Same again'],
      deck: [
        'Season {season} limps to a close on {stars} stars',
        '{arrived} guests, {stars} stars, and not much else',
      ],
      paragraph: [
        '{name} dragged itself to the end of its {ordinal} season on {stars} stars.',
        'The {ordinal} season is over. {arrived} came; few will remember it.',
      ],
    },
  },
};

export interface Ad {
  readonly title: string;
  readonly text: string;
}

export const ROOMS_AD: Ad = {
  title: 'ROOMS WANTED',
  text: '{turned} guests were turned away this season. Builders, apply within.',
};

export const COMPLAINT_ADS: { readonly [kind in ThoughtKind]?: Ad } = {
  'queue-too-long': { title: 'BAR STAFF WANTED', text: 'For {where}. The queues are legendary.' },
  littered: { title: 'CLEANERS WANTED', text: 'The paths need you. Brooms provided.' },
  filthy: { title: 'CLEANERS WANTED', text: 'For {where}. Bring a mop and a strong stomach.' },
  hurt: { title: 'WANTED: LIFEGUARDS', text: '“{voice}”, heard {times} times. Whistle provided.' },
  broken: { title: 'HANDYMAN WANTED', text: 'For {where}. Must own a spanner.' },
  'no-bed': { title: 'BUILDERS WANTED', text: 'Guests slept on the sand. Beds needed, urgently.' },
  shabby: { title: 'PAINTERS WANTED', text: '{where} has seen better days. Brushes provided.' },
};

export const FILLER_ADS: readonly Ad[] = [
  { title: 'FOR SALE', text: 'Parasols. Barely used. Not where anyone needed them.' },
  { title: 'LOST', text: 'One flip-flop, left foot, near the pier. Reward.' },
  { title: 'SITUATIONS VACANT', text: 'Ice cream seller for next season. Must like children.' },
];

export const KICKERS: readonly string[] = ['Exclusive', 'Shock', 'Scandal', 'Special report'];

export const WEATHER_EARS: { readonly [tone in Tone]: readonly string[] } = {
  broadsheet: [
    'Grey and mild. Drizzle off the sea.',
    'Fair, with a breeze off the bay.',
    'Cool nights. The beach is empty.',
  ],
  tabloid: [
    'Storms. More of them than guests.',
    'Grey, like the mood on the boardwalk.',
    'Rain, and plenty of it.',
  ],
};

export const PRICE_EARS: { readonly [tone in Tone]: readonly string[] } = {
  broadsheet: ['Late edition · Free to guests', 'Final edition · Free to guests'],
  tabloid: ['Late edition · Read it and weep', 'Final edition · Not for the faint-hearted'],
};

// One seed per edition, so it reads the same each time it is opened.
export const seedOf = (gameId: string, season: number): number =>
  mix(fnv(gameId) ^ Math.imul(season, 0x9e37_79b1));

export function pick<T>(choices: readonly T[], seed: number, salt: number): T {
  return choices[Math.floor(unitAt(seed, salt) * choices.length)]!;
}

const PLACEHOLDER = /\{(\w+)\}/g;

export const placeholdersOf = (template: string): readonly string[] =>
  [...template.matchAll(PLACEHOLDER)].map((found) => found[1]!);

export const fits = (template: string, facts: Facts): boolean =>
  placeholdersOf(template).every((key) => key in facts);

export const fill = (template: string, facts: Facts): string =>
  template.replace(PLACEHOLDER, (whole, key: string) => facts[key] ?? whole);

// Null when no template fits, which only a template table that broke its own rule allows.
export function write(
  templates: readonly string[],
  facts: Facts,
  seed: number,
  salt: number,
): string | null {
  const fitting = templates.filter((template) => fits(template, facts));
  return fitting.length > 0 ? fill(pick(fitting, seed, salt), facts) : null;
}
