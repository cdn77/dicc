import { ServiceDefinition } from 'dicc';
import { DynamicChildService, ImplicitChildService, ChildPublicService } from './common';

export { DynamicChildService, ImplicitChildService };

export const childPublicService = {
  factory: ChildPublicService,
} satisfies ServiceDefinition<ChildPublicService>;
