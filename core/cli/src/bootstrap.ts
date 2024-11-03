import { Container, ServiceType } from 'dicc';
import * as argv0 from './argv';
import * as autowiring0 from './autowiring';
import * as checker0 from './checker';
import * as configLoader0 from './configLoader';
import * as definitionScanner0 from './definitionScanner';
import * as definitions0 from './definitions';
import * as iffy0 from './iffy';
import * as sourceFiles0 from './sourceFiles';
import * as typeHelper0 from './typeHelper';

interface PublicServices {
  'debug.logger': ServiceType<typeof definitions0.debug.logger>;
  'dicc': Promise<ServiceType<typeof definitions0.dicc>>;
}

interface DynamicServices {
  '#Iffy.0': iffy0.Iffy;
}

interface AnonymousServices {
  '#Argv.0': argv0.Argv;
  '#AutowiringFactory.0': autowiring0.AutowiringFactory;
  '#Checker.0': Promise<checker0.Checker>;
  '#ConfigLoader.0': configLoader0.ConfigLoader;
  '#ConsoleHandler.0': ServiceType<typeof definitions0.debug.console>;
  '#DefinitionScanner.0': Promise<definitionScanner0.DefinitionScanner>;
  '#Dicc.0': Promise<ServiceType<typeof definitions0.dicc>>;
  '#DiccConfig.0': Promise<ServiceType<typeof definitions0.config>>;
  '#Logger.0': ServiceType<typeof definitions0.debug.logger>;
  '#Plugin.0': ServiceType<typeof definitions0.debug.console>;
  '#Project.0': Promise<ServiceType<typeof definitions0.project>>;
  '#SourceFiles.0': Promise<sourceFiles0.SourceFiles>;
  '#TypeHelper.0': Promise<typeHelper0.TypeHelper>;
}

export class DiccContainer extends Container<PublicServices, DynamicServices, AnonymousServices>{
  constructor() {
    super({
      'debug.logger': {
        ...definitions0.debug.logger,
        aliases: ['#Logger.0'],
        factory: (di) => definitions0.debug.logger.factory(di.find('#Plugin.0')),
      },
      'dicc': {
        aliases: ['#Dicc.0'],
        async: true,
        factory: async (di) => new definitions0.dicc(
          await di.get('#SourceFiles.0'),
          await di.get('#DefinitionScanner.0'),
          di.get('#AutowiringFactory.0'),
          await di.get('#Checker.0'),
          await di.get('#DiccConfig.0'),
          di.get('#Logger.0'),
        ),
      },
      '#Argv.0': {
        factory: () => new argv0.Argv(),
      },
      '#AutowiringFactory.0': {
        factory: (di) => ({
          create: (containers) => new autowiring0.Autowiring(
            di.get('#Logger.0'),
            containers,
          ),
        }),
      },
      '#Checker.0': {
        async: true,
        factory: async (di) => new checker0.Checker(
          await di.get('#TypeHelper.0'),
          di.get('#Logger.0'),
        ),
      },
      '#ConfigLoader.0': {
        factory: (di) => new configLoader0.ConfigLoader(di.get('#Argv.0')),
      },
      '#ConsoleHandler.0': {
        ...definitions0.debug.console,
        aliases: ['#Plugin.0'],
        factory: (di) => definitions0.debug.console.factory(di.get('#Argv.0')),
      },
      '#DefinitionScanner.0': {
        async: true,
        factory: async (di) => new definitionScanner0.DefinitionScanner(
          await di.get('#TypeHelper.0'),
          di.get('#Logger.0'),
        ),
      },
      '#DiccConfig.0': {
        ...definitions0.config,
        async: true,
        factory: async (di) => definitions0.config.factory(di.get('#ConfigLoader.0')),
      },
      '#Project.0': {
        ...definitions0.project,
        async: true,
        factory: async (di) => definitions0.project.factory(await di.get('#DiccConfig.0')),
      },
      '#SourceFiles.0': {
        async: true,
        factory: async (di) => new sourceFiles0.SourceFiles(
          await di.get('#Project.0'),
          await di.get('#DiccConfig.0'),
          di.get('#Logger.0'),
        ),
      },
      '#TypeHelper.0': {
        async: true,
        factory: async (di) => new typeHelper0.TypeHelper(await di.get('#Project.0')),
      },
    });
  }
}



