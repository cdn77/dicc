import { ServiceScope } from 'dicc';
import { CodeBlockWriter, SourceFile, Type } from 'ts-morph';
import { ContainerBuilder } from './containerBuilder';
import {
  ArgumentInfo,
  ArgumentOverrideMap,
  AutoFactoryTarget,
  CallbackInfo,
  ContainerParametersInfo,
  ServiceDecoratorInfo,
  ServiceDefinitionInfo,
  TypeFlag,
} from './types';

export class Compiler {
  constructor(
    private readonly builder: ContainerBuilder,
  ) {}

  compile(): void {
    const definitions = [...this.builder.getDefinitions()].sort(
      (a, b) => compareIDs(a.parent ?? '', b.parent ?? '') || compareIDs(a.id, b.id),
    );
    const sources = extractSources(definitions, this.builder.getParametersInfo());

    this.builder.output.replaceWithText('');

    this.writeHeader(sources);
    this.writeMap(definitions, sources);
    this.writeDefinitions(definitions, sources);

    if (this.builder.options.preamble !== undefined) {
      this.builder.output.insertText(0, this.builder.options.preamble.replace(/\s*$/, '\n\n'));
    }
  }

  private writeHeader(sources: Map<SourceFile, string>): void {
    const imports = [...sources].map(([source, name]) => [
      name,
      this.builder.output.getRelativePathAsModuleSpecifierTo(source),
    ]);

    this.builder.output.addImportDeclaration({
      moduleSpecifier: 'dicc',
      namedImports: [
        { name: 'Container' },
      ],
    });

    for (const [namespaceImport, moduleSpecifier] of imports) {
      this.builder.output.addImportDeclaration({ moduleSpecifier, namespaceImport });
    }
  }

  private writeMap(definitions: ServiceDefinitionInfo[], sources: Map<SourceFile, string>): void {
    this.builder.output.addStatements((writer) => {
      const aliasMap: Map<string, Set<string>> = new Map();
      let useForeignServiceType = false;
      let useServiceType = false;

      writer.writeLine(`\ninterface Services {`);

      writer.indent(() => {
        for (const { source, id, path, type, aliases, factory, async, explicit, parent } of definitions) {
          const method = !explicit && factory?.method !== 'constructor' && factory?.method;
          const fullPath = join('.', sources.get(source), path, method);
          const serviceType = !explicit && !method && !path.includes('.')
            ? fullPath
            : `ServiceType<typeof ${fullPath}>`;
          const fullType = parent
            ? maybeAsync(`ForeignServiceType<${serviceType}, '${id}'>`, async && !factory?.async)
            : maybeAsync(serviceType, async);

          if (!id.startsWith('#')) {
            writer.writeLine(`'${parent ? `${parent}.` : ''}${id}': ${fullType};`);
          }

          for (const typeAlias of [type, ...aliases]) {
            const alias = this.builder.getTypeId(typeAlias);

            if (alias !== undefined) {
              aliasMap.has(alias) || aliasMap.set(alias, new Set());
              aliasMap.get(alias)!.add(fullType);
            }
          }

          if (parent) {
            useForeignServiceType = true;
          } else if (serviceType !== fullPath) {
            useServiceType = true;
          }
        }

        for (const [alias, ids] of [...aliasMap].sort((a, b) => compareIDs(a[0], b[0]))) {
          if (ids.size > 1) {
            writer.writeLine(`'${alias}':`);
            writer.indent(() => {
              let n = ids.size;

              for (const id of ids) {
                writer.writeLine(`| ${id}${--n ? '' : ';'}`);
              }
            });
          } else {
            writer.writeLine(`'${alias}': ${[...ids].join('')};`);
          }
        }
      });

      writer.writeLine('}');

      if (useForeignServiceType) {
        this.builder.output.getImportDeclarationOrThrow('dicc').addNamedImport('ForeignServiceType');
      }

      if (useServiceType) {
        this.builder.output.getImportDeclarationOrThrow('dicc').addNamedImport('ServiceType');
      }
    });
  }

