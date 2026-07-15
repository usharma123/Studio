import { useAuth } from "@clerk/react";
import { AuthAdministrativeScopes, AuthRelayWriteScope } from "@t3tools/contracts";
import { CheckIcon } from "lucide-react";
import { useReducer } from "react";

import {
  CONNECT_ONBOARDING_OPT_OUT_STORAGE_KEY,
  ConnectOnboardingOptOutSchema,
  EMPTY_CONNECT_ONBOARDING_OPT_OUT_STATE,
} from "~/cloud/connectOnboarding";
import { hasCloudPublicConfig } from "~/cloud/publicConfig";
import { useCloudLinkController } from "~/cloud/useCloudLinkController";
import { usePrimarySessionState } from "~/environments/primary";
import { useLocalStorage } from "~/hooks/useLocalStorage";
import { cn } from "~/lib/utils";
import { useEnvironments, usePrimaryEnvironment } from "~/state/environments";
import { CloudEnvironmentConnectRows } from "./CloudEnvironmentConnectList";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Switch } from "../ui/switch";
import { toastManager } from "../ui/toast";

/**
 * Post-sign-in onboarding wizard for T3 Connect. Opens on every in-session
 * sign-in — sign-out removes the connected relay environments, so each new
 * session starts with no devices to reach. It first prompts to publish this
 * environment (managed tunnel + agent activity, both defaulting on) when the
 * current session is authorized to manage the relay link, then lists the
 * account's T3 Connect environments so every device can be connected right
 * away. A cold load with a restored session does not count as a sign-in.
 */
export function ConnectOnboardingDialog() {
  if (!hasCloudPublicConfig()) return null;

  return <ConfiguredConnectOnboardingDialog />;
}

type OnboardingStep = "publish" | "devices";

interface OnboardingState {
  readonly observedAccount: string | null | undefined;
  readonly requestedAccount: string | null;
  readonly openForAccount: string | null;
  readonly prefilledForAccount: string | null;
  readonly step: OnboardingStep;
  readonly exposeEnvironment: boolean;
  readonly publishAgentActivity: boolean;
  readonly dontShowAgain: boolean;
  readonly isApplying: boolean;
}

type OnboardingAction =
  | { readonly type: "replace"; readonly state: OnboardingState }
  | { readonly type: "patch"; readonly patch: Partial<OnboardingState> };

const INITIAL_ONBOARDING_STATE: OnboardingState = {
  observedAccount: undefined,
  requestedAccount: null,
  openForAccount: null,
  prefilledForAccount: null,
  step: "devices",
  exposeEnvironment: true,
  publishAgentActivity: true,
  dontShowAgain: false,
  isApplying: false,
};

function reduceOnboardingState(state: OnboardingState, action: OnboardingAction): OnboardingState {
  return action.type === "replace" ? action.state : { ...state, ...action.patch };
}

