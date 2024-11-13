import { Container, type ServiceType } from 'dicc';
import * as di4 from '../../analysis/di';
import type * as di6 from '../../compiler/di';
import type * as di5 from '../../container/di';
import type * as di3 from '../../definitions/di';
import type * as di0 from '../../extensions/di';
import type * as di1 from '../../utils/di';
import * as di2 from '../di';
import * as definitions0 from './definitions';

interface PublicServices {
  'compiler': Promise<ServiceType<typeof definitions0.compiler>>;
}

interface DynamicServices {}

interface AnonymousServices {
  '#Argv0.0': di2.Argv;
  '#AutowiringFactory0.0': Promise<di4.AutowiringFactory>;
  '#BuilderMap0.0': Promise<di5.BuilderMap>;
  '#BuilderReflectionFactory0.0': di4.BuilderReflectionFactory;
  '#CompilerConfig0.0': Promise<ServiceType<typeof definitions0.config.compilerConfig>>;
  '#CompilerExtension0': Promise<
    | di0.DecoratorsExtension
    | di0.ServicesExtension
  >;
  '#ConfigLoader0.0': ServiceType<typeof definitions0.config.loader>;
  '#ConsoleHandler0.0': ServiceType<typeof definitions0.debug.console>;
  '#ContainerAnalyser0.0': Promise<di4.ContainerAnalyser>;
  '#ContainerBuilderFactory0.0': Promise<di5.ContainerBuilderFactory>;
  '#ContainerCompiler0.0': Promise<di6.ContainerCompiler>;
  '#ContainerReflector0.0': Promise<di4.ContainerReflector>;
  '#DecoratorsExtension0.0': Promise<di0.DecoratorsExtension>;
  '#EventDispatcher0.0': Promise<ServiceType<typeof definitions0.eventDispatcher>>;
  '#EventSubscriber0': Promise<
    | di0.DecoratorsExtension
    | di0.ServicesExtension
  >;
  '#ExtensionLoader0.0': Promise<di0.ExtensionLoader>;
  '#ExternalReflectionFactory0.0': Promise<di4.ExternalReflectionFactory>;
  '#Logger0.0': ServiceType<typeof definitions0.debug.logger>;
  '#ModuleResolver0.0': Promise<di1.ModuleResolver>;
  '#Project0.0': Promise<ServiceType<typeof definitions0.project>>;
  '#ReferenceResolverFactory0.0': Promise<di1.ReferenceResolverFactory>;
  '#ResourceScanner0.0': Promise<di3.ResourceScanner>;
  '#ServiceAnalyser0.0': Promise<di4.ServiceAnalyser>;
  '#ServiceCompiler0.0': Promise<di6.ServiceCompiler>;
  '#ServicesExtension0.0': Promise<di0.ServicesExtension>;
  '#TypeHelper0.0': Promise<di1.TypeHelper>;
  '#WriterFactory0.0': Promise<di6.WriterFactory>;
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
        factory: () => new di2.Argv(),
      },
      '#AutowiringFactory0.0': {
        factory: async (di) => {
          const call2Arg0 = await di.get('#ContainerReflector0.0');
          return {
            create: (serviceAnalyser) => new di4.Autowiring(
              call2Arg0,
              serviceAnalyser,
            ),
          };
        },
        async: true,
      },
      '#BuilderMap0.0': {
        factory: async (di) => {
          const di5 = await import('../../container/di.js');
          return new di5.BuilderMap(
            await di.get('#Project0.0'),
            await di.get('#ContainerBuilderFactory0.0'),
            await di.get('#CompilerConfig0.0'),
          );
        },
        async: true,
      },
      '#BuilderReflectionFactory0.0': {
        factory: () => ({
          create: (container) => new di4.BuilderReflection(
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
        factory: async (di) => new di4.ContainerAnalyser(
          await di.get('#ContainerReflector0.0'),
          await di.get('#ServiceAnalyser0.0'),
        ),
        async: true,
      },
      '#ContainerBuilderFactory0.0': {
        factory: async (di) => {
          const di5 = await import('../../container/di.js');
          const call1Arg0 = await di.get('#EventDispatcher0.0');
          return {
            create: (sourceFile, options) => new di5.ContainerBuilder(
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
          const di6 = await import('../../compiler/di.js');
          return new di6.ContainerCompiler(
            await di.get('#ServiceCompiler0.0'),
            await di.get('#WriterFactory0.0'),
          );
        },
        async: true,
      },
      '#ContainerReflector0.0': {
        factory: async (di) => new di4.ContainerReflector(
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
          const di0 = await import('../../extensions/di.js');
          return new di0.DecoratorsExtension(
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
          const di0 = await import('../../extensions/di.js');
          return new di0.ExtensionLoader(
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
            create: (container) => new di4.ExternalReflection(
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
          const di1 = await import('../../utils/di.js');
          return new di1.ModuleResolver(
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
          const di1 = await import('../../utils/di.js');
          return new di1.ReferenceResolverFactory(
            await di.get('#ModuleResolver0.0'),
          );
        },
        async: true,
      },
      '#ResourceScanner0.0': {
        factory: async (di) => {
          const di3 = await import('../../definitions/di.js');
          return new di3.ResourceScanner(
            await di.get('#Project0.0'),
            await di.get('#EventDispatcher0.0'),
          );
        },
        async: true,
      },
      '#ServiceAnalyser0.0': {
        factory: async (di) => new di4.ServiceAnalyser(
          await di.get('#AutowiringFactory0.0'),
        ),
        async: true,
      },
      '#ServiceCompiler0.0': {
        factory: async (di) => {
          const di6 = await import('../../compiler/di.js');
          return new di6.ServiceCompiler(
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
          const di0 = await import('../../extensions/di.js');
          return new di0.ServicesExtension(
            await di.get('#TypeHelper0.0'),
          );
        },
        async: true,
      },
      '#TypeHelper0.0': {
        factory: async (di) => {
          const di1 = await import('../../utils/di.js');
          return new di1.TypeHelper(
            await di.get('#ReferenceResolverFactory0.0'),
          );
        },
        async: true,
      },
      '#WriterFactory0.0': {
        factory: async (di) => {
          const di6 = await import('../../compiler/di.js');
          return new di6.WriterFactory(
            await di.get('#Project0.0'),
          );
        },
        async: true,
      },
    });
  }
}
