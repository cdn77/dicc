import { it, test } from 'node:test';
import { runTestSuite } from '../utils.mjs';

test('Service generators', async () => {
  await it('generate lists or iterables of services', async () => {
    await runTestSuite(import.meta.url);
  });
});
