-- TAILOR Phase 1: claims/evidence corpus layer.
-- Claims are model-PROPOSED but code-ADMITTED: a verified claim's evidence
-- quote must literally match its source document before insertion.

CREATE TYPE public.claim_kind AS ENUM ('verified', 'inferred', 'user_attested');
CREATE TYPE public.claim_type AS ENUM ('skill', 'achievement', 'scope', 'credential', 'role');
CREATE TYPE public.claim_status AS ENUM ('active', 'rejected');

CREATE TABLE public.claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  origin_document_id UUID REFERENCES public.documents(id) ON DELETE CASCADE,
  kind public.claim_kind NOT NULL,
  type public.claim_type NOT NULL,
  text TEXT NOT NULL,
  labels TEXT[] NOT NULL DEFAULT '{}',
  reasoning TEXT,
  date_start TEXT,
  date_end TEXT,
  status public.claim_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.claim_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  quote TEXT NOT NULL,
  start_offset INTEGER NOT NULL,
  end_offset INTEGER NOT NULL,
  match_verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.claim_links (
  inferred_claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  supporting_claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  PRIMARY KEY (inferred_claim_id, supporting_claim_id)
);

CREATE INDEX idx_claims_user ON public.claims(user_id);
CREATE INDEX idx_claims_origin_doc ON public.claims(origin_document_id);
CREATE INDEX idx_claim_evidence_claim ON public.claim_evidence(claim_id);

ALTER TABLE public.claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claim_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claim_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own claims"
  ON public.claims FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own claim evidence"
  ON public.claim_evidence FOR ALL
  USING (EXISTS (SELECT 1 FROM public.claims c WHERE c.id = claim_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.claims c WHERE c.id = claim_id AND c.user_id = auth.uid()));

CREATE POLICY "Users manage own claim links"
  ON public.claim_links FOR ALL
  USING (EXISTS (SELECT 1 FROM public.claims c WHERE c.id = inferred_claim_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.claims c WHERE c.id = inferred_claim_id AND c.user_id = auth.uid()));
