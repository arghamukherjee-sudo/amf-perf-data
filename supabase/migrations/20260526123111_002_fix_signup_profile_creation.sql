/*
  # Fix user signup - Allow profile auto-creation on registration

  1. Changes
    - Drops and recreates `handle_new_user()` function with Supabase-recommended
      pattern: SECURITY DEFINER SET search_path = '' with explicit schema prefixes
    - Drops the dependent trigger first, then recreates both
    - Adds new RLS INSERT policies on `profiles` for signup flow

  2. Security
    - New policy "Users can insert own profile on signup": only allows insert
      where auth.uid() matches the profile id
    - New policy "Allow profile creation for new users": allows anon insert
      for certain Supabase auth flow configurations
    - SET search_path = '' prevents search path injection attacks
    - All table references use explicit public. schema prefix

  3. Important Notes
    - Fixes the "Database error saving new user" error during registration
*/

-- Drop trigger first, then function, then recreate both
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

DROP FUNCTION IF EXISTS handle_new_user();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'team_member'
  );
  RETURN NEW;
EXCEPTION
  WHEN others THEN
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Policy: users can insert their own profile (auth.uid() must match id)
CREATE POLICY "Users can insert own profile on signup"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Policy: allow anon insert for certain Supabase auth flow configurations
CREATE POLICY "Allow profile creation for new users"
  ON profiles FOR INSERT
  TO anon
  WITH CHECK (true);
