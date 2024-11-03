import { z } from 'zod';

const resourceSchema = z.strictObject({
  excludePaths: z.array(z.string()).optional(),
  excludeExports: z.array(z.string()).optional(),
});

const containerConfigSchema = z.strictObject({
  preamble: z.string().optional(),
  className: z.string().regex(/^[a-z$_][a-z0-9$_]*$/i, 'Invalid identifier').default('AppContainer'),
  lazyImports: z.boolean().default(true),
  resources: z.record(resourceSchema.nullish()),
});

export const compilerConfigSchema = z.strictObject({
  project: z.string().default('./tsconfig.json'),
  extensions: z.record(z.any()).nullish().transform((v) => v ?? {}),
  containers: z.record(containerConfigSchema),
});

type ResourceConfigSchema = z.infer<typeof resourceSchema>;
type ContainerConfigSchema = z.infer<typeof containerConfigSchema>;
type CompilerConfigSchema = z.infer<typeof compilerConfigSchema>;

export interface ResourceOptions extends ResourceConfigSchema {}
export interface ContainerOptions extends ContainerConfigSchema {}

export interface CompilerConfig extends CompilerConfigSchema {
  configFile: string;
}
