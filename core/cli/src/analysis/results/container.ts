import { Service, TypeSpecifier } from './service';

export type Resource = {
  staticImport: string;
  dynamicImport: string;
  needsType: boolean;
  needsValue: boolean;
};

export type TypeSpecifierWithAsync = TypeSpecifier & {
  async: boolean;
};

export type Container = {
  resources: Map<string, Resource>;
  imports: Set<string>;
  publicTypes: Map<string, TypeSpecifierWithAsync>;
  dynamicTypes: Map<string, TypeSpecifierSet>;
  anonymousTypes: Map<string, TypeSpecifierSet>;
  services: Set<Service>;
  className: string;
  preamble?: string;
};

export class TypeSpecifierSet implements Iterable<TypeSpecifierWithAsync> {
  private readonly specifiers: Map<string, TypeSpecifierWithAsync> = new Map();

  add(specifier: TypeSpecifierWithAsync): void {
    const key =
      specifier.kind === 'local'
        ? `local:${specifier.path}`
        : `foreign:${specifier.container.path}#${specifier.id}`;

    const existing = this.specifiers.get(key);

    if (existing) {
      if (specifier.async) {
        existing.async = true;
      }

      return;
    }

    this.specifiers.set(key, specifier);
  }

  get size(): number {
    return this.specifiers.size;
  }

  *[Symbol.iterator](): Iterator<TypeSpecifierWithAsync> {
    yield* this.specifiers.values();
  }
}
