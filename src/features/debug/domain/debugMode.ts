// Read by vite.config.ts, which compiles the answer in, so this module may import nothing.
type BuildEnv = { readonly VOX_DEBUG?: string | undefined; readonly CI?: string | undefined };

const flagged = (value: string | undefined): boolean =>
  value !== undefined && value !== '' && value !== '0' && value !== 'false';

// Off in CI, which builds what is deployed; a typo fails the build rather than ship a guess.
export function debugAllowedBy(env: BuildEnv): boolean {
  const asked = env.VOX_DEBUG?.trim() ?? '';
  if (asked === '') return !flagged(env.CI);
  if (asked === 'on' || asked === 'off') return asked === 'on';
  throw new Error(`VOX_DEBUG is "${asked}"; it takes on or off`);
}
