import { Call } from './call';

export type AsyncMode =
  | 'await'
  | 'wrap'
  | 'none';

export function getAsyncMode(valueIsAsync: boolean, targetWantsAsync: boolean): AsyncMode {
  return valueIsAsync === targetWantsAsync
    ? 'none'
    : valueIsAsync ? 'await' : 'wrap';
}

export type RawArgument = {
  kind: 'raw';
  value: any;
};

export type LiteralArgument = {
  kind: 'literal';
  source: string;
  async: AsyncMode;
};

export type OverrideCall = Call & {
  kind: 'call';
};

export type OverrideValue = {
  kind: 'value';
  resource: string;
  path: string;
  async: boolean;
};

export type OverriddenArgument = {
  kind: 'overridden';
  value: OverrideCall | OverrideValue;
  async: AsyncMode;
  spread: boolean;
};

type InjectedArgumentOptions = {
  kind: 'injected';
};

type InjectedServiceArgumentOptions = InjectedArgumentOptions & {
  alias: string;
  async: AsyncMode;
  spread: boolean;
};

export type SingleInjectedArgument = InjectedServiceArgumentOptions & {
  mode: 'single';
  need: boolean;
};

export type ListInjectedArgument = InjectedServiceArgumentOptions & {
  mode: 'list';
};

export type IterableInjectedArgument = InjectedServiceArgumentOptions & {
  mode: 'iterable';
};

export type AccessorInjectedArgument = InjectedArgumentOptions & {
  mode: 'accessor';
  alias: string;
  target: 'single' | 'list';
  async: boolean;
  need: boolean;
};

export type InjectorInjectedArgument = InjectedArgumentOptions & {
  mode: 'injector';
  id: string;
};

export type TupleInjectedArgument = InjectedArgumentOptions & {
  mode: 'tuple';
  values: Argument[];
  spread: boolean;
};

export type ScopedRunnerInjectedArgument = InjectedArgumentOptions & {
  mode: 'scoped-runner';
};

export type InjectedArgument =
  | SingleInjectedArgument
  | ListInjectedArgument
  | IterableInjectedArgument
  | AccessorInjectedArgument
  | InjectorInjectedArgument
  | TupleInjectedArgument
  | ScopedRunnerInjectedArgument;

export type Argument =
  | RawArgument
  | LiteralArgument
  | OverriddenArgument
  | InjectedArgument;

export type ArgumentList = Iterable<Argument> & {
  length: number;
  inject: boolean;
  async: boolean;
  replace(index: number, arg: Argument): void;
};