function reconcileOnboardingState(
  state: OnboardingState,
  input: {
    readonly accountSnapshotReady: boolean;
    readonly activeAccount: string | null;
    readonly optOutAccounts: ReadonlyArray<string>;
    readonly canOpen: boolean;
    readonly showPublishStep: boolean;
    readonly linkStateData: ReturnType<typeof useCloudLinkController>["linkState"]["data"];
  },
): OnboardingState {
  let next = state;
  const patch = (values: Partial<OnboardingState>) => {
    next = { ...next, ...values };
  };

  if (input.accountSnapshotReady && next.observedAccount !== input.activeAccount) {
    const shouldRequest =
      next.observedAccount !== undefined &&
      next.observedAccount !== input.activeAccount &&
      input.activeAccount !== null;
    patch({
      observedAccount: input.activeAccount,
      ...(shouldRequest ? { requestedAccount: input.activeAccount } : {}),
    });
  }

  if (next.openForAccount !== null && next.openForAccount !== input.activeAccount) {
    patch({ openForAccount: null, prefilledForAccount: null });
  }
  if (next.requestedAccount !== null && next.requestedAccount !== input.activeAccount) {
    patch({ requestedAccount: null });
  }

  if (next.requestedAccount !== null && input.optOutAccounts.includes(next.requestedAccount)) {
    patch({ requestedAccount: null });
  } else if (next.requestedAccount !== null && next.openForAccount === null && input.canOpen) {
    patch({
      requestedAccount: null,
      openForAccount: next.requestedAccount,
      prefilledForAccount: null,
      step: input.showPublishStep ? "publish" : "devices",
      exposeEnvironment: true,
      publishAgentActivity: true,
      dontShowAgain: false,
    });
  }

  if (
    next.openForAccount !== null &&
    next.prefilledForAccount !== next.openForAccount &&
    input.linkStateData !== null
  ) {
    const account = next.openForAccount;
    const linkMatchesAccount =
      input.linkStateData.linked && input.linkStateData.cloudUserId === account;
    patch({
      prefilledForAccount: account,
      ...(linkMatchesAccount
        ? {
            exposeEnvironment:
              input.linkStateData.managedTunnelActive ?? input.linkStateData.linked,
            publishAgentActivity: input.linkStateData.publishAgentActivity,
          }
        : {}),
    });
  }

  return next;
}

