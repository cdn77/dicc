import { Container, ServiceType } from 'dicc';
import * as defs0 from './definitions';

export interface Services {
  'debug.logger': ServiceType<typeof defs0.debug.logger>;
  'dicc': Promise<ServiceType<typeof defs0.dicc>>;
  '#Argv.0': defs0.Argv;
  '#Autowiring.0': defs0.Autowiring;
  '#Checker.0': Promise<defs0.Checker>;
  '#Compiler.0': Promise<defs0.Compiler>;
  '#ConfigLoader.0': defs0.ConfigLoader;
  '#ConsoleHandler.0': ServiceType<typeof defs0.debug.console>;
  '#DefinitionScanner.0': Promise<defs0.DefinitionScanner>;
  '#Dicc.0': Promise<ServiceType<typeof defs0.dicc>>;
  '#DiccConfig.0': Promise<ServiceType<typeof defs0.config>>;
  '#Logger.0': ServiceType<typeof defs0.debug.logger>;
  '#Plugin.0': ServiceType<typeof defs0.debug.console>;
  '#Project.0': Promise<ServiceType<typeof defs0.project>>;
  '#ServiceRegistry.0': defs0.ServiceRegistry;
  '#SourceFiles.0': Promise<defs0.SourceFiles>;
  '#TypeHelper.0': Promise<defs0.TypeHelper>;
}

export const container = new Container<Services>({
  'debug.logger': {
    ...defs0.debug.logger,
    aliases: ['#Logger.0'],
    factory: (di) => defs0.debug.logger.factory(di.find('#Plugin.0')),
  },
  'dicc': {
    aliases: ['#Dicc.0'],
    async: true,
    factory: async (di) => new defs0.dicc(
      await di.get('#SourceFiles.0'),
      await di.get('#TypeHelper.0'),
      await di.get('#DefinitionScanner.0'),
      di.get('#Autowiring.0'),
      await di.get('#Compiler.0'),
      await di.get('#Checker.0'),
      await di.get('#DiccConfig.0'),
    ),
  },
  '#Argv.0': {
    factory: () => new defs0.Argv(),
  },
  '#Autowiring.0': {
    factory: (di) => new defs0.Autowiring(
      di.get('#ServiceRegistry.0'),
      di.get('#Logger.0'),
    ),
  },
  '#Checker.0': {
    async: true,
    factory: async (di) => new defs0.Checker(
      await di.get('#TypeHelper.0'),
      di.get('#ServiceRegistry.0'),
      di.get('#Logger.0'),
    ),
  },
  '#Compiler.0': {
    async: true,
    factory: async (di) => new defs0.Compiler(
      di.get('#ServiceRegistry.0'),
      di.get('#Autowiring.0'),
      await di.get('#SourceFiles.0'),
      await di.get('#DiccConfig.0'),
    ),
  },
  '#ConfigLoader.0': {
    factory: (di) => new defs0.ConfigLoader(di.get('#Argv.0')),
  },
  '#ConsoleHandler.0': {
    ...defs0.debug.console,
    aliases: ['#Plugin.0'],
    factory: (di) => defs0.debug.console.factory(di.get('#Argv.0')),
  },
  '#DefinitionScanner.0': {
    async: true,
    factory: async (di) => new defs0.DefinitionScanner(
      di.get('#ServiceRegistry.0'),
      await di.get('#TypeHelper.0'),
      di.get('#Logger.0'),
    ),
  },
  '#DiccConfig.0': {
    ...defs0.config,
    async: true,
    factory: async (di) => defs0.config.factory(di.get('#ConfigLoader.0')),
  },
  '#Project.0': {
    ...defs0.project,
    async: true,
    factory: async (di) => defs0.project.factory(await di.get('#DiccConfig.0')),
  },
  '#ServiceRegistry.0': {
    factory: () => new defs0.ServiceRegistry(),
  },
  '#SourceFiles.0': {
    async: true,
    factory: async (di) => new defs0.SourceFiles(
      await di.get('#Project.0'),
      await di.get('#DiccConfig.0'),
    ),
  },
  '#TypeHelper.0': {
    async: true,
    factory: async (di) => new defs0.TypeHelper(await di.get('#SourceFiles.0')),
  },
});



