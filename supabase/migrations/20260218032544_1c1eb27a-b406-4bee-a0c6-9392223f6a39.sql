
-- Fix storage policies to support both user avatars and group avatars

-- Drop existing INSERT policy
DROP POLICY IF EXISTS "Upload own avatar" ON storage.objects;

-- Create new INSERT policy supporting both paths
CREATE POLICY "Upload user or group avatar" 
  ON storage.objects FOR INSERT 
  WITH CHECK (
    bucket_id = 'avatars' 
    AND (
      -- User avatars: users/{user_id}.*
      auth.uid()::text = (storage.foldername(name))[1]
      OR
      -- Group avatars: groups/{group_id}.* (if owner/admin)
      (
        (storage.foldername(name))[1] = 'groups'
        AND public.is_group_owner_or_admin(
          auth.uid(), 
          ((storage.foldername(name))[2])::uuid
        )
      )
    )
  );

-- Drop existing UPDATE policy if any and recreate
DROP POLICY IF EXISTS "Update own avatar" ON storage.objects;

CREATE POLICY "Update user or group avatar" 
  ON storage.objects FOR UPDATE 
  USING (
    bucket_id = 'avatars' 
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR
      (
        (storage.foldername(name))[1] = 'groups'
        AND public.is_group_owner_or_admin(
          auth.uid(), 
          ((storage.foldername(name))[2])::uuid
        )
      )
    )
  );

-- Drop existing DELETE policy if any and recreate
DROP POLICY IF EXISTS "Delete own avatar" ON storage.objects;

CREATE POLICY "Delete user or group avatar" 
  ON storage.objects FOR DELETE 
  USING (
    bucket_id = 'avatars' 
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR
      (
        (storage.foldername(name))[1] = 'groups'
        AND public.is_group_owner_or_admin(
          auth.uid(), 
          ((storage.foldername(name))[2])::uuid
        )
      )
    )
  );

-- Add CHECK constraints for text field length limits
ALTER TABLE public.posts ADD CONSTRAINT posts_content_length CHECK (char_length(content) <= 10000);
ALTER TABLE public.comments ADD CONSTRAINT comments_content_length CHECK (char_length(content) <= 2000);
ALTER TABLE public.groups ADD CONSTRAINT groups_name_length CHECK (char_length(name) <= 100);
ALTER TABLE public.groups ADD CONSTRAINT groups_description_length CHECK (char_length(description) <= 500);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_display_name_length CHECK (char_length(display_name) <= 50);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_bio_length CHECK (char_length(bio) <= 300);
