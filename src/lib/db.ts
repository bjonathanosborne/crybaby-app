import { supabase } from "@/integrations/supabase/client";
import { RoundLoadError, classifyRoundLoadError } from "@/lib/roundErrors";
import type { PersistResult } from "@/hooks/useRoundPersistence";

// Re-export typed errors so existing callers keep importing from "@/lib/db"
export { RoundLoadError, classifyRoundLoadError };
export type { RoundLoadErrorKind } from "@/lib/roundErrors";

// PR #30 commit 3 (D4-A): atomic round creation helpers.
// Wraps the three RPCs added in
// supabase/migrations/20260429010000_d4a_atomic_round_creation.sql.
// All three return PersistResult<T> so callers handle network /
// auth / unknown failures uniformly without throwing.

interface PersistError {
  kind: "auth" | "network" | "conflict" | "unknown";
  message: string;
  cause: unknown;
}

function classifyDbError(err: unknown): PersistError {
  const message = err instanceof Error ? err.message : String(err);
  const maybeCoded = err as { code?: string; status?: number } | undefined;
  const code = maybeCoded?.code ?? maybeCoded?.status;
  if (code === "PGRST301" || code === 401 || /jwt|unauthor/i.test(message)) {
    return { kind: "auth", message, cause: err };
  }
  if (code === "23505" || code === "40001" || /conflict|version/i.test(message)) {
    return { kind: "conflict", message, cause: err };
  }
  if (/network|fetch|timeout|offline|abort/i.test(message)) {
    return { kind: "network", message, cause: err };
  }
  return { kind: "unknown", message, cause: err };
}

async function runPersist<T>(fn: () => Promise<T>): Promise<PersistResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: classifyDbError(err) };
  }
}

// ─── Notifications ───

