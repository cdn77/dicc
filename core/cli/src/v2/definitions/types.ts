import { Type } from 'ts-morph';
import { Callable } from './callable';

export type ArgumentOverride = Callable | ValueType;

export class SingleType {
  constructor(
    public readonly rawType: Type,
    public readonly type: Type,
    public readonly nullable: boolean = false,
  ) {}

  get serviceType(): Type {
    return this.type;
  }

  * getInjectableTypes(): Iterable<Type> {
    yield this.type;
  }
}

export class ListType {
  constructor(
    public readonly rawType: Type,
    public readonly type: Type,
    public readonly nullable: boolean = false,
  ) {}

  get serviceType(): Type {
    return this.type;
  }

  * getInjectableTypes(): Iterable<Type> {
    yield this.type;
    yield this.rawType;
  }
}

export class PromiseType {
  constructor(
    public readonly rawType: Type,
    public readonly value: SingleType | ListType,
    public readonly nullable: boolean = false,
  ) {}

  get serviceType(): Type {
    return this.value.type;
  }

  * getInjectableTypes(): Iterable<Type> {
    yield * this.value.getInjectableTypes();
    yield this.rawType;
  }
}

export class IterableType {
  constructor(
    public readonly rawType: Type,
    public readonly type: Type,
    public readonly nullable: boolean = false,
    public readonly async: boolean = false,
  ) {}

  get serviceType(): Type {
    return this.type;
  }

  * getInjectableTypes(): Iterable<Type> {
    yield this.type;
    yield this.rawType;
  }
}

export class AccessorType {
  constructor(
    public readonly rawType: Type,
    public readonly returnType: SingleType | ListType | PromiseType,
    public readonly nullable: boolean = false,
  ) {}

  get serviceType(): Type {
    return this.returnType.serviceType;
  }

  * getInjectableTypes(): Iterable<Type> {
    yield * this.returnType.getInjectableTypes();
  }
}

export class InjectorType {
  constructor(
    public readonly rawType: Type,
    public readonly type: Type,
    public readonly nullable: boolean = false,
  ) {}

  get serviceType(): Type {
    return this.type;
  }

  * getInjectableTypes(): Iterable<Type> {
    yield this.type;
  }
}

export class ScopedRunnerType {
  constructor(
    public readonly nullable: boolean = false,
  ) {}
}

export type ValueType =
  | SingleType
  | ListType
  | PromiseType
  | IterableType
  | AccessorType
  | InjectorType
  | ScopedRunnerType;

export type ReturnType =
  | SingleType
  | ListType
  | PromiseType
  | IterableType;
