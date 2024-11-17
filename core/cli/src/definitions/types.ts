import { Type } from 'ts-morph';
import { OverrideDefinition } from './argumentDefinition';
import { CallableDefinition } from './callableDefinition';

export type ArgumentOverride = CallableDefinition | OverrideDefinition | LiteralDefinition;

export class LiteralDefinition {
  constructor(
    public readonly source: string,
  ) {}
}

export class SingleType {
  constructor(
    public readonly type: Type,
    public readonly nullable: boolean = false,
    public readonly aliasType: Type = type,
  ) {}

  * getInjectableTypes(): Iterable<InjectableType> {
    yield this;
  }

  get serviceType(): Type {
    return this.type;
  }
}

export class ListType {
  private readonly asSingleType: SingleType;

  constructor(
    public readonly type: Type,
    public readonly value: SingleType,
    public readonly nullable: boolean = false,
  ) {
    this.asSingleType = new SingleType(this.type, this.nullable, this.aliasType);
  }

  * getInjectableTypes(): Iterable<InjectableType> {
    yield this.asSingleType;
    yield this;
  }

  get serviceType(): Type {
    return this.value.serviceType;
  }

  get aliasType(): Type {
    return this.value.aliasType;
  }
}

export class PromiseType {
  private readonly asSingleType: SingleType;

  constructor(
    public readonly type: Type,
    public readonly value: SingleType | ListType,
    public readonly nullable: boolean = false,
  ) {
    this.asSingleType = new SingleType(this.type, this.nullable, this.aliasType);
  }

  * getInjectableTypes(): Iterable<InjectableType> {
    yield this.asSingleType;
    yield this;
  }

  get serviceType(): Type {
    return this.value.serviceType;
  }

  get aliasType(): Type {
    return this.value.aliasType;
  }
}

export class IterableType {
  private readonly asSingleType: SingleType;

  constructor(
    public readonly type: Type,
    public readonly value: SingleType,
    public readonly nullable: boolean = false,
    public readonly async: boolean = false,
  ) {
    this.asSingleType = new SingleType(this.type, this.nullable, this.aliasType);
  }

  * getInjectableTypes(): Iterable<InjectableType> {
    yield this.asSingleType;
    yield this;
  }

  get serviceType(): Type {
    return this.value.serviceType;
  }

  get aliasType(): Type {
    return this.value.aliasType;
  }
}

export class AccessorType {
  private readonly asSingleType: SingleType;

  constructor(
    public readonly type: Type,
    public readonly returnType: SingleType | ListType | PromiseType,
    public readonly nullable: boolean = false,
  ) {
    this.asSingleType = new SingleType(this.type, this.nullable, this.aliasType);
  }

  * getInjectableTypes(): Iterable<InjectableType> {
    yield this.asSingleType;
    yield this;
  }

  get serviceType(): Type {
    return this.returnType.serviceType;
  }

  get aliasType(): Type {
    return this.returnType.aliasType;
  }
}

export class InjectorType {
  private readonly asSingleType: SingleType;

  constructor(
    public readonly type: Type,
    public readonly serviceType: Type,
    public readonly nullable: boolean = false,
  ) {
    this.asSingleType = new SingleType(this.type, this.nullable, this.aliasType);
  }

  * getInjectableTypes(): Iterable<InjectableType> {
    yield this.asSingleType;
    yield this;
  }

  get aliasType(): Type {
    return this.serviceType;
  }
}

export class TupleType {
  readonly values: ValueType[];

  constructor(
    ...values: ValueType[]
  ) {
    this.values = values;
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
  | TupleType
  | ScopedRunnerType;

export type InjectableType =
  | SingleType
  | ListType
  | PromiseType
  | IterableType
  | AccessorType
  | InjectorType;

export type ReturnType =
  | SingleType
  | ListType
  | PromiseType
  | IterableType;
