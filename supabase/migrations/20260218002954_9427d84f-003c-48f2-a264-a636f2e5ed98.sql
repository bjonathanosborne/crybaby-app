
-- The trigger function runs as SECURITY DEFINER and bypasses RLS,
-- so we don't need a permissive INSERT policy at all.
DROP POLICY "Service role can insert notifications" ON public.notifications;
