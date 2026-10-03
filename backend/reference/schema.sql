-- Dedicated private storage: no browser role can read credentials, jobs or drafts.
CREATE TABLE IF NOT EXISTS public.visuart_seo (
  key text PRIMARY KEY,
  value jsonb NOT NULL
);
ALTER TABLE public.visuart_seo ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.visuart_seo FROM anon, authenticated;
GRANT ALL ON public.visuart_seo TO service_role;

CREATE OR REPLACE FUNCTION public.visuart_seo_lock(owner_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE acquired text;
BEGIN
  INSERT INTO visuart_seo(key, value) VALUES ('lock', jsonb_build_object('owner',owner_id,'until',extract(epoch from now())+300))
  ON CONFLICT (key) DO UPDATE SET value=excluded.value
  WHERE (visuart_seo.value->>'until')::numeric < extract(epoch from now())
  RETURNING key INTO acquired;
  RETURN acquired IS NOT NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.visuart_seo_lock(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.visuart_seo_lock(text) TO service_role;
