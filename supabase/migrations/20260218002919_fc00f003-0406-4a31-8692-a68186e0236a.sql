
-- Notifications table for in-app notification center
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  type TEXT NOT NULL DEFAULT 'group_join',
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  data JSONB DEFAULT '{}',
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications"
  ON public.notifications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can update their own notifications"
  ON public.notifications FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own notifications"
  ON public.notifications FOR DELETE
  USING (user_id = auth.uid());

-- Service role inserts notifications (from edge functions / triggers)
CREATE POLICY "Service role can insert notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (true);

CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX idx_notifications_read ON public.notifications(user_id, read);

-- Push subscriptions table for browser push
CREATE TABLE public.push_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, endpoint)
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own subscriptions"
  ON public.push_subscriptions FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX idx_push_subscriptions_user_id ON public.push_subscriptions(user_id);

-- Database function to create notifications for group owners/admins when someone joins
CREATE OR REPLACE FUNCTION public.notify_group_on_join()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _group_name TEXT;
  _joiner_name TEXT;
  _admin RECORD;
BEGIN
  -- Don't notify for the owner auto-join on group creation
  IF NEW.role = 'owner' THEN
    RETURN NEW;
  END IF;

  SELECT name INTO _group_name FROM public.groups WHERE id = NEW.group_id;
  SELECT display_name INTO _joiner_name FROM public.profiles WHERE user_id = NEW.user_id;

  -- Notify all owners and admins of the group (except the joiner)
  FOR _admin IN
    SELECT user_id FROM public.group_members
    WHERE group_id = NEW.group_id
      AND role IN ('owner', 'admin')
      AND user_id != NEW.user_id
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      _admin.user_id,
      'group_join',
      COALESCE(_joiner_name, 'Someone') || ' joined ' || COALESCE(_group_name, 'your group'),
      COALESCE(_joiner_name, 'A new member') || ' just joined ' || COALESCE(_group_name, 'your group') || '!',
      jsonb_build_object('group_id', NEW.group_id, 'joiner_user_id', NEW.user_id)
    );
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_group_member_join
  AFTER INSERT ON public.group_members
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_group_on_join();
