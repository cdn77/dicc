import {
  Argument,
  ArgumentList,
  AsyncMode,
  AutoImplement,
  Call, ChildServiceRegistrations,
  Factory, ForkHookInfo,
  HookInfo,
  InjectedArgument,
  OverriddenArgument,
  Resource,
  Service,
} from '../analysis';
import { InternalError } from '../errors';
import { getFirst, mapMap } from '../utils';
import { compareServiceIds, formatType } from './utils';
import { WriterFactory } from './writerFactory';

export class ServiceCompiler {
  constructor(
    private readonly writerFactory: WriterFactory,
  ) {}

  compileDefinitions(services: Iterable<Service>, resources: Map<string, Resource>): string {
    const writer = this.writerFactory.create();
    const orderedServices = [...services].sort(compareServiceIds);

    writer.write('{');
    writer.indent(() => {
      for (const service of orderedServices) {
        writer.write(`'${service.id}': {`);
        writer.indent(() => {
          writer.write(this.compileDefinition(service, resources));
        });
        writer.write('},\n');
      }
    });
    writer.write('}');

    return writer.toString();
  }

  private compileDefinition(service: Service, resources: Map<string, Resource>): string {
    const writer = this.writerFactory.create();
    writer.conditionalWrite(service.aliases.size > 0, `aliases: ${this.compileAliases(service)},\n`);
    writer.write(`factory: ${this.compileFactory(service, resources)},\n`);
    writer.conditionalWrite(service.async, `async: true,\n`);

    if (service.factory?.kind === 'foreign') {
      writer.write(`scope: 'private',\n`);
    } else {
      writer.conditionalWrite(service.scope !== 'global', `scope: '${service.scope}',\n`);
    }

    const forceAsyncOnCreate = doesOnCreateNeedForcedAsync(service, resources);
    writer.write(this.compileHook('onCreate', service.onCreate, resources, forceAsyncOnCreate));
    writer.write(this.compileForkHook(service.onFork, resources));
    writer.write(this.compileHook('onDestroy', service.onDestroy, resources));

    return writer.toString();
  }

  private compileAliases(service: Service): string {
    if (service.aliases.size === 1) {
      return `['${getFirst(service.aliases)}']`;
    }

    const writer = this.writerFactory.create();
    writer.write('[');
    writer.indent(() => {
      for (const alias of service.aliases) {
        writer.write(`'${alias}',\n`);
      }
    });
    writer.write(']');
    return writer.toString();
  }

  private compileFactory(
    service: Service,
    resources: Map<string, Resource>,
    scope: Set<string> = new Set(),
  ): string {
    if (!service.factory) {
      return 'undefined';
    }

    const [async, inject] = resolveFactorySignature(service);
    const body = this.compileFactoryBody(service, service.factory, resources, scope);
    return `${async ? 'async ' : ''}(${inject ? 'di' : ''}) => ${body}`;
  }

  private compileFactoryBody(
    service: Service,
    factory: Factory | AutoImplement,
    resources: Map<string, Resource>,
    parentScope: Set<string>,
  ): string {
    const [imports, scope] = this.compileDynamicImports(
      resources,
      parentScope,
      factory.kind !== 'foreign' && factory.kind !== 'auto-interface' && factory.call,
      ...service.decorate?.calls ?? [],
      ...this.getAutoFactoryCallsIfEager(service),
    );

    const eagerArgs = factory.kind === 'auto-class' || factory.kind === 'auto-interface'
      ? this.compileEagerAsyncArgs(factory)
      : '';

    const register = this.compileChildServiceRegistrations(service.register);

    const decorate = service.decorate
      ? this.compileCalls(
        service.decorate.calls,
        (stmt, call, i, n) => i + 1 < n ? `service = ${awaitKw(call)}${stmt}` : `return ${stmt}`,
      )
      : register ? 'return service;' : '';
    const multipleDecorate = (service.decorate?.calls.length ?? 0) > 1;

    const needsBlock =
      !!imports
      || !!eagerArgs
      || !!register
      || !!decorate
      || (factory.kind === 'foreign' && factory.container.async);

    const createService = this.compileCreateService(
      service,
      factory,
      resources,
      scope,
      multipleDecorate ? 'let'
        : (decorate || register) ? 'const'
          : needsBlock ? 'return'
            : 'inline',
    );

    if (!needsBlock) {
      return createService;
    }

    const writer = this.writerFactory.create();
    writer.write(`{`);
    writer.indent(() => {
      writer.write(imports);
      writer.write(eagerArgs);
      writer.write(createService);
      writer.write(register);
      writer.write(decorate);
    });
    writer.write('}');
    return writer.toString();
  }

