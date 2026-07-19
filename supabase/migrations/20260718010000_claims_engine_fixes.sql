-- Fixes to the Phase 1 claims-engine schema (see 20260718000000_claims_engine.sql),
-- addressing two Task 2 review findings:
--   1. "Users manage own claim links" only checked ownership of inferred_claim_id;
--      it must also check ownership of supporting_claim_id in both USING and WITH CHECK,
--      otherwise a user could link another user's claim as supporting evidence.
--   2. public.claims was missing the standard updated_at trigger present on other tables.

DROP POLICY "Users manage own claim links" ON public.claim_links;

CREATE POLICY "Users manage own claim links"
  ON public.claim_links FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.claims c WHERE c.id = inferred_claim_id AND c.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.claims c2 WHERE c2.id = supporting_claim_id AND c2.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.claims c WHERE c.id = inferred_claim_id AND c.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.claims c2 WHERE c2.id = supporting_claim_id AND c2.user_id = auth.uid())
  );

CREATE TRIGGER update_claims_updated_at
  BEFORE UPDATE ON public.claims
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
