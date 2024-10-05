import { Logger, LogLevel } from '@debugr/core';
import { DiagnosticCategory, DiagnosticMessageChain, Node, SourceFile } from 'ts-morph';
import { Container } from './container';
import { TypeHelper } from './typeHelper';
import { TypeFlag } from './types';

export class Checker {
  constructor(
    private readonly helper: TypeHelper,
    private readonly logger: Logger,
  ) {}

  removeExtraneousImplicitRegistrations(container: Container): void {
    for (const def of container.getDefinitions()) {
      if (def.explicit) {
        continue;
      }

      const others = container.getByType(def.type).filter((d) => d !== def);

      if ((!def.factory && others.find((d) => d.factory)) || others.find((d) => d.explicit)) {
        this.logger.debug(`Unregistered extraneous service '${def.path}'`);
        container.unregister(def.id);
      }
    }
  }

  scanUsages(container: Container): void {
    for (const method of ['get', 'find', 'iterate']) {
      for (const call of this.helper.getContainerMethodCalls(method)) {
        const [id] = call.getArguments();

        if (Node.isStringLiteral(id) && !container.has(id.getLiteralValue())) {
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

    for (const definition of container.getDefinitions()) {
      if (!definition.factory) {
        dynamic.add(definition.id);
      } else {
        for (const param of definition.factory.parameters) {
          if (param.flags & TypeFlag.Injector) {
            const [id] = param.type ? container.getIdsByType(param.type) : []
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

  checkOutput(output: SourceFile): void {
    for (const diagnostic of output.getPreEmitDiagnostics()) {
      this.logger.log(
        this.getDiagnosticCategoryLogLevel(diagnostic.getCategory()),
        this.formatDiagnostic(diagnostic.getMessageText(), diagnostic.getLineNumber()),
      );
    }
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
