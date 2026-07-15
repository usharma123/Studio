"use client";

import {
  ProviderDriverKind,
  type ProviderInstanceId,
  type ServerProviderModel,
} from "@t3tools/contracts";
import { normalizeModelSlug } from "@t3tools/shared/model";
import { PlusIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { sortModelsForProviderInstance } from "../../modelOrdering";
import { MAX_CUSTOM_MODEL_LENGTH } from "../../modelSelection";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { ProviderModelRow } from "./ProviderModelRow";

const CUSTOM_MODEL_PLACEHOLDER_BY_KIND: Partial<Record<ProviderDriverKind, string>> = {
  [ProviderDriverKind.make("codex")]: "gpt-6.7-codex-ultra-preview",
  [ProviderDriverKind.make("claudeAgent")]: "claude-sonnet-5",
  [ProviderDriverKind.make("cursor")]: "claude-sonnet-4-6",
  [ProviderDriverKind.make("opencode")]: "openai/gpt-5",
};

interface ProviderModelsSectionProps {
  readonly instanceId: ProviderInstanceId;
  readonly driverKind: ProviderDriverKind | null;
  readonly models: ReadonlyArray<ServerProviderModel>;
  readonly customModels: ReadonlyArray<string>;
  readonly hiddenModels: ReadonlyArray<string>;
  readonly favoriteModels: ReadonlyArray<string>;
  readonly modelOrder: ReadonlyArray<string>;
  readonly onChange: (next: ReadonlyArray<string>) => void;
  readonly onHiddenModelsChange: (next: ReadonlyArray<string>) => void;
  readonly onFavoriteModelsChange: (next: ReadonlyArray<string>) => void;
  readonly onModelOrderChange: (next: ReadonlyArray<string>) => void;
}

export function ProviderModelsSection({
  instanceId,
  driverKind,
  models,
  customModels,
  hiddenModels,
  favoriteModels,
  modelOrder,
  onChange,
  onHiddenModelsChange,
  onFavoriteModelsChange,
  onModelOrderChange,
}: ProviderModelsSectionProps) {
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const shouldScrollToEndRef = useRef(false);
  const hiddenModelSet = new Set(hiddenModels);
  const favoriteModelSet = new Set(favoriteModels);
  const orderedModels = sortModelsForProviderInstance(models, {
    favoriteModels: favoriteModelSet,
    groupFavorites: true,
    modelOrder,
  });

  useEffect(() => {
    if (!shouldScrollToEndRef.current) return;
    shouldScrollToEndRef.current = false;
    const frame = requestAnimationFrame(() => {
      const list = listRef.current;
      list?.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
    });
    return () => cancelAnimationFrame(frame);
  }, [customModels.length, models.length]);

  const handleAdd = () => {
    const normalized = driverKind ? normalizeModelSlug(input, driverKind) : input.trim() || null;
    if (!normalized) return setError("Enter a model slug.");
    if (models.some((model) => !model.isCustom && model.slug === normalized)) {
      return setError("That model is already built in.");
    }
    if (normalized.length > MAX_CUSTOM_MODEL_LENGTH) {
      return setError(`Model slugs must be ${MAX_CUSTOM_MODEL_LENGTH} characters or less.`);
    }
    if (customModels.includes(normalized)) return setError("That custom model is already saved.");
    onChange([...customModels, normalized]);
    setInput("");
    setError(null);
    shouldScrollToEndRef.current = true;
  };
  const handleRemove = (slug: string) => {
    onChange(customModels.filter((model) => model !== slug));
    onModelOrderChange(modelOrder.filter((model) => model !== slug));
    onFavoriteModelsChange(favoriteModels.filter((model) => model !== slug));
    setError(null);
  };
  const handleToggleHidden = (slug: string) => {
    onHiddenModelsChange(
      hiddenModelSet.has(slug)
        ? hiddenModels.filter((model) => model !== slug)
        : [...hiddenModels, slug],
    );
  };
  const handleToggleFavorite = (slug: string) => {
    onFavoriteModelsChange(
      favoriteModelSet.has(slug)
        ? favoriteModels.filter((model) => model !== slug)
        : [...favoriteModels, slug],
    );
  };
  const handleMove = (slug: string, direction: -1 | 1) => {
    const slugs = orderedModels.map((model) => model.slug);
    const index = slugs.indexOf(slug);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= slugs.length) return;
    [slugs[index], slugs[nextIndex]] = [slugs[nextIndex]!, slugs[index]!];
    onModelOrderChange(slugs);
  };

  return (
    <div className="border-t border-border/60 px-4 py-3 sm:px-5">
      <div className="text-xs font-medium text-foreground">Models</div>
      <div className="mt-1 text-xs text-muted-foreground">
        {models.length} model{models.length === 1 ? "" : "s"} available.
      </div>
      <div ref={listRef} className="mt-2 max-h-40 overflow-y-auto pb-1">
        {orderedModels.map((model, index) => {
          const isFavorite = favoriteModelSet.has(model.slug);
          const previous = orderedModels[index - 1];
          const next = orderedModels[index + 1];
          return (
            <ProviderModelRow
              key={`${instanceId}:${model.slug}`}
              instanceId={instanceId}
              model={model}
              state={{
                hidden: !model.isCustom && hiddenModelSet.has(model.slug),
                favorite: isFavorite,
                canMoveUp:
                  previous !== undefined && favoriteModelSet.has(previous.slug) === isFavorite,
                canMoveDown: next !== undefined && favoriteModelSet.has(next.slug) === isFavorite,
              }}
              onToggleHidden={handleToggleHidden}
              onToggleFavorite={handleToggleFavorite}
              onMove={handleMove}
              onRemove={handleRemove}
            />
          );
        })}
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Input
          id={`provider-instance-${instanceId}-custom-model`}
          value={input}
          onChange={(event) => {
            setInput(event.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            handleAdd();
          }}
          placeholder={driverKind ? CUSTOM_MODEL_PLACEHOLDER_BY_KIND[driverKind] : "model-slug"}
          spellCheck={false}
        />
        <Button className="shrink-0" variant="outline" onClick={handleAdd}>
          <PlusIcon className="size-3.5" /> Add
        </Button>
      </div>
      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
