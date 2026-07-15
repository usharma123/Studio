import { SparklesIcon } from "lucide-react";
import { NEW_TASK_SUGGESTIONS, QA_TASK_SUGGESTIONS } from "./NewTaskWelcome.data";

export function NewTaskWelcome({
  projectName,
  onSelectSuggestion,
  mode = "developer",
}: {
  readonly projectName: string;
  readonly onSelectSuggestion: (prompt: string) => void;
  readonly mode?: "qa" | "developer";
}) {
  const qaMode = mode === "qa";
  const suggestions = qaMode ? QA_TASK_SUGGESTIONS : NEW_TASK_SUGGESTIONS;
  return (
    <div className="flex h-full min-h-0 items-center justify-center px-4 pb-36 sm:px-8 sm:pb-40">
      <div className="w-full max-w-4xl">
        <div className="mb-8 flex flex-col items-center text-center sm:mb-10">
          <div className="relative mb-6 flex size-14 items-center justify-center rounded-[20px] border border-border/70 bg-card/60 shadow-lg shadow-black/10">
            <SparklesIcon className="absolute -right-1 -top-1 size-4 text-violet-400" />
            <span className="font-mono text-xl font-semibold tracking-[-0.12em] text-muted-foreground">
              &gt;_
            </span>
          </div>
          <h1 className="max-w-3xl text-balance text-2xl font-medium tracking-[-0.035em] text-foreground sm:text-3xl">
            {qaMode ? "What would you like to validate in " : "What should we build in "}
            <span className="text-foreground/78">{projectName}</span>?
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground/70">
            {qaMode
              ? "Work with the release assistant to review requirements, plan coverage, investigate results, and prepare release readiness."
              : "Start with a goal, attach context, or choose a shortcut. Codex can inspect, edit, run, and verify work in this project."}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {suggestions.map((suggestion) => {
            const Icon = suggestion.icon;
            return (
              <button
                key={suggestion.id}
                type="button"
                className="group flex min-h-28 cursor-pointer flex-col justify-between rounded-2xl border border-border/75 bg-card/25 p-4 text-left shadow-sm shadow-black/5 transition-[border-color,background-color,transform] duration-150 hover:-translate-y-0.5 hover:border-border hover:bg-card/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => onSelectSuggestion(suggestion.prompt)}
              >
                <Icon
                  className={`size-4 ${suggestion.accentClassName} transition-transform duration-150 group-hover:scale-110`}
                />
                <span className="mt-5 text-sm font-medium leading-snug text-foreground/90">
                  {suggestion.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
