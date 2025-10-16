import { ServiceDefinition } from '../definitions';
import { ContainerContext, UserCodeContext } from './types';

export class InternalError extends Error {}

export class ExtensionError extends InternalError {
  constructor(
    message: string,
    readonly extension: string,
  ) {
    super(message);
  }
}

export class UserError extends Error {}

export class ConfigError extends UserError {
  constructor(
    message: string,
    readonly file?: string,
  ) {
    super(message);
  }
}

export class UserCodeError extends UserError {
  constructor(
    message: string,
    readonly context: UserCodeContext,
  ) {
    super(message);
  }
}

export class UnsupportedError extends UserCodeError {}
export class DefinitionError extends UserCodeError {}

export class AutowiringError extends UserError {
  constructor(
    message: string,
    readonly context: ContainerContext,
  ) {
    super(message);
  }
}

export class CyclicDependencyError extends UserError {
  public readonly definitions: ServiceDefinition[];

  constructor(...definitions: ServiceDefinition[]) {
    super('Cyclic dependency detected');
    this.definitions = definitions;
  }
}
