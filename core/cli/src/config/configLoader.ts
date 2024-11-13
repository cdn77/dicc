import { readFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import { parse } from 'yaml';
import { ConfigError } from '../errors';
import { CompilerConfig, compilerConfigSchema } from './types';

const defaultConfigFiles = [
  'dicc.yaml',
  'dicc.yml',
  '.dicc.yaml',
  '.dicc.yml',
];

export class ConfigLoader {
  constructor(
    private readonly configFile?: string,
  ) {}

  async load(): Promise<CompilerConfig> {
    const [file, contents] = await this.resolveAndReadFile();
    const config = this.parseYaml(file, contents);
    const validated = this.validateConfig(file, config);
    process.chdir(dirname(file));
    return validated;
  }

  private async resolveAndReadFile(): Promise<[file: string, contents: string]> {
    const candidates = this.configFile === undefined ? defaultConfigFiles : [this.configFile];

    for (const file of candidates) {
      const fullPath = resolve(file);

      try {
        const config = await readFile(fullPath, 'utf-8');
        return [fullPath, config];
      } catch (e: any) {
        if (e.code === 'ENOENT') {
          continue;
        }

        throw new ConfigError(`Error reading config file: ${e.message}`, fullPath);
      }
    }

    throw new ConfigError(
      this.configFile === undefined
        ? 'Config file not specified and none of the default config files exists'
        : `Config file doesn't exist`,
      this.configFile,
    );
  }

  private parseYaml(file: string, contents: string): unknown {
    try {
      return parse(contents);
    } catch (e: any) {
      throw new ConfigError(`Error parsing config file: ${e.message}`, file);
    }
  }

  private validateConfig(file: string, config: unknown): CompilerConfig {
    try {
      return { ...compilerConfigSchema.parse(config), configFile: file };
    } catch (e: any) {
      throw new ConfigError(`Invalid config: ${e.message}`, file);
    }
  }
}
