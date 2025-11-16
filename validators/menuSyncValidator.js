// validators/menuSyncValidator.js
import { z } from "zod";

export const menuSyncStateSchema = z.object({
  // ✅ ID unik untuk request webhook ini
  requestID: z.string(),

  // ✅ ID merchant yang diberikan Grab
  merchantID: z.string(),

  // ✅ ID toko/partner merchant (dari sistem kita)
  partnerMerchantID: z.string(),

  // ✅ ID unik untuk job sinkronisasi menu
  jobID: z.string(),

  // ✅ Waktu terakhir status diperbarui
  updatedAt: z.string(),

  // ✅ Status sinkronisasi — mencakup semua kemungkinan status dari Grab
  status: z.enum(["QUEUEING", "PROCESSING", "SUCCESS", "FAILED"]),

  // ✅ Error list: Grab bisa kirim array of string (bukan object)
  errors: z.array(z.string().nullable()).optional(),
});
