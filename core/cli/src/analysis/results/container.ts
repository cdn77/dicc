import { Service, TypeSpecifier } from './service';

export type Resource = {
  staticImport: string;
  dynamicImport: string;
  needsType: boolean;
  needsValue: boolean;
};

export type TypeSpecifierWithAsync = TypeSpecifier & {
  async: boolean
};

export type Container = {
  resources: Map<string, Resource>;
  imports: Set<string>;
  publicTypes: Map<string, TypeSpecifierWithAsync>;
  dynamicTypes: Map<string, Set<TypeSpecifierWithAsync>>;
  anonymousTypes: Map<string, Set<TypeSpecifierWithAsync>>;
  services: Set<Service>;
  className: string;
  preamble?: string;
};
