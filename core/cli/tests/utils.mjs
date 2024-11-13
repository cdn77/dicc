import assert from 'node:assert';
import { spawn } from 'node:child_process';
import { readFile, unlink, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function generateTestContainer(url) {
  const suite = dirname(fileURLToPath(url));
  const configFile = resolve(suite, 'dicc.yaml');
  const diccExecutable = resolve(dirname(fileURLToPath(import.meta.url)), '../dist/cli/dicc.js');

  const dicc = spawn(diccExecutable, ['--config', configFile], {
    cwd: suite,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const output = [];

  dicc.stdout.on('data', (chunk) => {
    output.push({ stream: 'stdout', chunk });
  });

  dicc.stderr.on('data', (chunk) => {
    output.push({ stream: 'stderr', chunk });
  });

  const compilation = new Promise((resolve, reject) => {
    dicc.on('error', reject);
    dicc.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Compiler terminated with non-zero exit code: ${code}`));
      }
    });
  });

  try {
    await compilation;
  } catch (e) {
    for (const { stream, chunk } of output) {
      process[stream].write(chunk);
    }

    throw e;
  }

  return suite;
}

export async function compareGeneratedContainer(path, name) {
  const expectedFile = resolve(path, `expected${name}.ts`);
  const generatedFile = resolve(path, `generated${name}.ts`);

  const expected = await readFile(expectedFile, 'utf-8');
  const generated = await readFile(generatedFile, 'utf-8');
  assert.strictEqual(generated, expected, `Generated container doesn't match expected code`);

  try {
    await unlink(generatedFile);
  } catch { /* noop */ }
}

export async function runTestSuite(url) {
  const suite = await generateTestContainer(url);
  await compareGeneratedContainer(suite, 'Container');
}

export async function ensureFileExists(url, file, generate) {
  const suite = dirname(fileURLToPath(url));
  const path = resolve(suite, file);

  try {
    await stat(path);
  } catch (e) {
    if (e.code === 'ENOENT') {
      await writeFile(path, generate());
    } else {
      throw e;
    }
  }
}