  private writeDefinitions(
    definitions: ServiceDefinitionInfo[],
    sources: Map<SourceFile, string>,
  ): void {
    this.builder.output.addStatements((writer) => {
      const declaration = this.builder.options.className === 'default'
        ? 'default class'
        : `class ${this.builder.options.className}`;
      const [paramType, ctorArgs, superArgs] = this.compileContainerParameters(sources);

      writer.writeLine(`\nexport ${declaration} extends Container<Services${paramType}>{`);

      writer.indent(() => {
        writer.writeLine(`constructor(${ctorArgs}) {`);
        writer.indent(() => {
          writer.writeLine(`super(${superArgs}, {`);
          writer.indent(() => {
            for (const definition of definitions) {
              this.compileDefinition(writer, definition, sources);
            }
          });
          writer.writeLine('});');
        });
        writer.writeLine('}');
      });

      writer.writeLine('}\n');
    });
  }

  private compileContainerParameters(sources: Map<SourceFile, string>): [type: string, ctorArgs: string, superArgs: string] {
    const info = this.builder.getParametersInfo();

    if (!info) {
      return ['', '', '{}'];
    }

    const type = join('.', sources.get(info.source), info.path);

    return [
      `, ${type}`,
      `parameters: ${type}`,
      'parameters',
    ];
  }

