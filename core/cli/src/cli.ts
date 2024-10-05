#!/usr/bin/env node

import { DiccContainer } from './bootstrap';
import { UserError } from './errors';

const isVerbose = process.argv.slice(2).find((arg) => /^(-v+|--verbose)/.test(arg));

(async () => {
  try {
    const container = new DiccContainer();

    try {
      const dicc = await container.get('dicc');
      await dicc.compile();
    } catch (e: any) {
      const isUserError = e instanceof UserError;
      const logger = container.get('debug.logger');
      logger.error(isVerbose && !isUserError ? e : e.message);
      process.exit(1);
    }
  } catch (e: any) {
    const isUserError = e instanceof UserError;

    if (isVerbose && !isUserError) {
      throw e;
    } else {
      console.log(`Error: ${e.message}`);
      process.exit(1);
    }
  }
})();
