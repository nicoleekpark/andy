import { Stack, router } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useRef, useState } from "react";
import { Pressable, ScrollView, SectionList, StyleSheet, Text, View } from "react-native";
import { useQuery } from "convex/react";
import { useOffline } from "@/lib/connection";
import { api } from "@convex/_generated/api";
import { BriefingCard } from "@/components/briefing-card";
import { PersonAvatar } from "@/components/person-avatar";
import { AzIndex } from "@/components/az-index";
import { sectionFor, sectionsOf } from "@/lib/name-index";
import { useBriefingActions } from "@/lib/use-briefing-actions";
import { ThreadLoop } from "@/components/thread-loop";
import { useFeature } from "@/lib/feature-flags";
import { useBriefing } from "@/lib/use-briefing";
import { colors, fonts, size, space, textOpacity, textSize } from "@/constants/theme";
import { useOncePerSession } from "@/lib/use-once-per-session";
import { formatDate } from "@/lib/dates";
import { useOutbox } from "@/lib/outbox";
import { useCaptureDrafts, type CaptureDraft } from "@/lib/capture-draft";
import { useConfirm } from "@/components/confirm-dialog";
import { usePending } from "@/lib/pending-changes";
import { NOTHING_KEPT_OFFLINE, useLiveOrCopy, useNothingKeptOffline } from "@/lib/offline-copy";
import { peopleView } from "@convex/offlineViews";
import { OfflineCopyLine } from "@/components/offline-copy-line";
import { HomeBottomBar } from "@/components/home-bottom-bar";
import { useCaptureOrbit } from "@/components/capture-orbit";
import { NameResults } from "@/components/name-results";
import { useNameSearch } from "@/lib/use-name-search";

/**
 * Home: the people you keep, and the way in to everything else.
 *
 * Until now every screen was reachable only by deep link, which made the app
 * unusable without a terminal. This is the hub — profiles out to the timeline,
 * the record button out to capture, the gear out to settings (and the only
 * sign-out button in the app).
 *
 * Finding someone is the bottom bar's field (`home-bottom-bar.tsx`): it filters
 * this list in place by name or word, free and offline, with the same search
 * Ask uses. Asking a question in words costs a call, so it is never what typing
 * does — only the labelled "Ask Andy: “…”" row spends one (`home-actions.md`).
 */
/**
 * Nobody kept yet. The loop draws itself the first time this appears in a run
 * of the app — a greeting that finishes and rests — and is simply there after
 * that (STYLE.md → Thread motion). Its own component so the "first time"
 * counts appearances of the empty home, not of home.
 */
function EmptyHome() {
  const first = useOncePerSession("empty-home");
  return (
    <View style={styles.emptyInner}>
      <ThreadLoop motion={first ? "draw" : "still"} width={EMPTY_THREAD_WIDTH} />
      <Text style={styles.quiet}>
        No one yet — tap + to remember your first person.
      </Text>
    </View>
  );
}

/**
 * Notes kept on this phone while offline, not yet read (`src/lib/outbox.tsx`).
 * Said on home so nothing someone told you seems lost: the note is here, it
 * just has not been read. Online, it opens the oldest one to be read and
 * checked — one at a time, the same check every note gets. Nothing when there
 * are none.
 */
function OutboxLine() {
  const { notes } = useOutbox();
  const online = !useOffline();
  if (notes.length === 0) return null;
  const count = notes.length === 1 ? "1 note" : `${notes.length} notes`;
  if (!online) {
    return (
      <Text testID="outbox-line" style={styles.outboxLine}>
        {count} kept on this phone, waiting for Andy to read{" "}
        {notes.length === 1 ? "it" : "them"}.
      </Text>
    );
  }
  const oldest = notes[0];
  return (
    <Pressable
      testID="outbox-line"
      accessibilityRole="button"
      accessibilityLabel={`${count} kept on this phone. Read ${notes.length === 1 ? "it" : "the first"} now`}
      onPress={() =>
        router.push(
          oldest.aboutProfileId === undefined
            ? `/capture?outbox=${oldest.id}`
            : `/profile/${oldest.aboutProfileId}/capture?outbox=${oldest.id}`,
        )
      }
    >
      {/* Two pieces side by side, not nested: a nested Text inherits the
          line's faded opacity, and the action would read as faded too. */}
      <View style={styles.outboxRow}>
        <Text style={styles.outboxText}>{count} kept on this phone.</Text>
        <Text style={styles.outboxAction}>
          Read {notes.length === 1 ? "it" : "the first"} now
        </Text>
      </View>
    </Pressable>
  );
}