  private compileDefinition(
    writer: CodeBlockWriter,
    { source, id, path, type, factory, args, scope = 'global', async, container, parent, object, creates, hooks, aliases, decorators }: ServiceDefinitionInfo,
    sources: Map<SourceFile, string>,
  ): void {
    const decoratorMap = getDecoratorMap(decorators, sources);
    const src = sources.get(source)!;
    writer.writeLine(`'${parent ? `${parent}.` : ''}${id}': {`);

    writer.indent(() => {
      !parent && object && writer.writeLine(`...${src}.${path},`);

      const types = [!/^#/.test(id) ? type : undefined, ...aliases]
        .filter((v): v is Type => v !== undefined)
        .map((t) => `'${this.builder.getTypeId(t)}'`);

      writer.conditionalWriteLine(types.length > 0, `aliases: [${types.join(`, `)}],`);
      writer.conditionalWriteLine(async, `async: true,`);
      writer.conditionalWriteLine(container, `container: true,`);

      if (parent) {
        writer.writeLine(`scope: 'private',`);
      } else if (decoratorMap.scope && decoratorMap.scope !== scope) {
        writer.writeLine(`scope: '${decoratorMap.scope}',`);
      }

      if (factory) {
        if (parent) {
          this.compileForeignFactory(writer, parent, id, async);
        } else if (!object && factory.method !== 'constructor' && !factory.args.length && !decoratorMap.decorate.length) {
          writer.writeLine(`factory: ${join('.', src, path, factory.method)},`);
        } else if (!object || factory.method === 'constructor' || factory.args.length || decoratorMap.decorate.length) {
          this.compileFactory(
            writer,
            src,
            path,
            factory.async,
            factory.method,
            object,
            factory.returnType.isNullable(),
            factory.args,
            args,
            decoratorMap.decorate,
          );
        }
        // else definition is an object with a factory function with zero arguments and no decorators,
        // so it is already included in the compiled definition courtesy of object spread
      } else if (creates) {
        this.compileAutoFactory(writer, src, path, creates, sources);
      } else {
        writer.writeLine(`factory: undefined,`);
      }

      for (const hook of ['onCreate', 'onFork', 'onDestroy'] as const) {
        const info = hooks[hook];

        if (info?.args.length || decoratorMap[hook].length) {
          this.compileHook(writer, src, path, hook, info, decoratorMap[hook]);
        }
      }
    });

    writer.writeLine('},');
  }

  private compileForeignFactory(
    writer: CodeBlockWriter,
    parent: string,
    id: string,
    async?: boolean,
  ): void {
    const parentIsAsync = this.builder.get(parent).async;

    writer.write(`factory: `);
    writer.conditionalWrite(async || parentIsAsync, 'async ');

    if (!parentIsAsync) {
      writer.write(`(di) => di.get('${parent}').get('${id}'),\n`);
    } else {
      writer.write('(di) => {\n');
      writer.indent(() => {
        writer.writeLine(`const src = await di.get('${parent}');`);
        writer.writeLine(`return src.get('${id}');`);
      });
      writer.write('},\n');
    }
  }

  private compileFactory(
    writer: CodeBlockWriter,
    source: string,
    path: string,
    async: boolean | undefined,
    method: string | undefined,
    object: boolean | undefined,
    optional: boolean,
    args: ArgumentInfo[],
    argOverrides: ArgumentOverrideMap | undefined,
    decorators: DecoratorInfo[],
  ): void {
    const argValues = this.compileArguments(args, argOverrides && this.compileOverrides(writer, source, path, argOverrides));
    const decArgValues = decorators.map(([,, info]) => this.compileArguments(info.args));
    const inject = argValues.length > 0 || decArgValues.some((p) => p.length > 0);

    writer.write(`factory: `);
    writer.conditionalWrite(async, 'async ');
    writer.write(inject ? '(di) => ' : '() => ');

    const writeFactoryCall = () => {
      this.compileCall(
        writer,
        join(
          ' ',
          method === 'constructor' && 'new',
          async && decorators.length && 'await',
          join('.', source, path, object && 'factory', method !== 'constructor' && method),
        ),
        argValues,
      );
    };

    if (!decorators.length) {
      writeFactoryCall();
      writer.write(',\n');
      return;
    }

    writer.write(`{\n`);

    writer.indent(() => {
      writer.write(`${decorators.length > 1 ? 'let' : 'const'} service = `);
      writeFactoryCall();
      writer.write(';\n');

      if (optional) {
        writer.write('\nif (service === undefined) {');
        writer.indent(() => writer.writeLine('return undefined;'));
        writer.write('}\n');
      }

      for (const [i, [source, path, info]] of decorators.entries()) {
        const last = i + 1 >= decorators.length;
        writer.conditionalWrite(optional || (i > 0 ? decArgValues[i - 1] : argValues).length > 0 || decArgValues[i].length > 0, '\n');
        writer.write(last ? 'return ' : 'service = ');
        this.compileCall(writer, join(' ', info.async && !last && 'await', join('.', source, path, 'decorate')), ['service', ...decArgValues[i]]);
        writer.write(';\n');
      }
    });

    writer.write('},\n');
  }

  private compileAutoFactory(
    writer: CodeBlockWriter,
    source: string,
    path: string,
    creates: AutoFactoryTarget,
    sources: Map<SourceFile, string>,
  ): void {
    const args = this.compileArguments(creates.factory.args, {
      ...(creates.args ? this.compileOverrides(writer, source, path, creates.args) : {}),
      ...Object.fromEntries(creates.manualArgs.map((p) => [p, p])),
    });

    const inject = args.length > 0;

    const writeFactory = () => {
      writer.conditionalWrite(creates.async, 'async ');
      writer.write(`(${creates.manualArgs.join(', ')}) => `);

      this.compileCall(
        writer,
        join(
          ' ',
          creates.factory.method === 'constructor' && 'new',
          join('.', sources.get(creates.source), creates.path, creates.object && 'factory', creates.factory.method !== 'constructor' && creates.factory.method),
        ),
        args,
      );
    };

    writer.write(`factory: `);
    writer.write(inject ? '(di) => ' : '() => ');

    if (creates.method) {
      writer.write('({\n');
      writer.indent(() => {
        writer.write(`${creates.method}: `);
        writeFactory();
        writer.write(',\n');
      });
      writer.write('})');
    } else {
      writeFactory();
    }

    writer.write(',\n');
  }

  private compileHook(
    writer: CodeBlockWriter,
    source: string,
    path: string,
    hook: string,
    info: CallbackInfo | undefined,
    decorators: DecoratorInfo[],
  ): void {
    const args = ['service', ...this.compileArguments(info?.args ?? [])];
    const decoratorArgs = decorators.map(([,, info]) => this.compileArguments(info.args));
    const inject = args.length > 1 || decoratorArgs.some((p) => p.length > 0);
    const async = info?.async || decorators.some(([,, info]) => info.async);

    writer.write(`${hook}: `);
    writer.conditionalWrite(async, 'async ');
    writer.write(`(`);
    writer.conditionalWrite(hook === 'onFork', 'callback, ');
    writer.write(`service`);
    writer.conditionalWrite(inject, ', di');
    writer.write(') => ');

    if (!decorators.length) {
      this.compileCall(writer, join('.', source, path, hook), hook === 'onFork' ? ['callback', ...args] : args);
      writer.write(',\n');
      return;
    }

    writer.write('{\n');

    writer.indent(() => {
      if (info) {
        if (hook === 'onFork') {
          const tmp = new CodeBlockWriter(writer.getOptions());
          tmp.write('async (fork) => {\n');
          tmp.indent(() => {
            this.compileDecoratorCalls(tmp, decorators, 'fork ?? service', hook, decoratorArgs);
            tmp.write('return callback(fork);\n');
          });
          tmp.write('}');
          args.unshift(tmp.toString());
        }

        this.compileCall(writer, join(' ', hook === 'onFork' ? 'return' : info.async && 'await', join('.', source, path, hook)), args);
        writer.write(';\n');
      }

      if (!info || hook !== 'onFork') {
        writer.conditionalWrite(args.length > 1 || decoratorArgs[0].length > 0, '\n');
        this.compileDecoratorCalls(writer, decorators, 'service', hook, decoratorArgs);
      }

      if (!info && hook === 'onFork') {
        writer.write('return callback();\n');
      }
    });

    writer.write('},\n');
  }

  private compileDecoratorCalls(writer: CodeBlockWriter, decorators: DecoratorInfo[], service: string, hook: string, decoratorArgs: string[][]): void {
    for (const [i, [source, path, info]] of decorators.entries()) {
      writer.conditionalWrite(i > 0 && (decoratorArgs[i - 1].length > 0 || decoratorArgs[i].length > 0), '\n');
      this.compileCall(writer, join(' ', info.async && 'await', join('.', source, path, hook)), [service, ...decoratorArgs[i]]);
      writer.write(';\n');
    }
  }

  private compileCall(writer: CodeBlockWriter, expression: string, args: string[]): void {
    writer.write(expression);
    writer.write('(');

    if (args.length > 1) {
      writer.indent(() => {
        for (const arg of args) {
          writer.writeLine(`${arg},`);
        }
      });
    } else if (args.length) {
      writer.write(args[0]);
    }

    writer.write(')');
  }

  private compileOverrides(writer: CodeBlockWriter, source: string, path: string, overrides: ArgumentOverrideMap): Record<string, string> {
    return Object.fromEntries(Object.entries(overrides).map(([name, info]) => {
      switch (typeof info) {
        case 'object': {
          const args = this.compileArguments(info.args);
          const tmp = new CodeBlockWriter(writer.getOptions());
          this.compileCall(tmp, join(' ', info.async && 'await', join('.', source, path, 'args', name)), args)
          return [name, tmp.toString()];
        }
        case 'string': {
          const [method, arg] = /^%[a-z0-9_.]+$/i.test(info)
            ? ['resolveParameter', info.slice(1, -1)]
            : ['expand', info];
          return [name, `di.${method}('${arg}')`];
        }
        default:
          return [name, join('.', source, path, 'args', name)];
      }
    }));
  }

  private compileArguments(args: ArgumentInfo[], overrides?: Record<string, string>): string[] {
    const stmts: string[] = [];
    const undefs: string[] = [];

    for (const arg of args) {
      const stmt = overrides && arg.name in overrides ? overrides[arg.name] : this.compileArgument(arg);

      if (stmt === undefined) {
        undefs.push(`undefined`);
      } else {
        stmts.push(...undefs.splice(0, undefs.length), stmt);
      }
    }

    return stmts;
  }

  private compileArgument(arg: ArgumentInfo): string | undefined {
    if (arg.flags & TypeFlag.Container) {
      return 'di';
    } else if (!arg.type) {
      return undefined;
    }

    const id = this.builder.getTypeId(arg.type);

    if (id !== undefined) {
      return this.compileServiceInjection(arg.type, arg.flags, id);
    }

    const parameters = this.builder.getParametersByType(arg.type);

    if (!parameters) {
      return undefined;
    }

    if ('nestedTypes' in parameters) {
      return 'di.getParameters()';
    }

    const optional = arg.flags & TypeFlag.Optional ? `, false` : '';
    return `di.resolveParameter('${parameters.path}'${optional})`;
  }

  private compileServiceInjection(type: Type, flags: TypeFlag, id: string): string {
    if (flags & TypeFlag.Injector) {
      return `(service) => di.register('${id}', service)`;
    }

    const wantsPromise = Boolean(flags & TypeFlag.Async);
    const wantsArray = Boolean(flags & TypeFlag.Array);
    const wantsAccessor = Boolean(flags & TypeFlag.Accessor);
    const wantsIterable = Boolean(flags & TypeFlag.Iterable);
    const isOptional = Boolean(flags & TypeFlag.Optional);
    const valueIsAsync = this.builder.isAsync(type);
    let method: string = wantsArray ? 'find' : 'get';
    let prefix: string = '';
    let need: string = '';
    let postfix: string = '';

    if (!wantsArray && !wantsIterable && isOptional) {
      need = ', false';
    }

    if (wantsAccessor) {
      prefix = `${wantsPromise ? 'async ' : ''}() => `;
    } else if (wantsIterable) {
      method = 'iterate';
    } else if (!wantsPromise && valueIsAsync) {
      prefix = 'await ';
    } else if (wantsPromise && !valueIsAsync && !wantsArray) {
      prefix = 'Promise.resolve().then(() => ';
      postfix = ')';
    }

    return `${prefix}di.${method}('${id}'${need})${postfix}`;
  }
}

type DecoratorInfo = [source: string, path: string, info: CallbackInfo];

type DecoratorMap = {
  scope?: ServiceScope;
  decorate: DecoratorInfo[];
  onCreate: DecoratorInfo[];
  onFork: DecoratorInfo[];
  onDestroy: DecoratorInfo[];
};

function getDecoratorMap(decorators: ServiceDecoratorInfo[], sources: Map<SourceFile, string>): DecoratorMap {
  const map: DecoratorMap = {
    decorate: [],
    onCreate: [],
    onFork: [],
    onDestroy: [],
  };

  for (const decorator of decorators) {
    const source = sources.get(decorator.source)!;
    decorator.scope && (map.scope = decorator.scope);
    decorator.decorate && map.decorate.push([source, decorator.path, decorator.decorate]);
    decorator.hooks.onCreate && map.onCreate.push([source, decorator.path, decorator.hooks.onCreate]);
    decorator.hooks.onFork && map.onFork.push([source, decorator.path, decorator.hooks.onFork]);
    decorator.hooks.onDestroy && map.onDestroy.push([source, decorator.path, decorator.hooks.onDestroy]);
  }

  return map;
}

function compareIDs(a: string, b: string): number {
  return (a.indexOf('#') - b.indexOf('#')) || a.localeCompare(b, 'en', { sensitivity: 'base', numeric: true });
}

function extractSources(definitions: ServiceDefinitionInfo[], parameters?: ContainerParametersInfo): Map<SourceFile, string> {
  const sources = new Set(
    definitions
      .flatMap((d) => [d.source, ...d.decorators.map((o) => o.source), d.creates?.source])
      .filter((s): s is SourceFile => s !== undefined)
  );

  if (parameters) {
    sources.add(parameters.source);
  }

  const list = [...sources].sort(compareSourceFiles);
  const aliases: Record<string, number> = {};
  return new Map(list.map((s) => [s, extractSourceAlias(s, aliases)]));
}

function compareSourceFiles(a: SourceFile, b: SourceFile): number {
  const pa = a.getFilePath();
  const pb = b.getFilePath();
  return pa < pb ? -1 : pa > pb ? 1 : 0;
}

function extractSourceAlias(source: SourceFile, map: Record<string, number>): string {
  const alias = source.getFilePath()
    .replace(/^(?:.*\/)?([^\/]+)(?:\/index)?(?:\.d)?\.tsx?$/i, '$1')
    .replace(/[^a-z0-9]+/gi, '')
    || 'anon';
  map[alias] ??= 0;
  const idx = map[alias]++;
  return `${alias}${idx}`;
}

function join(separator: string, ...tokens: (string | 0 | false | undefined)[]): string {
  return tokens.filter((t) => typeof t === 'string').join(separator);
}

function maybeAsync(type: string, async?: boolean): string {
  return async
    ? `Promise<${type}>`
    : type;
}
