import { AbstractContainer } from './abstractContainer';
import { DynamicServices, PublicServices } from './types';

export class Container<
  PublicServices extends Record<string, any> = Record<string, never>,
  DynamicServices extends Record<string, any> = Record<string, never>,
  AnonymousServices extends Record<string, any> = Record<string, never>,
> extends AbstractContainer<PublicServices & DynamicServices & AnonymousServices> {
  [PublicServices]?: PublicServices;
  [DynamicServices]?: DynamicServices;
}
