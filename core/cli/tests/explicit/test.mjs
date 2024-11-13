import { it, test } from 'node:test';
import { runTestSuite } from '../utils.mjs';

test('Explicit definitions', async () => {
  await it('compiles explicitly defined services', async () => {
    await runTestSuite(import.meta.url);
  });
});
