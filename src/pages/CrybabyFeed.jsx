import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { loadFeed, createPost, addComment, toggleReaction, loadProfile } from "@/lib/db";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import crybabyLogo from "@/assets/crybaby-logo.png";

const FONT = "'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const MONO = "'SF Mono', 'JetBrains Mono', monospace";

const REACTION_EMOJIS = {
  "🔥": "🔥", "🔨": "🔨", "🍼": "🍼", "💀": "💀", "🐔": "🐔",
};
const REACTION_OPTIONS = ["🔥", "🔨", "🍼", "💀", "🐔"];

function timeAgo(dateStr) {
  const date = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function UserAvatar({ profile, size = 36 }) {
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
      width: size, height: size, borderRadius: size / 2, background: "#16A34A",
      display: "flex", alignItems: "center", justifyContent: "center",
      color: "#fff", fontSize: size * 0.4, fontWeight: 700, fontFamily: FONT, flexShrink: 0,
    }}>{initial}</div>
  );
}

// ─── Post Card ───
function PostCard({ post, profile, comments, reactions, profiles, currentUserId, onAddComment, onReact }) {
  const [showComments, setShowComments] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Count reactions by type
  const reactionCounts = {};
  reactions.forEach(r => {
    reactionCounts[r.reaction_type] = (reactionCounts[r.reaction_type] || 0) + 1;
  });
  const totalReactions = reactions.length;
  const myReaction = reactions.find(r => r.user_id === currentUserId);

  const handleSubmitComment = async () => {
    if (!newComment.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onAddComment(post.id, newComment.trim());
      setNewComment("");
    } finally {
      setSubmitting(false);
    }
  };

  const isRoundPost = post.post_type === "round_summary" || post.post_type === "round_result";
  let roundData = null;
  if (isRoundPost) {
    try { roundData = typeof post.content === "string" ? JSON.parse(post.content) : post.content; } catch {}
  }

  return (
    <div style={{
      background: "#fff", borderRadius: 20, overflow: "hidden",
      boxShadow: "0 2px 8px rgba(0,0,0,0.06)", border: "1px solid #E5E7EB",
    }}>
      {/* Header */}
      <div style={{ padding: "16px 18px 12px", display: "flex", gap: 12 }}>
        <UserAvatar profile={profile} size={40} />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: FONT, fontSize: 14, fontWeight: 700, color: "#1A1A1A" }}>
            {profile?.display_name || "Unknown"}
          </div>
          <div style={{ fontFamily: FONT, fontSize: 12, color: "#9CA3AF" }}>
            {timeAgo(post.created_at)}
          </div>
        </div>
        {isRoundPost && (
          <span style={{
            fontFamily: FONT, fontSize: 10, fontWeight: 700, padding: "4px 10px",
            borderRadius: 6, background: "#F0FDF4", color: "#16A34A",
            alignSelf: "flex-start", textTransform: "uppercase",
          }}>Round</span>
        )}
      </div>

      {/* Content */}
      <div style={{ padding: "0 18px 14px" }}>
        {isRoundPost && roundData ? (
          <div>
            {roundData.course && (
              <div style={{ fontFamily: FONT, fontSize: 14, fontWeight: 600, color: "#1A1A1A", marginBottom: 4 }}>
                ⛳ {roundData.course}
              </div>
            )}
            {roundData.gameType && (
              <div style={{ fontFamily: FONT, fontSize: 12, color: "#9CA3AF", marginBottom: 8 }}>
                {roundData.gameType} {roundData.stakes ? `· ${roundData.stakes}` : ""}
              </div>
            )}
            {roundData.results && Array.isArray(roundData.results) && (
              <div style={{ background: "#F9FAFB", borderRadius: 14, padding: "10px 14px" }}>
                {roundData.results.sort((a, b) => (b.amount || 0) - (a.amount || 0)).map((r, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "6px 0",
                    borderBottom: i < roundData.results.length - 1 ? "1px solid #F3F4F6" : "none",
                  }}>
                    <span style={{ fontSize: 14, width: 22, textAlign: "center" }}>
                      {i === 0 ? "🏆" : r.isCrybaby ? "🍼" : ""}
                    </span>
                    <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600, color: "#1A1A1A", flex: 1 }}>
                      {r.name}
                    </span>
                    {r.isCrybaby && (
                      <span style={{
                        fontFamily: FONT, fontSize: 10, fontWeight: 700, padding: "2px 6px",
                        borderRadius: 4, background: "#DC2626", color: "#fff",
                      }}>CRYBABY</span>
                    )}
                    <span style={{
                      fontFamily: MONO, fontSize: 14, fontWeight: 800,
                      color: (r.amount || 0) > 0 ? "#16A34A" : (r.amount || 0) < 0 ? "#DC2626" : "#9CA3AF",
                    }}>
                      {(r.amount || 0) >= 0 ? "+" : ""}${r.amount || 0}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {roundData.commentary && (
              <div style={{
                marginTop: 10, padding: "10px 14px", background: "#F0FDF4",
                borderRadius: 10, borderLeft: "3px solid #16A34A",
                fontFamily: FONT, fontSize: 13, color: "#166534", fontStyle: "italic", lineHeight: 1.5,
              }}>
                💬 "{roundData.commentary}"
              </div>
            )}
            {/* If content is just plain text (not JSON), show it */}
          </div>
        ) : (
          <div style={{ fontFamily: FONT, fontSize: 15, color: "#1A1A1A", lineHeight: 1.5 }}>
            {post.content}
          </div>
        )}
      </div>

      {/* Reactions bar */}
      <div style={{
        padding: "0 18px 8px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div style={{ display: "flex", gap: 2 }}>
          {Object.entries(reactionCounts).map(([type, count]) => (
            <span key={type} style={{ fontSize: 14 }}>{type}</span>
          ))}
          {totalReactions > 0 && (
            <span style={{ fontFamily: FONT, fontSize: 12, color: "#9CA3AF", marginLeft: 4 }}>{totalReactions}</span>
          )}
        </div>
        <span style={{ fontFamily: FONT, fontSize: 12, color: "#9CA3AF", cursor: "pointer" }}
          onClick={() => setShowComments(!showComments)}>
          {comments.length} comment{comments.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Reaction buttons */}
      <div style={{
        padding: "8px 18px 12px", borderTop: "1px solid #F3F4F6",
        display: "flex", gap: 4,
      }}>
        {REACTION_OPTIONS.map(emoji => (
          <button key={emoji} onClick={() => onReact(post.id, emoji)} style={{
            flex: 1, padding: "8px 4px", borderRadius: 10, border: "none", cursor: "pointer",
            fontSize: 18,
            background: myReaction?.reaction_type === emoji ? "#F0FDF4" : "#F9FAFB",
            outline: myReaction?.reaction_type === emoji ? "2px solid #16A34A" : "none",
          }}>
            {emoji}
          </button>
        ))}
        <button onClick={() => setShowComments(!showComments)} style={{
          flex: 1, padding: "8px 4px", borderRadius: 10, border: "none", cursor: "pointer",
          fontSize: 18, background: "#F9FAFB",
        }}>💬</button>
      </div>

      {/* Comments */}
      {showComments && (
        <div style={{ padding: "0 18px 14px", borderTop: "1px solid #F3F4F6" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 12 }}>
            {comments.map(comment => {
              const commenter = profiles[comment.user_id];
              return (
                <div key={comment.id} style={{ display: "flex", gap: 10 }}>
                  <UserAvatar profile={commenter} size={28} />
                  <div style={{ flex: 1, background: "#F9FAFB", borderRadius: 12, padding: "8px 12px" }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
                      <span style={{ fontFamily: FONT, fontSize: 12, fontWeight: 700, color: "#1A1A1A" }}>
                        {commenter?.display_name || "Unknown"}
                      </span>
                      <span style={{ fontFamily: FONT, fontSize: 10, color: "#9CA3AF" }}>
                        {timeAgo(comment.created_at)}
                      </span>
                    </div>
                    <div style={{ fontFamily: FONT, fontSize: 13, color: "#374151", marginTop: 2 }}>
                      {comment.content}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Comment input */}
          <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
            <UserAvatar profile={profiles[currentUserId]} size={28} />
            <div style={{
              flex: 1, display: "flex", background: "#F3F4F6", borderRadius: 20,
              padding: "4px 4px 4px 14px", alignItems: "center",
            }}>
              <input
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSubmitComment()}
                placeholder="Talk your trash..."
                style={{
                  flex: 1, border: "none", background: "transparent", outline: "none",
                  fontFamily: FONT, fontSize: 13, color: "#1A1A1A",
                }}
              />
              <button
                disabled={!newComment.trim() || submitting}
                onClick={handleSubmitComment}
                style={{
                  width: 32, height: 32, borderRadius: 16, border: "none", cursor: "pointer",
                  background: newComment.trim() ? "#16A34A" : "transparent",
                  color: newComment.trim() ? "#fff" : "#D1D5DB",
                  fontSize: 14, fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>↑</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── New Post Composer ───
function NewPostComposer({ profile, onPost }) {
  const [text, setText] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [posting, setPosting] = useState(false);

  if (!isOpen) {
    return (
      <button onClick={() => setIsOpen(true)} style={{
        width: "100%", display: "flex", alignItems: "center", gap: 12,
        padding: "14px 18px", background: "#fff", borderRadius: 16,
        border: "1px solid #E5E7EB", cursor: "pointer", textAlign: "left",
      }}>
        <UserAvatar profile={profile} size={36} />
        <span style={{ fontFamily: FONT, fontSize: 14, color: "#9CA3AF" }}>
          Challenge someone, talk trash, share a story...
        </span>
      </button>
    );
  }

  const handlePost = async () => {
    if (!text.trim() || posting) return;
    setPosting(true);
    try {
      await onPost(text);
      setText("");
      setIsOpen(false);
    } finally {
      setPosting(false);
    }
  };

  return (
    <div style={{
      background: "#fff", borderRadius: 16, padding: "16px 18px",
      border: "1px solid #E5E7EB",
    }}>
      <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
        <UserAvatar profile={profile} size={36} />
        <div style={{ fontFamily: FONT, fontSize: 14, fontWeight: 700, color: "#1A1A1A" }}>
          {profile?.display_name || "You"}
        </div>
      </div>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="What's on your mind? Challenge someone. Roast the crybaby. Call your shot."
        autoFocus
        rows={3}
        style={{
          width: "100%", border: "none", outline: "none", resize: "none",
          fontFamily: FONT, fontSize: 15, color: "#1A1A1A", lineHeight: 1.5,
          background: "transparent", boxSizing: "border-box",
        }}
      />
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
        <button onClick={() => { setIsOpen(false); setText(""); }} style={{
          padding: "8px 16px", borderRadius: 10, border: "none", cursor: "pointer",
          fontFamily: FONT, fontSize: 13, fontWeight: 600, background: "#F3F4F6", color: "#6B7280",
        }}>Cancel</button>
        <button disabled={!text.trim() || posting} onClick={handlePost} style={{
          padding: "8px 20px", borderRadius: 10, border: "none",
          cursor: text.trim() ? "pointer" : "not-allowed",
          fontFamily: FONT, fontSize: 13, fontWeight: 700,
          background: text.trim() ? "#1A1A1A" : "#D1D5DB",
          color: text.trim() ? "#fff" : "#9CA3AF",
          opacity: posting ? 0.6 : 1,
        }}>{posting ? "Posting..." : "Post"}</button>
      </div>
    </div>
  );
}

// ─── Main Feed Component ───
export default function CrybabyFeed() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [posts, setPosts] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [comments, setComments] = useState([]);
  const [reactions, setReactions] = useState([]);
  const [myProfile, setMyProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshFeed = async () => {
    try {
      const data = await loadFeed();
      setPosts(data.posts);
      const profileMap = {};
      data.profiles.forEach(p => { profileMap[p.user_id] = p; });
      setProfiles(profileMap);
      setComments(data.comments);
      setReactions(data.reactions);
    } catch (e) {
      console.error("Failed to load feed:", e);
    }
  };

  useEffect(() => {
    Promise.all([refreshFeed(), loadProfile().then(p => setMyProfile(p))])
      .finally(() => setLoading(false));

    // Realtime subscriptions
    const channel = supabase
      .channel("feed-updates")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "posts" }, () => refreshFeed())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "comments" }, () => refreshFeed())
      .on("postgres_changes", { event: "*", schema: "public", table: "reactions" }, () => refreshFeed())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const handlePost = async (text) => {
    await createPost({ content: text, postType: "trash_talk" });
    await refreshFeed();
  };

  const handleAddComment = async (postId, content) => {
    await addComment(postId, content);
    await refreshFeed();
  };

  const handleReact = async (postId, reactionType) => {
    await toggleReaction(postId, reactionType);
    await refreshFeed();
  };

  return (
    <div style={{
      maxWidth: 420, margin: "0 auto", minHeight: "100vh",
      background: "#F7F7F5", fontFamily: FONT, paddingBottom: 100,
    }}>
      {/* Header */}
      <div style={{
        padding: "52px 20px 16px", background: "#fff",
        borderBottom: "1px solid #E5E7EB",
        position: "sticky", top: 0, zIndex: 20,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <img src={crybabyLogo} alt="Crybaby Golf" style={{ height: 40 }} />
          <button onClick={() => navigate("/setup")} style={{
            padding: "8px 14px", borderRadius: 12, border: "none", cursor: "pointer",
            fontFamily: FONT, fontSize: 13, fontWeight: 700,
            background: "#16A34A", color: "#fff",
          }}>+ New Round</button>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: "16px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Composer */}
        <NewPostComposer profile={myProfile} onPost={handlePost} />

        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF" }}>Loading...</div>
        ) : posts.length === 0 ? (
          <div style={{
            background: "#fff", borderRadius: 20, padding: "40px 20px", textAlign: "center",
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
          }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🏌️</div>
            <div style={{ fontFamily: FONT, fontSize: 15, fontWeight: 600, color: "#6B7280" }}>
              No posts yet
            </div>
            <div style={{ fontFamily: FONT, fontSize: 13, color: "#9CA3AF", marginTop: 4, fontStyle: "italic" }}>
              Play a round or talk some trash to get things started.
            </div>
          </div>
        ) : (
          posts.map(post => (
            <PostCard
              key={post.id}
              post={post}
              profile={profiles[post.user_id]}
              comments={comments.filter(c => c.post_id === post.id)}
              reactions={reactions.filter(r => r.post_id === post.id)}
              profiles={profiles}
              currentUserId={user?.id}
              onAddComment={handleAddComment}
              onReact={handleReact}
            />
          ))
        )}

        {posts.length > 0 && (
          <div style={{
            textAlign: "center", padding: "20px 0",
            fontFamily: FONT, fontSize: 13, color: "#9CA3AF", fontStyle: "italic",
          }}>
            💬 "That's all for now. Go play a round and give the people something to talk about."
          </div>
        )}
      </div>
    </div>
  );
}
