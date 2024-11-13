import { ClassDeclaration, Expression, FunctionDeclaration, InterfaceDeclaration } from 'ts-morph';

export type DeclarationNode =
  | ClassDeclaration
  | InterfaceDeclaration
  | FunctionDeclaration
  | Expression;
