-- TAILOR Phase 2: grounded generation.
-- Requirements parsed from a posting, their coverage against the claims corpus,
-- and the bullets a generated resume is built from. Citations are join tables,
-- not arrays, so a deleted claim takes its citations with it rather than
-- leaving a saved resume pointing at evidence that no longer exists.

CREATE TYPE public.requirement_type AS ENUM ('skill', 'experience', 'credential', 'responsibility');
CREATE TYPE public.requirement_priority AS ENUM ('required', 'preferred');
CREATE TYPE public.coverage_status AS ENUM ('verified', 'inferred', 'gap');

CREATE TABLE public.jd_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_description_id UUID NOT NULL REFERENCES public.job_descriptions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  type public.requirement_type NOT NULL,
  priority public.requirement_priority NOT NULL,
  position INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.requirement_coverage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requirement_id UUID NOT NULL UNIQUE REFERENCES public.jd_requirements(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.coverage_status NOT NULL,
  rationale TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.coverage_claims (
  coverage_id UUID NOT NULL REFERENCES public.requirement_coverage(id) ON DELETE CASCADE,
  claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  PRIMARY KEY (coverage_id, claim_id)
);

CREATE TABLE public.resume_bullets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resume_id UUID NOT NULL REFERENCES public.generated_resumes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  section TEXT NOT NULL,
  position INTEGER NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.bullet_claims (
  bullet_id UUID NOT NULL REFERENCES public.resume_bullets(id) ON DELETE CASCADE,
  claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  PRIMARY KEY (bullet_id, claim_id)
);

ALTER TABLE public.job_descriptions ADD COLUMN lane_decision JSONB;
ALTER TABLE public.generated_resumes ADD COLUMN lane_decision JSONB;

CREATE INDEX idx_jd_requirements_jd ON public.jd_requirements(job_description_id);
CREATE INDEX idx_jd_requirements_user ON public.jd_requirements(user_id);
CREATE INDEX idx_requirement_coverage_user ON public.requirement_coverage(user_id);
CREATE INDEX idx_coverage_claims_claim ON public.coverage_claims(claim_id);
CREATE INDEX idx_resume_bullets_resume ON public.resume_bullets(resume_id);
CREATE INDEX idx_bullet_claims_claim ON public.bullet_claims(claim_id);

ALTER TABLE public.jd_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requirement_coverage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coverage_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resume_bullets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bullet_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own jd requirements"
  ON public.jd_requirements FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own requirement coverage"
  ON public.requirement_coverage FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own coverage claims"
  ON public.coverage_claims FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.requirement_coverage rc WHERE rc.id = coverage_id AND rc.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.claims c WHERE c.id = claim_id AND c.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.requirement_coverage rc WHERE rc.id = coverage_id AND rc.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.claims c WHERE c.id = claim_id AND c.user_id = auth.uid())
  );

CREATE POLICY "Users manage own resume bullets"
  ON public.resume_bullets FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own bullet claims"
  ON public.bullet_claims FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.resume_bullets b WHERE b.id = bullet_id AND b.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.claims c WHERE c.id = claim_id AND c.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.resume_bullets b WHERE b.id = bullet_id AND b.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.claims c WHERE c.id = claim_id AND c.user_id = auth.uid())
  );
