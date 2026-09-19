import { Global, Injectable, Module } from '@nestjs/common';
import { EventEmitter2, EventEmitterModule, OnEvent } from '@nestjs/event-emitter';

/**
 * A named, typed in-process event. The publishing module declares it and
 * exports it from its index.ts; the payload type travels with the name.
 */
export interface EventDefinition<Payload> {
  readonly name: string;
  /** Type carrier only; never read at runtime. */
  readonly payload?: Payload;
}

export const defineEvent = <Payload>(name: string): EventDefinition<Payload> => ({ name });

/**
 * Delivery is in-process and not guaranteed: a crash between commit and
 * handler loses the event. Use events for optional reactions only; anything
 * that must happen belongs in the same transaction or a direct call.
 */
@Injectable()
export class EventBus {
  constructor(private readonly emitter: EventEmitter2) {}

  publish<Payload>(event: EventDefinition<Payload>, payload: Payload): void {
    this.emitter.emit(event.name, payload);
  }
}

/** Subscribes a method to an event; handler errors are logged, never thrown at the publisher. */
export const OnDomainEvent = <Payload>(event: EventDefinition<Payload>) =>
  OnEvent(event.name, { async: true, promisify: true, suppressErrors: true });

@Global()
@Module({
  imports: [EventEmitterModule.forRoot({ wildcard: false, ignoreErrors: false })],
  providers: [EventBus],
  exports: [EventBus],
})
export class EventsModule {}
