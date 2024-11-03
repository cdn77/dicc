import { Logger, LogLevel } from '@debugr/core';
import { DiagnosticCategory, DiagnosticMessageChain, Node, SourceFile } from 'ts-morph';
import { ContainerBuilder } from './containerBuilder';
import { DefinitionError } from './errors';
import { TypeHelper } from './typeHelper';
import { TypeFlag } from './types';

export class Checker {
  constructor(
    private readonly helper: TypeHelper,
    private readonly logger: Logger,
  ) {}

  checkAutoFactories(builder: ContainerBuilder): void {
    for (const definition of builder.getDefinitions()) {
      if (definition.factory) {
        definition.id === '#HelloFactory.0' && this.logger.warning(`${definition.id} has factory`);
        continue;
      }

      const [signature, method] = this.helper.resolveAutoFactorySignature(definition.type);

      if (!signature) {
        definition.id === '#HelloFactory.0' && this.logger.warning(`${definition.id} has no signature`);
        continue;
      }

      const [serviceType, async] = this.helper.unwrapAsyncType(signature.getReturnType());
      const [serviceDef, ...rest] = builder.getByType(serviceType);

      if (!serviceDef) {
        definition.id === '#HelloFactory.0' && this.logger.warning(`${definition.id} has no target service`);
        continue;
      } else if (rest.length) {
        throw new DefinitionError(`Multiple services satisfy return type of auto factory '${definition.id}'`);
      } else if (!serviceDef.factory) {
        throw new DefinitionError(`Cannot auto-implement factory '${definition.id}': unable to resolve target service factory`);
      }

      this.logger.debug(`Promoting '${definition.id}' to auto-factory of '${serviceDef.id}'`);

      const manualArgs = signature.getParameters().map((p) => p.getName());

      definition.creates = {
        method,
        manualArgs,
        async,
        source: serviceDef.source,
        path: serviceDef.path,
        type: serviceDef.type,
        object: serviceDef.object,
        explicit: serviceDef.explicit,
        factory: serviceDef.factory,
        args: serviceDef.args,
      };

      if (method !== 'get') {
        builder.unregister(serviceDef.id);
      }
    }
  }

  removeExtraneousImplicitRegistrations(builder: ContainerBuilder): void {
    for (const def of builder.getDefinitions()) {
      if (def.explicit) {
        continue;
      }

      const others = builder.getByType(def.type).filter((d) => d !== def);

      if ((!def.factory && others.find((d) => d.factory)) || others.find((d) => d.explicit)) {
        this.logger.debug(`Unregistered extraneous service '${def.path}'`);
        builder.unregister(def.id);
      }
    }
  }

  scanUsages(builder: ContainerBuilder): void {
    for (const method of ['get', 'find', 'iterate']) {
      for (const call of this.helper.getContainerMethodCalls(method)) {
        const [id] = call.getArguments();

        if (Node.isStringLiteral(id) && !builder.has(id.getLiteralValue())) {
          const sf = id.getSourceFile();
          const ln = id.getStartLineNumber();
          this.logger.warning(`Unknown service '${id.getLiteralValue()}' in call to Container.${method}() in '${sf.getFilePath()}' on line ${ln}`);
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

    for (const definition of builder.getDefinitions()) {
      if (!definition.factory) {
        dynamic.add(definition.id);
      } else {
        for (const arg of definition.factory.args) {
          if (arg.flags & TypeFlag.Injector) {
            const [id] = arg.type ? builder.getIdsByType(arg.type) : []
            injectors.add(id);
          }
        }
      }
    }

    for (const id of dynamic) {
      if (!registrations.has(id) && !injectors.has(id)) {
        this.logger.warning(`No Container.register() call found for dynamic service '${id}'`);
      }
    }
  }

  checkOutput(output: SourceFile): boolean {
    let ok = true;

    for (const diagnostic of output.getPreEmitDiagnostics()) {
      this.logger.log(
        this.getDiagnosticCategoryLogLevel(diagnostic.getCategory()),
        this.formatDiagnostic(diagnostic.getMessageText(), diagnostic.getLineNumber()),
      );

      diagnostic.getCategory() === DiagnosticCategory.Error && (ok = false);
    }

    return ok;
  }

  private getDiagnosticCategoryLogLevel(category: DiagnosticCategory): LogLevel {
    switch (category) {
      case DiagnosticCategory.Warning: return LogLevel.WARNING;
      case DiagnosticCategory.Error: return LogLevel.ERROR;
      default: return LogLevel.INFO;
    }
  }

  private formatDiagnostic(message: DiagnosticMessageChain | string, line?: number): string {
    return line !== undefined
      ? `line ${line} in compiled container: ${this.formatDiagnosticMessage(message)}`
      : `in compiled container: ${this.formatDiagnosticMessage(message)}`;
  }

  private formatDiagnosticMessage(...messages: (DiagnosticMessageChain | string)[]): string {
    return messages.map((message) => {
      if (typeof message === 'string') {
        return message;
      }

      return this.formatDiagnosticMessage(message.getMessageText(), ...message.getNext() ?? []);
    }).join('\n');
  }
}
