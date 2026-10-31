CREATE TABLE public.demo_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 created_at timestamptz NOT NULL DEFAULT now(),
 name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
 email text NOT NULL CHECK (char_length(email) BETWEEN 3 AND 254),
 organization text NOT NULL CHECK (char_length(organization) BETWEEN 1 AND 150),
 organization_type text NOT NULL CHECK (organization_type IN ('nonprofit','neighborhood','membership','civic','municipal','community','other')),
 message text NOT NULL DEFAULT '' CHECK (char_length(message) <= 2000),
 source text NOT NULL CHECK (source IN ('contact','get-started')),
 submission_key uuid NOT NULL UNIQUE
);
GRANT ALL ON public.demo_requests TO service_role;
ALTER TABLE public.demo_requests ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.demo_requests IS 'Private website demo requests. No anonymous or ordinary authenticated read/write access; validated server-side inserts only. Owner follow-up via Lovable Cloud.';