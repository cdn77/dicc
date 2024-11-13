import { z } from 'zod';
import { ReferenceMap } from '../utils';
import { CompilerExtension } from './compilerExtension';

export enum CompilerExtensionInjectSpecifier {
  EventDispatcher = 'eventDispatcher',
  ModuleResolver = 'moduleResolver',
  ReferenceResolver = 'referenceResolver',
  TypeHelper = 'typeHelper',
  Logger = 'logger',
}

export type CompilerExtensionReferences = {
  module: string;
  map: ReferenceMap;
};

export interface CompilerExtensionConstructor {
  readonly inject?: CompilerExtensionInjectSpecifier[];
  readonly references?: CompilerExtensionReferences;
  readonly configSchema?: z.AnyZodObject;

  new (...args: any[]): CompilerExtension;
}

export type EnqueueResourcesCb = {
  (resources: string | string[], excludeExports?: string[], resolveFrom?: string): void;
};
