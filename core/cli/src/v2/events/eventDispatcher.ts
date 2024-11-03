import { getOrCreate } from '../utils';
import { AsyncEvent } from './asyncEvent';
import { Event } from './event';
import { EventConstructor, EventHandler, EventSubscriber } from './types';

export class EventDispatcher {
  private readonly events: Map<EventConstructor<any>, Map<EventHandler<any>, EventHandler<any>>> = new Map();

  addSubscriber(subscriber: EventSubscriber): void {
    for (const [event, handler] of subscriber.getSubscribedEvents()) {
      this.on(event, handler);
    }
  }

  removeSubscriber(subscriber: EventSubscriber): void {
    for (const [event, handler] of subscriber.getSubscribedEvents()) {
      this.off(event, handler);
    }
  }

  on<E extends Event>(event: EventConstructor<E>, handler: EventHandler<E>): void {
    getOrCreate(this.events, event, () => new Map()).set(handler, handler);
  }

  once<E extends Event>(event: EventConstructor<E>, handler: EventHandler<E>): void {
    const wrapped: EventHandler<E> = (evt) => {
      this.off(event, handler);
      handler(evt);
    };

    getOrCreate(this.events, event, () => new Map()).set(handler, wrapped);
  }

  off<E extends Event = any>(event?: EventConstructor<E>, handler?: EventHandler<E>): void {
    if (!event) {
      this.events.clear();
      return;
    }

    const handlers = this.events.get(event);

    if (!handlers) {
      return;
    }

    if (handler) {
      handlers.delete(handler);
    } else {
      handlers.clear();
    }

    if (!handlers.size) {
      this.events.delete(event);
    }
  }

  dispatch<E extends AsyncEvent>(event: E): Promise<E>;
  dispatch<E extends Event>(event: E): E;
  dispatch<E extends Event>(event: E): Promise<E> | E {
    const handlers = this.events.get(event.constructor as EventConstructor<E>);

    if (!handlers) {
      return event instanceof AsyncEvent ? event.resolve() : event;
    }

    return event instanceof AsyncEvent
      ? this.dispatchAsync(event, handlers)
      : this.dispatchSync(event, handlers);
  }

  private dispatchSync<E extends Event>(
    event: E,
    handlers: Map<EventHandler<E>, EventHandler<E>>,
  ): E {
    for (const handler of handlers.values()) {
      handler(event);
    }

    return event;
  }

  private async dispatchAsync<E extends AsyncEvent>(
    event: E,
    handlers: Map<EventHandler<E>, EventHandler<E>>,
  ): Promise<E> {
    for (const handler of handlers.values()) {
      await handler(event);
    }

    return event.resolve();
  }
}
