import { useLayoutEffect, useRef, useState } from "react";

/**
 * Keep an event-handler identity stable while dispatching to the latest
 * callback from the most recently committed render.
 */
export function useStableEventCallback<TArgs extends unknown[], TResult>(
  callback: (...args: TArgs) => TResult,
): (...args: TArgs) => TResult {
  const callbackRef = useRef(callback);
  useLayoutEffect(() => {
    callbackRef.current = callback;
  });
  const [stableCallback] = useState(
    () =>
      (...args: TArgs): TResult =>
        callbackRef.current(...args),
  );
  return stableCallback;
}
