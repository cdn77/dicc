import { it, test } from 'node:test';
import { runTestSuite } from '../utils.mjs';

test('Compiler extensions', async () => {
  await it('allow altering compilation', async () => {
    await runTestSuite(import.meta.url);
  });
});
