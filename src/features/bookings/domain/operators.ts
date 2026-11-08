export const OPERATORS: readonly string[] = [
  'Sunshine Tours',
  'Blue Lagoon Travel',
  'Coral Coast Holidays',
  'Seagull Getaways',
  'Palm Breeze Journeys',
  'Tidewater Travel',
  'Golden Sands Tours',
  'Starfish Holidays',
];

export const operatorFor = (random: () => number): string =>
  OPERATORS[Math.min(OPERATORS.length - 1, Math.floor(random() * OPERATORS.length))]!;
