import { Container, type ServiceType } from 'dicc';
import * as analysis0 from '../../analysis';
import type * as compiler0 from '../../compiler';
import type * as container0 from '../../container';
import type * as extensions0 from '../../extensions';
import type * as utils0 from '../../utils';
import * as argv0 from '../argv';
import * as definitions0 from './definitions';

interface PublicServices {
  'compiler': Promise<ServiceType<typeof definitions0.compiler>>;
}

interface DynamicServices {}

interface AnonymousServices {
  '#Argv0.0': argv0.Argv;
  '#AutowiringFactory0.0': Promise<analysis0.AutowiringFactory>;
  '#BuilderMap0.0': Promise<container0.BuilderMap>;
  '#BuilderReflectionFactory0.0': analysis0.BuilderReflectionFactory;
  '#CompilerConfig0.0': Promise<ServiceType<typeof definitions0.config.compilerConfig>>;
  '#CompilerExtension0': Promise<
    | extensions0.DecoratorsExtension
    | extensions0.ServicesExtension
  >;
  '#ConfigLoader0.0': ServiceType<typeof definitions0.config.loader>;
  '#ConsoleHandler0.0': ServiceType<typeof definitions0.debug.console>;
  '#ContainerAnalyser0.0': Promise<analysis0.ContainerAnalyser>;
  '#ContainerBuilderFactory0.0': Promise<container0.ContainerBuilderFactory>;
  '#ContainerCompiler0.0': Promise<compiler0.ContainerCompiler>;
  '#ContainerReflector0.0': Promise<analysis0.ContainerReflector>;
  '#DecoratorsExtension0.0': Promise<extensions0.DecoratorsExtension>;
  '#EventDispatcher0.0': Promise<ServiceType<typeof definitions0.eventDispatcher>>;
  '#EventSubscriber0': Promise<
    | extensions0.DecoratorsExtension
    | extensions0.ServicesExtension
  >;
  '#ExtensionLoader0.0': Promise<extensions0.ExtensionLoader>;
  '#ExternalReflectionFactory0.0': Promise<analysis0.ExternalReflectionFactory>;
  '#Logger0.0': ServiceType<typeof definitions0.debug.logger>;
  '#ModuleResolver0.0': Promise<utils0.ModuleResolver>;
  '#Project0.0': Promise<ServiceType<typeof definitions0.project>>;
  '#ReferenceResolverFactory0.0': Promise<utils0.ReferenceResolverFactory>;
  '#ResourceScanner0.0': Promise<utils0.ResourceScanner>;
  '#ServiceAnalyser0.0': Promise<analysis0.ServiceAnalyser>;
  '#ServiceCompiler0.0': Promise<compiler0.ServiceCompiler>;
  '#ServicesExtension0.0': Promise<extensions0.ServicesExtension>;
  '#TypeHelper0.0': Promise<utils0.TypeHelper>;
  '#WriterFactory0.0': Promise<compiler0.WriterFactory>;
}

