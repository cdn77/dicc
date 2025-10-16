import { ServiceDefinition } from 'dicc';
import { ChildPublicService, DynamicChildService, ImplicitChildService } from './common';

export { DynamicChildService, ImplicitChildService };

export const childPublicService = {
  factory: ChildPublicService,
} satisfies ServiceDefinition<ChildPublicService>;
