
-- Create role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

-- Create user_roles table
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- RLS: Admins can view all roles
CREATE POLICY "Admins can view all roles"
ON public.user_roles FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- RLS: Admins can manage roles
CREATE POLICY "Admins can insert roles"
ON public.user_roles FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete roles"
ON public.user_roles FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));

-- Users can see their own role
CREATE POLICY "Users can view own role"
ON public.user_roles FOR SELECT
USING (user_id = auth.uid());

-- Add admin SELECT policies to profiles so admins can see all profiles
CREATE POLICY "Admins can view all profiles"
ON public.profiles FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Add admin SELECT policies to rounds so admins can see all rounds
CREATE POLICY "Admins can view all rounds"
ON public.rounds FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Add admin SELECT policies to groups so admins can see all groups
CREATE POLICY "Admins can view all groups"
ON public.groups FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Add admin SELECT on group_members
CREATE POLICY "Admins can view all group members"
ON public.group_members FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Add admin SELECT on round_players
CREATE POLICY "Admins can view all round players"
ON public.round_players FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Add admin SELECT on round_events
CREATE POLICY "Admins can view all round events"
ON public.round_events FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));
