import { Node, SourceFile } from 'ts-morph';
import { ContainerBuilder, ImportMode } from '../container';
import {
  AutoImplementationInfo,
  Callable,
  LocalServiceDefinition,
  PromiseType,
} from '../definitions';
import { getFirst, mapMap, mapSet } from '../utils';
import { ContainerCompiler } from './containerCompiler';
import { $args, $lazy, Lazy, LazyWriter } from './lazy';
import { ServiceCompiler } from './serviceCompiler';

export interface LocalServiceCompilerFactory {
  create(
    container: ContainerCompiler,
    builder: ContainerBuilder,
    definition: LocalServiceDefinition,
  ): LocalServiceCompiler;
}

export class LocalServiceCompiler extends ServiceCompiler<LocalServiceDefinition> {
  private readonly path: string;

  constructor(
    container: ContainerCompiler,
    builder: ContainerBuilder,
    definition: LocalServiceDefinition,
    private readonly externalArgs: Set<string> = new Set(),
  ) {
    super(container, builder, definition);

    this.path = this.container.resolveDefinitionPath(
      this.definition,
      this.definition.async ? ImportMode.None : ImportMode.Value,
    );
  }

  compile(): Lazy {
    const writer = new LazyWriter();

    writer.block(() => {
      writer.write($lazy`factory: ${this.compileFactory()},\n`);
      writer.conditionalWrite(() => this.definition.scope !== 'global', `scope: '${this.definition.scope}',`);
      writer.conditionalWrite(() => this.definition.async, 'async: true,');

      for (const hook of ['onCreate', 'onFork', 'onDestroy'] as const) {
        const stmt = this.compileHook(hook);
        stmt !== undefined && writer.writeLine(stmt);
      }
    });

    return writer;
  }

  private compileFactory(): Lazy {
    if (!this.definition.factory && !this.definition.autoImplement) {
      return 'undefined';
    }

    const async = this.definition.factory?.async ? 'async ' : '';
    const args = $args('di');

    return $lazy`${async}(${args.value}) => ${args.watch(() => this.compileFactoryBody())}`;
  }

  private compileFactoryBody(): Lazy {
    const call = this.compileCall(this.compileFactoryStatement(), this.compileArguments(
      this.definition.factory?.args ?? new Map(),
      this.compileOverrides(),
    ));

    const register = this.compileChildContainerInjections();
    const resources = new Set([this.definition.resource]);
    const decorate = this.compileDecorateHooks(resources);

    return () => {
      const import_ = this.compileDynamicImports(...resources);

      if (import_ === undefined && register === undefined && decorate === undefined) {
        return call;
      }

      const writer = new LazyWriter();
      writer.write('{');
      writer.indent(() => {
        if (import_ !== undefined) {
          writer.writeLine(import_);
        }

        if (register === undefined && decorate === undefined) {
          writer.write($lazy`return ${call};`);
          return;
        }

        const declaration = decorate !== undefined ? 'let' : 'const';
        const await_ = this.definition.factory?.async && this.definition.factory.method !== 'constructor'
          ? 'await '
          : '';
        writer.writeLine($lazy`${declaration} service = ${await_}${call};`);
        register !== undefined && writer.write(register);
        writer.write(decorate ?? 'return service;');
      });
      writer.write(`}`);
      return writer;
    };
  }

  private compileFactoryStatement(): Lazy {
    const method = this.definition.factory?.method;
    const new_ = method === 'constructor' ? 'new ' : '';
    const path = this.definition.isExplicit() && this.definition.object
      ? `${this.path}.factory`
      : method
        ? `${this.path}.${method}`
        : this.path;

    if (this.definition.autoImplement) {
      return $lazy`${new_}${this.compileAutoImplementedFactory(path, this.definition.autoImplement)}`;
    } else {
      return `${new_}${path}`;
    }
  }