export async function loadNotifications(limit = 30) {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

export async function getUnreadCount() {
  const { count, error } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("read", false);

  if (error) throw error;
  return count || 0;
}

export async function markNotificationRead(id: string) {
  const { error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("id", id);

  if (error) throw error;
}

export async function markAllNotificationsRead() {
  const { error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("read", false);

  if (error) throw error;
}

// ─── Push Subscriptions ───

export async function savePushSubscription(subscription: PushSubscription) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const sub = subscription.toJSON();
  const { error } = await supabase
    .from("push_subscriptions")
    .upsert({
      user_id: user.id,
      endpoint: sub.endpoint!,
      p256dh: sub.keys!.p256dh,
      auth: sub.keys!.auth,
    }, { onConflict: "user_id,endpoint" });

  if (error) throw error;
}

export async function removePushSubscription(endpoint: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", user.id)
    .eq("endpoint", endpoint);
}

// Shared shape used by both startRound (the new D4-A atomic path)
// and createRound (the deprecated two-insert path). Kept as a single
// type so the wizard's call site doesn't need to change shape when
// migrating between the two.
//
// PR #30 commit 3 (D4-A): startRound is the canonical path now.
// createRound is `@deprecated` and kept for one PR cycle so any
// in-flight callers don't break during the rollout.
interface StartRoundArgs {
  gameType: string;
  course: { id: string; name: string; pars: number[]; handicaps: number[]; tees?: unknown };
  courseDetails?: Record<string, unknown>;
  stakes?: string;
  holeValue: number;
  players: Array<{
    name: string;
    handicap?: number | null;
    cart?: string | null;
    position?: string | null;
    userId?: string | null;
  }>;
  mechanics: Set<string> | string[];
  mechanicSettings: Record<string, unknown>;
  privacy: "public" | "private" | string;
  scorekeeperMode: boolean;
  flipConfig?: { baseBet: number; carryOverWindow: number | "all" };
  handicapPercent?: number | null;
}

/**
 * PR #30 commit 3 (D4-A): atomic round creation.
 *
 * Calls the `start_round` RPC, which inserts both the round and its
 * round_players rows inside a single transaction. The round lands
 * at `status='setup'`; CrybabyActiveRound's mount-success effect
 * flips it to `'active'` via `activateRound`. Stuck-in-setup rounds
 * are swept by `cleanup_stuck_setup_rounds` from the feed.
 *
 * Returns `PersistResult<string>` where `data` is the new round id.
 * Callers handle auth / network / conflict / unknown errors via
 * the discriminated union — no throws past this boundary.
 */
export async function startRound(args: StartRoundArgs): Promise<PersistResult<string>> {
  return runPersist(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    // PR #17 commit 2: handicap-percent scaling. Same logic as the
    // legacy createRound path (kept verbatim so behavior is identical).
    const percent = typeof args.handicapPercent === "number" ? args.handicapPercent : 100;
    const playerConfig = args.players
      .filter(p => p.name.trim())
      .map(p => {
        const raw: number | null = (typeof p.handicap === "number" && Number.isFinite(p.handicap))
          ? p.handicap : null;
        // PR #32: standard rounding (round-to-nearest), not Math.floor.
        // The pre-fix Math.floor turned 7.8 → 7 and 17.9 → 17, creating
        // artificial 1-stroke gaps where the raw values were essentially
        // tied. The engine's getStrokesOnHole uses Math.round; using floor
        // here AND round there was an internal inconsistency. Forensics
        // on Jonathan's 2026-04-29 DOC round (raw 13.6/8.0/7.8/17.9 →
        // floored 13/8/7/17) confirmed the bug: Michael at 8.0 got 1 pop
        // because Todd at 7.8 was floored to 7, fabricating a 1-stroke
        // gap from a 0.2-stroke real difference. Post-fix: 14/8/8/18
        // with Michael & Todd tied for lowest, both at 0 pops.
        const adjusted: number | null = raw === null ? null : Math.round((raw * percent) / 100);
        return {
          name: p.name,
          handicap: adjusted,
          rawHandicap: raw,
          handicap_percent: percent,
          cart: p.cart || null,
          position: p.position || null,
          userId: p.userId || null,
        };
      });

    const autoBroadcast = args.privacy !== "private";
    const courseDetails = {
      courseId: args.course.id,
      pars: args.course.pars,
      handicaps: args.course.handicaps,
      tees: args.course.tees,
      holeValue: args.holeValue,
      mechanics: Array.isArray(args.mechanics) ? args.mechanics : Array.from(args.mechanics),
      mechanicSettings: args.mechanicSettings,
      privacy: args.privacy,
      playerConfig,
      ...(args.flipConfig && {
        game_state: {
          flipConfig: args.flipConfig,
          flipState: { teamsByHole: {}, currentHole: 0 },
        },
      }),
      ...(args.courseDetails ?? {}),
    };

    // round_players-shaped configs (snake_case) — the RPC reads
    // `user_id`, `guest_name`, `is_scorekeeper` from each element.
    const playerConfigs = args.players
      .filter(p => p.name.trim())
      .map((p, i) => ({
        user_id: p.userId || (i === 0 ? user.id : null),
        guest_name: (p.userId || i === 0) ? null : p.name,
        is_scorekeeper: i === 0,
      }));

    const { data, error } = await supabase.rpc("start_round", {
      p_game_type: args.gameType,
      p_course: args.course.name,
      p_course_details: courseDetails,
      p_stakes: args.stakes ?? `$${args.holeValue}/hole`,
      p_scorekeeper_mode: args.scorekeeperMode,
      p_handicap_percent: percent,
      p_player_configs: playerConfigs,
    });
    if (error) throw error;
    if (typeof data !== "string") throw new Error(`start_round returned non-string: ${typeof data}`);

    // Match createRound's broadcast notification side-effect.
    if (autoBroadcast) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, first_name, last_name")
        .eq("user_id", user.id)
        .maybeSingle();
      const name = profile
        ? ([profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.display_name)
        : "Someone";
      notifyFriendsOfBroadcast(data, args.course.name, name).catch(() => {});
    }

    return data;
  });
}

/**
 * PR #30 commit 3 (D4-A): flips a `status='setup'` round to
 * `'active'`. Idempotent on the server (the RPC's UPDATE only
 * matches rows where the caller is the creator AND the round is
 * still in setup). Called from CrybabyActiveRound's mount-success
 * effect; fire-and-forget — failure is silent and the next feed
 * visit's sweeper will eventually cancel any orphaned setup round.
 */
export async function activateRound(roundId: string): Promise<PersistResult<void>> {
  return runPersist(async () => {
    const { error } = await supabase.rpc("activate_round", { p_round_id: roundId });
    if (error) throw error;
  });
}

/**
 * PR #30 commit 3 (D4-A): client-side sweeper. Cancels up to 50
 * of the calling user's `status='setup'` rounds older than 30
 * minutes. Returns the count cancelled. Called from CrybabyFeed
 * mount, fire-and-forget, once per visit (StrictMode-guarded).
 */
export async function cleanupStuckSetupRounds(): Promise<PersistResult<number>> {
  return runPersist(async () => {
    const { data, error } = await supabase.rpc("cleanup_stuck_setup_rounds");
    if (error) throw error;
    return typeof data === "number" ? data : 0;
  });
}

// Create a round in the database and return its ID.
// `stakes` is optional — when omitted, we compute a default "$X/hole"
// from holeValue. Scorecard rounds (PR #19) pass "Scorecard" here so
// the rounds row doesn't falsely advertise a dollar amount.
//
// @deprecated PR #30 commit 3 (D4-A): use `startRound` instead.
// `createRound` runs two non-transactional inserts (rounds insert
// → round_players insert) which can produce orphan rounds if the
// second insert fails. `startRound` calls the `start_round` RPC,
// which runs both inserts inside a single transaction. This
// function is kept for one PR cycle so any in-flight callers
// don't break; targeted for removal in the next cleanup PR.
export async function createRound({ gameType, course, courseDetails, stakes, holeValue, players, mechanics, mechanicSettings, privacy, scorekeeperMode, flipConfig, handicapPercent }) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // PR #17 commit 2: Apply the per-round handicap scale factor to each
  // player's raw profile handicap. The engine reads `handicap` directly
  // (no percentage-aware lookup), so what we store here is the ADJUSTED
  // value — computed once at round start, locked, never recomputed.
  // `rawHandicap` + `handicap_percent` are preserved as audit fields
  // so the round detail UI can render "10 (80% of 13)".
  //
  // Default to 100 when the caller doesn't pass a percent (individual
  // formats + legacy callers).
  //
  // PR #32: Math.round (round-to-nearest), not Math.floor. See the
  // matching fix in startRound above for the on-course evidence.
  const percent = typeof handicapPercent === "number" ? handicapPercent : 100;
  const playerConfig = players
    .filter(p => p.name.trim())
    .map(p => {
      const raw: number | null = (typeof p.handicap === "number" && Number.isFinite(p.handicap))
        ? p.handicap
        : null;
      const adjusted: number | null = raw === null
        ? null
        : Math.round((raw * percent) / 100);
      return {
        name: p.name,
        handicap: adjusted,      // engine reads this; it's the scaled value
        rawHandicap: raw,        // audit: original profile value at lock time
        handicap_percent: percent, // audit: scale applied
        cart: p.cart || null,
        position: p.position || null,
        userId: p.userId || null,
      };
    });

  // 1. Create the round
  const autoBroadcast = privacy !== "private";
  const { data: round, error: roundError } = await supabase
    .from("rounds")
    .insert({
      created_by: user.id,
      game_type: gameType,
      course: course.name,
      course_details: {
        courseId: course.id,
        pars: course.pars,
        handicaps: course.handicaps,
        tees: course.tees,
        holeValue,
        mechanics: Array.from(mechanics),
        mechanicSettings,
        privacy,
        playerConfig,
        // Flip mode: pre-seed game_state with the scorekeeper's setup
        // choice so CrybabyActiveRound can read flipConfig.baseBet +
        // carryOverWindow on first render. flipState is initialised
        // empty; teams are populated by the round-start FlipReel modal
        // + per-hole Flip button taps.
        ...(flipConfig && {
          game_state: {
            flipConfig,
            flipState: { teamsByHole: {}, currentHole: 0 },
          },
        }),
      },
      stakes: stakes ?? `$${holeValue}/hole`,
      status: "active",
      scorekeeper_mode: scorekeeperMode,
      is_broadcast: autoBroadcast,
      // PR #17 commit 2: first-class round-level handicap scale factor.
      // Only persisted for team games (DOC + Flip); individual formats
      // pass 100 and we still write the value so the column semantics
      // are consistent (NULL = legacy round predating the column; an
      // explicit 100 = round created post-migration at full handicap).
      handicap_percent: percent,
    } as any)
    .select()
    .single();

  if (roundError) throw roundError;

  // Notify friends if broadcasting
  if (autoBroadcast) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, first_name, last_name")
      .eq("user_id", user.id)
      .maybeSingle();
    const name = profile
      ? ([profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.display_name)
      : "Someone";
    notifyFriendsOfBroadcast(round.id, course.name, name).catch(() => {});
  }

  // 2. Add players — use userId from setup for all linked players
  const playerInserts = players
    .filter(p => p.name.trim())
    .map((p, i) => ({
      round_id: round.id,
      user_id: p.userId || (i === 0 ? user.id : null),
      guest_name: (p.userId || i === 0) ? null : p.name,
      hole_scores: [],
      total_score: 0,
      is_scorekeeper: i === 0,
    }));

  const { error: playersError } = await supabase
    .from("round_players")
    .insert(playerInserts);

  if (playersError) throw playersError;

  return round.id;
}

// Load a round with players
/**
 * Load a round and its players with a 10-second hard timeout.
 *
 * Throws `RoundLoadError` on failure. Callers should pattern-match on `.kind`:
 *   - "timeout"      — connection too slow; show retry
 *   - "not_found"    — round id doesn't exist or is no longer visible
 *   - "unauthorized" — RLS rejected or JWT expired; redirect to /auth
 *   - "network"      — anything else (show generic error + retry)
 *
 * Uses AbortController + supabase-js .abortSignal() so requests are actually
 * cancelled on timeout (not just ignored).
 */
