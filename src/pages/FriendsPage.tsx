import { useState, useEffect, useMemo } from "react";
import crybabyLogo from "@/assets/crybaby-logo.png";
import { useAuth } from "@/contexts/AuthContext";
import {
  loadFriends, loadPendingRequests, loadSentRequests,
  sendFriendRequest, acceptFriendRequest, removeFriendship,
  searchProfiles, loadSettlements, loadUserProfile,
} from "@/lib/db";
import { format, parseISO } from "date-fns";

const FONT = "'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const MONO = "'SF Mono', 'JetBrains Mono', monospace";

function UserAvatar({ profile, size = 40, bg = "#16A34A" }: { profile: any; size?: number; bg?: string }) {
  const name = profile?.display_name || "?";
  const initial = name[0]?.toUpperCase() || "?";
  if (profile?.avatar_url) {
    return (
      <img src={profile.avatar_url} alt={name}
        style={{ width: size, height: size, borderRadius: size / 2, objectFit: "cover", flexShrink: 0 }} />
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: size / 2, background: bg,
      display: "flex", alignItems: "center", justifyContent: "center",
      color: "#fff", fontSize: size * 0.4, fontWeight: 700, fontFamily: FONT, flexShrink: 0,
    }}>{initial}</div>
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

  const loadAll = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [f, p, s] = await Promise.all([
        loadFriends(),
        loadPendingRequests(),
        loadSentRequests(),
      ]);
      setFriends(f);
      setPending(p);
      setSent(s);

      // Load profiles for all friend user IDs
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
    } catch (e: any) {
      console.error(e);
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

  // Check if a user is already a friend or has a pending request
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

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT }}>
        Loading...
      </div>
    );
  }

  return (
    <div style={{
      maxWidth: 420, margin: "0 auto", minHeight: "100vh",
      background: "#F7F7F5", fontFamily: FONT, paddingBottom: 100,
    }}>
      {/* Header */}
      <div style={{
        padding: "52px 20px 16px", background: "#fff",
        borderBottom: "1px solid #E5E7EB",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <img src={crybabyLogo} alt="Crybaby" style={{ height: 64, marginLeft: -8, marginTop: -12, marginBottom: -12 }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: "#9CA3AF" }}>
              {view === "ledger" ? "/ Ledger" : "/ Friends"}
            </span>
          </div>
          {view === "list" && (
            <button onClick={() => setView("search")} style={{
              padding: "8px 14px", borderRadius: 10, border: "none", cursor: "pointer",
              fontFamily: FONT, fontSize: 12, fontWeight: 700,
              background: "#1A1A1A", color: "#fff",
            }}>+ Add Friend</button>
          )}
          {(view === "search" || view === "ledger") && (
            <button onClick={() => { setView("list"); setSearchQuery(""); setSearchResults([]); }} style={{
              padding: "8px 14px", borderRadius: 10, border: "1px solid #E5E7EB",
              background: "#fff", fontFamily: FONT, fontSize: 12, fontWeight: 600,
              color: "#6B7280", cursor: "pointer",
            }}>← Back</button>
          )}
        </div>
      </div>

      <div style={{ padding: "16px 16px", display: "flex", flexDirection: "column", gap: 16 }}>
        {/* SEARCH VIEW */}
        {view === "search" && (
          <>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSearch()}
                placeholder="Search by name..."
                style={{
                  flex: 1, padding: "12px 14px", borderRadius: 12,
                  border: "1px solid #E5E7EB", background: "#fff",
                  fontFamily: FONT, fontSize: 14, outline: "none",
                }}
              />
              <button onClick={handleSearch} disabled={searching} style={{
                padding: "12px 16px", borderRadius: 12, border: "none",
                background: "#16A34A", color: "#fff", fontFamily: FONT,
                fontSize: 14, fontWeight: 700, cursor: "pointer",
                opacity: searching ? 0.6 : 1,
              }}>
                {searching ? "..." : "🔍"}
              </button>
            </div>

            {searchResults.length > 0 ? (
              <div style={{
                background: "#fff", borderRadius: 16, overflow: "hidden",
                boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
              }}>
                {searchResults.map((p, i) => {
                  const alreadyConnected = existingRelationships.has(p.user_id);
                  return (
                    <div key={p.id} style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "14px 16px",
                      borderBottom: i < searchResults.length - 1 ? "1px solid #F3F4F6" : "none",
                    }}>
                      <UserAvatar profile={p} size={40} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A" }}>{p.display_name}</div>
                        {p.handicap != null && (
                          <span style={{ fontFamily: MONO, fontSize: 11, color: "#16A34A" }}>HCP {p.handicap}</span>
                        )}
                        {p.home_course && (
                          <span style={{ fontSize: 11, color: "#9CA3AF", marginLeft: 6 }}>{p.home_course}</span>
                        )}
                      </div>
                      {alreadyConnected ? (
                        <span style={{ fontSize: 11, fontWeight: 600, color: "#9CA3AF", padding: "6px 10px" }}>
                          Connected
                        </span>
                      ) : (
                        <button onClick={() => handleSendRequest(p.user_id)} style={{
                          padding: "8px 14px", borderRadius: 8, border: "none",
                          background: "#16A34A", color: "#fff", fontFamily: FONT,
                          fontSize: 12, fontWeight: 700, cursor: "pointer",
                        }}>Follow</button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : searchQuery && !searching ? (
              <div style={{ textAlign: "center", padding: 20, fontSize: 13, color: "#9CA3AF" }}>
                No players found for "{searchQuery}"
              </div>
            ) : null}
          </>
        )}

        {/* FRIEND LEDGER VIEW */}
        {view === "ledger" && friendProfile && (
          <>
            <div style={{
              background: "#fff", borderRadius: 20, padding: "20px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.06)", textAlign: "center",
            }}>
              <UserAvatar profile={friendProfile} size={56} bg="#3B82F6" />
              <div style={{ fontSize: 18, fontWeight: 800, color: "#1A1A1A", marginTop: 10 }}>
                {friendProfile.display_name}
              </div>
              {friendProfile.handicap != null && (
                <span style={{
                  fontFamily: MONO, fontSize: 12, fontWeight: 700, color: "#16A34A",
                  background: "#F0FDF4", padding: "2px 8px", borderRadius: 5, display: "inline-block", marginTop: 6,
                }}>HCP {friendProfile.handicap}</span>
              )}
              <div style={{
                marginTop: 16, padding: "14px", background: "#F9FAFB", borderRadius: 12,
              }}>
                <div style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase" }}>Total P&L</div>
                <div style={{
                  fontFamily: MONO, fontSize: 28, fontWeight: 800, marginTop: 4,
                  color: friendLedgerTotal >= 0 ? "#16A34A" : "#DC2626",
                }}>
                  {friendLedgerTotal >= 0 ? "+" : ""}${friendLedgerTotal.toFixed(0)}
                </div>
              </div>
            </div>

            {friendLedger.length === 0 ? (
              <div style={{ textAlign: "center", padding: 20, fontSize: 13, color: "#9CA3AF" }}>
                No settlement data yet for this player.
              </div>
            ) : (
              <div style={{
                background: "#fff", borderRadius: 20, padding: "18px 20px",
                boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>
                  Round Results
                </div>
                {friendLedger.map((s: any, i: number) => (
                  <div key={i} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "10px 12px", background: "#F9FAFB", borderRadius: 8, marginBottom: 4,
                    fontSize: 12,
                  }}>
                    <div>
                      <span style={{ fontWeight: 600, color: "#1A1A1A" }}>
                        {s.rounds?.course || "Round"}
                      </span>
                      {s.is_manual_adjustment && (
                        <span style={{ marginLeft: 6, fontSize: 10, color: "#F59E0B", fontWeight: 700 }}>ADJ</span>
                      )}
                      <div style={{ fontSize: 10, color: "#9CA3AF" }}>
                        {format(parseISO(s.created_at), "MMM d, yyyy")}
                      </div>
                    </div>
                    <span style={{
                      fontFamily: MONO, fontWeight: 700, fontSize: 13,
                      color: Number(s.amount) >= 0 ? "#16A34A" : "#DC2626",
                    }}>
                      {Number(s.amount) >= 0 ? "+" : ""}${Number(s.amount).toFixed(0)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* FRIENDS LIST VIEW */}
        {view === "list" && (
          <>
            {/* Pending Requests */}
            {pending.length > 0 && (
              <div style={{
                background: "#fff", borderRadius: 20, padding: "18px 20px",
                boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#F59E0B", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
                  Pending Requests ({pending.length})
                </div>
                {pending.map((req: any) => {
                  const senderId = req.user_id_a;
                  const profile = profiles[senderId];
                  return (
                    <div key={req.id} style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "12px 0", borderBottom: "1px solid #F3F4F6",
                    }}>
                      <UserAvatar profile={profile} size={40} bg="#F59E0B" />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A" }}>
                          {profile?.display_name || "Unknown"}
                        </div>
                        {profile?.handicap != null && (
                          <span style={{ fontFamily: MONO, fontSize: 11, color: "#9CA3AF" }}>HCP {profile.handicap}</span>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => handleAccept(req.id)} style={{
                          padding: "8px 12px", borderRadius: 8, border: "none",
                          background: "#16A34A", color: "#fff", fontFamily: FONT,
                          fontSize: 12, fontWeight: 700, cursor: "pointer",
                        }}>Accept</button>
                        <button onClick={() => handleDecline(req.id)} style={{
                          padding: "8px 12px", borderRadius: 8, border: "1px solid #E5E7EB",
                          background: "#fff", color: "#DC2626", fontFamily: FONT,
                          fontSize: 12, fontWeight: 600, cursor: "pointer",
                        }}>✕</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Sent Requests */}
            {sent.length > 0 && (
              <div style={{
                background: "#fff", borderRadius: 20, padding: "18px 20px",
                boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
                  Sent ({sent.length})
                </div>
                {sent.map((req: any) => {
                  const targetId = req.user_id_b;
                  const profile = profiles[targetId];
                  return (
                    <div key={req.id} style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "12px 0", borderBottom: "1px solid #F3F4F6",
                    }}>
                      <UserAvatar profile={profile} size={36} bg="#9CA3AF" />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#6B7280" }}>
                          {profile?.display_name || "Unknown"}
                        </div>
                        <span style={{ fontSize: 11, color: "#9CA3AF" }}>Pending...</span>
                      </div>
                      <button onClick={() => handleDecline(req.id)} style={{
                        padding: "6px 10px", borderRadius: 6, border: "1px solid #E5E7EB",
                        background: "#fff", color: "#9CA3AF", fontFamily: FONT,
                        fontSize: 11, fontWeight: 600, cursor: "pointer",
                      }}>Cancel</button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Accepted Friends */}
            <div style={{
              background: "#fff", borderRadius: 20, padding: "18px 20px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>
                Friends ({friends.length})
              </div>
              {friends.length === 0 ? (
                <div style={{ textAlign: "center", padding: "20px 0" }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>👥</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#6B7280" }}>No friends yet</div>
                  <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 4 }}>
                    Tap "+ Add Friend" to search and follow other players
                  </div>
                </div>
              ) : (
                friends.map((fr: any) => {
                  const friendId = getFriendId(fr);
                  const profile = profiles[friendId];
                  return (
                    <div key={fr.id} style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "12px 0", borderBottom: "1px solid #F3F4F6",
                      cursor: "pointer",
                    }} onClick={() => handleViewLedger(friendId)}>
                      <UserAvatar profile={profile} size={44} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A" }}>
                          {profile?.display_name || "Unknown"}
                        </div>
                        <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
                          {profile?.handicap != null && (
                            <span style={{ fontFamily: MONO, fontSize: 11, color: "#16A34A", fontWeight: 600 }}>
                              HCP {profile.handicap}
                            </span>
                          )}
                          {profile?.home_course && (
                            <span style={{ fontSize: 11, color: "#9CA3AF" }}>{profile.home_course}</span>
                          )}
                        </div>
                      </div>
                      <span style={{ fontSize: 12, color: "#9CA3AF" }}>View →</span>
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
