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

  // 1. Create the round
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
      },
      stakes: `$${holeValue}/hole`,
      status: "active",
      scorekeeper_mode: scorekeeperMode,
    })
    .select()
    .single();

  if (roundError) throw roundError;

  // 2. Add players
  const playerInserts = players
    .filter(p => p.name.trim())
    .map((p, i) => ({
      round_id: round.id,
      user_id: i === 0 ? user.id : null, // First player is creator
      guest_name: i === 0 ? null : p.name,
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

// Create a post (round summary or trash talk)
export async function createPost({ content, postType = "text", roundId = null, groupId = null }) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("posts")
    .insert({
      user_id: user.id,
      content,
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

  const { data, error } = await supabase
    .from("comments")
    .insert({ post_id: postId, user_id: user.id, content })
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

  const { data, error } = await supabase
    .from("groups")
    .insert({ name, description, created_by: user.id, privacy_level: privacyLevel })
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
  const { error } = await supabase
    .from("groups")
    .update(updates)
    .eq("id", groupId);

  if (error) throw error;
}

// Look up a group by invite code
export async function findGroupByInviteCode(code: string) {
  const { data, error } = await supabase
    .from("groups")
    .select("*, group_members(count)")
    .eq("invite_code", code.toUpperCase().trim())
    .maybeSingle();

  if (error) throw error;
  return data;
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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .ilike("display_name", `%${query}%`)
    .neq("user_id", user.id)
    .limit(20);

  if (error) throw error;
  return data || [];
}

// Load user's rounds
export async function loadMyRounds(limit = 10) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("rounds")
    .select("*, round_players(*)")
    .eq("created_by", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data;
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