export async function loadRound(
  roundId: string,
  options: { timeoutMs?: number } = {},
): Promise<{ round: any; players: any[] }> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const throwTimeout = () => {
    throw new RoundLoadError("timeout", roundId, `loadRound timed out after ${timeoutMs}ms`);
  };

  try {
    const { data: round, error: roundError } = await supabase
      .from("rounds")
      .select("*")
      .eq("id", roundId)
      .abortSignal(controller.signal)
      .maybeSingle();

    if (timedOut) throwTimeout();
    if (roundError) throw classifyRoundLoadError(roundError, roundId);
    if (!round) {
      throw new RoundLoadError("not_found", roundId, "Round not found");
    }

    const { data: players, error: playersError } = await supabase
      .from("round_players")
      .select("*")
      .eq("round_id", roundId)
      .abortSignal(controller.signal)
      .order("created_at");

    if (timedOut) throwTimeout();
    if (playersError) throw classifyRoundLoadError(playersError, roundId);

    return { round, players: players || [] };
  } catch (err) {
    if (timedOut) throwTimeout();
    throw classifyRoundLoadError(err, roundId);
  } finally {
    clearTimeout(timer);
  }
}

// Update hole scores for a player
export async function updatePlayerScores(playerId, holeScores, totalScore) {
  const { error } = await supabase
    .from("round_players")
    .update({ hole_scores: holeScores, total_score: totalScore })
    .eq("id", playerId);

  if (error) throw error;
}

// Complete a round
export async function completeRound(roundId) {
  const { error } = await supabase
    .from("rounds")
    .update({ status: "completed" })
    .eq("id", roundId);

  if (error) throw error;
}

// Set the needs_final_photo flag on a round.
// Called by the pre-completion photo gate when the scorekeeper skips the
// photo. Cleared (false) after a successful post_round_correction capture.
export async function setNeedsFinalPhoto(roundId, value) {
  const { error } = await supabase
    .from("rounds")
    .update({ needs_final_photo: !!value })
    .eq("id", roundId);

  if (error) throw error;
}

// Cancel a round — permanent, irreversible, preserves scores for record
export async function cancelRound(roundId) {
  const { error } = await supabase
    .from("rounds")
    .update({ status: "canceled", canceled_at: new Date().toISOString() })
    .eq("id", roundId);

  if (error) throw error;
}

// Validation constants
const MAX_POST_LENGTH = 10000;
const MAX_COMMENT_LENGTH = 2000;
const MAX_GROUP_NAME_LENGTH = 100;
const MAX_GROUP_DESC_LENGTH = 500;
const MAX_DISPLAY_NAME_LENGTH = 50;
const MAX_BIO_LENGTH = 300;

// Create a post (round summary or trash talk)
export async function createPost({ content, postType = "text", roundId = null, groupId = null }) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  if (!content || typeof content !== "string" || content.trim().length === 0) {
    throw new Error("Post content cannot be empty");
  }
  if (content.length > MAX_POST_LENGTH) {
    throw new Error(`Post must be ${MAX_POST_LENGTH} characters or fewer`);
  }

  const { data, error } = await supabase
    .from("posts")
    .insert({
      user_id: user.id,
      content: content.trim(),
      post_type: postType,
      round_id: roundId,
      group_id: groupId,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Load feed posts with profiles
export async function loadFeed(limit = 20) {
  const { data: posts, error } = await supabase
    .from("posts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  // Load profiles for post authors
  const userIds = [...new Set(posts.map(p => p.user_id))];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("*")
    .in("user_id", userIds);

  // Load comments and reactions for each post
  const postIds = posts.map(p => p.id);
  
  const { data: comments } = await supabase
    .from("comments")
    .select("*")
    .in("post_id", postIds)
    .order("created_at");

  const { data: reactions } = await supabase
    .from("reactions")
    .select("*")
    .in("post_id", postIds);

  // Load comment author profiles
  const commentUserIds = [...new Set((comments || []).map(c => c.user_id))];
  const { data: commentProfiles } = await supabase
    .from("profiles")
    .select("*")
    .in("user_id", commentUserIds.length ? commentUserIds : ["none"]);

  return {
    posts,
    profiles: [...(profiles || []), ...(commentProfiles || [])],
    comments: comments || [],
    reactions: reactions || [],
  };
}

// Add a comment
export async function addComment(postId, content) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  if (!content || typeof content !== "string" || content.trim().length === 0) {
    throw new Error("Comment cannot be empty");
  }
  if (content.length > MAX_COMMENT_LENGTH) {
    throw new Error(`Comment must be ${MAX_COMMENT_LENGTH} characters or fewer`);
  }

  const { data, error } = await supabase
    .from("comments")
    .insert({ post_id: postId, user_id: user.id, content: content.trim() })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Toggle reaction
export async function toggleReaction(postId, reactionType) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Check existing
  const { data: existing } = await supabase
    .from("reactions")
    .select("*")
    .eq("post_id", postId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    if (existing.reaction_type === reactionType) {
      await supabase.from("reactions").delete().eq("id", existing.id);
      return null;
    } else {
      const { data } = await supabase
        .from("reactions")
        .update({ reaction_type: reactionType })
        .eq("id", existing.id)
        .select()
        .single();
      return data;
    }
  } else {
    const { data } = await supabase
      .from("reactions")
      .insert({ post_id: postId, user_id: user.id, reaction_type: reactionType })
      .select()
      .single();
    return data;
  }
}

// Save AI commentary
export async function saveAICommentary({ roundId, postId, commentary, contextType }) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("ai_commentary")
    .insert({
      round_id: roundId,
      post_id: postId,
      user_id: user.id,
      commentary,
      context_type: contextType,
    });
}

// Load/update profile
export async function loadProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  return data;
}

