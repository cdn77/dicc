import { Node, Type } from 'ts-morph';

export class UserError extends Error {}

export class ConfigError extends UserError {}

export class DefinitionError extends UserError {
  constructor(message: string, node?: Node) {
    const location = node
      ? ` in ${node.getSourceFile().getFilePath()} on line ${node.getStartLineNumber()}`
      : '';
    super(`${message}${location}`);
  }
}

export class TypeError extends DefinitionError {
  constructor(message: string, type?: Type) {
    const [node] = type?.getSymbol()?.getDeclarations() ?? [];
    super(message, node);
  }
}