  private compileCreateService(
    service: Service,
    factory: Factory | AutoImplement,
    resources: Map<string, Resource>,
    scope: Set<string>,
    mode: 'const' | 'let' | 'return' | 'inline',
  ): string {
    if (factory.kind === 'local') {
      const call = this.compileCall(factory.call);
      return this.compileCreateServiceStmt(factory.call, call, mode);
    } else if (factory.kind === 'auto-class') {
      const body = this.compileAutoImplement(service, factory, resources, scope);
      const args = factory.call.args.length ? this.compileArgs(factory.call.args) : '';
      const stmt = `${factory.call.statement} ${body}${args}`;
      return this.compileCreateServiceStmt(factory.call, stmt, mode);
    } else if (factory.kind === 'auto-interface') {
      const [pre, post] = mode === 'inline' ? ['(', ')'] : ['', ''];
      const body = `${pre}${this.compileAutoImplement(service, factory, resources, scope)}${post}`;
      return this.compileCreateServiceStmt({ async: false }, body, mode);
    }

    const writer = this.writerFactory.create();

    if (factory.container.async) {
      writer.write(`const parent = await di.get('${factory.container.id}');\n`);
      writer.write(
        mode === 'const' || mode === 'let'
          ? `${mode} service = ${awaitKw(factory)}parent.get('${factory.id}');\n`
          : `return parent.get('${factory.id}');`,
      );
    } else {
      const get = `di.get('${factory.container.id}').get('${factory.id}')`;
      writer.write(this.compileCreateServiceStmt(factory, get, mode));
    }

    return writer.toString();
  }

  private compileCreateServiceStmt<Call extends { async: boolean }>(
    call: Call,
    expr: string,
    mode: 'const' | 'let' | 'return' | 'inline',
  ): string {
    switch (mode) {
      case 'const':
      case 'let':
        return `${mode} service = ${awaitKw(call)}${expr};\n`;
      case 'return':
        return `return ${expr};`;
      case 'inline':
        return expr;
    }
  }

  private compileAutoImplement(service: Service, factory: AutoImplement, resources: Map<string, Resource>, scope: Set<string>): string {
    const method = factory.method;
    const [assign, eos] = factory.kind === 'auto-class' ? [' =', ';'] : [':', ','];
    const writer = this.writerFactory.create();
    writer.write('{');
    writer.indent(() => {
      if (method.name === 'get') {
        writer.write(`${asyncKw(method)}get() {`);
        writer.indent(() => {
          writer.write(`return di.get('${method.target}'${needKw(method)});`);
        });
        writer.write('}');
        return;
      }

      writer.write('create');

      if (factory.kind === 'auto-class') {
        if (method.service.type.kind !== 'local') {
          throw new InternalError('This should not happen');
        }

        writer.write(`: ${formatType(service.type)}['create']`);
      }

      writer.write(`${assign} ${asyncKw(method)}(${method.args.join(', ')}) => `);
      writer.write(
        method.service.factory
          ? this.compileFactoryBody(method.service, method.service.factory, resources, scope)
          : 'undefined',
      );
      writer.write(eos);
    });
    writer.write('}');
    return writer.toString();
  }

  private compileHook(name: string, hook: HookInfo | undefined, resources: Map<string, Resource>, forceAsync: boolean = false): string {
    if (!hook || !hook.calls.length) {
      return '';
    }

    const writer = this.writerFactory.create();
    const args = ['service', 'di'].slice(0, hook.args);
    writer.write(`${name}: ${asyncKw(hook, forceAsync)}(${args.join(', ')}) => {`);
    writer.indent(() => {
      const [imports] = this.compileDynamicImports(resources, new Set(), ...hook.calls);
      writer.write(imports);
      writer.write(this.compileCalls(hook.calls, (stmt, call) => `${awaitKw(call)}${stmt}`));
    });
    writer.write('},\n');
    return writer.toString();
  }

  private compileForkHook(hook: ForkHookInfo | undefined, resources: Map<string, Resource>): string {
    if (!hook || (!hook.containerCall && !hook.serviceCall && !hook.calls.length)) {
      return '';
    }

    const [imports] = this.compileDynamicImports(resources, new Set(), hook.serviceCall, ...hook.calls);
    const args = ['callback', 'service', 'di'].slice(0, hook.args);

    let body = this.compileForkHookDecoratorCalls(
      hook,
      hook.serviceCall || hook.containerCall ? '' : imports,
      hook.serviceCall ? ['fork'] : hook.containerCall ? [] : args,
      hook.serviceCall ? 'fork' : '',
    );

    if (hook.serviceCall) {
      const pre = hook.containerCall ? 'async () => ' : '';
      hook.serviceCall.args.replace(0, { kind: 'literal', async: 'none', source: body });
      body = `${pre}${this.compileCall(hook.serviceCall)}`;
    }

    if (hook.containerCall) {
      body = `service.run(${body})`;
    }

    const writer = this.writerFactory.create();
    writer.write('onFork: ');

    if (!hook.serviceCall && !hook.containerCall) {
      writer.write(body);
      writer.write(',\n');
      return writer.toString();
    }

    writer.write(`async (${args.join(', ')}) => `);

    if (!imports) {
      writer.write(`${body},\n`);
      return writer.toString();
    }

    writer.write('{');
    writer.indent(() => {
      writer.write(imports);
      writer.write(`return ${body};`);
    });
    writer.write('},\n');
    return writer.toString();
  }

