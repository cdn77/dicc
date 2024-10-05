#!/usr/bin/env node

import { DiccContainer } from './bootstrap';

(async () => {
  const container = new DiccContainer();

  try {
    const dicc = await container.get('dicc');
    await dicc.compile();
  } catch (e: any) {
    const isVerbose = process.argv.slice(2).find((arg) => /^(-v+|--verbose)/.test(arg));

    try {
      const logger = container.get('debug.logger');
      logger.error(isVerbose ? e : e.message);
    } catch {
      if (isVerbose) {
        throw e;
      } else {
        console.log(`Error: ${e.message}`);
      }
    }

    process.exit(1);
  }
})();
