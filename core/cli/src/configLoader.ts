import { readFile } from 'fs/promises';
import { resolve } from 'path';
import { parse } from 'yaml';
import { Argv } from './argv';
import { ConfigError } from './errors';
import { DiccConfig, diccConfigSchema } from './types';

const defaultConfigFiles = [
  'dicc.yaml',
  'dicc.yml',
  '.dicc.yaml',
  '.dicc.yml',
];

export class ConfigLoader {
  private readonly configFile?: string;

  constructor(argv: Argv) {
    this.configFile = argv.configFile;
  }

  async load(): Promise<DiccConfig> {
    const [file, data] = await this.loadConfigFile();

    try {
      const config = parse(data);
      return diccConfigSchema.parse(config);
    } catch (e: any) {
      throw new ConfigError(`Error in config file '${file}': ${e.message}`);
    }
  }

  private async loadConfigFile(): Promise<[file: string, config: string]> {
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

        throw new ConfigError(`Error reading config file '${file}': ${e.message}`);
      }
    }

    throw new ConfigError(
      this.configFile === undefined
        ? 'Config file not specified and none of the default config files exists'
        : `Config file '${this.configFile}' doesn't exist`,
    );
  }
}
