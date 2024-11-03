import { Event } from './event';

export abstract class AsyncEvent extends Event {
  private readonly tasks: Set<Promise<unknown>> = new Set();

  waitFor(task: Promise<unknown> | (() => Promise<unknown>)): void {
    this.tasks.add(typeof task === 'function' ? task() : task);
  }

  async resolve(): Promise<this> {
    if (this.tasks.size) {
      await Promise.all(this.tasks);
    }

    return this;
  }
}
