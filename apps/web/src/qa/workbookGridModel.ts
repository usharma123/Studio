export type WorkbookDrafts<Row> = ReadonlyMap<string, Row>;

export function updateWorkbookDraft<Row>(
  drafts: WorkbookDrafts<Row>,
  rowId: string,
  row: Row,
): WorkbookDrafts<Row> {
  const next = new Map(drafts);
  next.set(rowId, row);
  return next;
}

export function effectiveWorkbookRow<Row>(
  row: Row,
  rowId: string,
  drafts: WorkbookDrafts<Row>,
): Row {
  return drafts.get(rowId) ?? row;
}

export function changedWorkbookRows<Row>(drafts: WorkbookDrafts<Row>): readonly Row[] {
  return [...drafts.values()];
}

export function discardWorkbookDrafts<Row>(_drafts?: WorkbookDrafts<Row>): WorkbookDrafts<Row> {
  return new Map<string, Row>();
}