export class DiccContainer extends Container<PublicServices, DynamicServices, AnonymousServices> {
  constructor() {
    super({
      'compiler': {
        factory: async (di) => new definitions0.compiler(
          await di.get('#ExtensionLoader0.0'),
          di.iterate('#CompilerExtension0'),
          await di.get('#ResourceScanner0.0'),
          await di.get('#ContainerAnalyser0.0'),
          await di.get('#ContainerCompiler0.0'),
          await di.get('#BuilderMap0.0'),
        ),
        async: true,
      },
      '#Argv0.0': {
        factory: () => new argv0.Argv(),
      },
      '#AutowiringFactory0.0': {
        factory: async (di) => {
          const call2Arg0 = await di.get('#ContainerReflector0.0');
          return {
            create: (serviceAnalyser) => new analysis0.Autowiring(
              call2Arg0,
              serviceAnalyser,
            ),
          };
        },
        async: true,
      },
      '#BuilderMap0.0': {
        factory: async (di) => {
          const container0 = await import('../../container/index.js');
          return new container0.BuilderMap(
            await di.get('#Project0.0'),
            await di.get('#ContainerBuilderFactory0.0'),
            await di.get('#CompilerConfig0.0'),
          );
        },
        async: true,
      },
      '#BuilderReflectionFactory0.0': {
        factory: () => ({
          create: (container) => new analysis0.BuilderReflection(
            container,
          ),
        }),
      },
      '#CompilerConfig0.0': {
        factory: async (di) => definitions0.config.compilerConfig.factory(
          di.get('#ConfigLoader0.0'),
        ),
        async: true,
      },
      '#ConfigLoader0.0': {
        factory: (di) => new definitions0.config.loader.factory(
          definitions0.config.loader.args.configFile(
            di.get('#Argv0.0'),
          ),
        ),
      },
      '#ConsoleHandler0.0': {
        factory: (di) => new definitions0.debug.console.factory(
          definitions0.debug.console.args.options(
            di.get('#Argv0.0'),
          ),
        ),
        scope: 'private',
      },
      '#ContainerAnalyser0.0': {
        factory: async (di) => new analysis0.ContainerAnalyser(
          await di.get('#EventDispatcher0.0'),
          await di.get('#ContainerReflector0.0'),
          await di.get('#ServiceAnalyser0.0'),
        ),
        async: true,
      },
      '#ContainerBuilderFactory0.0': {
        factory: async (di) => {
          const container0 = await import('../../container/index.js');
          const call1Arg0 = await di.get('#EventDispatcher0.0');
          return {
            create: (sourceFile, options) => new container0.ContainerBuilder(
              call1Arg0,
              sourceFile,
              options,
            ),
          };
        },
        async: true,
      },
      '#ContainerCompiler0.0': {
        factory: async (di) => {
          const compiler0 = await import('../../compiler/index.js');
          return new compiler0.ContainerCompiler(
            await di.get('#ServiceCompiler0.0'),
            await di.get('#WriterFactory0.0'),
          );
        },
        async: true,
      },
      '#ContainerReflector0.0': {
        factory: async (di) => new analysis0.ContainerReflector(
          di.get('#BuilderReflectionFactory0.0'),
          await di.get('#ExternalReflectionFactory0.0'),
          await di.get('#BuilderMap0.0'),
        ),
        async: true,
      },
      '#DecoratorsExtension0.0': {
        aliases: [
          '#EventSubscriber0',
          '#CompilerExtension0',
        ],
        factory: async (di) => {
          const extensions0 = await import('../../extensions/index.js');
          return new extensions0.DecoratorsExtension(
            await di.get('#TypeHelper0.0'),
          );
        },
        async: true,
      },
      '#EventDispatcher0.0': {
        factory: () => new definitions0.eventDispatcher.factory(),
        async: true,
        onCreate: async (service, di) => {
          definitions0.eventDispatcher.onCreate(
            service,
            await di.find('#EventSubscriber0'),
          );
        },
      },
      '#ExtensionLoader0.0': {
        factory: async (di) => {
          const extensions0 = await import('../../extensions/index.js');
          return new extensions0.ExtensionLoader(
            await di.get('#EventDispatcher0.0'),
            async () => di.get('#ModuleResolver0.0'),
            async () => di.get('#TypeHelper0.0'),
            await di.get('#ReferenceResolverFactory0.0'),
            di.get('#Logger0.0'),
            await di.get('#CompilerConfig0.0'),
          );
        },
        async: true,
      },
      '#ExternalReflectionFactory0.0': {
        factory: async (di) => {
          const call0Arg0 = await di.get('#TypeHelper0.0');
          return {
            create: (container) => new analysis0.ExternalReflection(
              call0Arg0,
              container,
            ),
          };
        },
        async: true,
      },
      '#Logger0.0': {
        factory: (di) => definitions0.debug.logger.factory(
          di.find('#ConsoleHandler0.0'),
        ),
      },
      '#ModuleResolver0.0': {
        factory: async (di) => {
          const utils0 = await import('../../utils/index.js');
          return new utils0.ModuleResolver(
            await di.get('#Project0.0'),
          );
        },
        async: true,
      },
      '#Project0.0': {
        factory: async (di) => definitions0.project.factory(
          await di.get('#CompilerConfig0.0'),
        ),
        async: true,
      },
      '#ReferenceResolverFactory0.0': {
        factory: async (di) => {
          const utils0 = await import('../../utils/index.js');
          return new utils0.ReferenceResolverFactory(
            await di.get('#ModuleResolver0.0'),
          );
        },
        async: true,
      },
      '#ResourceScanner0.0': {
        factory: async (di) => {
          const utils0 = await import('../../utils/index.js');
          return new utils0.ResourceScanner(
            await di.get('#Project0.0'),
            await di.get('#EventDispatcher0.0'),
          );
        },
        async: true,
      },
      '#ServiceAnalyser0.0': {
        factory: async (di) => new analysis0.ServiceAnalyser(
          await di.get('#AutowiringFactory0.0'),
        ),
        async: true,
      },
      '#ServiceCompiler0.0': {
        factory: async (di) => {
          const compiler0 = await import('../../compiler/index.js');
          return new compiler0.ServiceCompiler(
            await di.get('#WriterFactory0.0'),
          );
        },
        async: true,
      },
      '#ServicesExtension0.0': {
        aliases: [
          '#EventSubscriber0',
          '#CompilerExtension0',
        ],
        factory: async (di) => {
          const extensions0 = await import('../../extensions/index.js');
          return new extensions0.ServicesExtension(
            await di.get('#TypeHelper0.0'),
          );
        },
        async: true,
      },
      '#TypeHelper0.0': {
        factory: async (di) => {
          const utils0 = await import('../../utils/index.js');
          return new utils0.TypeHelper(
            await di.get('#ReferenceResolverFactory0.0'),
          );
        },
        async: true,
      },
      '#WriterFactory0.0': {
        factory: async (di) => {
          const compiler0 = await import('../../compiler/index.js');
          return new compiler0.WriterFactory(
            await di.get('#Project0.0'),
          );
        },
        async: true,
      },
    });
  }
}
