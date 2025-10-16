import { ServiceDecorator, ServiceDefinition } from 'dicc';
import { ChildPublicInterface, DynamicChildService } from './common';
import { TestChildContainer } from './generatedChildContainer';

export class ParentImplementationOfChildDynamicService implements DynamicChildService {
  static async create(): Promise<ParentImplementationOfChildDynamicService> {
    return new ParentImplementationOfChildDynamicService();
  }

  private constructor() {}
}

class ParentServiceDependingOnChildPublicService {
  constructor(readonly service: ChildPublicInterface) {}
}

export const parentServiceDependingOnChildPublicService = {
  factory: ParentServiceDependingOnChildPublicService,
} satisfies ServiceDefinition<ParentServiceDependingOnChildPublicService>;

export const childContainer = {
  factory: TestChildContainer,
  onFork: (cb) => cb(),
  anonymous: true,
} satisfies ServiceDefinition<TestChildContainer>;

export const childContainerDecorators = {
  onFork: () => {},
} satisfies ServiceDecorator<TestChildContainer>;

export const childServiceDecorators = {
  decorate: (service) => service,
} satisfies ServiceDecorator<ChildPublicInterface>;
