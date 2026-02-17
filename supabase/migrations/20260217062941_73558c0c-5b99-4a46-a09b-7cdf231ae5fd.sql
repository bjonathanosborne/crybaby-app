
-- ============================================================
-- CRYBABY DATABASE SCHEMA - ALL TABLES
-- ============================================================

-- Helper: update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ============================================================
-- 1. PROFILES
-- ============================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT '',
  handicap NUMERIC(4,1),
  ghin TEXT,
  ghin_verified BOOLEAN DEFAULT false,
  home_course TEXT,
  avatar_url TEXT,
  bio TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE POLICY "Profiles viewable by authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- ============================================================
-- 2. GROUPS
-- ============================================================
CREATE TABLE public.groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  privacy_level TEXT NOT NULL DEFAULT 'public' CHECK (privacy_level IN ('public', 'private')),
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_groups_updated_at BEFORE UPDATE ON public.groups FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 3. GROUP MEMBERS
-- ============================================================
CREATE TABLE public.group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, user_id)
);
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

-- Helper functions (security definer)
CREATE OR REPLACE FUNCTION public.is_group_member(_user_id UUID, _group_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.group_members WHERE user_id = _user_id AND group_id = _group_id); $$;

CREATE OR REPLACE FUNCTION public.is_group_owner_or_admin(_user_id UUID, _group_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.group_members WHERE user_id = _user_id AND group_id = _group_id AND role IN ('owner', 'admin')); $$;

-- Groups RLS
CREATE POLICY "Groups viewable" ON public.groups FOR SELECT TO authenticated USING (privacy_level = 'public' OR public.is_group_member(auth.uid(), id));
CREATE POLICY "Create groups" ON public.groups FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "Update groups" ON public.groups FOR UPDATE TO authenticated USING (public.is_group_owner_or_admin(auth.uid(), id));
CREATE POLICY "Delete groups" ON public.groups FOR DELETE TO authenticated USING (public.is_group_owner_or_admin(auth.uid(), id));

-- Group Members RLS
CREATE POLICY "View group members" ON public.group_members FOR SELECT TO authenticated USING (public.is_group_member(auth.uid(), group_id));
CREATE POLICY "Join groups" ON public.group_members FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() OR public.is_group_owner_or_admin(auth.uid(), group_id));
CREATE POLICY "Update member roles" ON public.group_members FOR UPDATE TO authenticated USING (public.is_group_owner_or_admin(auth.uid(), group_id));
CREATE POLICY "Leave or remove" ON public.group_members FOR DELETE TO authenticated USING (user_id = auth.uid() OR public.is_group_owner_or_admin(auth.uid(), group_id));

-- Auto-add creator as owner
CREATE OR REPLACE FUNCTION public.handle_new_group()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.group_members (group_id, user_id, role) VALUES (NEW.id, NEW.created_by, 'owner');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
CREATE TRIGGER on_group_created AFTER INSERT ON public.groups FOR EACH ROW EXECUTE FUNCTION public.handle_new_group();

-- ============================================================
-- 4. FRIENDSHIPS
-- ============================================================
CREATE TABLE public.friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id_a UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_id_b UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  CHECK (user_id_a <> user_id_b)
);
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "See own friendships" ON public.friendships FOR SELECT TO authenticated USING (user_id_a = auth.uid() OR user_id_b = auth.uid());
CREATE POLICY "Send friend requests" ON public.friendships FOR INSERT TO authenticated WITH CHECK (user_id_a = auth.uid() AND status = 'pending');
CREATE POLICY "Update friendships" ON public.friendships FOR UPDATE TO authenticated USING (user_id_a = auth.uid() OR user_id_b = auth.uid());
CREATE POLICY "Delete friendships" ON public.friendships FOR DELETE TO authenticated USING (user_id_a = auth.uid() OR user_id_b = auth.uid());

-- ============================================================
-- 5. ROUNDS
-- ============================================================
CREATE TABLE public.rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_type TEXT NOT NULL DEFAULT 'stroke',
  course TEXT NOT NULL DEFAULT '',
  course_details JSONB DEFAULT '{}',
  stakes TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'setup' CHECK (status IN ('setup', 'active', 'completed')),
  group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL,
  scorekeeper_mode BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.rounds ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_rounds_updated_at BEFORE UPDATE ON public.rounds FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 6. ROUND PLAYERS
