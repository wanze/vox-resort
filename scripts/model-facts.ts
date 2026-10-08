import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { catalogueFacts } from '../voxel-gen/catalogue.ts';

const FACTS = 'voxel-gen/facts.json';
const json = `${JSON.stringify(catalogueFacts(), null, 2)}\n`;
writeFileSync(FACTS, json);
execFileSync('pnpm', ['exec', 'oxfmt', FACTS], { stdio: 'inherit' });
console.log(`Wrote ${FACTS}, ${Math.round(json.length / 1e3)} KB`);
