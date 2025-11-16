// validators/integrationStatusValidator.js
import { z } from "zod";

export const integrationStatusSchema = z.object({
  partnerID: z.string(),
  storeID: z.string(),
  status: z.enum(["SYNCING", "ACTIVE", "FAILED"]),
  message: z.string().optional(),
});
