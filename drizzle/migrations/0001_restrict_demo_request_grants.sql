REVOKE ALL ON TABLE public.demo_requests FROM anon, authenticated;
GRANT ALL ON TABLE public.demo_requests TO service_role;