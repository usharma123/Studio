import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";

/**
 * Re-runs a live authorization decision immediately before each item leaves a
 * long-lived stream. This intentionally does not cache successful decisions:
 * assignment, release, and session revocation must affect the next event.
 */
export const reauthorizeStreamItems = <A, E, R, AuthorizationError, AuthorizationContext>(
  stream: Stream.Stream<A, E, R>,
  authorize: (item: A) => Effect.Effect<void, AuthorizationError, AuthorizationContext>,
): Stream.Stream<A, E | AuthorizationError, R | AuthorizationContext> =>
  stream.pipe(Stream.mapEffect((item) => authorize(item).pipe(Effect.as(item))));