export async function updateProfile(updates) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  if (updates.display_name !== undefined) {
    if (!updates.display_name || typeof updates.display_name !== "string" || updates.display_name.trim().length === 0) {
      throw new Error("Display name cannot be empty");
    }
    if (updates.display_name.length > MAX_DISPLAY_NAME_LENGTH) {
      throw new Error(`Display name must be ${MAX_DISPLAY_NAME_LENGTH} characters or fewer`);
    }
    updates.display_name = updates.display_name.trim();
  }
  if (updates.bio !== undefined && updates.bio && updates.bio.length > MAX_BIO_LENGTH) {
    throw new Error(`Bio must be ${MAX_BIO_LENGTH} characters or fewer`);
  }

  const { data, error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Upload user profile avatar
export async function uploadUserAvatar(file: File) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const ext = file.name.split(".").pop() || "png";
  const path = `users/${user.id}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, file, { upsert: true });

  if (uploadError) throw uploadError;

  const { data: { publicUrl } } = supabase.storage
    .from("avatars")
    .getPublicUrl(path);

  const avatarUrl = `${publicUrl}?t=${Date.now()}`;

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ avatar_url: avatarUrl })
    .eq("user_id", user.id);

  if (updateError) throw updateError;
  return avatarUrl;
}

// Groups
export async function loadGroups() {
  const { data, error } = await supabase
    .from("groups")
    .select("*, group_members(count)")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

export async function createGroup(name: string, description = "", privacyLevel = "public") {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    throw new Error("Group name cannot be empty");
  }
  if (name.length > MAX_GROUP_NAME_LENGTH) {
    throw new Error(`Group name must be ${MAX_GROUP_NAME_LENGTH} characters or fewer`);
  }
  if (description && description.length > MAX_GROUP_DESC_LENGTH) {
    throw new Error(`Group description must be ${MAX_GROUP_DESC_LENGTH} characters or fewer`);
  }

  const { data, error } = await supabase
    .from("groups")
    .insert({ name: name.trim(), description: description?.trim() || "", created_by: user.id, privacy_level: privacyLevel })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Load a single group
export async function loadGroup(groupId: string) {
  const { data, error } = await supabase
    .from("groups")
    .select("*, group_members(count)")
    .eq("id", groupId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

// Load group members with profiles
export async function loadGroupMembers(groupId: string) {
  const { data, error } = await supabase
    .from("group_members")
    .select("*")
    .eq("group_id", groupId)
    .order("joined_at");

  if (error) throw error;
  if (!data || data.length === 0) return [];

  // Load profiles for members
  const userIds = data.map(m => m.user_id);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("*")
    .in("user_id", userIds);

  const profileMap: Record<string, any> = {};
  (profiles || []).forEach((p: any) => { profileMap[p.user_id] = p; });

  return data.map(m => ({ ...m, profile: profileMap[m.user_id] || null }));
}

// Join a group
export async function joinGroup(groupId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("group_members")
    .insert({ group_id: groupId, user_id: user.id, role: "member" });

  if (error) throw error;
}

// Leave a group
export async function leaveGroup(groupId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("group_members")
    .delete()
    .eq("group_id", groupId)
    .eq("user_id", user.id);

  if (error) throw error;
}

// Remove member (admin/owner only)
export async function removeMember(groupId: string, userId: string) {
  const { error } = await supabase
    .from("group_members")
    .delete()
    .eq("group_id", groupId)
    .eq("user_id", userId);

  if (error) throw error;
}

// Load leaderboard for a group (settlements for all members)
export async function loadGroupLeaderboard(memberUserIds: string[]) {
  if (!memberUserIds.length) return {};

  const { data, error } = await supabase
    .from("round_settlements")
    .select("user_id, amount")
    .in("user_id", memberUserIds);

  if (error) throw error;

  // Aggregate totals per user
  const totals: Record<string, number> = {};
  (data || []).forEach((s: any) => {
    totals[s.user_id] = (totals[s.user_id] || 0) + Number(s.amount);
  });
  return totals;
}

// Update group details (owner/admin)
export async function updateGroup(groupId: string, updates: { name?: string; description?: string }) {
  if (updates.name !== undefined) {
    if (!updates.name || updates.name.trim().length === 0) throw new Error("Group name cannot be empty");
    if (updates.name.length > 100) throw new Error("Group name must be 100 characters or fewer");
    updates.name = updates.name.trim();
  }
  if (updates.description !== undefined && updates.description && updates.description.length > 500) {
    throw new Error("Group description must be 500 characters or fewer");
  }

  const { error } = await supabase
    .from("groups")
    .update(updates)
    .eq("id", groupId);

  if (error) throw error;
}

// Look up a group by invite code (uses secure RPC function)
export async function findGroupByInviteCode(code: string) {
  const { data, error } = await supabase
    .rpc("lookup_group_by_invite", { _code: code });

  if (error) throw error;
  // RPC returns an array; get first match
  const group = Array.isArray(data) ? data[0] : data;
  return group || null;
}

// Regenerate invite code (owner/admin only)
export async function regenerateInviteCode(groupId: string) {
  const newCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  const { data, error } = await supabase
    .from("groups")
    .update({ invite_code: newCode } as any)
    .eq("id", groupId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Load user's groups (groups they're a member of)
export async function loadMyGroups() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: memberships, error } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("user_id", user.id);

  if (error) throw error;
  if (!memberships?.length) return [];

  const groupIds = memberships.map(m => m.group_id);
  const { data: groups } = await supabase
    .from("groups")
    .select("*, group_members(count)")
    .in("id", groupIds)
    .order("created_at", { ascending: false });

  return groups || [];
}

// Upload group avatar
export async function uploadGroupAvatar(groupId: string, file: File) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Verify group ownership/admin status before attempting upload
  const { data: membership } = await supabase
    .from("group_members")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    throw new Error("Only group owners/admins can update the avatar");
  }

  const ext = file.name.split(".").pop() || "png";
  const path = `groups/${groupId}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, file, { upsert: true });

  if (uploadError) throw uploadError;

  const { data: { publicUrl } } = supabase.storage
    .from("avatars")
    .getPublicUrl(path);

  // Add cache-busting timestamp
  const avatarUrl = `${publicUrl}?t=${Date.now()}`;

  const { error: updateError } = await supabase
    .from("groups")
    .update({ avatar_url: avatarUrl })
    .eq("id", groupId);

  if (updateError) throw updateError;
  return avatarUrl;
}

// Friends
export async function loadFriends() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("friendships")
    .select("*")
    .or(`user_id_a.eq.${user.id},user_id_b.eq.${user.id}`)
    .eq("status", "accepted");

  if (error) throw error;
  return data || [];
}

// Load pending friend requests (received)
export async function loadPendingRequests() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("friendships")
    .select("*")
    .eq("user_id_b", user.id)
    .eq("status", "pending");

  if (error) throw error;
  return data || [];
}

// Load sent friend requests
export async function loadSentRequests() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("friendships")
    .select("*")
    .eq("user_id_a", user.id)
    .eq("status", "pending");

  if (error) throw error;
  return data || [];
}

// Send friend request
export async function sendFriendRequest(targetUserId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("friendships")
    .insert({ user_id_a: user.id, user_id_b: targetUserId, status: "pending" });

  if (error) throw error;
}

// Accept friend request
export async function acceptFriendRequest(friendshipId: string) {
  const { error } = await supabase
    .from("friendships")
    .update({ status: "accepted", accepted_at: new Date().toISOString() })
    .eq("id", friendshipId);

  if (error) throw error;
}

// Decline / remove friend
export async function removeFriendship(friendshipId: string) {
  const { error } = await supabase
    .from("friendships")
    .delete()
    .eq("id", friendshipId);

  if (error) throw error;
}

// Search profiles by display name
export async function searchProfiles(query: string) {
  const { data, error } = await supabase
    .rpc("search_users_by_name", { _query: query });

  if (error) throw error;
  return data || [];
}

// Load user's rounds
export async function loadMyRounds(limit = 10) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // Rounds created by this user
  const { data: created, error } = await supabase
    .from("rounds")
    .select("*, round_players(*)")
    .eq("created_by", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  // Also find rounds where user is a player (but didn't create)
  const { data: playerRows } = await supabase
    .from("round_players")
    .select("round_id")
    .eq("user_id", user.id);

  if (playerRows?.length) {
    const roundIds = playerRows.map((r: any) => r.round_id);
    const { data: asPlayer } = await supabase
      .from("rounds")
      .select("*, round_players(*)")
      .in("id", roundIds)
      .neq("created_by", user.id) // avoid duplicates
      .order("created_at", { ascending: false })
      .limit(limit);

    if (asPlayer?.length) {
      const combined = [...(created || []), ...asPlayer];
      combined.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return combined.slice(0, limit);
    }
  }

  return created || [];
}