function ConfiguredConnectOnboardingDialog() {
  // Mirrors ManagedRelayAuthProvider: a pending Clerk session must not read as
  // signed-out, or its later activation would look like a fresh sign-in.
  const { isLoaded, isSignedIn, userId } = useAuth({ treatPendingAsSignedOut: false });
  const [optOutState, setOptOutState] = useLocalStorage(
    CONNECT_ONBOARDING_OPT_OUT_STORAGE_KEY,
    EMPTY_CONNECT_ONBOARDING_OPT_OUT_STATE,
    ConnectOnboardingOptOutSchema,
  );

  const desktopBridge = window.desktopBridge;
  const primarySessionState = usePrimarySessionState();
  const currentSessionScopes = desktopBridge
    ? AuthAdministrativeScopes
    : primarySessionState.data?.authenticated
      ? (primarySessionState.data.scopes ?? null)
      : null;
  const canManageRelay = currentSessionScopes?.includes(AuthRelayWriteScope) ?? false;
  // The publish step is only offered when we know the answer; opening the
  // wizard before the session state resolves would let the step set change
  // mid-flight. A failed session read still opens the wizard — it just means
  // no publish step.
  const sessionScopesKnown =
    Boolean(desktopBridge) ||
    primarySessionState.data !== null ||
    primarySessionState.error !== null;

  const controller = useCloudLinkController();
  const showPublishStep = canManageRelay && controller.linkState.target !== null;
  const steps: ReadonlyArray<OnboardingStep> = showPublishStep
    ? ["publish", "devices"]
    : ["devices"];

  const [onboardingState, dispatchOnboarding] = useReducer(
    reduceOnboardingState,
    INITIAL_ONBOARDING_STATE,
  );

  const optOutAccounts = optOutState.optOutAccounts;

  // A manageable session implies a primary environment, so when the scopes
  // allow publishing, wait for the connection target too — otherwise the
  // wizard could open on the devices step moments before the publish step
  // becomes available and freeze there.
  const publishStepDecided = !canManageRelay || controller.linkState.target !== null;

  const linkStateData = controller.linkState.data;
  const activeAccount = isSignedIn && userId ? userId : null;
  const reconciledState = reconcileOnboardingState(onboardingState, {
    accountSnapshotReady: Boolean(isLoaded && (!isSignedIn || userId)),
    activeAccount,
    optOutAccounts,
    canOpen: sessionScopesKnown && publishStepDecided,
    showPublishStep,
    linkStateData,
  });
  if (reconciledState !== onboardingState) {
    dispatchOnboarding({ type: "replace", state: reconciledState });
  }
  const {
    openForAccount,
    step,
    exposeEnvironment,
    publishAgentActivity,
    dontShowAgain,
    isApplying,
  } = onboardingState;
  const patchOnboarding = (patch: Partial<OnboardingState>) => {
    dispatchOnboarding({ type: "patch", patch });
  };

  const complete = () => {
    // Keep the wizard up while a link request is in flight so its outcome
    // (and any failure) stays visible.
    if (isApplying) return;
    const account = openForAccount;
    patchOnboarding({ openForAccount: null, prefilledForAccount: null });
    if (account !== null && dontShowAgain) {
      setOptOutState((state) =>
        state.optOutAccounts.includes(account)
          ? state
          : { optOutAccounts: [...state.optOutAccounts, account] },
      );
    }
  };

  const applyPublishSelection = async () => {
    // The wizard only ever enables — with both toggles off there is nothing to
    // apply, and an existing link must not be torn down from onboarding.
    if (!exposeEnvironment && !publishAgentActivity) {
      patchOnboarding({ step: "devices" });
      return;
    }
    patchOnboarding({ isApplying: true });
    const ok = await controller.reconcileCloudState({
      managedTunnel: exposeEnvironment,
      publish: publishAgentActivity,
    });
    patchOnboarding({ isApplying: false });
    if (!ok) return;
    toastManager.add({
      type: "success",
      title: "T3 Connect enabled",
      description: exposeEnvironment
        ? "This environment is available to your other devices through T3 Connect."
        : "This environment publishes agent activity to your mobile clients.",
    });
    patchOnboarding({ step: "devices" });
  };

  return (
    <Dialog
      open={openForAccount !== null}
      onOpenChange={(open) => {
        // Keep the dialog up while a link request is in flight so its outcome
        // (and any failure) stays visible.
        if (!open && !isApplying) complete();
      }}
    >
      <DialogPopup className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Set up T3 Connect</DialogTitle>
          <DialogDescription>
            Mesh your devices together — publish this environment and connect the rest, all in one
            place.
          </DialogDescription>
          {steps.length > 1 ? (
            <OnboardingStepper
              steps={steps}
              currentStep={step}
              disabled={isApplying}
              onStepSelect={(nextStep) => patchOnboarding({ step: nextStep })}
            />
          ) : null}
        </DialogHeader>
        <DialogPanel>
          {step === "publish" ? (
            <PublishStep
              exposeEnvironment={exposeEnvironment}
              publishAgentActivity={publishAgentActivity}
              disabled={isApplying}
              operationError={controller.operationError}
              onExposeEnvironmentChange={(enabled) =>
                patchOnboarding({ exposeEnvironment: enabled })
              }
              onPublishAgentActivityChange={(enabled) =>
                patchOnboarding({ publishAgentActivity: enabled })
              }
            />
          ) : (
            <DevicesStep />
          )}
        </DialogPanel>
        <DialogFooter variant="bare" className="sm:justify-between">
          <label className="flex cursor-pointer items-center gap-2 self-start text-xs text-muted-foreground sm:self-center">
            <Checkbox
              checked={dontShowAgain}
              onCheckedChange={(checked) => patchOnboarding({ dontShowAgain: checked === true })}
            />
            Don&apos;t show this again
          </label>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            {step === "publish" ? (
              <>
                <Button
                  variant="ghost"
                  disabled={isApplying}
                  onClick={() => patchOnboarding({ step: "devices" })}
                >
                  Not now
                </Button>
                <Button
                  disabled={
                    isApplying || (controller.linkState.isPending && linkStateData === null)
                  }
                  onClick={() => void applyPublishSelection()}
                >
                  {isApplying ? "Enabling…" : "Continue"}
                </Button>
              </>
            ) : (
              <Button disabled={isApplying} onClick={complete}>
                Done
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

const STEP_LABELS: Record<OnboardingStep, string> = {
  publish: "Publish",
  devices: "Connect devices",
};

function OnboardingStepper({
  steps,
  currentStep,
  disabled,
  onStepSelect,
}: {
  readonly steps: ReadonlyArray<OnboardingStep>;
  readonly currentStep: OnboardingStep;
  readonly disabled: boolean;
  readonly onStepSelect: (step: OnboardingStep) => void;
}) {
  const currentIndex = steps.indexOf(currentStep);
  return (
    <div className="grid grid-cols-2 gap-2">
      {steps.map((step, index) => (
        <button
          key={step}
          type="button"
          disabled={disabled}
          className={cn(
            "grid min-w-0 grid-cols-[1rem_minmax(0,1fr)] gap-x-2 rounded-lg border px-3 py-2 text-left",
            index === currentIndex
              ? "border-primary bg-primary/10 ring-1 ring-primary/25"
              : index < currentIndex
                ? "border-border bg-background"
                : "border-border bg-muted/40",
          )}
          onClick={() => onStepSelect(step)}
        >
          <span
            className={cn(
              "row-span-2 mt-0.5 grid size-4 place-items-center rounded-full border",
              index < currentIndex
                ? "border-primary bg-primary text-primary-foreground"
                : index === currentIndex
                  ? "border-primary bg-background"
                  : "border-muted-foreground/35 bg-background",
            )}
            aria-hidden
          >
            {index < currentIndex ? <CheckIcon className="size-3" /> : null}
          </span>
          <span className="text-[10px] font-medium uppercase text-muted-foreground">
            Step {index + 1}
          </span>
          <span className="truncate text-xs font-semibold text-foreground">
            {STEP_LABELS[step]}
          </span>
        </button>
      ))}
    </div>
  );
}

function PublishStep({
  exposeEnvironment,
  publishAgentActivity,
  disabled,
  operationError,
  onExposeEnvironmentChange,
  onPublishAgentActivityChange,
}: {
  readonly exposeEnvironment: boolean;
  readonly publishAgentActivity: boolean;
  readonly disabled: boolean;
  readonly operationError: string | null;
  readonly onExposeEnvironmentChange: (enabled: boolean) => void;
  readonly onPublishAgentActivityChange: (enabled: boolean) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border">
        <OnboardingToggleRow
          title="Publish this environment"
          description="Make this environment available to your other devices through T3 Connect."
          checked={exposeEnvironment}
          disabled={disabled}
          onCheckedChange={onExposeEnvironmentChange}
        />
        <OnboardingToggleRow
          title="Publish agent activity"
          description="Send activity from this environment to your mobile clients for push notifications and Live Activities."
          checked={publishAgentActivity}
          disabled={disabled}
          onCheckedChange={onPublishAgentActivityChange}
        />
      </div>
      {operationError ? <p className="text-xs text-destructive">{operationError}</p> : null}
    </div>
  );
}

function OnboardingToggleRow({
  title,
  description,
  checked,
  disabled,
  onCheckedChange,
}: {
  readonly title: string;
  readonly description: string;
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly onCheckedChange: (enabled: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-t border-border/60 px-4 py-3 first:border-t-0">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch
        aria-label={title}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}

function DevicesStep() {
  const { environments } = useEnvironments();
  const primaryEnvironment = usePrimaryEnvironment();
  const savedEnvironmentIds = environments.flatMap((environment) =>
    environment.entry.target._tag === "PrimaryConnectionTarget" ? [] : [environment.environmentId],
  );

  return (
    <div className="overflow-hidden rounded-lg border">
      <CloudEnvironmentConnectRows
        primaryEnvironmentId={primaryEnvironment?.environmentId ?? null}
        savedEnvironmentIds={savedEnvironmentIds}
        showSavedAsConnected
        empty={
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            No other environments are published to your account yet. Publish one from another device
            and it will show up here.
          </p>
        }
      />
    </div>
  );
}
