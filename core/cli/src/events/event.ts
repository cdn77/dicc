import { EventConstructor, EventHandler, EventSubscription } from './types';

export abstract class Event {
  static sub<E extends Event>(
    this: EventConstructor<E>,
    handler: EventHandler<E>,
  ): EventSubscription<E> {
    return [this, handler];
  }

  private cancelled: boolean = false;

  cancel(): void {
    this.cancelled = true;
  }

  isCancelled(): boolean {
    return this.cancelled;
  }
}
