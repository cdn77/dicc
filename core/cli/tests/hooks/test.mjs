import { it, test } from 'node:test';
import { runTestSuite } from '../utils.mjs';

test('Service hooks', async () => {
  await it('compiles service hooks', async () => {
    await runTestSuite(import.meta.url);
  });
});
