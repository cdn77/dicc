import { z } from 'zod';
import { ContainerBuilder } from '../container';
import { EventSubscriber, EventSubscription } from '../events';
import {
  CompilerExtensionInjectSpecifier,
  CompilerExtensionReferences,
  EnqueueResourcesCb,
} from './types';

export abstract class CompilerExtension implements EventSubscriber {
  static readonly inject?: CompilerExtensionInjectSpecifier[];
  static readonly references?: CompilerExtensionReferences;
  static readonly configSchema?: z.ZodType;

  * getSubscribedEvents(): Iterable<EventSubscription<any>> {
  }

  loadResources(builder: ContainerBuilder, enqueue: EnqueueResourcesCb): void {
  }

  autowireDependencies(builder: ContainerBuilder): void {
  }
}
