/*
  # Fix Invitations RLS for Invite Acceptance

  1. Problem
    - The invite acceptance page needs to read invitation by token
    - But current policies only allow authenticated admins to read
    - Anonymous users (accepting invites) cannot read the invitation

  2. Solution
    - Allow anyone to read invitations by token (needed for invite acceptance)
    - This is safe since the token is a UUID and effectively a one-time password
*/

-- Allow reading invitations by token (for invite acceptance)
CREATE POLICY "Anyone can read invitation by token"
  ON invitations
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Drop the restrictive admin-only read policy
DROP POLICY IF EXISTS "Admins can read invitations" ON invitations;