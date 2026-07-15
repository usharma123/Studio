import { Check, LoaderCircle, RotateCcw } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

import {
  changedWorkbookRows,
  discardWorkbookDrafts,
  effectiveWorkbookRow,
  updateWorkbookDraft,
  type WorkbookDrafts,
} from "./workbookGridModel";

export interface WorkbookColumn<Row> {
  readonly id: string;
  readonly header: string;
  readonly className?: string;
  readonly width?: string;
  readonly cell: (context: {
    readonly row: Row;
    readonly readOnly: boolean;
    readonly update: (row: Row) => void;
  }) => ReactNode;
}

interface WorkbookGridProps<Row> {
  readonly ariaLabel: string;
  readonly rows: readonly Row[];
  readonly columns: readonly WorkbookColumn<Row>[];
  readonly getRowId: (row: Row) => string;
  readonly readOnly?: boolean;
  readonly emptyState: ReactNode;
  readonly onSave?: (rows: readonly Row[]) => Promise<void> | void;
}

export function WorkbookGrid<Row>(props: WorkbookGridProps<Row>) {
  const [drafts, setDrafts] = useState<WorkbookDrafts<Row>>(() => new Map());
  const [saving, setSaving] = useState(false);
  const dirty = drafts.size > 0;
  const readOnly = props.readOnly ?? props.onSave === undefined;
  const save = () => {
    if (!props.onSave || !dirty || saving) return;
    setSaving(true);
    void Promise.resolve(props.onSave(changedWorkbookRows(drafts))).then(
      () => {
        setDrafts(discardWorkbookDrafts());
        setSaving(false);
      },
      () => setSaving(false),
    );
  };

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex min-h-10 items-center gap-2 border-b bg-muted/20 px-3">
        <span className="text-[11px] font-medium text-muted-foreground">
          {props.rows.length} row{props.rows.length === 1 ? "" : "s"}
        </span>
        {readOnly ? (
          <span className="ml-auto rounded-full border bg-background px-2 py-0.5 text-[10px] text-muted-foreground">
            Read only
          </span>
        ) : dirty ? (
          <div className="ml-auto flex items-center gap-1.5">
            <span className="mr-1 text-[10px] text-amber-600 dark:text-amber-400">
              {drafts.size} unsaved
            </span>
            <Button
              size="xs"
              variant="ghost"
              disabled={saving}
              onClick={() => setDrafts(discardWorkbookDrafts())}
            >
              <RotateCcw />
              Discard
            </Button>
            <Button size="xs" disabled={saving} onClick={save}>
              {saving ? <LoaderCircle className="animate-spin" /> : <Check />}
              Save
            </Button>
          </div>
        ) : (
          <span className="ml-auto text-[10px] text-muted-foreground">All changes saved</span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table
          aria-label={props.ariaLabel}
          className="w-full min-w-[640px] table-fixed border-collapse"
        >
          <colgroup>
            {props.columns.map((column) => (
              <col key={column.id} style={column.width ? { width: column.width } : undefined} />
            ))}
          </colgroup>
          <thead>
            <tr className="border-b bg-muted/30">
              {props.columns.map((column) => (
                <th
                  key={column.id}
                  scope="col"
                  className={cn(
                    "border-r px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground last:border-r-0",
                    column.className,
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {props.rows.length === 0 ? (
              <tr>
                <td
                  colSpan={props.columns.length}
                  className="px-4 py-10 text-center text-xs text-muted-foreground"
                >
                  {props.emptyState}
                </td>
              </tr>
            ) : (
              props.rows.map((sourceRow) => {
                const rowId = props.getRowId(sourceRow);
                const row = effectiveWorkbookRow(sourceRow, rowId, drafts);
                return (
                  <tr
                    key={rowId}
                    data-qa-workbook-row-id={rowId}
                    className="border-b bg-background last:border-b-0 hover:bg-muted/20"
                  >
                    {props.columns.map((column) => (
                      <td
                        key={column.id}
                        className={cn(
                          "min-w-0 border-r px-3 py-2.5 align-top text-xs last:border-r-0",
                          column.className,
                        )}
                      >
                        {column.cell({
                          row,
                          readOnly,
                          update: (next) =>
                            setDrafts((current) => updateWorkbookDraft(current, rowId, next)),
                        })}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
