import { resolve } from 'path';
import { Project, SourceFile, ts } from 'ts-morph';
import { InternalError } from '../errors';

export class ModuleResolver {
  constructor(private readonly project: Project) {}

  resolve(module: string, resolveFrom: string = 'index.ts'): SourceFile {
    const fs = this.project.getFileSystem();

    const result = ts.resolveModuleName(
      module,
      resolve(fs.getCurrentDirectory(), resolveFrom),
      this.project.getCompilerOptions(),
      this.project.getModuleResolutionHost(),
    );

    if (!result.resolvedModule) {
      throw new InternalError(`Unable to resolve module '${module}'`);
    }

    return this.project.addSourceFileAtPath(result.resolvedModule.resolvedFileName);
  }
}