// Load the current user's active round (if any) — includes rounds they're a player in.
//
// PR #23 D4-B: SELECT includes `course_details` so the stuck-round
// detector can inspect `game_state.currentHole`.
//
// PR #30 D4-A: SELECT also includes `status` and the WHERE clause
// widens to `status IN ('active', 'setup')` so setup-stuck rounds
// surface to the StuckRoundBanner alongside legacy active-stuck
// rounds. The 5-min setup-stuck predicate (in stuckRound.ts)
// catches anything whose mount-success activate never fired.
export async function loadActiveRound() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const ROUND_COLS = "id, course, game_type, stakes, created_at, course_details, status";

  // Check rounds created by this user first
  const { data: created } = await supabase
    .from("rounds")
    .select(ROUND_COLS)
    .eq("created_by", user.id)
    .in("status", ["active", "setup"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (created) return created;

  // Also check rounds where this user is listed as a player.
  // Setup-state rounds shouldn't have non-creator players yet
  // (the round just got created), but the IN filter is harmless
  // for the player path either way.
  const { data: playerRows } = await supabase
    .from("round_players")
    .select("round_id")
    .eq("user_id", user.id);

  if (!playerRows?.length) return null;

  const roundIds = playerRows.map((r: any) => r.round_id);
  const { data: asPlayer } = await supabase
    .from("rounds")
    .select(ROUND_COLS)
    .in("id", roundIds)
    .in("status", ["active", "setup"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return asPlayer || null;
}

// Load settlements for a user (for ledger)
export async function loadSettlements(userId?: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const targetId = userId || user.id;

  const { data, error } = await supabase
    .from("round_settlements")
    .select("*, rounds(course, game_type, created_at)")
    .eq("user_id", targetId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

// Aggregate career stats via server-side function (efficient single query)
export async function loadUserStats(userId?: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const targetId = userId || user.id;

  const { data, error } = await supabase.rpc("get_user_stats", { p_user_id: targetId });
  if (error) throw error;
  return (data as any[])?.[0] || null;
}

// ============================================================
// Career scoring distribution — fuels the Stats page pie chart.
// Buckets every hole the user has scored into ace/eagle/birdie/
// par/bogey/double/triple_plus counts. Server-aggregated so we
// never fetch per-hole data over the wire.
// ============================================================

export interface UserScoreDistribution {
  ace: number;
  eagle: number;
  birdie: number;
  pars: number;
  bogey: number;
  double_bogey: number;
  triple_plus: number;
  total_holes: number;
}

export async function loadUserScoreDistribution(userId?: string): Promise<UserScoreDistribution | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const targetId = userId || user.id;

  const { data, error } = await supabase.rpc("get_user_score_distribution", { p_user_id: targetId });
  if (error) throw error;
  const row = (data as unknown as Array<Record<string, string | number>> | null)?.[0];
  if (!row) return null;
  // RPC returns bigints as strings; coerce.
  return {
    ace: Number(row.ace) || 0,
    eagle: Number(row.eagle) || 0,
    birdie: Number(row.birdie) || 0,
    pars: Number(row.pars) || 0,
    bogey: Number(row.bogey) || 0,
    double_bogey: Number(row.double_bogey) || 0,
    triple_plus: Number(row.triple_plus) || 0,
    total_holes: Number(row.total_holes) || 0,
  };
}

// Insert settlements after a round completes
export async function insertSettlements(
  roundId: string,
  settlements: {
    userId?: string | null;
    guestName?: string | null;
    amount: number;
    /**
     * Flip-only: per-player net from holes 1-15. Optional so non-Flip
     * callers (DOC / Solo / etc.) can omit — undefined lands as NULL
     * in the DB via the column's default.
     */
    baseAmount?: number;
    /** Flip-only: per-player net from holes 16-18. Same NULL-on-omit semantics. */
    crybabyAmount?: number;
  }[],
) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Idempotency guard: if settlements already exist for this round, skip.
  // Prevents duplicate rows if this is called twice (e.g. resume to a completed round).
  const { count, error: countError } = await supabase
    .from("round_settlements")
    .select("*", { count: "exact", head: true })
    .eq("round_id", roundId);
  if (countError) throw countError;
  if (count && count > 0) return;

  const inserts = settlements.map(s => ({
    round_id: roundId,
    user_id: s.userId || null,
    guest_name: s.guestName || null,
    amount: s.amount,
    // Only set the split columns when callers provide them — Flip
    // populates both; other modes leave them NULL via the column default.
    ...(s.baseAmount !== undefined ? { base_amount: s.baseAmount } : {}),
    ...(s.crybabyAmount !== undefined ? { crybaby_amount: s.crybabyAmount } : {}),
  }));

  const { error } = await supabase.from("round_settlements").insert(inserts);
  if (error) throw error;
}

// Save round game state (current hole, carry-over, running totals) to course_details JSONB.
// Called after every hole so a killed/backgrounded app can resume from the right position.
/**
 * Persisted game-state shape on `rounds.course_details.game_state`.
 *
 * Required fields are the scoring essentials that every game mode needs.
 * Optional fields carry mode-specific state so reload + apply-capture
 * replay both see the same data the client had in memory:
 *
 *   - `hammerHistory`     — DOC / Flip: per-hole hammer depth + fold state.
 *   - `flipState`         — Flip: per-hole team assignments (replaces
 *                            the previously-broken `flipTeams` field —
 *                            apply-capture falls back to that name for
 *                            any legacy row, but new writes use `flipState`).
 *   - `flipConfig`        — Flip: setup-time choices (baseBet + carry window).
 *   - `crybabyState`      — Flip: crybaby sub-game state (holes 16-18).
 *   - `hammerStateByHole` — CrybabyActiveRound: hammer state by hole number
 *                            for post-round hammer correction.
 */
export interface GameStatePersisted {
  currentHole: number;
  carryOver: number;
  totals: Record<string, number>;
  hammerHistory?: unknown[];
  flipState?: unknown;
  flipConfig?: unknown;
  crybabyState?: unknown;
  hammerStateByHole?: Record<number, unknown>;
  [key: string]: unknown;
}

export async function saveGameState(roundId: string, state: GameStatePersisted): Promise<void> {
  const { data: round, error: readError } = await supabase
    .from("rounds")
    .select("course_details")
    .eq("id", roundId)
    .single();
  if (readError) throw readError;

  const updated = { ...(round.course_details || {}), game_state: state };
  const { error } = await supabase
    .from("rounds")
    .update({ course_details: updated })
    .eq("id", roundId);
  if (error) throw error;
}

/**
 * Load saved game state from course_details JSONB (returns null if no save exists).
 * Uses the same 10-second AbortController timeout as loadRound and throws
 * RoundLoadError on failure.
 */
export async function loadGameState(
  roundId: string,
  options: { timeoutMs?: number } = {},
): Promise<{ currentHole: number; carryOver: number; totals: Record<string, number> } | null> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const { data: round, error } = await supabase
      .from("rounds")
      .select("course_details")
      .eq("id", roundId)
      .abortSignal(controller.signal)
      .single();

    if (timedOut) {
      throw new RoundLoadError("timeout", roundId, `loadGameState timed out after ${timeoutMs}ms`);
    }
    if (error) {
      // Not-found is treated as null (no save exists) rather than an error
      if ((error as any).code === "PGRST116") return null;
      throw classifyRoundLoadError(error, roundId);
    }
    return (round?.course_details as any)?.game_state ?? null;
  } catch (err) {
    if (timedOut) {
      throw new RoundLoadError("timeout", roundId, `loadGameState timed out after ${timeoutMs}ms`);
    }
    throw classifyRoundLoadError(err, roundId);
  } finally {
    clearTimeout(timer);
  }
}

// Delete non-manual settlements for a round (used before recalculation)
export async function deleteRoundSettlements(roundId: string): Promise<void> {
  const { error } = await supabase
    .from("round_settlements")
    .delete()
    .eq("round_id", roundId)
    .is("is_manual_adjustment", false);
  if (error) throw error;
}

// Update scores + settlements after post-round score editing
export async function updateRoundScoresAndSettlements(
  roundId: string,
  playerUpdates: { playerId: string; holeScores: Record<string, number>; totalScore: number }[],
  settlements: { userId?: string | null; guestName?: string | null; amount: number }[],
): Promise<void> {
  // 1. Delete old non-manual settlements
  await deleteRoundSettlements(roundId);

  // 2. Update each player's scores
  for (const pu of playerUpdates) {
    const { error } = await supabase
      .from("round_players")
      .update({ hole_scores: pu.holeScores, total_score: pu.totalScore })
      .eq("id", pu.playerId);
    if (error) throw error;
  }

  // 3. Insert recalculated settlements
  const inserts = settlements.map(s => ({
    round_id: roundId,
    user_id: s.userId || null,
    guest_name: s.guestName || null,
    amount: s.amount,
  }));
  const { error: insertError } = await supabase
    .from("round_settlements")
    .insert(inserts);
  if (insertError) throw insertError;
}

/**
 * PR #17 commit 2: Update a round's handicap percentage post-completion.
 *
 * Writes two places atomically-as-Supabase-allows:
 *   1. `rounds.handicap_percent` — the new authoritative column.
 *   2. `course_details.playerConfig` — regenerates each entry's
 *      `handicap` (scaled) while preserving `rawHandicap` + stamping
 *      the new `handicap_percent` audit field.
 *
 * The legacy `mechanicSettings.pops.handicapPercent` location is
 * intentionally left untouched — per spec it becomes dead data (no
 * longer read) for any round this function has updated.
 *
 * Caller should then re-run score-dependent recomputes (settlements,
 * totals) since stroke allocation may have changed.
 */
export async function updateRoundHandicapPercent(
  roundId: string,
  newPercent: number,
  existingCourseDetails: { playerConfig?: Array<{
    name?: string;
    handicap?: number | null;
    rawHandicap?: number | null;
    handicap_percent?: number;
    cart?: string | null;
    position?: string | null;
    userId?: string | null;
    color?: string;
  }> } & Record<string, unknown>,
): Promise<void> {
  const existingPC = Array.isArray(existingCourseDetails.playerConfig)
    ? existingCourseDetails.playerConfig
    : [];

  // Regenerate adjusted handicaps. When `rawHandicap` is absent (legacy
  // round being touched for the first time post-column), assume the
  // existing `handicap` IS the raw value — that's the legacy shape.
  const regenPlayerConfig = existingPC.map(pc => {
    const raw: number | null = (typeof pc.rawHandicap === "number" && Number.isFinite(pc.rawHandicap))
      ? pc.rawHandicap
      : (typeof pc.handicap === "number" && Number.isFinite(pc.handicap))
        ? pc.handicap
        : null;
    const adjusted: number | null = raw === null
      ? null
      : Math.floor((raw * newPercent) / 100);
    return {
      ...pc,
      handicap: adjusted,
      rawHandicap: raw,
      handicap_percent: newPercent,
    };
  });

  const nextCourseDetails = {
    ...existingCourseDetails,
    playerConfig: regenPlayerConfig,
  };

  const { error } = await supabase
    .from("rounds")
    .update({
      handicap_percent: newPercent,
      course_details: nextCourseDetails,
    } as any)
    .eq("id", roundId);
  if (error) throw error;
}

// Add manual adjustment
export async function addManualAdjustment(roundId: string, amount: number, notes: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase.from("round_settlements").insert({
    round_id: roundId,
    user_id: user.id,
    amount,
    is_manual_adjustment: true,
    notes,
  });

  if (error) throw error;
}

// ============================================================
// Round detail loader — used by /round/:id/summary.
//
// Fetches round + players + settlements + events + participant
// display names in parallel. Shape is loose on purpose (the UI
// narrows it at render); callers should not mutate.
// ============================================================

export interface RoundDetailBundle {
  round: {
    id: string;
    course: string;
    game_type: string;
    status: string;
    created_at: string;
    /**
     * PR #17 commit 2: first-class round-level handicap scale factor.
     * NULL on legacy rounds (resolve via course_details.mechanicSettings.pops.handicapPercent → 100).
     */
    handicap_percent?: number | null;
    course_details: {
      pars?: number[];
      handicaps?: number[];
      selectedTee?: string;
      privacy?: string;
      playerConfig?: Array<{
        name?: string;
        /** Scaled handicap the engine reads. */
        handicap?: number | null;
        /** Audit: raw profile handicap at lock time (PR #17 commit 2). */
        rawHandicap?: number | null;
        /** Audit: percent applied at lock time (PR #17 commit 2). */
        handicap_percent?: number;
        color?: string;
      }>;
      [k: string]: unknown;
    } | null;
    [k: string]: unknown;
  };
  players: Array<{
    id: string;
    user_id: string | null;
    guest_name: string | null;
    hole_scores: Record<string, number> | number[] | null;
    total_score: number | null;
    is_scorekeeper: boolean | null;
  }>;
  settlements: Array<{
    user_id: string | null;
    guest_name: string | null;
    amount: number;
    /** Flip-only: holes 1-15 per-player net. NULL on non-Flip settlements. */
    base_amount?: number | null;
    /** Flip-only: holes 16-18 per-player net. NULL on non-Flip settlements. */
    crybaby_amount?: number | null;
    is_manual_adjustment?: boolean | null;
    notes?: string | null;
  }>;
  events: Array<{
    id: string;
    hole_number: number | null;
    event_type: string;
    event_data: Record<string, unknown> | null;
    created_at: string;
  }>;
  participant_names: Record<string, string>;
}

export async function loadRoundDetail(roundId: string): Promise<RoundDetailBundle> {
  const [roundRes, playersRes, settleRes, eventRes] = await Promise.all([
    supabase.from("rounds").select("*").eq("id", roundId).maybeSingle(),
    supabase.from("round_players").select("*").eq("round_id", roundId).order("created_at"),
    supabase.from("round_settlements").select("user_id, guest_name, amount, base_amount, crybaby_amount, is_manual_adjustment, notes").eq("round_id", roundId),
    supabase.from("round_events").select("id, hole_number, event_type, event_data, created_at").eq("round_id", roundId).order("created_at"),
  ]);
  if (roundRes.error) throw roundRes.error;
  if (!roundRes.data) throw new RoundLoadError("not_found", roundId, "Round not found");
  if (playersRes.error) throw playersRes.error;

  const players = (playersRes.data || []) as RoundDetailBundle["players"];
  const participantIds = Array.from(
    new Set(players.map(p => p.user_id).filter((v): v is string => Boolean(v))),
  );
  const participant_names: Record<string, string> = {};
  if (participantIds.length > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("user_id, display_name, first_name, last_name")
      .in("user_id", participantIds);
    for (const p of profs || []) {
      const full = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
      participant_names[p.user_id] = full || p.display_name || "Player";
    }
  }

  return {
    round: roundRes.data as RoundDetailBundle["round"],
    players,
    settlements: (settleRes.data || []).map(s => ({
      user_id: s.user_id,
      guest_name: s.guest_name,
      amount: Number(s.amount),
      base_amount: s.base_amount === null || s.base_amount === undefined
        ? null
        : Number(s.base_amount),
      crybaby_amount: s.crybaby_amount === null || s.crybaby_amount === undefined
        ? null
        : Number(s.crybaby_amount),
      is_manual_adjustment: s.is_manual_adjustment ?? null,
      notes: s.notes ?? null,
    })),
    events: (eventRes.data || []) as RoundDetailBundle["events"],
    participant_names,
  };
}

// Load another user's profile
export async function loadUserProfile(userId: string) {
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

// ============================================================
// Profile rounds-list loader.
//
// Returns completed rounds for the given targetUserId, joined with:
//   - round_players(*) for hole_scores + totals + partner ids
//   - round_settlements (scoped to the same round set) for P&L
//   - profile display names for all participating users
//
// Visibility rules (mirrors rounds_visible_to_friends):
//   - Own profile: all rounds.
//   - Other user's profile + flag true (default): all target's rounds.
//   - Other user's profile + flag false: returns []. The viewer can
//     still see their shared rounds on their own profile, but not
//     on the target's profile.
//
// Shape stays loose (Record<string, unknown> for nested JSONB) so
// the UI layer narrows it at the component boundary. Callers should
// treat the return as read-only — it's the bundle for a view, not
// a row to persist.
// ============================================================

export interface UserRoundSummary {
  id: string;
  course: string;
  game_type: string;
  status: string;
  created_at: string;
  // Parsed shape of course_details; the fields we need at list-level.
  course_details: {
    pars?: number[];
    handicaps?: number[];
    playerConfig?: Array<{ name?: string; handicap?: number; color?: string }>;
    [k: string]: unknown;
  } | null;
  round_players: Array<{
    id: string;
    user_id: string | null;
    guest_name: string | null;
    hole_scores: Record<string, number> | number[] | null;
    total_score: number | null;
    is_scorekeeper: boolean | null;
  }>;
  // Settlements for THIS round, keyed to round_players by user_id / guest_name.
  round_settlements: Array<{
    user_id: string | null;
    guest_name: string | null;
    amount: number;
  }>;
  // Map of user_id -> display name (first+last preferred, display_name fallback).
  // Computed from a batched profile lookup, not a join — profile rows may not
  // exist for historic rounds; callers should fall back to guest_name.
  participant_names: Record<string, string>;
}

/**
 * Load the completed-round summary list for a user's profile page.
 * `viewerId` should be the current authenticated user id (for participation-
 * based visibility). Pass the same id as `targetUserId` when loading the
 * own profile.
 */
export async function loadUserRounds(
  targetUserId: string,
  viewerId: string,
  opts?: { limit?: number },
): Promise<UserRoundSummary[]> {
  const limit = opts?.limit ?? 500;
  const isOwnProfile = targetUserId === viewerId;

  // --- Privacy gate: if the target hides rounds, return empty. ---
  if (!isOwnProfile) {
    const { data: targetProfile } = await supabase
      .from("profiles")
      .select("rounds_visible_to_friends")
      .eq("user_id", targetUserId)
      .maybeSingle();
    if (targetProfile?.rounds_visible_to_friends === false) return [];
  }

  // --- Determine the visible round id set ---
  // Rounds the target participated in (player rows).
  const { data: targetPlayerRows, error: targetPlayerErr } = await supabase
    .from("round_players")
    .select("round_id")
    .eq("user_id", targetUserId);
  if (targetPlayerErr) throw targetPlayerErr;
  const visibleRoundIds = Array.from(
    new Set((targetPlayerRows || []).map(r => r.round_id)),
  );

  if (visibleRoundIds.length === 0) return [];

  // --- Batch 1: rounds + players (completed only) ---
  const { data: roundData, error: roundErr } = await supabase
    .from("rounds")
    .select("id, course, game_type, status, created_at, course_details, round_players(*)")
    .in("id", visibleRoundIds)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (roundErr) throw roundErr;
  const rounds = (roundData || []) as unknown as Array<Omit<UserRoundSummary, "round_settlements" | "participant_names">>;
  if (rounds.length === 0) return [];

  // --- Batch 2: settlements for exactly this round set ---
  const roundIdsWeKept = rounds.map(r => r.id);
  const { data: settleData } = await supabase
    .from("round_settlements")
    .select("round_id, user_id, guest_name, amount")
    .in("round_id", roundIdsWeKept);
  const settlementsByRound = new Map<string, UserRoundSummary["round_settlements"]>();
  for (const s of settleData || []) {
    const bucket = settlementsByRound.get(s.round_id) || [];
    bucket.push({
      user_id: s.user_id,
      guest_name: s.guest_name,
      amount: Number(s.amount),
    });
    settlementsByRound.set(s.round_id, bucket);
  }

  // --- Batch 3: display names for participating user_ids ---
  const participantIds = new Set<string>();
  for (const r of rounds) {
    for (const p of r.round_players || []) {
      if (p.user_id) participantIds.add(p.user_id);
    }
  }
  const participantNames: Record<string, string> = {};
  if (participantIds.size > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, display_name, first_name, last_name")
      .in("user_id", Array.from(participantIds));
    for (const p of profiles || []) {
      const full = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
      participantNames[p.user_id] = full || p.display_name || "Player";
    }
  }

  // --- Stitch ---
  return rounds.map(r => ({
    ...r,
    round_settlements: settlementsByRound.get(r.id) || [],
    participant_names: participantNames,
  }));
}

// Find existing users by email addresses
export async function findUsersByEmails(emails: string[]) {
  const { data, error } = await supabase
    .rpc("find_users_by_emails", { _emails: emails });

  if (error) throw error;
  return data || [];
}

// Send invite emails to non-users
export async function sendInviteEmails(emails: string[], inviterName: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const { data, error } = await supabase.functions.invoke("send-invite", {
    body: { emails, inviter_name: inviterName },
  });

  if (error) throw error;
  return data;
}

// ─── Invites ───

export async function createInvite(phone?: string): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const token = Array.from(crypto.getRandomValues(new Uint8Array(10)))
    .map(b => b.toString(36).padStart(2, "0"))
    .join("")
    .slice(0, 12);

  const { error } = await supabase.from("invites").insert({
    inviter_id: user.id,
    token,
    phone: phone || null,
    status: "pending",
  });

  if (error) throw error;
  return token;
}

export async function getInvite(token: string) {
  const { data, error } = await supabase
    .from("invites")
    .select("*, profiles:inviter_id(display_name, avatar_url)")
    .eq("token", token)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function acceptInvite(token: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const invite = await getInvite(token);
  if (!invite || invite.status === "accepted") return;

  await supabase
    .from("invites")
    .update({ status: "accepted", invitee_id: user.id, accepted_at: new Date().toISOString() })
    .eq("token", token);

  // Auto-send friend request to inviter
  if (invite.inviter_id && invite.inviter_id !== user.id) {
    try {
      await sendFriendRequest(invite.inviter_id);
    } catch {
      // Friend request may already exist — that's fine
    }
  }
}

// ─── Round Events (Live Feed) ───

export async function createRoundEvent({
  roundId,
  roundPlayerId,
  holeNumber,
  grossScore,
  par,
  eventType,
  eventData = {},
}: {
  roundId: string;
  roundPlayerId?: string | null;
  holeNumber: number;
  grossScore?: number | null;
  par?: number | null;
  eventType: string;
  eventData?: Record<string, any>;
}) {
  const { data, error } = await supabase
    .from("round_events")
    .insert({
      round_id: roundId,
      round_player_id: roundPlayerId || null,
      hole_number: holeNumber,
      gross_score: grossScore ?? null,
      par: par ?? null,
      event_type: eventType,
      event_data: eventData,
    } as any)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function loadRoundEvents(roundId: string) {
  const { data, error } = await supabase
    .from("round_events")
    .select("*")
    .eq("round_id", roundId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function loadEventReactions(eventIds: string[]) {
  if (!eventIds.length) return [];
  const { data, error } = await supabase
    .from("round_event_reactions")
    .select("*")
    .in("event_id", eventIds);

  if (error) throw error;
  return data || [];
}

// ─── Round Broadcast & Follow ───

export async function notifyFriendsOfBroadcast(roundId: string, course: string, creatorName: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data: friendships } = await supabase
    .from("friendships")
    .select("user_id_a, user_id_b")
    .or(`user_id_a.eq.${user.id},user_id_b.eq.${user.id}`)
    .eq("status", "accepted");

  const friendIds = (friendships || []).map(f =>
    f.user_id_a === user.id ? f.user_id_b : f.user_id_a
  );

  if (!friendIds.length) return;

  const notifications = friendIds.map(friendId => ({
    user_id: friendId,
    type: "round_broadcast_started",
    title: `${creatorName} is live at ${course}`,
    body: "Tap to follow the round",
    data: { roundId },
    read: false,
  }));

  const { error } = await supabase.from("notifications").insert(notifications);
  if (error) console.error("Failed to notify friends of broadcast:", error);
}

export async function toggleBroadcast(roundId: string, isBroadcast: boolean) {
  const { error } = await supabase
    .from("rounds")
    .update({ is_broadcast: isBroadcast } as any)
    .eq("id", roundId);
  if (error) throw error;

  if (isBroadcast) {
    const { data: round } = await supabase
      .from("rounds")
      .select("course, created_by")
      .eq("id", roundId)
      .single();
    if (round) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, first_name, last_name")
        .eq("user_id", round.created_by)
        .maybeSingle();
      const name = profile
        ? ([profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.display_name)
        : "Someone";
      await notifyFriendsOfBroadcast(roundId, round.course, name).catch(() => {});
    }
  }
}

export async function loadBroadcastRounds() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // Get friend IDs
  const { data: friendships } = await supabase
    .from("friendships")
    .select("user_id_a, user_id_b")
    .or(`user_id_a.eq.${user.id},user_id_b.eq.${user.id}`)
    .eq("status", "accepted");

  const friendIds = (friendships || []).map(f =>
    f.user_id_a === user.id ? f.user_id_b : f.user_id_a
  );

  if (!friendIds.length) return [];

  // Get active broadcast rounds from friends
  const { data: rounds, error } = await supabase
    .from("rounds")
    .select("*, round_players(*)")
    .eq("is_broadcast", true)
    .in("created_by", friendIds)
    .in("status", ["active", "completed"])
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) throw error;

  // Get creator profiles
  const creatorIds = [...new Set((rounds || []).map(r => r.created_by))];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, display_name, avatar_url")
    .in("user_id", creatorIds.length ? creatorIds : ["none"]);

  // Get current user's follow status
  const roundIds = (rounds || []).map(r => r.id);
  const { data: follows } = await supabase
    .from("round_followers")
    .select("*")
    .eq("user_id", user.id)
    .in("round_id", roundIds.length ? roundIds : ["none"]);

  const profileMap: Record<string, any> = {};
  (profiles || []).forEach(p => { profileMap[p.user_id] = p; });

  const followMap: Record<string, any> = {};
  (follows || []).forEach(f => { followMap[f.round_id] = f; });

  return (rounds || []).map(r => ({
    ...r,
    creatorProfile: profileMap[r.created_by] || null,
    followStatus: followMap[r.id]?.status || null,
  }));
}

export async function followRound(roundId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("round_followers")
    .upsert({
      round_id: roundId,
      user_id: user.id,
      status: "following",
    } as any, { onConflict: "round_id,user_id" });
  if (error) throw error;
}

export async function declineRound(roundId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("round_followers")
    .upsert({
      round_id: roundId,
      user_id: user.id,
      status: "declined",
    } as any, { onConflict: "round_id,user_id" });
  if (error) throw error;
}

export async function loadFollowedRoundEvents(roundIds: string[]) {
  if (!roundIds.length) return [];
  const { data, error } = await supabase
    .from("round_events")
    .select("*")
    .in("round_id", roundIds)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data || [];
}

export async function toggleEventReaction(eventId: string, reactionType: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: existing } = await supabase
    .from("round_event_reactions")
    .select("*")
    .eq("event_id", eventId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    if (existing.reaction_type === reactionType) {
      await supabase.from("round_event_reactions").delete().eq("id", existing.id);
      return null;
    } else {
      const { data } = await supabase
        .from("round_event_reactions")
        .update({ reaction_type: reactionType })
        .eq("id", existing.id)
        .select()
        .single();
      return data;
    }
  } else {
    const { data } = await supabase
      .from("round_event_reactions")
      .insert({ event_id: eventId, user_id: user.id, reaction_type: reactionType })
      .select()
      .single();
    return data;
  }
}

// ─── Admin: User Role Management ───

export async function loadAllUserRoles(): Promise<{ user_id: string; role: string }[]> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("user_id, role");
  if (error) throw error;
  return data ?? [];
}

export async function assignAdminRole(userId: string): Promise<void> {
  const { error } = await supabase
    .from("user_roles")
    .insert({ user_id: userId, role: "admin" });
  if (error && error.code !== "23505") throw error; // ignore unique violation
}

export async function removeAdminRole(userId: string): Promise<void> {
  const { error } = await supabase
    .from("user_roles")
    .delete()
    .eq("user_id", userId)
    .eq("role", "admin");
  if (error) throw error;
}
