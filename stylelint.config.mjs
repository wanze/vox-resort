import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const FEATURES = readdirSync(join(import.meta.dirname, 'src/features'));

// Blocks and elements in kebab case after the owner's prefix, one optional --modifier last.
const classesOf = (...prefixes) =>
  `^(?:${prefixes.join('|')})(?:-[a-z0-9]+)*(?:--[a-z0-9]+(?:-[a-z0-9]+)*)?$`;

const COLOURS = ['rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'lab', 'lch', 'oklab', 'oklch', 'color-mix'];

export default {
  extends: ['stylelint-config-standard'],
  plugins: ['stylelint-declaration-strict-value'],
  rules: {
    'selector-class-pattern': [
      classesOf('[a-z][a-z0-9]*'),
      { message: 'Expected "%s" to be kebab-case with an optional --modifier' },
    ],
    'color-no-hex': true,
    'color-named': 'never',
    'function-disallowed-list': COLOURS,
    // A component's own stacking, under 4, stays local; anything that layers the screen is a token.
    'scale-unlimited/declaration-strict-value': [
      ['z-index'],
      { ignoreValues: ['/^-?[0-3]$/', 'auto'] },
    ],
    // Four calc()s in a row read better as top, right, bottom and left than as one inset.
    'declaration-block-no-redundant-longhand-properties': [true, { ignoreShorthands: ['inset'] }],
    'declaration-no-important': true,
    'selector-max-id': [0, { ignoreContextFunctionalPseudoClasses: [':where'] }],
    'selector-max-compound-selectors': 4,
    // A var() fallback can land in calc(), where a bare 0 next to a length is invalid.
    'length-zero-no-unit': [true, { ignore: ['custom-properties'], ignoreFunctions: ['var'] }],
    // The kit sets a shared look and its states first and each control's own size after it;
    // ordering by specificity instead would split every control in two.
    'no-descending-specificity': null,
    // Blank lines are oxfmt's; these three would also break up the token groups.
    'comment-empty-line-before': null,
    'custom-property-empty-line-before': null,
    'declaration-empty-line-before': null,
  },
  overrides: [
    {
      files: ['src/app/styles/tokens.css'],
      rules: { 'color-no-hex': null, 'function-disallowed-list': null },
    },
    {
      files: ['src/app/styles/base.css'],
      rules: { 'selector-class-pattern': classesOf('app') },
    },
    // The kit knows nothing of the features that use it.
    {
      files: ['src/shared/**/*.css'],
      rules: {
        'selector-class-pattern': [
          classesOf('ui'),
          { message: 'Expected "%s" to be a ui kit class' },
        ],
        'keyframes-name-pattern': '^ui-[a-z0-9-]+$',
      },
    },
    ...FEATURES.map((feature) => ({
      files: [`src/features/${feature}/**/*.css`],
      rules: {
        'selector-class-pattern': [
          classesOf(feature, 'ui', 'hud', 'app'),
          {
            message: `Expected "%s" to belong to ${feature}, or to the ui kit, hud or app it sits in`,
          },
        ],
        'keyframes-name-pattern': `^${feature}-[a-z0-9-]+$`,
      },
    })),
    // Standalone tool pages with their own palettes; nothing in the game reads them.
    {
      files: ['src/app/compare.css', 'src/app/soundBoard.css'],
      rules: { 'color-no-hex': null, 'function-disallowed-list': null },
    },
  ],
};
