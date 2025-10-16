import { it, test } from 'node:test';
import { compareGeneratedContainer, ensureFileExists, generateTestContainer } from '../utils.mjs';

test('Container merging', async () => {
  await it('merges containers', async () => {
    await ensureFileExists(
      import.meta.url,
      'generatedChildContainer.ts',
      generateEmptyChildContainer,
    );
    const path = await generateTestContainer(import.meta.url);
    await compareGeneratedContainer(path, 'ParentContainer');
    await compareGeneratedContainer(path, 'ChildContainer');
  });
});

function generateEmptyChildContainer() {
  return `
import { Container } from 'dicc';

export class TestChildContainer extends Container {
  constructor() {
    super({});
  }
}
`;
}
