export type Brand =
  | 'sunshine'
  | 'lagoon'
  | 'coral'
  | 'seagull'
  | 'palm'
  | 'tidewater'
  | 'sands'
  | 'starfish';

export interface Operator {
  readonly name: string;
  readonly brand: Brand;
  readonly motto: string;
}

const LISTED: readonly Operator[] = [
  { name: 'Sunshine Tours', brand: 'sunshine', motto: 'Every day a bright one' },
  { name: 'Blue Lagoon Travel', brand: 'lagoon', motto: 'Clear water, clear minds' },
  { name: 'Coral Coast Holidays', brand: 'coral', motto: 'Shores worth the journey' },
  { name: 'Seagull Getaways', brand: 'seagull', motto: 'Fly away, stay away' },
  { name: 'Palm Breeze Journeys', brand: 'palm', motto: 'Slow days in the shade' },
  { name: 'Tidewater Travel', brand: 'tidewater', motto: 'Go where the tide goes' },
  { name: 'Golden Sands Tours', brand: 'sands', motto: 'Warm sand, warm welcome' },
  { name: 'Starfish Holidays', brand: 'starfish', motto: 'Holidays that shine' },
];

export const OPERATORS: readonly string[] = LISTED.map((operator) => operator.name);

// By name, as offers and saves carry it: a name no longer listed gets no brand, not an error.
export const operatorNamed = (name: string): Operator | null =>
  LISTED.find((operator) => operator.name === name) ?? null;

export const operatorFor = (random: () => number): string =>
  OPERATORS[Math.min(OPERATORS.length - 1, Math.floor(random() * OPERATORS.length))]!;
