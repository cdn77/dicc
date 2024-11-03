import { ContainerBuilder } from '../container';
import {
  AccessorType,
  Argument,
  InjectorType,
  IterableType,
  ListType,
  PromiseType,
  ScopedRunnerType,
  ServiceDefinition,
} from '../definitions';
import { getFirst } from '../utils';
import { ContainerCompiler } from './containerCompiler';
import { $args, $lazy, Lazy, LazyWriter } from './lazy';

export abstract class ServiceCompiler<Definition extends ServiceDefinition> {
  constructor(
    protected readonly container: ContainerCompiler,
    protected readonly builder: ContainerBuilder,
    protected readonly definition: Definition,
  ) {}

  abstract compile(): Lazy;

  protected compileCall(statement: Lazy, args: Lazy[]): Lazy {
    if (args.length < 2) {
      return $lazy`${statement}(${getFirst(args)})`;
    }

    const writer = new LazyWriter();

    writer.writeLine($lazy`${statement}(`);
    writer.indent(() => {
      for (const arg of args) {
        writer.writeLine($lazy`${arg},`);
      }
    });
    writer.write(')');

    return writer;
  }

  protected compileArguments(args: Map<string, Argument>, overrides?: Map<string | number, Lazy>): Lazy[] {
    const stmts: Lazy[] = [];
    const undefs: Lazy[] = [];
    let idx = 0;

    for (const [name, arg] of args) {
      const stmt = overrides?.get(name) ?? overrides?.get(idx) ?? this.compileArgument(arg);
      ++idx;

      if (stmt === undefined) {
        undefs.push(`undefined`);
      } else {
        stmts.push(...undefs.splice(0, undefs.length), stmt);
      }
    }

    return stmts;
  }

  protected compileArgument(arg: Argument): Lazy | undefined {
    if (!arg.type) {
      return undefined;
    } if (arg.type instanceof ScopedRunnerType) {
      return $args.use('di', '{ run: async (cb) => di.run(cb) }');
    } else if (arg.type instanceof InjectorType) {
      const type = arg.type.type;
      const [id] = $args.unwatch(() => this.container.resolveServiceInjection(type));
      return id === undefined ? undefined : $args.use('di', `(service) => di.register('${id}', service)`);
    } else if (arg.type instanceof IterableType) {
      const type = arg.type.type;
      const [id] = $args.unwatch(() => this.container.resolveServiceInjection(type));
      return id === undefined ? undefined : $args.use('di', `${arg.rest ? '...' : ''}di.iterate('${id}')`);
    }

    let value = arg.type;
    let wantsAccessor: boolean = false;
    let wantsAsync: boolean = false;

    if (value instanceof AccessorType) {
      value = value.returnType;
      wantsAccessor = true;
    }

    if (value instanceof PromiseType) {
      value = value.value;
      wantsAsync = true;
    }

    for (const type of value.getInjectableTypes()) {
      const [id, async] = $args.unwatch(() => this.container.resolveServiceInjection(type));

      if (id === undefined) {
        continue;
      }

      const method = value instanceof ListType && type === value.type ? 'find' : 'get';
      const need = method === 'get' && (arg.optional || value.nullable) ? ', false' : '';
      const source = `di.${method}('${id}'${need})`;

      $args.use('di');

      if (wantsAccessor) {
        return `${wantsAsync ? 'async ' : ''}() => ${source}`;
      }

      return $lazy`${arg.rest ? '...' : ''}${this.ensureAsyncAwaited(source, async, wantsAsync)}`;
    }

    return undefined;
  }

  protected ensureAsyncAwaited(source: Lazy, isAsync: boolean, wantsAsync: boolean): Lazy {
    if (isAsync && !wantsAsync) {
      return $lazy`await ${source}`;
    } else if (!isAsync && wantsAsync) {
      return $lazy`Promise.resolve().then(() => ${source})`;
    } else {
      return source;
    }
  }
}
