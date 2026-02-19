
-- Trigger: when a friend request is sent, create a notification for the recipient
CREATE OR REPLACE FUNCTION public.notify_friend_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _sender_name TEXT;
BEGIN
  IF NEW.status = 'pending' THEN
    SELECT 
      COALESCE(
        NULLIF(TRIM(CONCAT(first_name, ' ', last_name)), ''),
        display_name,
        'Someone'
      )
    INTO _sender_name
    FROM public.profiles
    WHERE user_id = NEW.user_id_a;

    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      NEW.user_id_b,
      'friend_request',
      COALESCE(_sender_name, 'Someone') || ' sent you a friend request',
      'Tap to accept or decline.',
      jsonb_build_object(
        'friendship_id', NEW.id,
        'sender_user_id', NEW.user_id_a
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_friend_request_created
AFTER INSERT ON public.friendships
FOR EACH ROW
EXECUTE FUNCTION public.notify_friend_request();
