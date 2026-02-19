import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  loadFriends, loadPendingRequests, loadSentRequests,
  sendFriendRequest, acceptFriendRequest, removeFriendship,
  searchProfiles, loadSettlements, loadUserProfile, loadProfile,
} from "@/lib/db";
import { format, parseISO } from "date-fns";
import { UserPlus, Search, ArrowLeft, ChevronRight, Loader2, Share2, Copy, Check } from "lucide-react";
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

type View = "list" | "search" | "ledger";

export default function FriendsPage() {
  const { user } = useAuth();
  const [view, setView] = useState<View>("list");
  const [friends, setFriends] = useState<any[]>([]);
  const [pending, setPending] = useState<any[]>([]);
  const [sent, setSent] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  // Friend ledger view
  const [selectedFriend, setSelectedFriend] = useState<any>(null);
  const [friendLedger, setFriendLedger] = useState<any[]>([]);
  const [friendProfile, setFriendProfile] = useState<any>(null);

  // Invite
  const [linkCopied, setLinkCopied] = useState(false);
  const [myProfile, setMyProfile] = useState<any>(null);

  const INVITE_URL = "https://crybabygolf.lovable.app/auth";

  const loadAll = async () => {
    if (!user) return;
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
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, [user]);

  const getFriendId = (friendship: any) => {
    return friendship.user_id_a === user?.id ? friendship.user_id_b : friendship.user_id_a;
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const results = await searchProfiles(searchQuery.trim());
      setSearchResults(results);
    } catch (e) {
      console.error(e);
    } finally {
      setSearching(false);
    }
  };

  const handleSendRequest = async (targetUserId: string) => {
    try {
      await sendFriendRequest(targetUserId);
      setSearchResults(prev => prev.filter(p => p.user_id !== targetUserId));
      await loadAll();
      toast({ title: "Friend request sent!" });
    } catch (e: any) {
      console.error(e);
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleAccept = async (friendshipId: string) => {
    try {
      await acceptFriendRequest(friendshipId);
      await loadAll();
    } catch (e) { console.error(e); }
  };

  const handleDecline = async (friendshipId: string) => {
    try {
      await removeFriendship(friendshipId);
      await loadAll();
    } catch (e) { console.error(e); }
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
    } catch (e) { console.error(e); }
  };

  const existingRelationships = useMemo(() => {
    const map = new Set<string>();
    [...friends, ...pending, ...sent].forEach((f: any) => {
      map.add(f.user_id_a);
      map.add(f.user_id_b);
    });
    return map;
  }, [friends, pending, sent]);

  const friendLedgerTotal = useMemo(() => {
    return friendLedger.reduce((sum, s) => sum + Number(s.amount), 0);
  }, [friendLedger]);

  const handleShareLink = async () => {
    const shareData = {
      title: "Join me on Crybaby Golf!",
      text: `${myProfile?.display_name || "Your buddy"} wants you to join Crybaby Golf — the app for tracking bets, trash talk, and bragging rights on the course.`,
      url: INVITE_URL,
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (e: any) {
        if (e.name !== "AbortError") console.error(e);
      }
    } else {
      await navigator.clipboard.writeText(INVITE_URL);
      setLinkCopied(true);
      toast({ title: "Link copied!" });
      setTimeout(() => setLinkCopied(false), 2000);
    }
  };

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(INVITE_URL);
    setLinkCopied(true);
    toast({ title: "Link copied to clipboard!" });
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const goBack = () => {
    setView("list");
    setSearchQuery("");
    setSearchResults([]);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-[420px] mx-auto min-h-screen bg-background pb-24">
      {/* Page header */}
      <div className="px-4 pt-4 pb-2 flex justify-between items-center">
        <h1 className="text-2xl font-extrabold text-foreground tracking-tight">
          {view === "ledger" ? "Ledger" : view === "search" ? "Find Friends" : "Friends"}
        </h1>
        <div className="flex gap-2">
          {view === "list" && (
            <>
              <button onClick={handleShareLink}
                className="px-3 py-2 rounded-xl border border-border bg-card text-foreground text-xs font-semibold cursor-pointer hover:border-primary/30 transition-colors flex items-center gap-1.5">
                <Share2 size={14} /> Invite
              </button>
              <button onClick={() => setView("search")}
                className="px-3 py-2 rounded-xl border-none bg-primary text-primary-foreground text-xs font-bold cursor-pointer hover:opacity-90 transition-opacity flex items-center gap-1.5">
                <Search size={14} /> Find
              </button>
            </>
          )}
          {view !== "list" && (
            <button onClick={goBack}
              className="px-3 py-2 rounded-xl border border-border bg-card text-foreground text-xs font-semibold cursor-pointer hover:border-primary/30 transition-colors flex items-center gap-1.5">
              <ArrowLeft size={14} /> Back
            </button>
          )}
        </div>
      </div>

      <div className="px-4 flex flex-col gap-4">
        {/* ─── SEARCH / FIND VIEW ─── */}
        {view === "search" && (
          <>
            <div className="bg-card rounded-2xl p-4 border border-border">
              <p className="text-xs text-muted-foreground mb-3">
                Search by name, GHIN number, home course, or state
              </p>
              <div className="flex gap-2">
                <input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleSearch()}
                  placeholder="Name, GHIN, course, or state..."
                  className="flex-1 p-3 rounded-xl border border-border bg-background text-sm text-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 placeholder:text-muted-foreground"
                  style={{ fontSize: 16 }}
                />
                <button onClick={handleSearch} disabled={searching}
                  className="px-4 rounded-xl border-none bg-primary text-primary-foreground text-sm font-bold cursor-pointer disabled:opacity-50 flex items-center justify-center"
                  style={{ minWidth: 48 }}>
                  {searching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                </button>
              </div>
            </div>

            {/* Invite link fallback */}
            <div className="flex gap-2">
              <button onClick={handleShareLink}
                className="flex-1 p-3 rounded-xl border border-border bg-card text-foreground text-xs font-semibold cursor-pointer hover:border-primary/30 transition-colors flex items-center justify-center gap-1.5">
                <Share2 size={14} /> Share Invite Link
              </button>
              <button onClick={handleCopyLink}
                className="p-3 rounded-xl border border-border bg-card text-foreground text-xs font-semibold cursor-pointer hover:border-primary/30 transition-colors flex items-center justify-center gap-1.5"
                style={{ minWidth: 48 }}>
                {linkCopied ? <Check size={14} className="text-primary" /> : <Copy size={14} />}
              </button>
            </div>

            {searchResults.length > 0 && (
              <div className="bg-card rounded-2xl overflow-hidden border border-border">
                {searchResults.map((p: any, i: number) => {
                  const alreadyConnected = existingRelationships.has(p.user_id);
                  const nameDisplay = [p.first_name, p.last_name].filter(Boolean).join(" ") || p.display_name;
                  return (
                    <div key={p.user_id} className={`flex items-center gap-3 px-4 py-3 ${i < searchResults.length - 1 ? "border-b border-border" : ""}`}>
                      <UserAvatar profile={p} size={40} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-foreground truncate">{nameDisplay}</div>
                        <div className="flex flex-wrap gap-x-2 gap-y-0.5 items-center">
                          {p.handicap != null && (
                            <span className="text-xs font-mono text-primary font-semibold">HCP {p.handicap}</span>
                          )}
                          {p.home_course && (
                            <span className="text-xs text-muted-foreground truncate">{p.home_course}</span>
                          )}
                          {p.state && (
                            <span className="text-xs text-muted-foreground">{p.state}</span>
                          )}
                          {p.ghin && (
                            <span className="text-xs text-muted-foreground font-mono">GHIN {p.ghin}</span>
                          )}
                        </div>
                      </div>
                      {alreadyConnected ? (
                        <span className="text-xs font-semibold text-muted-foreground">Connected</span>
                      ) : (
                        <button onClick={() => handleSendRequest(p.user_id)}
                          className="px-3 py-1.5 rounded-lg border-none bg-primary text-primary-foreground text-xs font-bold cursor-pointer hover:opacity-90">
                          Add
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {searchQuery && !searching && searchResults.length === 0 && (
              <div className="text-center py-5 text-sm text-muted-foreground">
                No players found for "{searchQuery}"
              </div>
            )}
          </>
        )}

        {/* ─── LEDGER VIEW ─── */}
        {view === "ledger" && friendProfile && (
          <>
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
                <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">
                  Round Results
                </div>
                <div className="flex flex-col gap-1">
                  {friendLedger.map((s: any, i: number) => (
                    <div key={i} className="flex justify-between items-center p-3 bg-muted rounded-lg text-xs">
                      <div>
                        <span className="font-semibold text-foreground">
                          {s.rounds?.course || "Round"}
                        </span>
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
          </>
        )}

        {/* ─── FRIENDS LIST VIEW ─── */}
        {view === "list" && (
          <>
            {/* Pending Requests */}
            {pending.length > 0 && (
              <div className="bg-card rounded-2xl p-4 border border-border">
                <div className="text-[10px] font-bold text-destructive uppercase tracking-wider mb-3">
                  Pending Requests ({pending.length})
                </div>
                {pending.map((req: any) => {
                  const senderId = req.user_id_a;
                  const profile = profiles[senderId];
                  return (
                    <div key={req.id} className="flex items-center gap-3 py-3 border-b border-border last:border-none">
                      <UserAvatar profile={profile} size={40} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-foreground">
                          {profile?.display_name || "Unknown"}
                        </div>
                        {profile?.handicap != null && (
                          <span className="text-xs font-mono text-muted-foreground">HCP {profile.handicap}</span>
                        )}
                      </div>
                      <div className="flex gap-1.5">
                        <button onClick={() => handleAccept(req.id)}
                          className="px-3 py-1.5 rounded-lg border-none bg-primary text-primary-foreground text-xs font-bold cursor-pointer">
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

            {/* Sent Requests */}
            {sent.length > 0 && (
              <div className="bg-card rounded-2xl p-4 border border-border">
                <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">
                  Sent ({sent.length})
                </div>
                {sent.map((req: any) => {
                  const targetId = req.user_id_b;
                  const profile = profiles[targetId];
                  return (
                    <div key={req.id} className="flex items-center gap-3 py-3 border-b border-border last:border-none">
                      <UserAvatar profile={profile} size={36} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-muted-foreground">
                          {profile?.display_name || "Unknown"}
                        </div>
                        <span className="text-xs text-muted-foreground">Pending...</span>
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

            {/* Accepted Friends */}
            <div className="bg-card rounded-2xl p-4 border border-border">
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">
                Friends ({friends.length})
              </div>
              {friends.length === 0 ? (
                <div className="text-center py-6">
                  <UserPlus size={32} className="mx-auto text-muted-foreground mb-2" />
                  <div className="text-sm font-semibold text-muted-foreground">No friends yet</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Tap "Find" to search or "Invite" to share a link
                  </div>
                </div>
              ) : (
                friends.map((fr: any) => {
                  const friendId = getFriendId(fr);
                  const profile = profiles[friendId];
                  return (
                    <div key={fr.id} className="flex items-center gap-3 py-3 border-b border-border last:border-none cursor-pointer hover:bg-accent/50 -mx-4 px-4 transition-colors"
                      onClick={() => handleViewLedger(friendId)}>
                      <UserAvatar profile={profile} size={44} />
                      <div className="flex-1 min-w-0">
                        <div className="text-[15px] font-semibold text-foreground">
                          {profile?.display_name || "Unknown"}
                        </div>
                        <div className="flex gap-2 mt-0.5">
                          {profile?.handicap != null && (
                            <span className="text-xs font-mono text-primary font-semibold">
                              HCP {profile.handicap}
                            </span>
                          )}
                          {profile?.home_course && (
                            <span className="text-xs text-muted-foreground">{profile.home_course}</span>
                          )}
                        </div>
                      </div>
                      <ChevronRight size={16} className="text-muted-foreground" />
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
