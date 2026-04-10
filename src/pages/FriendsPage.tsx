import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  loadFriends, loadPendingRequests, loadSentRequests,
  sendFriendRequest, acceptFriendRequest, removeFriendship,
  searchProfiles, loadSettlements, loadUserProfile, loadProfile,
  createInvite,
} from "@/lib/db";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from "date-fns";
import { UserPlus, Search, ArrowLeft, ChevronRight, Loader2, Share2, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";

function UserAvatar({ profile, size = 40 }: { profile: any; size?: number }) {
  const name = profile?.display_name || "?";
  const initial = name[0]?.toUpperCase() || "?";
  if (profile?.avatar_url) {
    return (
      <img src={profile.avatar_url} alt={name}
        className="rounded-full object-cover flex-shrink-0"
        style={{ width: size, height: size }} />
    );
  }
  return (
    <div className="rounded-full bg-primary flex items-center justify-center text-primary-foreground flex-shrink-0 font-bold"
      style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {initial}
    </div>
  );
}

type View = "list" | "ledger";

export default function FriendsPage() {
  const { user } = useAuth();
  const [view, setView] = useState<View>("list");
  const [friends, setFriends] = useState<any[]>([]);
  const [pending, setPending] = useState<any[]>([]);
  const [sent, setSent] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  // Search — always visible on list view
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  // Suggested friends (group co-members not yet connected)
  const [suggested, setSuggested] = useState<any[]>([]);

  // Friend ledger view
  const [selectedFriend, setSelectedFriend] = useState<any>(null);
  const [friendLedger, setFriendLedger] = useState<any[]>([]);
  const [friendProfile, setFriendProfile] = useState<any>(null);

  // Invite
  const [inviteSending, setInviteSending] = useState(false);
  const [myProfile, setMyProfile] = useState<any>(null);

  const loadAll = async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    try {
      const [f, p, s, mp] = await Promise.all([
        loadFriends(),
        loadPendingRequests(),
        loadSentRequests(),
        loadProfile(),
      ]);
      setFriends(f);
      setPending(p);
      setSent(s);
      setMyProfile(mp);

      const allUserIds = new Set<string>();
      [...f, ...p, ...s].forEach((fr: any) => {
        allUserIds.add(fr.user_id_a);
        allUserIds.add(fr.user_id_b);
      });
      allUserIds.delete(user.id);

      const profileMap: Record<string, any> = {};
      for (const uid of allUserIds) {
        const prof = await loadUserProfile(uid);
        if (prof) profileMap[uid] = prof;
      }
      setProfiles(profileMap);

      // Load suggested players from shared groups
      loadSuggested([...f, ...p, ...s]);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const loadSuggested = async (existing: any[]) => {
    if (!user) return;
    try {
      const existingIds = new Set<string>(
        existing.flatMap((fr: any) => [fr.user_id_a, fr.user_id_b])
      );
      existingIds.add(user.id);

      // Get groups I'm in
      const { data: myGroups } = await supabase
        .from("group_members")
        .select("group_id")
        .eq("user_id", user.id);

      if (!myGroups?.length) return;

      const groupIds = myGroups.map((g: any) => g.group_id);

      // Get co-members of those groups
      const { data: coMembers } = await supabase
        .from("group_members")
        .select("user_id")
        .in("group_id", groupIds)
        .neq("user_id", user.id);

      if (!coMembers?.length) return;

      const candidateIds = [...new Set(
        coMembers
          .map((m: any) => m.user_id)
          .filter((id: string) => !existingIds.has(id))
      )].slice(0, 6);

      if (!candidateIds.length) return;

      const suggestedProfiles: any[] = [];
      for (const uid of candidateIds) {
        const prof = await loadUserProfile(uid);
        if (prof) suggestedProfiles.push(prof);
      }
      setSuggested(suggestedProfiles);
    } catch {
      // silent
    }
  };

  useEffect(() => { loadAll(); }, [user]);

  const getFriendId = (friendship: any) =>
    friendship.user_id_a === user?.id ? friendship.user_id_b : friendship.user_id_a;

  // Debounced live search
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const results = await searchProfiles(searchQuery.trim());
        setSearchResults(results);
      } catch {
        // silent
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSendRequest = async (targetUserId: string) => {
    try {
      await sendFriendRequest(targetUserId);
      setSearchResults(prev => prev.filter(p => p.user_id !== targetUserId));
      setSuggested(prev => prev.filter(p => p.user_id !== targetUserId));
      setSearchQuery("");
      await loadAll();
      toast({ title: "Friend request sent! 🤝" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleAccept = async (friendshipId: string) => {
    try {
      await acceptFriendRequest(friendshipId);
      toast({ title: "Friend added! 🤝" });
      await loadAll();
    } catch { /* silent */ }
  };

  const handleDecline = async (friendshipId: string) => {
    try {
      await removeFriendship(friendshipId);
      await loadAll();
    } catch { /* silent */ }
  };

  const handleViewLedger = async (friendUserId: string) => {
    try {
      const [ledger, prof] = await Promise.all([
        loadSettlements(friendUserId),
        loadUserProfile(friendUserId),
      ]);
      setFriendLedger(ledger);
      setFriendProfile(prof);
      setSelectedFriend(friendUserId);
      setView("ledger");
    } catch { /* silent */ }
  };

  const existingRelationships = useMemo(() => {
    const map = new Set<string>();
    [...friends, ...pending, ...sent].forEach((f: any) => {
      map.add(f.user_id_a);
      map.add(f.user_id_b);
    });
    return map;
  }, [friends, pending, sent]);

  const friendLedgerTotal = useMemo(() =>
    friendLedger.reduce((sum, s) => sum + Number(s.amount), 0),
    [friendLedger]
  );

  const handleInvite = async () => {
    setInviteSending(true);
    try {
      const token = await createInvite();
      const inviteUrl = `${window.location.origin}/invite/${token}`;
      const senderName = [myProfile?.first_name, myProfile?.last_name].filter(Boolean).join(" ") || myProfile?.display_name || "Your buddy";
      const msg = `${senderName} invited you to join Crybaby Golf ⛳ — track scores, settle bets, and talk trash on the course.`;

      if (navigator.share) {
        await navigator.share({ title: "Join me on Crybaby Golf", text: msg, url: inviteUrl });
      } else {
        // Fallback: SMS
        window.open(`sms:?body=${encodeURIComponent(msg + " " + inviteUrl)}`, "_self");
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        toast({ title: "Couldn't create invite", description: "Please try again.", variant: "destructive" });
      }
    } finally {
      setInviteSending(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Ledger view ──
  if (view === "ledger" && friendProfile) {
    return (
      <div className="max-w-[420px] mx-auto min-h-screen bg-background pb-24">
        <div className="px-4 pt-6 pb-2 flex justify-between items-center">
          <h1 className="text-2xl font-extrabold text-foreground tracking-tight">Ledger</h1>
          <button onClick={() => setView("list")}
            className="px-3 py-2 rounded-xl border border-border bg-card text-foreground text-xs font-semibold cursor-pointer hover:border-primary/30 transition-colors flex items-center gap-1.5">
            <ArrowLeft size={14} /> Back
          </button>
        </div>
        <div className="px-4 flex flex-col gap-4">
          <div className="bg-card rounded-2xl p-5 border border-border text-center">
            <UserAvatar profile={friendProfile} size={56} />
            <div className="text-lg font-extrabold text-foreground mt-3">
              {friendProfile.display_name}
            </div>
            {friendProfile.handicap != null && (
              <span className="inline-block mt-1.5 px-2 py-0.5 rounded bg-accent text-accent-foreground text-xs font-mono font-bold">
                HCP {friendProfile.handicap}
              </span>
            )}
            <div className="mt-4 p-3.5 bg-muted rounded-xl">
              <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Total P&L</div>
              <div className={`font-mono text-2xl font-extrabold mt-1 ${friendLedgerTotal >= 0 ? "text-primary" : "text-destructive"}`}>
                {friendLedgerTotal >= 0 ? "+" : ""}${friendLedgerTotal.toFixed(0)}
              </div>
            </div>
          </div>
          {friendLedger.length === 0 ? (
            <div className="text-center py-5 text-sm text-muted-foreground">
              No settlement data yet for this player.
            </div>
          ) : (
            <div className="bg-card rounded-2xl p-4 border border-border">
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">Round Results</div>
              <div className="flex flex-col gap-1">
                {friendLedger.map((s: any, i: number) => (
                  <div key={i} className="flex justify-between items-center p-3 bg-muted rounded-lg text-xs">
                    <div>
                      <span className="font-semibold text-foreground">{s.rounds?.course || "Round"}</span>
                      {s.is_manual_adjustment && (
                        <span className="ml-1.5 text-[10px] text-accent-foreground font-bold">ADJ</span>
                      )}
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {format(parseISO(s.created_at), "MMM d, yyyy")}
                      </div>
                    </div>
                    <span className={`font-mono font-bold text-sm ${Number(s.amount) >= 0 ? "text-primary" : "text-destructive"}`}>
                      {Number(s.amount) >= 0 ? "+" : ""}${Number(s.amount).toFixed(0)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Main list view ──
  const showingSearch = searchQuery.trim().length > 0;

  return (
    <div className="max-w-[420px] mx-auto min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="px-4 pt-6 pb-3 flex justify-between items-center">
        <h1 className="text-2xl font-extrabold text-foreground tracking-tight">Friends</h1>
        <button
          onClick={handleInvite}
          disabled={inviteSending}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold border-none cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          {inviteSending
            ? <Loader2 size={15} className="animate-spin" />
            : <Share2 size={15} />}
          Invite
        </button>
      </div>

      {/* Always-visible search */}
      <div className="px-4 mb-3">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search players by name, course, state…"
            className="w-full pl-9 pr-9 py-3 rounded-2xl border border-border bg-card text-sm text-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 placeholder:text-muted-foreground"
            style={{ fontSize: 16 }}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      <div className="px-4 flex flex-col gap-4">

        {/* ── Search results ── */}
        {showingSearch && (
          <div className="bg-card rounded-2xl border border-border overflow-hidden">
            {searching ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={20} className="animate-spin text-muted-foreground" />
              </div>
            ) : searchResults.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                No players found for "{searchQuery}"
              </div>
            ) : (
              searchResults.map((p: any, i: number) => {
                const alreadyConnected = existingRelationships.has(p.user_id);
                const nameDisplay = [p.first_name, p.last_name].filter(Boolean).join(" ") || p.display_name;
                return (
                  <div key={p.user_id}
                    className={`flex items-center gap-3 px-4 py-3 ${i < searchResults.length - 1 ? "border-b border-border" : ""}`}>
                    <UserAvatar profile={p} size={40} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-foreground truncate">{nameDisplay}</div>
                      <div className="flex flex-wrap gap-x-2 gap-y-0.5 items-center">
                        {p.handicap != null && <span className="text-xs font-mono text-primary font-semibold">HCP {p.handicap}</span>}
                        {p.home_course && <span className="text-xs text-muted-foreground truncate max-w-[120px]">{p.home_course}</span>}
                        {p.state && <span className="text-xs text-muted-foreground">{p.state}</span>}
                      </div>
                    </div>
                    {alreadyConnected ? (
                      <span className="text-xs font-semibold text-muted-foreground">Connected</span>
                    ) : (
                      <button onClick={() => handleSendRequest(p.user_id)}
                        className="px-3 py-1.5 rounded-lg border-none bg-primary text-primary-foreground text-xs font-bold cursor-pointer hover:opacity-90 whitespace-nowrap">
                        + Add
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ── Pending Requests ── */}
        {!showingSearch && pending.length > 0 && (
          <div className="bg-card rounded-2xl p-4 border border-primary/30">
            <div className="text-[10px] font-bold text-primary uppercase tracking-wider mb-3">
              Requests ({pending.length})
            </div>
            {pending.map((req: any) => {
              const senderId = req.user_id_a;
              const profile = profiles[senderId];
              const senderName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || profile?.display_name || "Unknown";
              return (
                <div key={req.id} className="flex items-center gap-3 py-3 border-b border-border last:border-none">
                  <UserAvatar profile={profile} size={42} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-foreground">{senderName}</div>
                    {profile?.handicap != null && (
                      <span className="text-xs font-mono text-muted-foreground">HCP {profile.handicap}</span>
                    )}
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={() => handleAccept(req.id)}
                      className="px-3 py-1.5 rounded-lg border-none bg-primary text-primary-foreground text-xs font-bold cursor-pointer hover:opacity-90">
                      Accept
                    </button>
                    <button onClick={() => handleDecline(req.id)}
                      className="px-2.5 py-1.5 rounded-lg border border-border bg-card text-destructive text-xs font-semibold cursor-pointer">
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Suggested Players (group co-members) ── */}
        {!showingSearch && suggested.length > 0 && (
          <div className="bg-card rounded-2xl p-4 border border-border">
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">
              People You May Know
            </div>
            {suggested.map((p: any, i: number) => {
              const nameDisplay = [p.first_name, p.last_name].filter(Boolean).join(" ") || p.display_name;
              return (
                <div key={p.user_id}
                  className={`flex items-center gap-3 py-3 ${i < suggested.length - 1 ? "border-b border-border" : ""}`}>
                  <UserAvatar profile={p} size={42} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-foreground truncate">{nameDisplay}</div>
                    <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                      {p.handicap != null && <span className="text-xs font-mono text-primary font-semibold">HCP {p.handicap}</span>}
                      {p.home_course && <span className="text-xs text-muted-foreground truncate max-w-[140px]">{p.home_course}</span>}
                    </div>
                  </div>
                  <button onClick={() => handleSendRequest(p.user_id)}
                    className="px-3 py-1.5 rounded-lg border border-primary/40 bg-primary/10 text-primary text-xs font-bold cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors whitespace-nowrap">
                    + Add
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Friends List ── */}
        {!showingSearch && (
          <div className="bg-card rounded-2xl p-4 border border-border">
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">
              Friends ({friends.length})
            </div>
            {friends.length === 0 ? (
              <div className="text-center py-6">
                <UserPlus size={32} className="mx-auto text-muted-foreground mb-2" />
                <div className="text-sm font-semibold text-muted-foreground">No friends yet</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Search above or hit Invite to bring your crew in
                </div>
              </div>
            ) : (
              friends.map((fr: any) => {
                const friendId = getFriendId(fr);
                const profile = profiles[friendId];
                return (
                  <div key={fr.id}
                    className="flex items-center gap-3 py-3 border-b border-border last:border-none cursor-pointer hover:bg-accent/50 -mx-4 px-4 transition-colors"
                    onClick={() => handleViewLedger(friendId)}>
                    <UserAvatar profile={profile} size={44} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[15px] font-semibold text-foreground">
                        {[profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || profile?.display_name || "Unknown"}
                      </div>
                      <div className="flex gap-2 mt-0.5">
                        {profile?.handicap != null && (
                          <span className="text-xs font-mono text-primary font-semibold">HCP {profile.handicap}</span>
                        )}
                        {profile?.home_course && (
                          <span className="text-xs text-muted-foreground truncate">{profile.home_course}</span>
                        )}
                      </div>
                    </div>
                    <ChevronRight size={16} className="text-muted-foreground" />
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ── Sent Requests ── */}
        {!showingSearch && sent.length > 0 && (
          <div className="bg-card rounded-2xl p-4 border border-border">
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">
              Sent ({sent.length})
            </div>
            {sent.map((req: any) => {
              const targetId = req.user_id_b;
              const profile = profiles[targetId];
              const targetName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || profile?.display_name || "Unknown";
              return (
                <div key={req.id} className="flex items-center gap-3 py-3 border-b border-border last:border-none">
                  <UserAvatar profile={profile} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-muted-foreground">{targetName}</div>
                    <span className="text-xs text-muted-foreground">Pending…</span>
                  </div>
                  <button onClick={() => handleDecline(req.id)}
                    className="px-2.5 py-1.5 rounded-lg border border-border bg-card text-muted-foreground text-xs font-semibold cursor-pointer">
                    Cancel
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
