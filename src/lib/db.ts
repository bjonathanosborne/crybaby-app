import { supabase } from "@/integrations/supabase/client";

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

// Create a round in the database and return its ID
export async function createRound({ gameType, course, courseDetails, stakes, holeValue, players, mechanics, mechanicSettings, privacy, scorekeeperMode }) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Build player config to persist setup wizard selections
  const playerConfig = players
    .filter(p => p.name.trim())
    .map(p => ({
      name: p.name,
      handicap: p.handicap,
      cart: p.cart || null,
      position: p.position || null,
      userId: p.userId || null,
    }));

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
      },
      stakes: `$${holeValue}/hole`,
      status: "active",
      scorekeeper_mode: scorekeeperMode,
      is_broadcast: autoBroadcast,
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
export async function loadRound(roundId) {
  const { data: round, error: roundError } = await supabase
    .from("rounds")
    .select("*")
    .eq("id", roundId)
    .maybeSingle();

  if (roundError) throw roundError;
  if (!round) return null;

  const { data: players, error: playersError } = await supabase
    .from("round_players")
    .select("*")
    .eq("round_id", roundId)
    .order("created_at");

  if (playersError) throw playersError;

  return { round, players };
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

// Load the current user's active round (if any) — includes rounds they're a player in
export async function loadActiveRound() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Check rounds created by this user first
  const { data: created } = await supabase
    .from("rounds")
    .select("id, course, game_type, stakes, created_at")
    .eq("created_by", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (created) return created;

  // Also check rounds where this user is listed as a player
  const { data: playerRows } = await supabase
    .from("round_players")
    .select("round_id")
    .eq("user_id", user.id);

  if (!playerRows?.length) return null;

  const roundIds = playerRows.map((r: any) => r.round_id);
  const { data: asPlayer } = await supabase
    .from("rounds")
    .select("id, course, game_type, stakes, created_at")
    .in("id", roundIds)
    .eq("status", "active")
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

// Insert settlements after a round completes
export async function insertSettlements(roundId: string, settlements: { userId?: string; guestName?: string; amount: number }[]) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const inserts = settlements.map(s => ({
    round_id: roundId,
    user_id: s.userId || null,
    guest_name: s.guestName || null,
    amount: s.amount,
  }));

  const { error } = await supabase.from("round_settlements").insert(inserts);
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

// Load another user's profile
export async function loadUserProfile(userId: string) {
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  return data;
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
