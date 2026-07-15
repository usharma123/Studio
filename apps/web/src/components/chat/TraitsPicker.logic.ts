import type {
  ProviderDriverKind,
  ProviderOptionSelection,
  ServerProviderModel,
} from "@t3tools/contracts";
import { getProviderOptionDescriptors } from "@t3tools/shared/model";
import { getProviderModelCapabilities } from "../../providerModels";

type ProviderOptions = ReadonlyArray<ProviderOptionSelection>;

export function shouldRenderTraitsControls(input: {
  provider: ProviderDriverKind;
  models: ReadonlyArray<ServerProviderModel>;
  model: string | null | undefined;
  prompt: string;
  modelOptions: ProviderOptions | null | undefined;
  allowPromptInjectedEffort?: boolean;
}): boolean {
  const caps = getProviderModelCapabilities(input.models, input.model, input.provider);
  const descriptors = getProviderOptionDescriptors({ caps, selections: input.modelOptions });
  return descriptors.some(
    (descriptor) =>
      descriptor.type === "select" ||
      (descriptor.type === "boolean" &&
        (descriptor.id === "thinking" || descriptor.id === "fastMode")),
  );
}
