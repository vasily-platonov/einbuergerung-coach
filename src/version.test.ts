import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import packageJson from '../package.json'

it('keeps the VERSION file and package.json on the same version', () => {
  expect(readFileSync('VERSION', 'utf8').trim()).toBe(packageJson.version)
})
