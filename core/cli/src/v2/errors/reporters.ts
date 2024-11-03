import { resolve, relative } from 'path';
import { Node, SourceFile } from 'ts-morph';
import { ContainerBuilder } from '../container';
import { DecoratorDefinition, ServiceDefinition } from '../definitions';
import {
  AutowiringError,
  ConfigError,
  CyclicDependencyError,
  DefinitionError,
  ExtensionError,
  InternalError,
  UnsupportedError,
  UserCodeError,
  UserError,
} from './errors';
import { ErrorReporter } from './types';

export class UnknownErrorReporter implements ErrorReporter<Error> {
  supports(error: unknown): error is Error {
    return true;
  }

  * report(error: Error): Iterable<string> {
    yield line(`${error.name}:`, error.message);
    yield error.stack ?? '';
  }
}

export class InternalErrorReporter implements ErrorReporter<InternalError> {
  supports(error: unknown): error is InternalError {
    return error instanceof InternalError;
  }

  * report(error: InternalError): Iterable<string> {
    yield line('Internal error:', error.message);
  }
}

export class ExtensionErrorReporter implements ErrorReporter<ExtensionError> {
  supports(error: unknown): error is ExtensionError {
    return error instanceof ExtensionError;
  }

  * report(error: ExtensionError): Iterable<string> {
    yield line('Extension error:', error.message);
    yield line('In extension', error.extension);
  }
}

export class UserErrorReporter<E extends UserError> implements ErrorReporter<E> {
  supports(error: unknown): error is E {
    return error instanceof UserError;
  }

  * report(error: E): Iterable<string> {
    yield line('Error:', error.message);
  }
}

export class ConfigErrorReporter extends UserErrorReporter<ConfigError> {
  supports(error: unknown): error is ConfigError {
    return error instanceof ConfigError;
  }

  * report(error: ConfigError): Iterable<string> {
    yield line('Configuration error:', error.message);

    if (error.file) {
      yield line('Config file:', relative(resolve(), error.file));
    }
  }
}

export class UserCodeErrorReporter<E extends UserCodeError = UserCodeError> implements ErrorReporter<E> {
  supports(error: unknown): error is E {
    return error instanceof UserCodeError;
  }

  * report(error: E): Iterable<string> {
    yield line(this.title(), error.message);
    yield builder(error.context.builder);
    yield file('Resource', error.context.resource);
    yield path(error.context.path);
    yield node('Location:', error.context.node);
  }

  protected title(): string {
    return 'Error analysing code:';
  }
}

export class UnsupportedErrorReporter extends UserCodeErrorReporter<UnsupportedError> {
  supports(error: unknown): error is UnsupportedError {
    return error instanceof UnsupportedError;
  }

  protected title(): string {
    return 'Unsupported:';
  }
}

export class DefinitionErrorReporter extends UserCodeErrorReporter<DefinitionError> {
  supports(error: unknown): error is DefinitionError {
    return error instanceof DefinitionError;
  }

  protected title(): string {
    return 'Invalid definition:';
  }
}

export class AutowiringErrorReporter extends UserErrorReporter<AutowiringError> {
  supports(error: unknown): error is AutowiringError {
    return error instanceof AutowiringError;
  }

  * report(error: AutowiringError): Iterable<string> {
    yield line('Autowiring error:', error.message);
    yield builder(error.context.builder);
    yield * definition(error.context.definition);
    yield method(error.context.method);
    yield arg(error.context.argument);
  }
}

export class CyclicDependencyErrorReporter implements ErrorReporter<CyclicDependencyError> {
  supports(error: unknown): error is CyclicDependencyError {
    return error instanceof CyclicDependencyError;
  }

  * report(error: CyclicDependencyError): Iterable<string> {
    yield line('Cyclic dependency detected:');

    for (const def of error.definitions) {
      yield * definition(def);
    }
  }
}



function line(...chunks: string[]): string {
  return `${chunks.join(' ')}\n`;
}

function builder(builder: ContainerBuilder): string {
  return line('Container:', filePath(builder.sourceFile), `(${builder.className})`);
}

function file(label: string, file: SourceFile): string {
  return line(label, filePath(file));
}

function filePath(file: SourceFile): string {
  return relative(resolve(), file.getFilePath());
}

function path(path: string): string {
  return line('Path:', path);
}

function node(label: string, node?: Node): string {
  return node ? line(label, `${filePath(node.getSourceFile())}:${node.getStartLineNumber()}`) : '';
}

function * definition(definition?: ServiceDefinition | DecoratorDefinition): Iterable<string> {
  if (!definition) {
    return;
  }

  if (definition instanceof DecoratorDefinition) {
    yield line(
      'Decorator:',
      definition.path,
      'exported from',
      filePath(definition.resource),
    );

    yield node('Defined at:', definition.node);
  } else if (definition.isForeign()) {
    yield line(
      'Service:',
      definition.foreignId,
      'merged from container',
      definition.container.path,
      'exported from',
      filePath(definition.container.resource),
    );
  } else {
    yield line(
      'Service:',
      definition.path,
      'exported from',
      filePath(definition.resource),
    );

    yield node('Defined at:', definition.node);
    yield node('Declaration:', definition.declaration);
  }
}

function method(type?: 'factory' | 'override' | 'decorate' | 'onCreate' | 'onFork' | 'onDestroy' | 'auto-implement'): string {
  return type ? line('While processing:', methodLabel(type)) : '';
}

function methodLabel(type: 'factory' | 'override' | 'decorate' | 'onCreate' | 'onFork' | 'onDestroy' | 'auto-implement'): string {
  switch (type) {
    case 'factory': return 'service factory';
    case 'override': return 'service factory argument overrides';
    case 'decorate': return 'decorate() hook';
    case 'onCreate': return 'onCreate() hook';
    case 'onFork': return 'onFork() hook';
    case 'onDestroy': return 'onDestroy() hook';
    case 'auto-implement': return 'auto-implemented factory / accessor';
  }
}

function arg(name?: string): string {
  return name !== undefined ? line('Argument:', name) : '';
}
