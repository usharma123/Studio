import {
  BinocularsIcon,
  ClipboardCheckIcon,
  FileSearchIcon,
  HammerIcon,
  SearchCheckIcon,
  ShieldQuestionIcon,
  WrenchIcon,
} from "lucide-react";

export interface NewTaskSuggestion {
  readonly id: string;
  readonly label: string;
  readonly prompt: string;
  readonly accentClassName: string;
  readonly icon: typeof BinocularsIcon;
}

export const NEW_TASK_SUGGESTIONS: ReadonlyArray<NewTaskSuggestion> = [
  {
    id: "explore",
    label: "Explore and understand code",
    prompt:
      "Explore this codebase and explain its architecture, the most important workflows, and the best place to start making changes.",
    accentClassName: "text-sky-400",
    icon: BinocularsIcon,
  },
  {
    id: "build",
    label: "Build a new feature, app, or tool",
    prompt:
      "Help me build a new feature in this project. Inspect the existing architecture first, then propose a focused implementation plan.",
    accentClassName: "text-violet-400",
    icon: HammerIcon,
  },
  {
    id: "review",
    label: "Review code and suggest changes",
    prompt:
      "Review the current changes for correctness, security, performance, maintainability, and missing tests. Prioritize actionable findings.",
    accentClassName: "text-emerald-400",
    icon: SearchCheckIcon,
  },
  {
    id: "fix",
    label: "Fix issues and failures",
    prompt:
      "Find and fix the most important failing tests, build errors, or runtime issues in this project. Verify the result when you are done.",
    accentClassName: "text-orange-400",
    icon: WrenchIcon,
  },
];

export const QA_TASK_SUGGESTIONS: ReadonlyArray<NewTaskSuggestion> = [
  {
    id: "requirements",
    label: "Review release requirements",
    prompt:
      "Review the release requirements, preserve their source citations, and identify ambiguities, missing acceptance criteria, dependencies, and material test risks.",
    accentClassName: "text-sky-400",
    icon: FileSearchIcon,
  },
  {
    id: "strategy",
    label: "Shape the test strategy",
    prompt:
      "Help me create or refine the test strategy for this release using the approved requirements, current risks, environments, test data, and entry and exit criteria.",
    accentClassName: "text-violet-400",
    icon: ShieldQuestionIcon,
  },
  {
    id: "coverage",
    label: "Find coverage gaps",
    prompt:
      "Analyze this release for requirement, scenario, test-case, automation, and execution coverage gaps, then prioritize the gaps by risk and release impact.",
    accentClassName: "text-emerald-400",
    icon: SearchCheckIcon,
  },
  {
    id: "readiness",
    label: "Summarize release readiness",
    prompt:
      "Summarize release readiness, including pending reviews, failed executions, open blockers, evidence gaps, and the decisions that still require a QA team member.",
    accentClassName: "text-orange-400",
    icon: ClipboardCheckIcon,
  },
];
