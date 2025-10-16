import { Logger } from '@debugr/core';
import { dirname, resolve } from 'path';
import { CompilerConfig } from '../config';
import { ExtensionError } from '../errors';
import { EventDispatcher } from '../events';
import { ModuleResolver, ReferenceResolverFactory, TypeHelper } from '../utils';
import { CompilerExtension } from './compilerExtension';
import {
  CompilerExtensionConstructor,
  CompilerExtensionInjectSpecifier as InjectSpec,
  CompilerExtensionReferences,
} from './types';

export class ExtensionLoader {
  private tsNodeRegistered: boolean = false;

  constructor(
    private readonly eventDispatcher: EventDispatcher,
    private readonly getModuleResolver: () => Promise<ModuleResolver>,
    private readonly getTypeHelper: () => Promise<TypeHelper>,
    private readonly referenceResolverFactory: ReferenceResolverFactory,
    private readonly logger: Logger,
    private readonly config: CompilerConfig,
  ) {}

  async *load(): AsyncIterable<CompilerExtension> {
    for (const [id, config] of Object.entries(this.config.extensions)) {
      const [path, constructor] = await this.resolveExtension(id, this.config.configFile);

      const extension = new constructor(
        ...(await this.resolveInjections(
          id,
          path,
          constructor.inject ?? [],
          constructor.references,
        )),
        constructor.configSchema ? await constructor.configSchema.parseAsync(config) : config,
      );

      this.eventDispatcher.addSubscriber(extension);

      yield extension;
    }
  }

  private async resolveInjections(
    extensionId: string,
    extensionPath: string,
    services: InjectSpec[],
    references?: CompilerExtensionReferences,
  ): Promise<any[]> {
    const args: any[] = [];

    for (const specifier of services) {
      switch (specifier) {
        case InjectSpec.EventDispatcher:
          args.push(this.eventDispatcher);
          break;
        case InjectSpec.ModuleResolver:
          args.push(await this.getModuleResolver());
          break;
        case InjectSpec.TypeHelper:
          args.push(await this.getTypeHelper());
          break;
        case InjectSpec.Logger:
          args.push(this.logger);
          break;
        case InjectSpec.ReferenceResolver:
          if (!references) {
            throw new ExtensionError(
              `Extension requires injection of reference resolver but doesn't specify a reference module`,
              extensionId,
            );
          }

          args.push(
            this.referenceResolverFactory.create(references.module, references.map, extensionPath),
          );
          break;
        default:
          throw new ExtensionError(
            `Unknown injection specifier '${specifier}' in extension`,
            extensionId,
          );
      }
    }

    return args;
  }

  private async resolveExtension(
    extension: string,
    configPath: string,
  ): Promise<[path: string, constructor: CompilerExtensionConstructor]> {
    const [specifier, name = 'default'] = extension.split(/#/);
    const [path, module] = await this.importExtension(extension, specifier, configPath);

    if (!(name in module)) {
      if (typeof module === 'function') {
        return [path, module];
      }

      const hint = name === 'default' ? 'default export' : `export named '${name}'`;
      throw new ExtensionError(
        `Unable to import extension '${specifier}': module has no ${hint}`,
        extension,
      );
    } else if (typeof module[name] !== 'function') {
      throw new ExtensionError(
        `Unable to import extension '${specifier}': '${name}' is not a function`,
        extension,
      );
    }

    return [path, module[name]];
  }

  private async importExtension(
    extension: string,
    specifier: string,
    configPath: string,
  ): Promise<[path: string, module: any]> {
    try {
      if (specifier.startsWith('.')) {
        const path = resolve(dirname(configPath), specifier);
        return [path, await this.importModule(extension, path)];
      } else {
        return [require.resolve(specifier), await this.importModule(extension, specifier)];
      }
    } catch (e: any) {
      throw new ExtensionError(
        `Unable to import extension '${specifier}': ${e.message}`,
        extension,
      );
    }
  }

  private async importModule(extension: string, specifier: string): Promise<any> {
    if (/\.ts$/i.test(specifier)) {
      await this.ensureTsNodeRegistered(extension);
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require(specifier);
    }

    return import(specifier);
  }

  private async ensureTsNodeRegistered(extension: string): Promise<void> {
    if (this.tsNodeRegistered) {
      return;
    }

    this.tsNodeRegistered = true;

    try {
      const tsNode = await import('ts-node');

      tsNode.register({
        transpileOnly: true,
        logError: true,
      });
    } catch {
      throw new ExtensionError('Cannot load ts-node, is it installed?', extension);
    }
  }
}
