import { it, test } from 'node:test';
import { runTestSuite } from '../utils.mjs';

test('Injection of iterables', async () => {
  await it('injects appropriately adjusted iterables', async () => {
    await runTestSuite(import.meta.url);
  });
});
