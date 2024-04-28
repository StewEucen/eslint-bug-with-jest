'use strict'

/**
 * ESLint Config
 *
 * @type {Array<import('eslint').Linter.FlatConfig>}
 */
module.exports = [
  {
    languageOptions: {
      parserOptions: {
        ecmaVersion: 'latest',
      },
    },
    ignores: [
      '**/node_modules/**',
    ],
    rules: {
      indent: [
        'error',
        2, // 4
      ],
      quotes: [
        'error',
        'single', // 'double'
      ],
      semi: [
        'error',
        'never', // 'always'
      ],
    },
  },
]
