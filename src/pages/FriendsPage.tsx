import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  loadFriends, loadPendingRequests, loadSentRequests,
  sendFriendRequest, acceptFriendRequest, removeFriendship,
  searchProfiles, loadSettlements, loadUserProfile,
  findUsersByEmails, sendInviteEmails, loadProfile,
} from "@/lib/db";
import { format, parseISO } from "date-fns";
import { UserPlus, Search, Mail, Contact, ArrowLeft, ChevronRight, Loader2, CheckCircle2, Send } from "lucide-react";
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

type View = "list" | "search" | "ledger" | "find";

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

  // Find friends
  const [findMode, setFindMode] = useState<"menu" | "contacts" | "email">("menu");
  const [emailInput, setEmailInput] = useState("");
  const [contactEmails, setContactEmails] = useState<string[]>([]);
  const [matchedUsers, setMatchedUsers] = useState<any[]>([]);
  const [unmatchedEmails, setUnmatchedEmails] = useState<string[]>([]);
  const [findLoading, setFindLoading] = useState(false);
  const [inviteSending, setInviteSending] = useState<Set<string>>(new Set());
  const [inviteSent, setInviteSent] = useState<Set<string>>(new Set());
  const [myProfile, setMyProfile] = useState<any>(null);

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
      setMatchedUsers(prev => prev.map(u => u.user_id === targetUserId ? { ...u, requestSent: true } : u));
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

  // ─── Contacts API ───
  const handleAccessContacts = async () => {
    try {
      if (!("contacts" in navigator)) {
        toast({ title: "Not supported", description: "Contacts API isn't available on this device. Try entering emails manually.", variant: "destructive" });
        setFindMode("email");
        return;
      }
      const contacts = await (navigator as any).contacts.select(["email"], { multiple: true });
      const emails: string[] = [];
      contacts.forEach((c: any) => {
        if (c.email) c.email.forEach((e: string) => emails.push(e.toLowerCase().trim()));
      });
      if (emails.length === 0) {
        toast({ title: "No emails found", description: "None of your contacts had email addresses." });
        return;
      }
      setContactEmails(emails);
      await matchEmails(emails);
    } catch (e: any) {
      if (e.name !== "TypeError") {
        console.error(e);
      }
      toast({ title: "Contacts access denied", description: "You can enter emails manually instead." });
      setFindMode("email");
    }
  };

  const matchEmails = async (emails: string[]) => {
    setFindLoading(true);
    try {
      const uniqueEmails = [...new Set(emails.map(e => e.toLowerCase().trim()))];
      const matched = await findUsersByEmails(uniqueEmails);
      const matchedEmailSet = new Set(matched.map((m: any) => m.email.toLowerCase()));
      const unmatched = uniqueEmails.filter(e => !matchedEmailSet.has(e));
      setMatchedUsers(matched);
      setUnmatchedEmails(unmatched);
      setFindMode("contacts");
    } catch (e) {
      console.error(e);
      toast({ title: "Error", description: "Failed to look up contacts", variant: "destructive" });
    } finally {
      setFindLoading(false);
    }
  };

  const handleEmailSubmit = async () => {
    const emails = emailInput
      .split(/[,\n]+/)
      .map(e => e.trim().toLowerCase())
      .filter(e => e.includes("@"));
    if (emails.length === 0) {
      toast({ title: "Enter valid emails", description: "Separate multiple emails with commas." });
      return;
    }
    setContactEmails(emails);
    await matchEmails(emails);
  };

  const handleSendInvite = async (email: string) => {
    setInviteSending(prev => new Set(prev).add(email));
    try {
      await sendInviteEmails([email], myProfile?.display_name || "A friend");
      setInviteSent(prev => new Set(prev).add(email));
      toast({ title: "Invite sent!", description: `Email invite sent to ${email}` });
    } catch (e: any) {
      toast({ title: "Failed to send", description: e.message, variant: "destructive" });
    } finally {
      setInviteSending(prev => {
        const next = new Set(prev);
        next.delete(email);
        return next;
      });
    }
  };

  const goBack = () => {
    if (view === "find") {
      setFindMode("menu");
      setMatchedUsers([]);
      setUnmatchedEmails([]);
      setContactEmails([]);
      setEmailInput("");
      setInviteSent(new Set());
    }
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
          {view === "ledger" ? "Ledger" : view === "find" ? "Find Friends" : view === "search" ? "Search" : "Friends"}
        </h1>
        <div className="flex gap-2">
          {view === "list" && (
            <>
              <button onClick={() => { setView("find"); setFindMode("menu"); }}
                className="px-3 py-2 rounded-xl border border-border bg-card text-foreground text-xs font-semibold cursor-pointer hover:border-primary/30 transition-colors flex items-center gap-1.5">
                <UserPlus size={14} /> Find Friends
              </button>
              <button onClick={() => setView("search")}
                className="px-3 py-2 rounded-xl border-none bg-primary text-primary-foreground text-xs font-bold cursor-pointer hover:opacity-90 transition-opacity flex items-center gap-1.5">
                <Search size={14} /> Search
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
        {/* ─── FIND FRIENDS VIEW ─── */}
        {view === "find" && findMode === "menu" && (
          <div className="flex flex-col gap-3">
            <div className="bg-card rounded-2xl p-5 border border-border text-center">
              <UserPlus size={32} className="mx-auto text-primary mb-3" />
              <h3 className="text-base font-bold text-foreground mb-1">Find your golf buddies</h3>
              <p className="text-sm text-muted-foreground">
                Check your contacts or enter emails to find friends already on Crybaby — or invite them to join.
              </p>
            </div>

            <button onClick={handleAccessContacts}
              className="w-full p-4 rounded-2xl border border-border bg-card cursor-pointer text-left hover:border-primary/30 hover:shadow-sm transition-all flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Contact size={20} className="text-primary" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-foreground">Check Contacts</div>
                <div className="text-xs text-muted-foreground">Match your phone contacts with Crybaby</div>
              </div>
              <ChevronRight size={16} className="text-muted-foreground" />
            </button>

            <button onClick={() => setFindMode("email")}
              className="w-full p-4 rounded-2xl border border-border bg-card cursor-pointer text-left hover:border-primary/30 hover:shadow-sm transition-all flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center">
                <Mail size={20} className="text-accent-foreground" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-foreground">Enter Emails</div>
                <div className="text-xs text-muted-foreground">Type or paste email addresses to find friends</div>
              </div>
              <ChevronRight size={16} className="text-muted-foreground" />
            </button>
          </div>
        )}

        {view === "find" && findMode === "email" && matchedUsers.length === 0 && unmatchedEmails.length === 0 && (
          <div className="flex flex-col gap-3">
            <div className="bg-card rounded-2xl p-4 border border-border">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                Enter email addresses
              </label>
              <textarea
                value={emailInput}
                onChange={e => setEmailInput(e.target.value)}
                placeholder={"john@example.com\njane@example.com"}
                rows={4}
                className="w-full border border-border rounded-xl p-3 bg-background text-sm text-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 resize-none placeholder:text-muted-foreground"
              />
              <p className="text-xs text-muted-foreground mt-1.5">Separate multiple emails with commas or new lines</p>
              <button
                onClick={handleEmailSubmit}
                disabled={findLoading || !emailInput.trim()}
                className="w-full mt-3 p-3 rounded-xl border-none bg-primary text-primary-foreground text-sm font-bold cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {findLoading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                {findLoading ? "Searching..." : "Find Friends"}
              </button>
            </div>
          </div>
        )}

        {/* Results (shared for contacts + email) */}
        {view === "find" && (matchedUsers.length > 0 || unmatchedEmails.length > 0) && (
          <div className="flex flex-col gap-4">
            {/* Matched users */}
            {matchedUsers.length > 0 && (
              <div className="bg-card rounded-2xl border border-border overflow-hidden">
                <div className="px-4 py-3 border-b border-border">
                  <span className="text-xs font-bold text-primary uppercase tracking-wider">
                    Already on Crybaby ({matchedUsers.length})
                  </span>
                </div>
                {matchedUsers.map((u: any, i: number) => {
                  const alreadyConnected = existingRelationships.has(u.user_id);
                  return (
                    <div key={u.user_id} className={`flex items-center gap-3 px-4 py-3 ${i < matchedUsers.length - 1 ? "border-b border-border" : ""}`}>
                      <UserAvatar profile={u} size={40} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-foreground truncate">{u.display_name}</div>
                        {u.handicap != null && (
                          <span className="text-xs font-mono text-primary font-semibold">HCP {u.handicap}</span>
                        )}
                      </div>
                      {alreadyConnected || u.requestSent ? (
                        <span className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                          <CheckCircle2 size={14} /> {u.requestSent ? "Sent" : "Connected"}
                        </span>
                      ) : (
                        <button onClick={() => handleSendRequest(u.user_id)}
                          className="px-3 py-1.5 rounded-lg border-none bg-primary text-primary-foreground text-xs font-bold cursor-pointer hover:opacity-90 transition-opacity">
                          Add
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Unmatched emails — invite */}
            {unmatchedEmails.length > 0 && (
              <div className="bg-card rounded-2xl border border-border overflow-hidden">
                <div className="px-4 py-3 border-b border-border">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    Not on Crybaby yet ({unmatchedEmails.length})
                  </span>
                </div>
                {unmatchedEmails.map((email, i) => (
                  <div key={email} className={`flex items-center gap-3 px-4 py-3 ${i < unmatchedEmails.length - 1 ? "border-b border-border" : ""}`}>
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                      <Mail size={16} className="text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-foreground truncate">{email}</div>
                    </div>
                    {inviteSent.has(email) ? (
                      <span className="flex items-center gap-1 text-xs font-semibold text-primary">
                        <CheckCircle2 size={14} /> Invited
                      </span>
                    ) : (
                      <button
                        onClick={() => handleSendInvite(email)}
                        disabled={inviteSending.has(email)}
                        className="px-3 py-1.5 rounded-lg border border-primary text-primary bg-transparent text-xs font-bold cursor-pointer hover:bg-primary/5 transition-colors disabled:opacity-50 flex items-center gap-1"
                      >
                        {inviteSending.has(email) ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                        Invite
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <button onClick={() => { setMatchedUsers([]); setUnmatchedEmails([]); setFindMode("menu"); }}
              className="text-sm text-primary font-semibold bg-transparent border-none cursor-pointer hover:underline self-center">
              Search more contacts
            </button>
          </div>
        )}

        {/* ─── SEARCH VIEW ─── */}
        {view === "search" && (
          <>
            <div className="flex gap-2">
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSearch()}
                placeholder="Search by name..."
                className="flex-1 p-3 rounded-2xl border border-border bg-card text-sm text-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 placeholder:text-muted-foreground"
              />
              <button onClick={handleSearch} disabled={searching}
                className="px-4 rounded-2xl border-none bg-primary text-primary-foreground text-sm font-bold cursor-pointer disabled:opacity-50">
                {searching ? "..." : "🔍"}
              </button>
            </div>

            {searchResults.length > 0 && (
              <div className="bg-card rounded-2xl overflow-hidden border border-border">
                {searchResults.map((p, i) => {
                  const alreadyConnected = existingRelationships.has(p.user_id);
                  return (
                    <div key={p.id} className={`flex items-center gap-3 px-4 py-3 ${i < searchResults.length - 1 ? "border-b border-border" : ""}`}>
                      <UserAvatar profile={p} size={40} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-foreground">{p.display_name}</div>
                        <div className="flex gap-2 items-center">
                          {p.handicap != null && (
                            <span className="text-xs font-mono text-primary font-semibold">HCP {p.handicap}</span>
                          )}
                          {p.home_course && (
                            <span className="text-xs text-muted-foreground">{p.home_course}</span>
                          )}
                        </div>
                      </div>
                      {alreadyConnected ? (
                        <span className="text-xs font-semibold text-muted-foreground">Connected</span>
                      ) : (
                        <button onClick={() => handleSendRequest(p.user_id)}
                          className="px-3 py-1.5 rounded-lg border-none bg-primary text-primary-foreground text-xs font-bold cursor-pointer hover:opacity-90">
                          Follow
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
                    Tap "Find Friends" to get started
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
