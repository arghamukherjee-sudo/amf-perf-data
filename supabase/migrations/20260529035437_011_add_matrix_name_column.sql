/*
  # Add matrix_name column and is_current to weekly_target_matrix

  1. Changes
    - Add `matrix_name` column to identify different weeks/periods
    - Add `is_current` flag to mark the active matrix

  2. Purpose
    - Allow naming of weekly matrices (e.g., "Week 1 May 2026")
    - Auto-load current week matrix on page load
    - Filter between different weekly matrices

  3. Security
    - Existing RLS policies remain unchanged
*/

-- Add matrix_name column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'weekly_target_matrix' AND column_name = 'matrix_name'
  ) THEN
    ALTER TABLE weekly_target_matrix ADD COLUMN matrix_name text DEFAULT '';
  END IF;
END $$;

-- Add is_current column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'weekly_target_matrix' AND column_name = 'is_current'
  ) THEN
    ALTER TABLE weekly_target_matrix ADD COLUMN is_current boolean DEFAULT false;
  END IF;
END $$;

-- Create index on period dates for faster queries
CREATE INDEX IF NOT EXISTS weekly_target_matrix_period_idx 
ON weekly_target_matrix (period_start, period_end);

-- Set a default matrix_name for existing records based on period
UPDATE weekly_target_matrix 
SET matrix_name = 'Week ' || EXTRACT(WEEK FROM period_start)::text || ' - ' || TO_CHAR(period_start, 'Mon YYYY')
WHERE matrix_name = '' OR matrix_name IS NULL;
