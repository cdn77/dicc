import { ConsoleHandler } from '@debugr/console';
import { Logger, Plugin } from '@debugr/core';
import { ServiceDefinition } from 'dicc';
import { IndentationText, NewLineKind, Project, QuoteKind } from 'ts-morph';
import { Argv } from './argv';
import { ConfigLoader } from './configLoader';
import { Dicc } from './dicc';
import { DiccConfig } from './types';

export namespace debug {
  export const logger = {
    factory: (plugins: Plugin[]) => new Logger({
      globalContext: {},
      plugins,
    }),
  } satisfies ServiceDefinition<Logger>;

  export const console = {
    factory: (argv: Argv) => new ConsoleHandler({ threshold: argv.logLevel, timestamp: false }),
    scope: 'private',
    anonymous: true,
  } satisfies ServiceDefinition<ConsoleHandler, Plugin>;
}

export const config = {
  factory: async (loader: ConfigLoader) => loader.load(),
  anonymous: true,
} satisfies ServiceDefinition<DiccConfig>;

export const project = {
  factory: (config: DiccConfig) => new Project({
    tsConfigFilePath: config.project,
    manipulationSettings: {
      indentationText: IndentationText.TwoSpaces,
      newLineKind: NewLineKind.LineFeed,
      quoteKind: QuoteKind.Single,
      useTrailingCommas: true,
    },
  }),
  anonymous: true,
} satisfies ServiceDefinition<Project>;

export const dicc = Dicc satisfies ServiceDefinition<Dicc>;
