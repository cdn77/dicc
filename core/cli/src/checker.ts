import { Node } from 'ts-morph';
import { ServiceRegistry } from './serviceRegistry';
import { TypeHelper } from './typeHelper';
import { TypeFlag } from './types';

export class Checker {
  private readonly helper: TypeHelper;
  private readonly registry: ServiceRegistry;

  constructor(helper: TypeHelper, registry: ServiceRegistry) {
    this.helper = helper;
    this.registry = registry;
  }

  removeExtraneousImplicitRegistrations(): void {
    for (const def of this.registry.getDefinitions()) {
      if (!def.explicit && this.registry.getIdsByType(def.type).filter((id) => id !== def.id).length) {
        this.registry.unregister(def.id);
      }
    }
  }

  scanUsages(): void {
    for (const method of ['get', 'find', 'iterate']) {
      for (const call of this.helper.getContainerMethodCalls(method)) {
        const [id] = call.getArguments();

        if (Node.isStringLiteral(id) && !this.registry.has(id.getLiteralValue())) {
          const sf = id.getSourceFile();
          const ln = id.getStartLineNumber();
          console.log(`Warning: unknown service '${id.getLiteralValue()}' in call to Container.${method}() in ${sf.getFilePath()} on line ${ln}`);
        }
      }
    }

    const registrations: Set<string> = new Set();

    for (const call of this.helper.getContainerMethodCalls('register')) {
      const [id] = call.getArguments();

      if (Node.isStringLiteral(id)) {
        registrations.add(id.getLiteralValue());
      }
    }

    const injectors: Set<string> = new Set();
    const dynamic: Set<string> = new Set();

    for (const definition of this.registry.getDefinitions()) {
      if (!definition.factory) {
        dynamic.add(definition.id);
      } else {
        for (const param of definition.factory.parameters) {
          if (param.flags & TypeFlag.Injector) {
            const [id] = param.type ? this.registry.getIdsByType(param.type) : []
            injectors.add(id);
          }
        }
      }
    }

    for (const id of dynamic) {
      if (!registrations.has(id) && !injectors.has(id)) {
        console.log(`Warning: no Container.register() call found for dynamic service '${id}'`);
      }
    }
  }
}
