import type { AsyncEvent } from './asyncEvent';
import type { Event } from './event';

export type EventHandler<E extends Event = Event> = (
  event: E,
) => E extends AsyncEvent ? Promise<void> | void : void;

export type EventConstructor<E extends Event = Event> = {
  new (...args: any): E;
};

export type EventSubscription<E extends Event> = [
  event: EventConstructor<E>,
  handler: EventHandler<E>,
];

export interface EventSubscriber {
  getSubscribedEvents(): Iterable<EventSubscription<any>>;
}
