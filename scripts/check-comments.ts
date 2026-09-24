import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parseSync } from 'oxc-parser';

const MAX_LINES = 3;
const CHECKED = /\.(ts|tsx|css)$/;
const DIRECTIVE = /^[\s*/]*(oxlint|eslint|@ts-|@vite-ignore|[@#]__PURE__|\/ <reference)/;

interface Comment {
  start: number;
  end: number;
  text: string;
  block: boolean;
}

function commentsOf(file: string, source: string): Comment[] {
  if (file.endsWith('.css')) {
    return [...source.matchAll(/\/\*[\s\S]*?\*\//g)].map((m) => ({
      start: m.index,
      end: m.index + m[0].length,
      text: m[0],
      block: true,
    }));
  }
  return parseSync(file, source).comments.map((c) => ({
    start: c.start,
    end: c.end,
    text: source.slice(c.start, c.end),
    block: c.type === 'Block',
  }));
}

function groupsOf(source: string, comments: Comment[]): Array<[number, number]> {
  const groups: Array<[number, number]> = [];
  for (const c of comments) {
    const last = groups.at(-1);
    // Consecutive `//` lines read as one comment, so they are measured together.
    if (last && /^[ \t]*\r?\n[ \t]*$/.test(source.slice(last[1], c.start))) last[1] = c.end;
    else groups.push([c.start, c.end]);
  }
  return groups;
}

function check(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  const lineAt = (offset: number) => source.slice(0, offset).split('\n').length;
  const comments = commentsOf(file, source).filter((c) => !DIRECTIVE.test(c.text));

  const docs = comments
    .filter((c) => c.block && c.text.startsWith('/**') && !file.endsWith('.css'))
    .map((c) => `${file}:${lineAt(c.start)}  doc comment; let names and types explain what`);
  const long = groupsOf(source, comments)
    .map(([start, end]) => ({ line: lineAt(start), lines: lineAt(end) - lineAt(start) + 1 }))
    .filter(({ lines }) => lines > MAX_LINES)
    .map(
      ({ line, lines }) =>
        `${file}:${line}  ${lines}-line comment (max ${MAX_LINES}); keep only the why`,
    );
  return [...docs, ...long];
}

const args = process.argv.slice(2);
const files = (
  args.length > 0
    ? args
    : execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
        encoding: 'utf8',
      }).split('\n')
).filter((f) => CHECKED.test(f));

const problems = files.flatMap(check);
if (problems.length > 0) {
  console.error(problems.join('\n'));
  console.error(
    `\n${problems.length} comment problem(s). Comments explain why, never what; see CLAUDE.md.`,
  );
  process.exit(1);
}
