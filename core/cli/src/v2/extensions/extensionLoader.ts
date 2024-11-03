import { dirname, resolve } from 'path';
import { ConfigError, ExtensionError } from '../errors';
import { EventDispatcher } from '../events';
import { ModuleResolver, ReferenceResolverFactory, TypeHelper } from '../utils';
import { CompilerExtension } from './compilerExtension';
import {
  CompilerExtensionConstructor,
  CompilerExtensionInjectSpecifier,
  CompilerExtensionReferences,
} from './types';

export class ExtensionLoader {
  constructor(
    private readonly eventDispatcher: EventDispatcher,
    private readonly getModuleResolver: () => Promise<ModuleResolver>,
    private readonly getTypeHelper: () => Promise<TypeHelper>,
    private readonly referenceResolverFactory: ReferenceResolverFactory,
  ) {}

  async * load(extensions: Record<string, any>, configPath: string): AsyncIterable<CompilerExtension> {
    for (const [id, config] of Object.entries(extensions)) {
      const [path, constructor] = await this.resolveExtension(id, configPath);

      const extension = new constructor(
        ...await this.resolveInjections(id, path, constructor.inject ?? [], constructor.references),
        constructor.configSchema ? await constructor.configSchema.parseAsync(config) : config,
      );

      this.eventDispatcher.addSubscriber(extension);

      yield extension;
    }
  }

  private async resolveInjections(
    extensionId: string,
    extensionPath: string,
    services: CompilerExtensionInjectSpecifier[],
    references?: CompilerExtensionReferences,
  ): Promise<any[]> {
    const args: any[] = [];

    for (const specifier of services) {
      switch (specifier) {
        case 'eventDispatcher': args.push(this.eventDispatcher); break;
        case 'moduleResolver': args.push(await this.getModuleResolver()); break;
        case 'typeHelper': args.push(await this.getTypeHelper()); break;
        case 'referenceResolver':
          if (!references) {
            throw new ExtensionError(`Extension requires injection of reference resolver but doesn't specify a reference module`, extensionId);
          }

          args.push(this.referenceResolverFactory.create(references.module, references.map, extensionPath));
          break;
        default: throw new ExtensionError(`Unknown injection specifier '${specifier}' in extension`, extensionId);
      }
    }

    return args;
  }

  private async resolveExtension(extension: string, configPath: string): Promise<[path: string, constructor: CompilerExtensionConstructor]> {
    const [specifier, name = 'default'] = extension.split(/#/);
    const [path, module] = await this.importExtension(specifier, configPath);

    if (!(name in module)) {
      if (typeof module === 'function') {
        return [path, module];
      }

      const hint = name === 'default' ? 'default export' : `export named '${name}'`;
      throw new ConfigError(`Unable to import extension '${specifier}': module has no ${hint}`);
    } else if (typeof module[name] !== 'function') {
      throw new ConfigError(`Unable to import extension '${specifier}': '${name}' is not a function`);
    }

    return [path, module[name]];
  }

  private async importExtension(specifier: string, configPath: string): Promise<[path: string, module: any]> {
    try {
      if (specifier.startsWith('.')) {
        const path = resolve(dirname(configPath), specifier);
        return [path, await import(path)];
      } else {
        return [require.resolve(specifier), await import(specifier)];
      }
    } catch (e: any) {
      throw new ConfigError(`Unable to import extension '${specifier}': ${e.message}`, configPath);
    }
  }
}
