import { AbstractContainer } from './abstractContainer';
import { DynamicServices, PublicServices } from './types';

export class Container<
  PublicServices extends Record<string, any> = {},
  DynamicServices extends Record<string, any> = {},
  AnonymousServices extends Record<string, any> = {},
> extends AbstractContainer<PublicServices & DynamicServices & AnonymousServices> {
  [PublicServices]?: PublicServices;
  [DynamicServices]?: DynamicServices;
}