  private compileForkHookDecoratorCalls(hook: ForkHookInfo, imports: string, args: string[], cbArg: string): string {
    if (!hook.calls.length) {
      return 'callback';
    }

    const calls = this.compileCalls(hook.calls, (stmt, call) => `${awaitKw(call)}${stmt}`);
    const writer = this.writerFactory.create();

    writer.write(`async (${args.join(', ')}) => {`);
    writer.indent(() => {
      writer.write(imports);
      writer.write(calls);
      writer.write(`return callback(${cbArg});`);
    });
    writer.write('}');

    return writer.toString();
  }

  private compileCalls(
    calls: Call[],
    format?: (stmt: string, call: Call, index: number, total: number) => string,
  ): string {
    const writer = this.writerFactory.create();

    for (let i = 0; i < calls.length; ++i) {
      const stmt = this.compileCall(calls[i]);
      writer.write(format ? format(stmt, calls[i], i, calls.length) : stmt);
      writer.write(';\n');
    }

    return writer.toString();
  }

  private compileCall(call: Call): string {
    return `${call.statement}${this.compileArgs(call.args)}`;
  }

  private compileArgs(args: ArgumentList): string {
    if (!args.length) {
      return '()';
    }

    const writer = this.writerFactory.create();
    writer.write('(');
    writer.indent(() => {
      for (const arg of args) {
        writer.write(`${this.compileArg(arg)},\n`);
      }
    });
    writer.write(')');
    return writer.toString();
  }

  private compileArg(arg: Argument): string {
    switch (arg.kind) {
      case 'raw': return JSON.stringify(arg.value);
      case 'literal': return withAsyncMode(arg, arg.source);
      case 'overridden': return withSpread(arg, withAsyncMode(arg, this.compileOverriddenArg(arg)));
      case 'injected': return this.compileInjectedArgument(arg);
    }
  }

  private compileOverriddenArg(arg: OverriddenArgument): string {
    return arg.value.kind === 'value'
      ? withSpread(arg, withAsyncMode(arg, arg.value.path))
      : this.compileCall(arg.value);
  }

  private compileInjectedArgument(arg: InjectedArgument): string {
    switch (arg.mode) {
      case 'scoped-runner': return `{ async run(cb) { return di.run(cb); } }`;
      case 'injector': return `(service) => di.register('${arg.id}', service)`;
      case 'accessor':
        return `${asyncKw(arg)}() => di.${method(arg.target)}('${arg.alias}'${needKw(arg)})`;
    }

    if (arg.mode === 'tuple') {
      const values = arg.values.map((value) => this.compileArg(value)).join(',\n');

      if (arg.spread) {
        return values;
      }

      const writer = this.writerFactory.create();
      writer.write('[');
      writer.indent(() => writer.write(`${values},`));
      writer.write(']');
      return writer.toString();
    }

    const need = arg.mode === 'single' ? needKw(arg) : '';
    const asyncMode = arg.mode === 'iterable' ? withIterableMode : withAsyncMode;
    return withSpread(arg, asyncMode(arg, `di.${method(arg.mode)}('${arg.alias}'${need})`));
  }

  private compileDynamicImports(
    resources: Map<string, Resource>,
    scope: Set<string>,
    ...targets: (Call | false | undefined | null)[]
  ): [string, Set<string>] {
    const imports: Map<string, string> = new Map();
    const queue: Call[] = targets.filter((target) => !!target);
    let target: Call | undefined;

    while (target = queue.shift()) {
      checkResource(target.resource);

      for (const arg of target.args) {
        if (arg.kind !== 'overridden') {
          continue;
        }

        if (arg.value.kind === 'call') {
          queue.push(arg.value);
        } else {
          checkResource(arg.value.resource);
        }
      }
    }

    const stmt = this.compilePromiseAll(imports);
    return [stmt, new Set([...scope, ...imports.keys()])];

    function checkResource(alias: string): void {
      if (scope.has(alias) || imports.has(alias)) {
        return;
      }

      const resource = resources.get(alias);

      if (!resource) {
        throw new InternalError('This should never happen');
      }

      if (!resource.needsValue) {
        imports.set(alias, `import('${resource.dynamicImport}')`);
      }
    }
  }

