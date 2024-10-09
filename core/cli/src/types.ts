import { ServiceScope } from 'dicc';
import { KindToNodeMappings, SourceFile, SyntaxKind, Type } from 'ts-morph';
import { z } from 'zod';

const resourceSchema = z.strictObject({
  exclude: z.array(z.string()).optional(),
});

const containerConfigSchema = z.strictObject({
  preamble: z.string().optional(),
  className: z.string().regex(/^[a-z$_][a-z0-9$_]*$/i, 'Invalid identifier').default('AppContainer'),
  typeCheck: z.boolean().default(true),
  resources: z.record(resourceSchema.optional().nullable()),
});

export const diccConfigSchema = z.strictObject({
  project: z.string().default('./tsconfig.json'),
  containers: z.record(containerConfigSchema),
});

type ResourceConfigSchema = z.infer<typeof resourceSchema>;
type ContainerConfigSchema = z.infer<typeof containerConfigSchema>;
type DiccConfigSchema = z.infer<typeof diccConfigSchema>;

export interface ResourceOptions extends ResourceConfigSchema {}
export interface ContainerOptions extends ContainerConfigSchema {}
export interface DiccConfig extends DiccConfigSchema {}

export type ServiceRegistrationInfo = {
  source: SourceFile;
  path: string;
  id?: string;
  type: Type;
  aliases: Type[];
  object?: boolean;
  explicit?: boolean;
  anonymous?: boolean;
  factory?: ServiceFactoryInfo;
  args?: Record<string, CallbackInfo | undefined>;
  hooks: ServiceHooks;
  scope?: ServiceScope;
};

export type ServiceDefinitionInfo = Omit<ServiceRegistrationInfo, 'id'> & {
  id: string;
  async?: boolean;
  decorators: ServiceDecoratorInfo[];
};

export type ServiceDecoratorInfo = {
  source: SourceFile;
  path: string;
  type: Type;
  priority: number;
  decorate?: CallbackInfo;
  hooks: ServiceHooks;
  scope?: ServiceScope;
};

export type ServiceFactoryInfo = {
  parameters: ParameterInfo[];
  returnType: Type;
  method?: string;
  async?: boolean;
};

export type ServiceHooks = {
  onCreate?: CallbackInfo;
  onFork?: CallbackInfo;
  onDestroy?: CallbackInfo;
};

export type CallbackInfo = {
  parameters: ParameterInfo[];
  async?: boolean;
};

export type ParameterInfo = {
  name: string;
  type?: Type;
  flags: TypeFlag;
};

export enum TypeFlag {
  None      = 0b0000000,
  Optional  = 0b0000001,
  Array     = 0b0000010,
  Iterable  = 0b0000100,
  Async     = 0b0001000,
  Accessor  = 0b0010000,
  Injector  = 0b0100000,
  Container = 0b1000000,
}

export type ResolvedReference<K extends SyntaxKind> =
  K extends SyntaxKind.TypeAliasDeclaration
  ? Type
  : KindToNodeMappings[K];
