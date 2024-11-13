import { it, test } from 'node:test';
import { runTestSuite } from '../utils.mjs';

test('Implicit definitions', async () => {
  await it('compiles implicitly defined services', async () => {
    await runTestSuite(import.meta.url);
  });
});
