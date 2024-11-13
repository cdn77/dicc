export interface DynamicChildService {}

export class ImplicitChildService {
  static async create(dynamic: DynamicChildService): Promise<ImplicitChildService> {
    return new ImplicitChildService(dynamic);
  }

  private constructor(
    readonly dynamic: DynamicChildService,
  ) {}
}

export interface ChildPublicInterface {}

export class ChildPublicService implements ChildPublicInterface {
  constructor(
    readonly implicit: ImplicitChildService,
  ) {}
}
