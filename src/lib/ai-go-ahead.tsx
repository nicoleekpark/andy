import { useMutation, useQuery } from "convex/react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@convex/_generated/api";
import { AiPermissionSheet } from "@/components/ai-permission-sheet";
import { useFeatureState } from "@/lib/feature-flags";
import { userMessage } from "@/lib/user-message";

/**
 * The person's go-ahead before what they write reaches an AI service
 * (`docs/design/decisions/pre-submission-privacy.md`, option A; App Review
 * 5.1.2(i)). The server is the guard (`convex/aiPermission.ts`); this is the
 * asking.
 *
 * Never asked by itself. Asked only when the person reaches for something
 * that needs reading — Let Andy read it, a photo, Ask, a follow-up — which is
 * the moment the question makes sense. Not now is remembered on the server
 * (`aiDeclinedAt`), so a person who said no writes and saves as written and is
 * not asked again unless they reach for one of those themselves.
 * Every place that is about to send something calls `useAiGoAhead()` first and
 * goes on only if it resolves true.
 */

/** Resolves true to go on; false when the person chose Not now. */
type GoAhead = () => Promise<boolean>;

/**
 * Where this person stands: `off` while the switch is off (nothing is asked),
 * `unknown` while loading or offline, then `unasked`, `declined` or `allowed`.
 * A screen uses it to choose its main button — Save as written for someone who
 * said no — never to decide whether something may be sent; that is the server.
 */
export type AiChoice = "off" | "unknown" | "unasked" | "declined" | "allowed";

const GoAheadContext = createContext<{ goAhead: GoAhead; choice: AiChoice }>({
  goAhead: async () => true,
  choice: "off",
});

/** Ask, if Andy has to, before sending anything to an AI service. */
export function useAiGoAhead(): GoAhead {
  return useContext(GoAheadContext).goAhead;
}

/** This person's answer so far (see `AiChoice`). */
export function useAiChoice(): AiChoice {
  return useContext(GoAheadContext).choice;
}

export function AiGoAheadProvider({
  active,
  children,
}: {
  /** In the app and unlocked: the only time the question may be on screen. */
  active: boolean;
  children: React.ReactNode;
}) {
  const asking = useFeatureState("aiPermission");
  const user = useQuery(api.users.current, {});
  const allow = useMutation(api.aiPermission.allow);
  const decline = useMutation(api.aiPermission.decline);
  // Needed only when the switch is known to be on and the user row is known
  // to say no. Not known yet — loading, offline — is not a reason to ask: the
  // server refuses anything it has to, in words that say where to go.
  const needed =
    asking === true && user !== undefined && user !== null && user.aiAllowedAt === undefined;
  /** Not now on this phone, before (or without) the server hearing it. */
  const [declinedHere, setDeclinedHere] = useState(false);
  const choice: AiChoice =
    asking === false
      ? "off"
      : asking === undefined || user === undefined || user === null
        ? "unknown"
        : user.aiAllowedAt !== undefined
          ? "allowed"
          : declinedHere || user.aiDeclinedAt !== undefined
            ? "declined"
            : "unasked";

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Everyone waiting on the answer; usually one call site. */
  const waiting = useRef<((goOn: boolean) => void)[]>([]);

  const settle = useCallback((goOn: boolean) => {
    for (const resolve of waiting.current.splice(0)) resolve(goOn);
    setOpen(false);
    setError(null);
  }, []);

  const goAhead = useCallback<GoAhead>(() => {
    if (!needed) return Promise.resolve(true);
    // Already asking: a second press while the question is up sends nothing.
    // Resolving both on one Allow would make one tap into two paid calls.
    if (waiting.current.length > 0) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      waiting.current.push(resolve);
      setOpen(true);
    });
  }, [needed]);

  // Answered somewhere else — another phone, Settings — or the switch went
  // off: nobody is left to ask, so whoever was waiting goes on.
  useEffect(() => {
    if (!needed && open) queueMicrotask(() => settle(true));
  }, [needed, open, settle]);

  const onAllow = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await allow({});
      settle(true);
    } catch (thrown) {
      setError(userMessage(thrown, "Andy couldn't save that. Check your connection and try again."));
    } finally {
      setSaving(false);
    }
  }, [allow, settle]);

  const onNotNow = useCallback(() => {
    // Remembered, so nothing offers the question again by itself. Not waited
    // on: the answer is no either way, and a failure only means being asked
    // once more next time.
    decline({}).catch(() => {});
    setDeclinedHere(true);
    settle(false);
  }, [decline, settle]);

  const value = useMemo(() => ({ goAhead, choice }), [goAhead, choice]);

  return (
    <GoAheadContext.Provider value={value}>
      {children}
      {open && active ? (
        <AiPermissionSheet
          saving={saving}
          error={error}
          onAllow={() => void onAllow()}
          onNotNow={onNotNow}
        />
      ) : null}
    </GoAheadContext.Provider>
  );
}