  private compileAutoImplementedFactory(
    path: string,
    ai: AutoImplementationInfo,
  ): Lazy {
    const writer = new LazyWriter();
    const extend = Node.isClassDeclaration(this.definition.declaration);
    const [prefix, postfix, assign, comma] = extend
      ? [`class extends ${path} {`, '}', ' = ', ';']
      : ['({', '})', ': ', ','];

    writer.write(prefix);

    writer.indent(() => {
      const async = ai.method.async ? 'async ' : '';
      const args = new Set(ai.method.args.keys());
      const useServiceType = this.definition.isExplicit() || this.definition.factory?.method === 'constructor';
      const typeHint = extend
        ? useServiceType
          ? `: ServiceType<typeof ${path}>['${ai.method.name}']`
          : `: ${path}['${ai.method.name}']`
        : '';

      if (useServiceType) {
        this.builder.imports.useServiceType = true;
      }

      writer.write(`${async}${ai.method.name}${typeHint}${assign}(${[...args].join(', ')}) => `);

      if (ai.method.name === 'get') {
        $args.use('di');
        const id = $args.unwatch(() => this.container.resolveServiceInjection(ai.service.type));
        const need = ai.method.returnType.nullable ? ', false' : '';
        writer.write(`di.get('${id}'${need})${comma}`);
      } else {
        const compiler = new LocalServiceCompiler(
          this.container,
          this.builder,
          ai.service,
          args,
        );

        writer.write(compiler.compileFactoryBody());
      }

      writer.write(comma);
    });

    writer.write(postfix);

    return writer;
  }

  private compileOverrides(): Map<string, Lazy> {
    if (!this.definition.isExplicit()) {
      return new Map(mapSet(this.externalArgs, (n) => [n, n]));
    }

    return mapMap(this.definition.args, (name, value) => {
      if (this.externalArgs.has(name)) {
        return [name, name];
      }

      const arg = this.definition.factory?.args.get(name);
      const argPath = `${this.path}.args.${name}`;

      if (!(value instanceof Callable)) {
        return [name, argPath];
      }

      const isAsync = value.returnType instanceof PromiseType;
      const wantsAsync = arg?.type instanceof PromiseType;

      const source = this.ensureAsyncAwaited(
        this.compileCall(argPath, this.compileArguments(value.args)),
        isAsync,
        wantsAsync,
      );

      return [name, source];
    });
  }

  private compileChildContainerInjections(): Lazy | undefined {
    if (!this.definition.autoRegister?.size) {
      return undefined;
    }

    $args.use('di');

    const writer = new LazyWriter();

    for (const [foreignId, definition] of this.definition.autoRegister) {
      const [id, async] = $args.unwatch(() => this.container.resolveServiceInjection(definition.type));
      const get = this.ensureAsyncAwaited(`di.get('${id}')`, async, false);
      writer.writeLine($lazy`service.register('${foreignId}', ${get});`);
    }

    return writer;
  }

  private compileDecorateHooks(resources: Set<SourceFile>): Lazy | undefined {
    const [callables] = this.resolveHookCallables('decorate');

    if (!callables.length) {
      return undefined;
    }

    const writer = new LazyWriter();
    const overrides = new Map(['service'].entries());
    let idx = 0;

    for (const [callable, resource, path] of callables) {
      const await_ = callable.async ? 'await ' : '';
      const call = this.compileCall(`${path}.decorate`, this.compileArguments(callable.args, overrides));
      const stmt = ++idx >= callables.length ? 'return ' : `service = ${await_}`;
      writer.writeLine($lazy`${stmt}${call} ?? service;`);
      resources.add(resource);
    }

    return writer;
  }

  private compileHook(hook: 'onCreate' | 'onFork' | 'onDestroy'): Lazy | undefined {
    const [callables, async] = this.resolveHookCallables(hook);
    const isFork = hook === 'onFork';
    const isContainerFork = isFork && this.definition.container;

    if (!callables.length && !isContainerFork) {
      return undefined;
    }

    const writer = new LazyWriter();
    const args = isFork ? $args('callback', 'service', 'di') : $args('service', 'di');
    isFork && args.use('callback');

    writer.write($lazy`${hook}: ${async || isContainerFork ? 'async ' : ''}(${args.value}) => `);

    const body = callables.length
      ? args.watch(() => this.compileHookBody(hook, callables))
      : undefined;

    if (!isContainerFork) {
      writer.write($lazy`${body},`);
      return writer;
    }

    const callback = body ? $lazy`async () => ${body}` : 'callback';
    args.use('service');
    writer.write($lazy`service.run(${callback}),`);
    return writer;
  }

