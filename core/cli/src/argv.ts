import { LogLevel } from '@debugr/core';
import { parseArgs } from 'util';

export class Argv {
  readonly configFile?: string;
  readonly logLevel: LogLevel;

  constructor() {
    const args = parseArgs({
      strict: true,
      allowPositionals: false,
      options: {
        'config': {
          short: 'c',
          type: 'string',
        },
        'verbose': {
          short: 'v',
          type: 'boolean',
          default: [],
          multiple: true,
        },
      },
    });

    this.configFile = args.values.config;

    const verbosity = args.values.verbose
      ? args.values.verbose.reduce((n, v) => n + 2 * (Number(v) - 0.5), 0)
      : 0;

    if (verbosity >= 2) {
      this.logLevel = LogLevel.TRACE;
    } else if (verbosity > 0) {
      this.logLevel = LogLevel.DEBUG;
    } else if (verbosity < 0) {
      this.logLevel = LogLevel.WARNING;
    } else {
      this.logLevel = LogLevel.INFO;
    }
  }
}
