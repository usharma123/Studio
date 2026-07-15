import type { QaReleaseSnapshot } from "@t3tools/contracts";
import {
  AlertTriangle,
  Check,
  FileCheck2,
  FileText,
  FileUp,
  LoaderCircle,
  Play,
} from "lucide-react";
import { useRef } from "react";

import { Button } from "~/components/ui/button";

import { canStartIngestion } from "../model";
import {
  documentKindChecklist,
  documentVersion,
  persistedDocumentKind,
  suggestedDocumentKind,
} from "../intakeModel";
import type { QaStageTabId } from "../stageRouting";

interface IntakeStageProps {
  readonly snapshot: QaReleaseSnapshot;
  readonly selectedTab: QaStageTabId;
  readonly readOnly: boolean;
  readonly busy:
    | "initialize"
    | "upload"
    | "ingestion"
    | "save"
    | "review"
    | "strategy"
    | "scenario"
    | "test-case"
    | "script"
    | "readiness"
    | null;
  readonly onFiles: (files: FileList | null) => Promise<void> | void;
  readonly onStartIngestion: () => Promise<void> | void;
}

export function IntakeStage(props: IntakeStageProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const checklist = documentKindChecklist(props.snapshot.documents);
  if (props.selectedTab === "progress") {
    return <IntakeProgress snapshot={props.snapshot} />;
  }
  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <FileUp className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-medium">Source documents</h3>
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {props.snapshot.documents.length}
        </span>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={(event) => {
            const input = event.currentTarget;
            void Promise.resolve(props.onFiles(input.files)).finally(() => {
              input.value = "";
            });
          }}
        />
        <Button
          className="ml-auto"
          size="xs"
          variant="outline"
          disabled={
            props.readOnly || props.busy !== null || props.snapshot.ingestionStatus !== "idle"
          }
          onClick={() => inputRef.current?.click()}
        >
          {props.busy === "upload" ? <LoaderCircle className="animate-spin" /> : <FileUp />}
          Add files
        </Button>
      </div>
      <div className="grid grid-cols-4 gap-px border-b bg-border">
        {checklist.map((item) => (
          <div key={item.kind} className="bg-card px-3 py-2.5">
            <div className="flex items-center gap-1.5">
              {item.status === "classified" ? (
                <Check className="size-3 text-emerald-500" />
              ) : item.status === "suggested" ? (
                <AlertTriangle className="size-3 text-amber-500" />
              ) : (
                <span className="size-2.5 rounded-full border" aria-hidden />
              )}
              <span className="text-[10px] font-semibold">{item.kind}</span>
            </div>
            <p className="mt-1 truncate text-[9px] text-muted-foreground">
              {item.status === "classified"
                ? `${item.documents.length} classified`
                : item.status === "suggested"
                  ? "Confirm suggestion"
                  : "Not provided"}
            </p>
          </div>
        ))}
      </div>
      {props.snapshot.documents.length === 0 ? (
        <button
          type="button"
          disabled={props.readOnly}
          className="m-3 flex w-[calc(100%-1.5rem)] flex-col items-center rounded-lg border border-dashed px-4 py-8 text-center hover:bg-muted/30 disabled:pointer-events-none"
          onClick={() => inputRef.current?.click()}
        >
          <FileUp className="size-5 text-muted-foreground" />
          <span className="mt-2 text-xs font-medium">Add release documents</span>
          <span className="mt-1 text-[11px] text-muted-foreground">
            Requirements, specifications, change requests, or test evidence
          </span>
        </button>
      ) : (
        <div>
          {props.snapshot.documents.map((document) => (
            <div
              key={document.id}
              className="flex items-center gap-3 border-b px-4 py-2.5 last:border-b-0"
            >
              <div className="flex size-8 items-center justify-center rounded-lg bg-muted/70">
                {document.status === "processed" ? (
                  <FileCheck2 className="size-4 text-emerald-500" />
                ) : (
                  <FileText className="size-4 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">{document.fileName}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span>{document.mediaType}</span>
                  <span>·</span>
                  <span>{Math.max(1, Math.round(document.byteSize / 1024))} KB</span>
                  {documentVersion(document) ? <span>· v{documentVersion(document)}</span> : null}
                </div>
              </div>
              <DocumentClassification document={document} />
              <span className="capitalize text-[10px] text-muted-foreground">
                {document.status}
              </span>
            </div>
          ))}
        </div>
      )}
      {!props.readOnly ? (
        <div className="flex items-center justify-between gap-3 border-t bg-muted/20 px-4 py-3">
          <p className="text-[11px] leading-4 text-muted-foreground">
            The local QA runtime deterministically extracts requirements and traceability.
          </p>
          <Button
            size="sm"
            disabled={props.busy !== null || !canStartIngestion(props.snapshot)}
            onClick={() => void props.onStartIngestion()}
          >
            {props.busy === "ingestion" ? <LoaderCircle className="animate-spin" /> : <Play />}
            Start ingestion
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function DocumentClassification({
  document,
}: {
  readonly document: QaReleaseSnapshot["documents"][number];
}) {
  const persisted = persistedDocumentKind(document);
  const suggested = suggestedDocumentKind(document);
  if (persisted) {
    return (
      <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
        {persisted}
      </span>
    );
  }
  return (
    <span className="rounded-full border bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
      {suggested ? `${suggested}?` : "Unclassified"}
    </span>
  );
}

function IntakeProgress({ snapshot }: { readonly snapshot: QaReleaseSnapshot }) {
  const processed = snapshot.documents.filter((document) => document.status === "processed").length;
  return (
    <section className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">Ingestion progress</h3>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {processed} of {snapshot.documents.length} documents processed
          </p>
        </div>
        <span className="text-sm font-semibold tabular-nums">{snapshot.ingestionProgress}%</span>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${snapshot.ingestionProgress}%` }}
        />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <Metric label="Uploaded" value={snapshot.documents.length} />
        <Metric label="Processed" value={processed} />
        <Metric label="Requirements" value={snapshot.requirements.length} />
      </div>
    </section>
  );
}

function Metric(props: { readonly label: string; readonly value: number }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <p className="text-lg font-semibold tabular-nums">{props.value}</p>
      <p className="mt-0.5 text-[10px] text-muted-foreground">{props.label}</p>
    </div>
  );
}