  private compileHookBody(
    hook: 'onCreate' | 'onFork' | 'onDestroy',
    callables: [callable: Callable, resource: SourceFile, path: string][],
  ): Lazy {
    const isFork = hook === 'onFork';
    const hasOwnForkHook = isFork && callables[0][2] === this.path;

    if (!hasOwnForkHook) {
      const writer = new LazyWriter();
      writer.write('{');
      writer.indent(() => {
        const resources = new Set(callables.map(([, resource]) => resource));
        writer.write(() => this.compileDynamicImports(...resources) ?? '');
        writer.write(this.compileHookCalls(hook, callables, new Map(['service'].entries())));
        isFork && writer.writeLine('return callback();');
      });
      writer.write('}');
      return writer;
    }

    const [ownForkHook] = callables.shift()!;
    const callback = callables.length ? this.compileServiceForkHookCallback(callables) : 'callback';
    const call = this.compileCall(`${this.path}.onFork`, this.compileArguments(
      ownForkHook.args,
      new Map([callback, 'service'].entries()),
    ));

    if (ownForkHook.args.size > 1) {
      $args.use('service');
    }

    return () => {
      const imports = this.compileDynamicImports(this.definition.resource);

      if (imports === undefined) {
        return call;
      }

      const writer = new LazyWriter();
      writer.write('{');
      writer.indent(() => {
        writer.writeLine(imports);
        writer.writeLine($lazy`return ${call};`);
      });
      writer.write('}');
      return writer;
    };
  }

  private compileServiceForkHookCallback(callables: [callable: Callable, resource: SourceFile, path: string][]): Lazy {
    const overrides = new Map(['fork ?? service'].entries());
    const writer = new LazyWriter();
    writer.write('async (fork) => {');
    writer.indent(() => {
      const resources = new Set(callables.map(([, resource]) => resource));
      writer.write(() => this.compileDynamicImports(...resources) ?? '');
      writer.write(this.compileHookCalls('onFork', callables, overrides));
      writer.writeLine('return callback();');
    });
    writer.write('}');
    return writer;
  }

  private compileHookCalls(
    hook: string,
    callables: [callable: Callable, resource: SourceFile, path: string][],
    overrides: Map<string | number, string>,
  ): Lazy {
    const writer = new LazyWriter();

    for (const [callable, /*resource*/, path] of callables) {
      if (callable.args.size) {
        $args.use('service');
      }

      const await_ = callable.async ? `await ` : '';
      const call = this.compileCall(`${path}.${hook}`, this.compileArguments(
        callable.args,
        overrides,
      ));

      writer.writeLine($lazy`${await_}${call};`);
    }

    return writer;
  }

  private resolveHookCallables(
    hook: 'decorate' | 'onCreate' | 'onFork' | 'onDestroy',
  ): [callables: [callable: Callable, resource: SourceFile, path: string][], async: boolean] {
    const callables: [callable: Callable, resource: SourceFile, path: string][] = [];
    let async: boolean = false;

    if (hook !== 'decorate' && this.definition.isExplicit() && this.definition[hook]) {
      callables.push([this.definition[hook], this.definition.resource, this.path]);
      this.definition[hook].async && (async = true);
    }

    for (const decorator of this.definition.decorators ?? []) {
      if (decorator[hook]) {
        const importMode = this.builder.lazyImports && this.definition.async
          ? ImportMode.None
          : ImportMode.Value;

        callables.push([
          decorator[hook],
          decorator.resource,
          this.container.resolveDefinitionPath(decorator, importMode),
        ]);

        decorator[hook].async && (async = true);
      }
    }

    return [callables, async];
  }

  private compileDynamicImports(...resources: SourceFile[]): Lazy | undefined {
    if (!this.builder.lazyImports) {
      return undefined;
    }

    const imports = resources
      .map((resource) => this.builder.imports.getInfo(this.builder, resource));

    if (!imports.length) {
      return undefined;
    } else if (imports.length === 1) {
      const info = getFirst(imports);
      return `const ${info.alias} = await import('${info.dynamicSpecifier}');`;
    }

    const writer = new LazyWriter();
    const aliases = imports.map((info) => info.alias);

    writer.write(`const [${aliases.join(', ')}] = await Promise.all([`);
    writer.indent(() => {
      for (const info of imports) {
        writer.writeLine(`import('${info.dynamicSpecifier}'),`);
      }
    });
    writer.write(']);');

    return writer;
  }
}
