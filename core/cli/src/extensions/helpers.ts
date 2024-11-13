import { ServiceScope } from 'dicc';
import { Node, ObjectLiteralExpression, SyntaxKind } from 'ts-morph';
import { DefinitionError, UserCodeContext } from '../errors';

type LiteralTypeToValueType = {
  string: string;
  number: number;
  boolean: boolean;
  object: ObjectLiteralExpression;
};

export function getPropertyLiteralValueIfKind<Type extends keyof LiteralTypeToValueType>(
  node: ObjectLiteralExpression,
  property: string,
  type: Type,
): LiteralTypeToValueType[Type] | undefined;
export function getPropertyLiteralValueIfKind<Type extends keyof LiteralTypeToValueType, ReturnType>(
  node: ObjectLiteralExpression,
  property: string,
  type: Type,
  ctx: UserCodeContext,
  validate: (value: LiteralTypeToValueType[Type], ctx: UserCodeContext) => ReturnType,
): ReturnType | undefined;
export function getPropertyLiteralValueIfKind<Type extends keyof LiteralTypeToValueType>(
  node: ObjectLiteralExpression,
  property: string,
  type: Type,
  ctx?: UserCodeContext,
  validate?: (value: any, ctx: UserCodeContext) => any,
): any {
  const value = node.getProperty(property)
    ?.asKind(SyntaxKind.PropertyAssignment)
    ?.getInitializer();

  if (!value) {
    return undefined;
  }

  switch (type) {
    case 'string': return check(value.asKind(SyntaxKind.StringLiteral)?.getLiteralValue());
    case 'number': return check(value.asKind(SyntaxKind.NumericLiteral)?.getLiteralValue());
    case 'boolean': return Node.isTrueLiteral(value) || Node.isFalseLiteral(value)
      ? check(value.getLiteralValue())
      : undefined;
    case 'object': return check(value.asKind(SyntaxKind.ObjectLiteralExpression));
    default: throw 'unreachable';
  }

  function check(value: any): any {
    return ctx && validate && value !== undefined ? validate(value, ctx) : value;
  }
}

export function validateServiceScope(scope: string, ctx: UserCodeContext): ServiceScope {
  switch (scope) {
    case 'global':
    case 'local':
    case 'private':
      return scope as ServiceScope;
  }

  throw new DefinitionError(`Invalid service scope '${scope}'`, ctx);
}

export function subpath(ctx: UserCodeContext, sub: string): UserCodeContext {
  return { ...ctx, path: `${ctx.path}.${sub}` };
}