-- ============================================================
CREATE TABLE public.round_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  guest_name TEXT,
  hole_scores JSONB DEFAULT '[]',
  total_score INTEGER,
  is_scorekeeper BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (round_id, user_id)
);
ALTER TABLE public.round_players ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_round_players_updated_at BEFORE UPDATE ON public.round_players FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Helper function (now round_players exists)
CREATE OR REPLACE FUNCTION public.is_round_participant(_user_id UUID, _round_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.round_players WHERE user_id = _user_id AND round_id = _round_id); $$;

-- Rounds RLS
CREATE POLICY "View rounds" ON public.rounds FOR SELECT TO authenticated USING (created_by = auth.uid() OR public.is_round_participant(auth.uid(), id));
CREATE POLICY "Create rounds" ON public.rounds FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "Update rounds" ON public.rounds FOR UPDATE TO authenticated USING (created_by = auth.uid());
CREATE POLICY "Delete rounds" ON public.rounds FOR DELETE TO authenticated USING (created_by = auth.uid());

-- Round Players RLS
CREATE POLICY "View round players" ON public.round_players FOR SELECT TO authenticated
  USING (public.is_round_participant(auth.uid(), round_id) OR EXISTS (SELECT 1 FROM public.rounds WHERE id = round_id AND created_by = auth.uid()));
CREATE POLICY "Add players" ON public.round_players FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.rounds WHERE id = round_id AND created_by = auth.uid()) OR user_id = auth.uid());
CREATE POLICY "Update scores" ON public.round_players FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.rounds WHERE id = round_id AND created_by = auth.uid()));
CREATE POLICY "Remove players" ON public.round_players FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.rounds WHERE id = round_id AND created_by = auth.uid()));

-- ============================================================
-- 7. POSTS
-- ============================================================
CREATE TABLE public.posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  round_id UUID REFERENCES public.rounds(id) ON DELETE SET NULL,
  content TEXT NOT NULL DEFAULT '',
  post_type TEXT NOT NULL DEFAULT 'text' CHECK (post_type IN ('text', 'round_summary', 'trash_talk', 'achievement')),
  group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View posts" ON public.posts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Create posts" ON public.posts FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Update posts" ON public.posts FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Delete posts" ON public.posts FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ============================================================
-- 8. COMMENTS
-- ============================================================
CREATE TABLE public.comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View comments" ON public.comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Create comments" ON public.comments FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Update comments" ON public.comments FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Delete comments" ON public.comments FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ============================================================
-- 9. REACTIONS
-- ============================================================
CREATE TABLE public.reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reaction_type TEXT NOT NULL DEFAULT '🔥',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (post_id, user_id)
);
ALTER TABLE public.reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View reactions" ON public.reactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Create reactions" ON public.reactions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Update reactions" ON public.reactions FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Delete reactions" ON public.reactions FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ============================================================
-- 10. AI COMMENTARY
-- ============================================================
CREATE TABLE public.ai_commentary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID REFERENCES public.rounds(id) ON DELETE CASCADE,
  post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  commentary TEXT NOT NULL,
  context_type TEXT NOT NULL DEFAULT 'round' CHECK (context_type IN ('round', 'feed', 'score_update')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_commentary ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View AI commentary" ON public.ai_commentary FOR SELECT TO authenticated USING (true);
CREATE POLICY "Insert AI commentary" ON public.ai_commentary FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- ============================================================
-- 11. REALTIME
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.round_players;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_commentary;
ALTER PUBLICATION supabase_realtime ADD TABLE public.comments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.posts;

-- ============================================================
-- 12. AVATAR STORAGE
-- ============================================================
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);
CREATE POLICY "Avatars publicly accessible" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
CREATE POLICY "Upload own avatar" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Update own avatar" ON storage.objects FOR UPDATE USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Delete own avatar" ON storage.objects FOR DELETE USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
