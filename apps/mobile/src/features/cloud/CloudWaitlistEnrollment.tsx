import { useWaitlist } from "@clerk/expo";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { useReducer } from "react";

import { cn } from "../../lib/cn";
import { CloudWaitlistJoinRejectedError, joinCloudWaitlist } from "./cloudWaitlistJoin";

export function CloudWaitlistEnrollment(props: { readonly onSignIn: () => void }) {
  const { errors, fetchStatus, waitlist } = useWaitlist();
  const [{ emailAddress, requestError }, updateForm] = useReducer(
    (
      state: { readonly emailAddress: string; readonly requestError: string | null },
      update: Partial<{ readonly emailAddress: string; readonly requestError: string | null }>,
    ) => ({ ...state, ...update }),
    { emailAddress: "", requestError: null },
  );
  const isSubmitting = fetchStatus === "fetching";
  const fieldError = errors.fields.emailAddress?.longMessage;

  const joinWaitlist = async () => {
    const normalizedEmailAddress = emailAddress.trim();
    if (!normalizedEmailAddress || isSubmitting) {
      return;
    }

    updateForm({ requestError: null });
    try {
      await joinCloudWaitlist(waitlist, normalizedEmailAddress);
    } catch (error) {
      console.error(error);
      updateForm({
        requestError:
          error instanceof CloudWaitlistJoinRejectedError
            ? "Could not join the waitlist. Check your email address and try again."
            : "Could not join the waitlist. Check your connection and try again.",
      });
    }
  };

  if (waitlist.id) {
    return (
      <View className="gap-[18px]">
        <Text className="text-center font-t3-bold text-xl text-foreground">
          You are on the waitlist
        </Text>
        <Text className="text-center font-sans text-base text-foreground-secondary">
          We will email you when your T3 Connect access is ready.
        </Text>
        <SignInAction onPress={props.onSignIn} />
      </View>
    );
  }

  return (
    <View className="gap-[18px]">
      <Text className="font-sans text-base text-foreground-secondary">
        Enter your email and we will let you know when access is ready.
      </Text>

      <View className="gap-2">
        <Text className="font-t3-bold text-sm text-foreground-secondary">Email address</Text>
        <TextInput
          accessibilityLabel="Email address"
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect={false}
          className={cn(
            "min-h-[54px] rounded-2xl border border-input-border bg-input px-4 py-3.5 font-sans text-lg text-foreground border-continuous",
            (fieldError || requestError) && "border-danger-foreground",
          )}
          keyboardType="email-address"
          onChangeText={(value) => updateForm({ emailAddress: value, requestError: null })}
          onSubmitEditing={() => void joinWaitlist()}
          placeholder="Enter your email address"
          placeholderTextColorClassName="accent-placeholder"
          returnKeyType="join"
          textContentType="emailAddress"
          value={emailAddress}
        />
        {fieldError || requestError ? (
          <Text
            accessibilityLiveRegion="polite"
            className="font-sans text-sm text-danger-foreground"
            selectable
          >
            {fieldError ?? requestError}
          </Text>
        ) : null}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{
          busy: isSubmitting,
          disabled: isSubmitting || emailAddress.trim().length === 0,
        }}
        disabled={isSubmitting || emailAddress.trim().length === 0}
        onPress={() => void joinWaitlist()}
        className="min-h-[54px] flex-row items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 disabled:opacity-[0.45]"
      >
        {isSubmitting ? (
          <ActivityIndicator colorClassName="accent-primary-foreground" size="small" />
        ) : null}
        <Text className="font-t3-bold text-base text-primary-foreground">
          {isSubmitting ? "Joining" : "Join the waitlist"}
        </Text>
      </Pressable>

      <SignInAction onPress={props.onSignIn} />
    </View>
  );
}

function SignInAction(props: { readonly onPress: () => void }) {
  return (
    <View className="flex-row items-center justify-center gap-1 pt-1">
      <Text className="font-sans text-base text-foreground-secondary">Already have access?</Text>
      <Pressable accessibilityRole="button" hitSlop={8} onPress={props.onPress}>
        <Text className="font-t3-bold text-base text-foreground">Sign in</Text>
      </Pressable>
    </View>
  );
}
