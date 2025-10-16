const brand = Symbol('brand');

export interface DynamicChildService {
  [brand]?: void;
}

export class ImplicitChildService {
  static async create(dynamic: DynamicChildService): Promise<ImplicitChildService> {
    return new ImplicitChildService(dynamic);
  }

  private constructor(readonly dynamic: DynamicChildService) {}
}

export interface ChildPublicInterface {
  [brand]?: void;
}

export class ChildPublicService implements ChildPublicInterface {
  [brand]?: void;

  constructor(readonly implicit: ImplicitChildService) {}
}