/**
 * A 21pt line of text grows to a 45pt target (WCAG 2.5.8 / STYLE.md's 44pt):
 * 12 above and below, 8 at the sides where the words already give width.
 */
const LINE_ACTION_SLOP = { top: space.md, bottom: space.md, left: space.sm, right: space.sm };

/**
 * Notes left half-written when iOS closed Andy in the background
 * (`src/lib/capture-draft.ts`, device QA #52) — one line each, newest first,
 * up to three. Continue opens one as it was; Discard asks first, because it
 * cannot be brought back. Nothing when there are none.
 */
function DraftLines() {
  const { drafts, drop } = useCaptureDrafts();
  return (
    <>
      {drafts.map((draft) => (
        <DraftOffer key={draft.id} draft={draft} drop={() => drop(draft.id)} />
      ))}
    </>
  );
}

function DraftOffer({ draft, drop }: { draft: CaptureDraft; drop: () => void }) {
  const confirm = useConfirm();
  const about = draft.aboutName?.trim();
  const line = about ? `You were writing about ${about}.` : "You were writing a note.";
  // With several lines, "Continue" alone would not say which. Starts with the
  // word on screen, so Voice Control can still say it (WCAG 2.5.3).
  const which = about ? `the note about ${about}` : "the note you were writing";
  return (
    <View testID="draft-line" style={styles.outboxRow}>
      <Text style={styles.outboxText}>{line}</Text>
      <Pressable
        testID="draft-line-continue"
        accessibilityRole="button"
        accessibilityLabel={`Continue ${which}`}
        hitSlop={LINE_ACTION_SLOP}
        onPress={() =>
          router.push(
            draft.profileId === undefined
              ? `/capture?resume=${draft.id}`
              : `/profile/${draft.profileId}/capture?resume=${draft.id}`,
          )
        }
      >
        <Text style={styles.outboxAction}>Continue</Text>
      </Pressable>
      <Pressable
        testID="draft-line-discard"
        accessibilityRole="button"
        accessibilityLabel={`Discard ${which}`}
        hitSlop={LINE_ACTION_SLOP}
        onPress={() =>
          confirm("Discard this note?", "What you were writing can't be brought back.", [
            { text: "Cancel", style: "cancel" },
            { text: "Discard", style: "destructive", onPress: drop },
          ])
        }
      >
        <Text style={styles.outboxAction}>Discard</Text>
      </Pressable>
    </View>
  );
}

/**
 * Changes made offline, waiting to be saved for good (`pending-changes.tsx`).
 * Offline it only says how many; online it offers Sync — pressed by the
 * person, as asked, so they know when their changes reach Andy.
 */
