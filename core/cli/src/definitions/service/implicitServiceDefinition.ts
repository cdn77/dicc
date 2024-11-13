import { AbstractLocalServiceDefinition } from './abstractLocalServiceDefinition';

export class ImplicitServiceDefinition extends AbstractLocalServiceDefinition {
  isImplicit(): this is ImplicitServiceDefinition {
    return true;
  }
}
