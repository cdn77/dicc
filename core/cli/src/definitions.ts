import { ConsoleHandler } from '@debugr/console';
import { Logger, Plugin } from '@debugr/core';
import { ServiceDefinition } from 'dicc';
import { IndentationText, NewLineKind, Project, QuoteKind } from 'ts-morph';
import { Argv } from './argv';
import { ConfigLoader } from './configLoader';
import { Dicc } from './dicc';
import { DiccConfig } from './types';

export { Argv } from './argv';
export { Autowiring } from './autowiring';
export { Checker } from './checker';
export { Compiler } from './compiler';
export { ConfigLoader } from './configLoader';
export { DefinitionScanner } from './definitionScanner';
export { ServiceRegistry } from './serviceRegistry';
export { SourceFiles } from './sourceFiles';
export { TypeHelper } from './typeHelper';

export namespace debug {
  export const logger = ((plugins: Plugin[]) => new Logger({
    globalContext: {},
    plugins,
  })) satisfies ServiceDefinition<Logger>;

  export const console = {
    factory: (argv: Argv) => new ConsoleHandler({ threshold: argv.logLevel, timestamp: false }),
    scope: 'private',
  } satisfies ServiceDefinition<Plugin>;
}

export const config = (
  async (loader: ConfigLoader) => loader.load()
) satisfies ServiceDefinition<DiccConfig>;

export const project = ((config: DiccConfig) => new Project({
  tsConfigFilePath: config.project,
  manipulationSettings: {
    indentationText: IndentationText.TwoSpaces,
    newLineKind: NewLineKind.LineFeed,
    quoteKind: QuoteKind.Single,
    useTrailingCommas: true,
  },
})) satisfies ServiceDefinition<Project>;

export const dicc = Dicc satisfies ServiceDefinition<Dicc>;
