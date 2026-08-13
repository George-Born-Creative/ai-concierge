-- Diagnostics are an explicit, versioned, allowlisted snapshot attached only
-- when the user opts in while submitting a support request.
ALTER TABLE "SupportRequest" ADD COLUMN "diagnostics" JSONB;
