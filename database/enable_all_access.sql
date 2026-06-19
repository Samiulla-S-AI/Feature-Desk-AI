DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT schemaname, tablename
        FROM pg_tables
        WHERE schemaname = 'public'
    LOOP
        -- Enable RLS
        EXECUTE format(
            'ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY;',
            r.schemaname,
            r.tablename
        );

        -- Drop existing policy if it exists
        EXECUTE format(
            'DROP POLICY IF EXISTS "ALLOW ALL" ON %I.%I;',
            r.schemaname,
            r.tablename
        );

        -- Create ALLOW ALL policy
        EXECUTE format(
            'CREATE POLICY "ALLOW ALL"
             ON %I.%I
             FOR ALL
             TO public
             USING (true)
             WITH CHECK (true);',
            r.schemaname,
            r.tablename
        );
    END LOOP;
END $$;