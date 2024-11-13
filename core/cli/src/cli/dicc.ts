#!/usr/bin/env node
import { formatErrorReport } from '../errors';
import { DiccContainer } from './bootstrap';

async function main(): Promise<void> {
  const container = new DiccContainer();
  const compiler = await container.get('compiler');
  await compiler.compile();
}

main().catch((e: unknown) => {
  process.stderr.write([...formatErrorReport(e)].join(''));
});
