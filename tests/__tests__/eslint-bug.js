'use strict'

const {
  ESLint,
} = require('eslint')

describe('ESLint Bug', () => {
  test('should not throw an error', async () => {
    const eslint = new ESLint()
    const filePaths = [
      'tests/resources',
    ]
    const expectedLength = 3

    const results = await eslint.lintFiles(filePaths)

    expect(results)
      .toHaveLength(expectedLength)
  })
})
