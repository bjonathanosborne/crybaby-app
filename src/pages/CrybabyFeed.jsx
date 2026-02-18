import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { loadFeed, createPost, addComment, toggleReaction, loadProfile } from "@/lib/db";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import crybabyLogo from "@/assets/crybaby-logo.png";
import { Trophy, Baby, MessageCircle, ArrowUp, Flame, Hammer, Skull, Bird, Send } from "lucide-react";

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
        className="rounded-full object-cover flex-shrink-0"
        style={{ width: size, height: size }} />
    );
  }
  return (
    <div className="rounded-full bg-primary flex items-center justify-center text-primary-foreground flex-shrink-0 font-bold"
      style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {initial}
    </div>
  );
}

// ─── Post Card ───
function PostCard({ post, profile, comments, reactions, profiles, currentUserId, onAddComment, onReact }) {
  const [showComments, setShowComments] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
    <div className="bg-card rounded-2xl overflow-hidden border border-border shadow-sm hover:shadow-md transition-shadow duration-300">
      {/* Header */}
      <div className="p-4 pb-3 flex gap-3 items-start">
        <UserAvatar profile={profile} size={40} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-foreground truncate">
            {profile?.display_name || "Unknown"}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {timeAgo(post.created_at)}
          </div>
        </div>
        {isRoundPost && (
          <span className="text-[10px] font-bold px-2.5 py-1 rounded-md bg-accent text-accent-foreground uppercase tracking-wider">
            Round
          </span>
        )}
      </div>

      {/* Content */}
      <div className="px-4 pb-3">
        {isRoundPost && roundData ? (
          <div>
            {roundData.course && (
              <div className="text-sm font-semibold text-foreground mb-1 flex items-center gap-1.5">
                <span className="text-primary">⛳</span> {roundData.course}
              </div>
            )}
            {roundData.gameType && (
              <div className="text-xs text-muted-foreground mb-3">
                {roundData.gameType} {roundData.stakes ? `· ${roundData.stakes}` : ""}
              </div>
            )}
            {roundData.results && Array.isArray(roundData.results) && (
              <div className="bg-muted/50 rounded-xl p-3">
                {roundData.results.sort((a, b) => (b.amount || 0) - (a.amount || 0)).map((r, i) => (
                  <div key={i} className={`flex items-center gap-2.5 py-2 ${i < roundData.results.length - 1 ? "border-b border-border" : ""}`}>
                    <span className="text-sm w-5 text-center">
                      {i === 0 ? "🏆" : r.isCrybaby ? "🍼" : ""}
                    </span>
                    <span className="text-[13px] font-semibold text-foreground flex-1 truncate">
                      {r.name}
                    </span>
                    {r.isCrybaby && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-destructive text-destructive-foreground uppercase tracking-wider">
                        Crybaby
                      </span>
                    )}
                    <span className={`font-mono text-sm font-extrabold ${(r.amount || 0) > 0 ? "text-primary" : (r.amount || 0) < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                      {(r.amount || 0) >= 0 ? "+" : ""}${r.amount || 0}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {roundData.commentary && (
              <div className="mt-3 p-3 bg-accent rounded-xl border-l-2 border-primary text-[13px] text-accent-foreground italic leading-relaxed">
                💬 "{roundData.commentary}"
              </div>
            )}
          </div>
        ) : (
          <div className="text-[15px] text-foreground leading-relaxed">
            {post.content}
          </div>
        )}
      </div>

      {/* Reactions summary */}
      <div className="px-4 pb-2 flex justify-between items-center">
        <div className="flex gap-0.5 items-center">
          {Object.entries(reactionCounts).map(([type, count]) => (
            <span key={type} className="text-sm">{type}</span>
          ))}
          {totalReactions > 0 && (
            <span className="text-xs text-muted-foreground ml-1.5">{totalReactions}</span>
          )}
        </div>
        <button onClick={() => setShowComments(!showComments)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer bg-transparent border-none">
          {comments.length} comment{comments.length !== 1 ? "s" : ""}
        </button>
      </div>

      {/* Reaction buttons */}
      <div className="px-4 py-2.5 border-t border-border flex gap-1.5">
        {REACTION_OPTIONS.map(emoji => (
          <button key={emoji} onClick={() => onReact(post.id, emoji)}
            className={`flex-1 py-2 rounded-xl border-none cursor-pointer text-base transition-all duration-150 hover:scale-105 active:scale-95 ${
              myReaction?.reaction_type === emoji
                ? "bg-accent ring-2 ring-primary"
                : "bg-muted/50 hover:bg-muted"
            }`}>
            {emoji}
          </button>
        ))}
        <button onClick={() => setShowComments(!showComments)}
          className="flex-1 py-2 rounded-xl border-none cursor-pointer bg-muted/50 hover:bg-muted transition-all duration-150 hover:scale-105 active:scale-95 flex items-center justify-center">
          <MessageCircle size={16} className="text-muted-foreground" />
        </button>
      </div>

      {/* Comments */}
      {showComments && (
        <div className="px-4 pb-4 border-t border-border">
          <div className="flex flex-col gap-2.5 pt-3">
            {comments.map(comment => {
              const commenter = profiles[comment.user_id];
              return (
                <div key={comment.id} className="flex gap-2.5">
                  <UserAvatar profile={commenter} size={28} />
                  <div className="flex-1 bg-muted rounded-2xl px-3 py-2">
                    <div className="flex gap-1.5 items-baseline">
                      <span className="text-xs font-bold text-foreground">
                        {commenter?.display_name || "Unknown"}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {timeAgo(comment.created_at)}
                      </span>
                    </div>
                    <div className="text-[13px] text-foreground/80 mt-0.5">
                      {comment.content}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Comment input */}
          <div className="flex gap-2 mt-3 items-center">
            <UserAvatar profile={profiles[currentUserId]} size={28} />
            <div className="flex-1 flex bg-muted rounded-full px-3 py-1 items-center">
              <input
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSubmitComment()}
                placeholder="Talk your trash..."
                className="flex-1 border-none bg-transparent outline-none text-[13px] text-foreground placeholder:text-muted-foreground"
              />
              <button
                disabled={!newComment.trim() || submitting}
                onClick={handleSubmitComment}
                className={`w-7 h-7 rounded-full border-none cursor-pointer flex items-center justify-center transition-all duration-150 ${
                  newComment.trim()
                    ? "bg-primary text-primary-foreground hover:scale-105"
                    : "bg-transparent text-muted-foreground/40"
                }`}>
                <ArrowUp size={14} strokeWidth={2.5} />
              </button>
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
      <button onClick={() => setIsOpen(true)}
        className="w-full flex items-center gap-3 p-3.5 bg-card rounded-2xl border border-border cursor-pointer text-left hover:border-primary/30 transition-colors duration-200">
        <UserAvatar profile={profile} size={36} />
        <span className="text-sm text-muted-foreground">
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
    <div className="bg-card rounded-2xl p-4 border border-border">
      <div className="flex gap-3 mb-3 items-center">
        <UserAvatar profile={profile} size={36} />
        <div className="text-sm font-bold text-foreground">
          {profile?.display_name || "You"}
        </div>
      </div>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="What's on your mind? Challenge someone. Roast the crybaby. Call your shot."
        autoFocus
        rows={3}
        className="w-full border-none outline-none resize-none text-[15px] text-foreground leading-relaxed bg-transparent placeholder:text-muted-foreground"
      />
      <div className="flex justify-end gap-2 mt-3">
        <button onClick={() => { setIsOpen(false); setText(""); }}
          className="px-4 py-2 rounded-xl border-none cursor-pointer text-[13px] font-semibold bg-muted text-muted-foreground hover:bg-muted/80 transition-colors">
          Cancel
        </button>
        <button disabled={!text.trim() || posting} onClick={handlePost}
          className={`px-5 py-2 rounded-xl border-none text-[13px] font-bold transition-all duration-150 ${
            text.trim()
              ? "bg-foreground text-background cursor-pointer hover:opacity-90"
              : "bg-muted text-muted-foreground/50 cursor-not-allowed"
          }`}
          style={{ opacity: posting ? 0.6 : 1 }}>
          {posting ? "Posting..." : "Post"}
        </button>
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
    <div className="max-w-[420px] mx-auto min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="px-5 pt-[52px] pb-4 bg-card border-b border-border sticky top-0 z-20">
        <div className="flex justify-between items-center">
          <img src={crybabyLogo} alt="Crybaby Golf" style={{ height: 160, marginLeft: -24, marginTop: -40, marginBottom: -40 }} />
          <button onClick={() => navigate("/setup")}
            className="px-4 py-2 rounded-xl border-none cursor-pointer text-[13px] font-bold bg-foreground text-background hover:opacity-90 transition-opacity mr-8">
            + New Round
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col gap-3.5">
        <NewPostComposer profile={myProfile} onPost={handlePost} />

        {loading ? (
          <div className="text-center py-10 text-muted-foreground text-sm">Loading...</div>
        ) : posts.length === 0 ? (
          <div className="bg-card rounded-2xl p-10 text-center border border-border">
            <div className="text-4xl mb-3">⛳</div>
            <div className="text-sm font-semibold text-muted-foreground">
              No posts yet
            </div>
            <div className="text-xs text-muted-foreground mt-1 italic">
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
          <div className="text-center py-5 text-[13px] text-muted-foreground italic">
            That's all for now. Go play a round and give the people something to talk about.
          </div>
        )}
      </div>
    </div>
  );
}
