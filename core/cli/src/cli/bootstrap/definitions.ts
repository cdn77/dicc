import { ConsoleHandler } from '@debugr/console';
import { Logger, Plugin } from '@debugr/core';
import { ServiceDefinition } from 'dicc';
import { IndentationText, NewLineKind, Project, QuoteKind } from 'ts-morph';
import { Compiler } from '../../compiler';
import { CompilerConfig, ConfigLoader } from '../../config';
import { EventDispatcher, EventSubscriber } from '../../events';
import { Argv } from '../argv';

export namespace debug {
  export const logger = {
    factory: (plugins: Plugin[]) => new Logger({
      globalContext: {},
      plugins,
    }),
    anonymous: true,
  } satisfies ServiceDefinition<Logger>;

  export const console = {
    factory: ConsoleHandler,
    args: {
      options: (argv: Argv) => ({ threshold: argv.logLevel, timestamp: false }),
    },
    scope: 'private',
    anonymous: true,
  } satisfies ServiceDefinition<ConsoleHandler, Plugin>;
}

export namespace config {
  export const loader = {
    factory: ConfigLoader,
    args: {
      configFile: (argv: Argv) => argv.configFile,
    },
    anonymous: true,
  } satisfies ServiceDefinition<ConfigLoader>;

  export const compilerConfig = {
    factory: async (loader: ConfigLoader) => loader.load(),
    anonymous: true,
  } satisfies ServiceDefinition<CompilerConfig>;
}

export const project = {
  factory: (config: CompilerConfig) => new Project({
    tsConfigFilePath: config.project,
    skipAddingFilesFromTsConfig: true,
    manipulationSettings: {
      indentationText: IndentationText.TwoSpaces,
      newLineKind: NewLineKind.LineFeed,
      quoteKind: QuoteKind.Single,
      useTrailingCommas: true,
    },
  }),
  anonymous: true,
} satisfies ServiceDefinition<Project>;

export const eventDispatcher = {
  factory: EventDispatcher,
  anonymous: true,
  onCreate: (dispatcher, subscribers: EventSubscriber[]) => {
    for (const subscriber of subscribers) {
      dispatcher.addSubscriber(subscriber);
    }
  },
} satisfies ServiceDefinition<EventDispatcher>;

export const compiler = Compiler satisfies ServiceDefinition<Compiler>;
