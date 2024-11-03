import { Type } from 'ts-morph';
import { getOrCreate } from '../utils';

export class TypeMap {
  private readonly types: Map<Type, string> = new Map();
  private readonly names: Set<string> = new Set();

  add(type: Type): void {
    this.getTypeName(type);
  }

  getTypeName(type: Type): string {
    return getOrCreate(this.types, type, () => {
      const typeName = type.getSymbol()?.getName() ?? 'Anonymous';

      for (let i = 0; ; ++i) {
        const name = `${typeName}.${i}`;

        if (!this.names.has(name)) {
          this.types.set(type, name);
          this.names.add(name);
          return name;
        }
      }
    });
  }

  getTypeNamesIfExist(types: Iterable<Type>): string[] {
    return [...types].map((type) => this.types.get(type)).filter((name) => name !== undefined);
  }

  [Symbol.iterator](): Iterable<[Type, string]> {
    return this.types;
  }
}
