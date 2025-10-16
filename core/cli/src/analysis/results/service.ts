import { ServiceScope } from 'dicc';
import { Argument, SingleInjectedArgument } from './arguments';
import { Call } from './call';

export type Service = {
  id: string;
  type: TypeSpecifier;
  aliases: Set<string>;
  factory?: Factory | AutoImplement;
  async: boolean;
  scope: ServiceScope;
  anonymous: boolean;
  register?: ChildServiceRegistrations;
  decorate?: HookInfo;
  onCreate?: HookInfo;
  onFork?: ForkHookInfo;
  onDestroy?: HookInfo;
};

export type LocalTypeSpecifier = {
  kind: 'local';
  resource: string;
  path: string;
  indirect: boolean;
};

export type ForeignTypeSpecifier = {
  kind: 'foreign';
  container: LocalTypeSpecifier;
  id: string;
};

export type TypeSpecifier = LocalTypeSpecifier | ForeignTypeSpecifier;

export type LocalFactory = {
  kind: 'local';
  call: Call;
};

export type ForeignContainer = {
  id: string;
  async: boolean;
};

export type ForeignFactory = {
  kind: 'foreign';
  container: ForeignContainer;
  id: string;
  async: boolean;
};

export type Factory = LocalFactory | ForeignFactory;

export type AutoImplementAccessorMethod = {
  name: 'get';
  async: boolean;
  target: string;
  need: boolean;
};

export type AutoImplementFactoryMethod = {
  name: 'create';
  args: string[];
  async: boolean;
  service: Service;
  eagerDeps: Map<string, Argument>;
};

export type AutoImplementMethod = AutoImplementAccessorMethod | AutoImplementFactoryMethod;

export type AutoClass = {
  kind: 'auto-class';
  call: Call;
  method: AutoImplementMethod;
};

export type AutoInterface = {
  kind: 'auto-interface';
  method: AutoImplementMethod;
};

export type AutoImplement = AutoClass | AutoInterface;

export type ChildServiceRegistrations = {
  services: Map<string, SingleInjectedArgument>;
  async: boolean;
};

export type HookInfo = {
  async: boolean;
  args: number;
  calls: Call[];
};

export type ForkHookInfo = {
  args: number;
  containerCall: boolean;
  serviceCall?: Call;
  calls: Call[];
};