  private * getAutoFactoryCallsIfEager(service: Service): Iterable<Call> {
    if (
      !service.factory
      || (service.factory.kind !== 'auto-class' && service.factory.kind !== 'auto-interface')
      || service.factory.method.name !== 'create'
      || service.factory.method.async
    ) {
      return;
    }

    const target = service.factory.method.service;

    if (target.factory && (target.factory.kind === 'local' || target.factory.kind === 'auto-class')) {
      yield target.factory.call;
    }

    if (target.decorate) {
      yield * target.decorate.calls;
    }
  }

  private compileEagerAsyncArgs(factory: AutoImplement): string {
    if (factory.method.name === 'get') {
      return '';
    }

    return this.compilePromiseAll(mapMap(
      factory.method.eagerDeps,
      (name, arg) => [name, this.compileArg(arg)],
    ));
  }

  private compileChildServiceRegistrations(registrations?: ChildServiceRegistrations): string {
    if (!registrations) {
      return '';
    }

    const writer = this.writerFactory.create();

    for (const [id, arg] of registrations.services) {
      writer.write(`service.register('${id}', ${this.compileArg(arg)});\n`);
    }

    return writer.toString();
  }

  private compilePromiseAll(stmts: Map<string, string>): string {
    if (stmts.size < 2) {
      return [...stmts]
        .map(([alias, stmt]) => `const ${alias} = await ${stmt};\n`)
        .join('');
    }

    const writer = this.writerFactory.create();
    writer.write(`const [${[...stmts.keys()].join(', ')}] = await Promise.all([`);
    writer.indent(() => {
      for (const stmt of stmts.values()) {
        writer.write(`${stmt},`);
      }
    });
    writer.write(']);\n');
    return writer.toString();
  }
}


function withAsyncMode<O extends { async: AsyncMode }>(o: O, value: string): string {
  switch (o.async) {
    case 'none': return value;
    case 'await': return `await ${value}`;
    case 'wrap': return `Promise.resolve(${value})`;
  }
}

function withIterableMode<O extends { async: AsyncMode }>(o: O, value: string): string {
  switch (o.async) {
    case 'none': return value;
    case 'await': return `await toSyncIterable(${value})`;
    case 'wrap': return `toAsyncIterable(${value})`;
  }
}

function withSpread<O extends { spread: boolean }>(o: O, value: string): string {
  return o.spread ? `...${value}` : value;
}

function asyncKw<Value extends { async: boolean }>(value: Value, force: boolean = false): string {
  return value.async || force ? 'async ' : '';
}

function awaitKw<Value extends { async: boolean }>(value: Value): string {
  return value.async ? 'await ' : '';
}

function needKw<Value extends { need: boolean }>(value: Value): string {
  return value.need ? '' : ', false';
}

function method(mode: 'single' | 'list' | 'iterable'): string {
  switch (mode) {
    case 'single': return 'get';
    case 'list': return 'find';
    case 'iterable': return 'iterate';
  }
}

function resolveFactorySignature(service: Service): [async: boolean, inject: boolean] {
  let async = false;
  let inject = false;

  if (service.register) {
    inject = true;

    if (service.register.async) {
      async = true;
    }
  }

  if (service.decorate && service.decorate.args > 1) {
    inject = true;
  }

  if (service.decorate?.async) {
    async = true;
  }

  if (async && inject) {
    return [async, inject];
  }

  if (!service.factory) {
    return [false, false];
  }

  switch (service.factory.kind) {
    case 'foreign':
      return [async || service.factory.async, true];
    case 'local':
      return [async || service.factory.call.async || service.factory.call.args.async, inject || service.factory.call.args.inject];
    case 'auto-class':
      if (service.factory.call.args.async) {
        async = true;
      }

      if (service.factory.call.args.inject) {
        inject = true;
      }

      if (async && inject) {
        return [async, inject];
      }
      break;
  }

  if (service.factory.method.name === 'get') {
    return [async, true];
  } else if (service.factory.method.eagerDeps.size) {
    return [true, true];
  }

  const [, afInject] = resolveFactorySignature(service.factory.method.service);
  return [async, inject || afInject];
}

/**
 * This handles an edge case where an onCreate hook doesn't
 * need to be async for any other reason than a dynamic import,
 * because dynamic imports are analysed *after* we determine which
 * calls can be async, so the hook's own `async` property doesn't
 * reflect whether it will actually end up using dynamic imports
 * (because when the factory is async, the entire service is async)
 */
function doesOnCreateNeedForcedAsync(service: Service, resources: Map<string, Resource>): boolean {
  if (!service.async || !service.onCreate || service.onCreate.async) {
    return false;
  }

  for (const call of service.onCreate.calls) {
    if (!resources.get(call.resource)?.needsValue) {
      return true;
    }
  }

  return false;
}