function PendingLine() {
  const { changes, sync, syncing } = usePending();
  const online = !useOffline();
  if (changes.length === 0) return null;
  const count = changes.length === 1 ? "1 change" : `${changes.length} changes`;
  return (
    <View testID="pending-line" style={styles.outboxRow}>
      <Text style={styles.outboxText}>{count} made offline, not saved yet.</Text>
      {online ? (
        <Pressable
          accessibilityRole="button"
          testID="pending-line-sync"
          accessibilityLabel="Sync"
          accessibilityState={{ disabled: syncing }}
          disabled={syncing}
          onPress={() => void sync()}
          hitSlop={8}
        >
          <Text style={styles.outboxAction}>{syncing ? "Syncing…" : "Sync"}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Smaller than the launch loop: here it sits beside words, not alone. */
const EMPTY_THREAD_WIDTH = 112;

export default function HomeScreen() {
  // Offline, the same list built from the phone's copy (`offline-copy.tsx`).
  const nothingKept = useNothingKeptOffline();
  const { data: people, takenAt } = useLiveOrCopy(useQuery(api.profiles.people), (copy) =>
    peopleView(copy.profiles, copy.notes),
  );
  const { briefing, ask, alerts, askForAlerts, answer, unanswer } = useBriefing(
    useFeature("calendarBriefing"),
  );
  const { askToMute, notNow, openIphoneSettings } = useBriefingActions();
  const online = !useOffline();
  /**
   * What is typed into the bottom bar's field. In memory only, never on disk
   * (`home-actions.md` R10): it survives opening a profile and coming back,
   * and nothing new enters `forgetOnThisPhone`.
   */
  const [query, setQuery] = useState("");
  const { results: found } = useNameSearch(query);
  /** A query present: the list becomes what matches it (R6). */
  const searching = query.trim() !== "";
  const newNote = useCaptureOrbit("/capture");
  // Letters and the A–Z index only once the list is long (`INDEX_FROM`).
  const { indexed, sections } = sectionsOf(people ?? [], (row) => row.profile.name);
  const list = useRef<SectionList<NonNullable<typeof people>[number], { letter: string }>>(null);
  /** The letter last asked for, so a jump that has to wait can be retried. */
  const wanted = useRef<string | null>(null);
  /** Retried once, then left where it got to — never a loop. */
  const retried = useRef(false);
  const jumpTo = (letter: string, retry = false) => {
    wanted.current = letter;
    retried.current = retry;
    list.current?.scrollToLocation({
      sectionIndex: sectionFor(letter, sections),
      // 0 is the section's own heading, so the letter lands at the top.
      itemIndex: 0,
      animated: false,
    });
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: "Andy",
          // Lora, like the names in the list under it: the one heading on
          // home that was in the system face (dev/design/home-title.html, B).
          // Same bar and height, so the briefing card does not move.
          //
          // `fontWeight` is not decoration: the navigator lays this over iOS's
          // default title style, which carries `fontWeight: "600"`. Lora-Medium
          // is one static weight with no 600, and iOS answers a family + weight
          // it does not have with the system font — silently. "400" asks for
          // the face that exists.
          headerTitleStyle: {
            fontFamily: fonts.displayMedium,
            fontSize: 20,
            fontWeight: "400",
          },
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Settings"
              onPress={() => router.push("/settings")}
              style={styles.settingsButton}
              testID="settings-button"
            >
              {/* The gear, as iOS draws it (device QA #3). The word stands in
                  where a build has no SF Symbols. */}
              <SymbolView
                name="gearshape"
                size={size.icon}
                tintColor={colors.ink}
                fallback={<Text style={styles.headerAction}>Settings</Text>}
                testID="settings-gear"
              />
            </Pressable>
          ),
        }}
      />
      <View style={styles.container}>
        <View style={styles.listArea}>
          {searching ? (
            // Not A–Z sections, so no letters and no index; the briefing and
            // the lines above the list wait until the query clears (R6).
            <ScrollView
              style={styles.listBox}
              contentContainerStyle={styles.results}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              testID="home-search-results"
            >
              <NameResults results={found} />
              {found !== undefined && found.people.length === 0 && found.mentions.length === 0 ? (
                <Text style={styles.noMatch}>No one matches “{query.trim()}”.</Text>
              ) : null}
            </ScrollView>
          ) : (
          <SectionList
            ref={list}
            // Its own width beside the index: in a row, the list's box needs
            // `flex` — `contentContainerStyle` only sizes what scrolls inside it.
            style={styles.listBox}
            sections={sections}
            keyExtractor={(item) => item.profile._id}
            contentContainerStyle={styles.list}
            renderSectionHeader={({ section }) =>
              indexed ? (
                <Text style={styles.letterHeading} accessibilityRole="header">
                  {section.letter}
                </Text>
              ) : null
            }
            // Rows have no fixed height (the latest detail is optional), so a
            // jump far down may land before they are measured: go roughly there,
            // then again once they are.
            // `info.index` counts every heading and row, not sections — so the
            // retry is of the letter asked for, not of `sections[info.index]`.
            onScrollToIndexFailed={(info) => {
              list.current
                ?.getScrollResponder()
                ?.scrollTo({ y: info.averageItemLength * info.index, animated: false });
              if (retried.current) return;
              setTimeout(() => {
                if (wanted.current !== null) jumpTo(wanted.current, true);
              }, 50);
            }}
            /*
              Above the list rather than beside it. The briefing is about the next
              ten minutes and the list is about everybody — putting the two in
              the same scroll, in that order, is the whole hierarchy.
            */
            ListHeaderComponent={
              <>
                <OfflineCopyLine takenAt={takenAt} />
                <DraftLines />
                <OutboxLine />
                <PendingLine />
                {briefing.state === "loading" ||
                briefing.state === "off" ||
                briefing.state === "muted" ||
                briefing.state === "nobody" ? null : briefing.state === "ask" ? (
                  <BriefingCard
                    state="ask"
                    onAsk={() => void ask()}
                    asking={briefing.asking}
                    onNotNow={notNow}
                    onMute={() => askToMute(false)}
                  />
                ) : briefing.state === "ready" ? (
                  <BriefingCard
                    state="ready"
                    briefings={briefing.briefings}
                    now={briefing.now}
                    alerts={alerts}
                    onEnableAlerts={() => void askForAlerts()}
                    onAnswer={answer}
                    onUnanswer={unanswer}
                    onMute={() => askToMute(true)}
                  />
                ) : briefing.state === "denied" ? (
                  <BriefingCard
                    state="denied"
                    onOpenSettings={openIphoneSettings}
                    onMute={() => askToMute(false)}
                  />
                ) : briefing.state === "empty" ? (
                  <BriefingCard state="empty" onMute={() => askToMute(true)} />
                ) : (
                  <BriefingCard state="unavailable" />
                )}
              </>
            }
            ListEmptyComponent={
              // Centred in the space the list would have filled. `list` already
              // grows to that space, so the wrapper only has to say where in it.
              <View style={styles.emptyState}>
                {people === undefined ? (
                  <Text style={styles.quiet}>{nothingKept ? NOTHING_KEPT_OFFLINE : "Loading…"}</Text>
                ) : (
                  <EmptyHome />
                )}
              </View>
            }
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                // The fact too: two rows called Marcus should not sound the same
                // to VoiceOver either.
                accessibilityLabel={
                  item.latestFact === null
                    ? item.profile.name
                    : `${item.profile.name}, ${item.latestFact}`
                }
                onPress={() => router.push(`/profile/${item.profile._id}`)}
                style={styles.row}
              >
                <PersonAvatar name={item.profile.name} photoUrl={item.photoUrl} />
                <View style={styles.rowText}>
                  <Text style={styles.rowName}>{item.profile.name}</Text>
                  {/*
                    What they told you most recently, in your own saved words —
                    recognising somebody beats recalling them, and two people
                    who share a name stop looking identical. One line: the
                    profile is where the rest is.
                  */}
                  {item.latestFact !== null ? (
                    <Text style={styles.rowFact} numberOfLines={1}>
                      {item.latestFact}
                    </Text>
                  ) : null}
                  <Text style={styles.rowMeta}>
                    {[
                      item.profile.relationshipContext,
                      `${item.noteCount} ${item.noteCount === 1 ? "note" : "notes"}`,
                      formatDate(item.lastNoteAt),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                </View>
              </Pressable>
            )}
          />
          )}
          {indexed && !searching ? (
            <AzIndex available={sections.map((section) => section.letter)} onJump={(letter) => jumpTo(letter)} />
          ) : null}
        </View>

        <HomeBottomBar
          query={query}
          onQuery={setQuery}
          online={online}
          showField={people !== undefined && people.length > 0}
          onNewNote={newNote.open}
        />
        {newNote.orbit}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  outboxLine: { color: colors.ink, fontSize: 14, opacity: textOpacity.quiet, lineHeight: 21, marginBottom: space.lg },
  outboxRow: { flexDirection: "row", flexWrap: "wrap", columnGap: space.xs, marginBottom: space.lg },
  outboxText: { color: colors.ink, fontSize: 14, opacity: textOpacity.quiet, lineHeight: 21 },
  outboxAction: { color: colors.moss, fontSize: 14, lineHeight: 21 },
  container: { flex: 1, backgroundColor: colors.paper, padding: 24, gap: 16 },
  headerAction: { color: colors.ink, fontSize: 15 },
  /** 44pt square, so the small gear is still an easy target. */
  settingsButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },

  /** The list, and the A–Z index beside it when there is one. */
  // Room for the half of round Record that rises above the bottom bar, so it
  // never sits over the last row or the foot of the A–Z index.
  listArea: { flex: 1, flexDirection: "row", paddingBottom: space.xl },
  listBox: { flex: 1 },
  list: { gap: 4, paddingBottom: 8, flexGrow: 1 },
  /**
   * A letter over its group. Lora, as STYLE.md gives section headers; on
   * `paper`, because iOS keeps the current one pinned over the rows scrolling
   * beneath it.
   */
  letterHeading: {
    color: colors.ink,
    fontFamily: fonts.display,
    fontSize: textSize.sm,
    opacity: textOpacity.quiet,
    backgroundColor: colors.paper,
    paddingTop: space.md,
    paddingBottom: space.xs,
  },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md },
  // `flex: 1` so a long fact is cut at the edge, not pushed past it by the circle.
  rowText: { flex: 1, gap: 3 },
  rowName: { color: colors.ink, fontSize: 18, fontFamily: fonts.display },
  rowFact: { color: colors.ink, fontSize: 14, opacity: 0.8, lineHeight: 19 },
  rowMeta: {
    color: colors.ink,
    fontSize: 13,
    opacity: textOpacity.quiet,
    fontFamily: fonts.utility,
  },

  emptyState: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyInner: { alignItems: "center", gap: space.xl },
  quiet: {
    color: colors.ink,
    fontSize: 15,
    opacity: textOpacity.quiet,
    lineHeight: 22,
    textAlign: "center",
  },

  results: { paddingBottom: space.xxl },
  noMatch: {
    color: colors.ink,
    fontSize: textSize.base,
    opacity: textOpacity.quiet,
    marginTop: space.lg,
    marginHorizontal: space.xl,
  },
});
