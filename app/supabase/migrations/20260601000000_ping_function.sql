-- keep-supabase-alive workflow에서 호출하는 ping 함수
CREATE OR REPLACE FUNCTION ping() RETURNS text AS $$
  SELECT 'pong'::text;
$$ LANGUAGE sql SECURITY DEFINER;
