import { readFileSync, writeFileSync } from 'node:fs';

const SOURCE = 'fixtures/source/reference-save.json';
const FIXTURE = 'fixtures/reference-resort.json';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isIndexed = (value: object): boolean => {
  const keys = Object.keys(value);
  return keys.length > 0 && keys.every((key, index) => key === String(index));
};

const byKey = ([a]: [string, unknown], [b]: [string, unknown]): number => (a < b ? -1 : 1);

// A typed array JSON-stringifies to an object of index keys, which the schema would refuse; keys
// are sorted so a re-export diffs by placement rather than by whatever order the game wrote them.
function normalised(_key: string, value: unknown): unknown {
  if (!isRecord(value)) return value;
  if (isIndexed(value)) return Object.values(value);
  return Object.fromEntries(Object.entries(value).toSorted(byKey));
}

const save = JSON.parse(readFileSync(SOURCE, 'utf8'));
if (!save.world) throw new Error(`${SOURCE} has no world: is it a save as exported for SIM_SAVE?`);
const json = `${JSON.stringify(save.world, normalised, 2)}\n`;
writeFileSync(FIXTURE, json);
console.log(`Wrote ${FIXTURE}, ${(json.length / 1e6).toFixed(2)} MB`);
