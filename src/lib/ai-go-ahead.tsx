import { useMutation, useQuery } from "convex/react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
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
 * Asked once when Andy opens, and again at the moment it matters — Let Andy
 * read it, a photo, Ask, a follow-up — for as long as the answer is "not now".
 * Every place that is about to send something calls `useAiGoAhead()` first and
 * goes on only if it resolves true.
 */

/** Resolves true to go on; false when the person chose Not now. */
type GoAhead = () => Promise<boolean>;

const GoAheadContext = createContext<GoAhead>(async () => true);

/** Ask, if Andy has to, before sending anything to an AI service. */
export function useAiGoAhead(): GoAhead {
  return useContext(GoAheadContext);
}

export function AiGoAheadProvider({
  active,
  children,
}: {
  /** In the app and unlocked: the only time the question may appear by itself. */
  active: boolean;
  children: React.ReactNode;
}) {
  const asking = useFeatureState("aiPermission");
  const user = useQuery(api.users.current, {});
  const allow = useMutation(api.aiPermission.allow);
  // Needed only when the switch is known to be on and the user row is known
  // to say no. Not known yet — loading, offline — is not a reason to ask: the
  // server refuses anything it has to, in words that say where to go.
  const needed =
    asking === true && user !== undefined && user !== null && user.aiAllowedAt === undefined;

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

  // Once per run of the app, when it first can: a person who said Not now is
  // asked again where it matters, not every time Andy comes to the front.
  const askedAtOpen = useRef(false);
  useEffect(() => {
    if (!active || !needed || askedAtOpen.current) return;
    askedAtOpen.current = true;
    queueMicrotask(() => setOpen(true));
  }, [active, needed]);

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

  return (
    <GoAheadContext.Provider value={goAhead}>
      {children}
      {open && active ? (
        <AiPermissionSheet
          saving={saving}
          error={error}
          onAllow={() => void onAllow()}
          onNotNow={() => settle(false)}
        />
      ) : null}
    </GoAheadContext.Provider>
  );
}
