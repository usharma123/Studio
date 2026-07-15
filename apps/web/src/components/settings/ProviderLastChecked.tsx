import { formatRelativeTime } from "../../timestampFormat";
import { useRelativeTimeTick } from "./useRelativeTimeTick";

export function ProviderLastChecked({ lastCheckedAt }: { readonly lastCheckedAt: string | null }) {
  useRelativeTimeTick();
  const lastCheckedRelative = lastCheckedAt ? formatRelativeTime(lastCheckedAt) : null;
  if (!lastCheckedRelative) return null;

  return (
    <span className="text-[11px] text-muted-foreground/60">
      {lastCheckedRelative.suffix ? (
        <>
          Checked <span className="font-mono tabular-nums">{lastCheckedRelative.value}</span>{" "}
          {lastCheckedRelative.suffix}
        </>
      ) : (
        <>Checked {lastCheckedRelative.value}</>
      )}
    </span>
  );
}
