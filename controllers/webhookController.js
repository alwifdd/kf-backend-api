// controllers/webhookController.js
import { supabase } from "../config/supabaseClient.js";
import { integrationStatusSchema } from "../validators/integrationStatusValidator.js";
import { menuSyncStateSchema } from "../validators/menuSyncValidator.js";

// --- Helper Functions ---
const processIntegrationStatus = async (statusData) => {
  console.log(
    `[Background] Integration Status: ${statusData.status} for ${statusData.storeID}`
  );
};

const processPushedMenu = async (menuData) => {
  console.log(
    `[Background] Menu Push received for partner: ${menuData.partnerID}`
  );
};

// --- Webhook Handlers ---

/**
 * 1. Menerima pesanan baru dari Grab (Submit Order webhook)
 */
export const handleSubmitOrder = async (req, res) => {
  const grabOrderPayload = req.body;
  const { orderID, partnerMerchantID, items, scheduledTime } = grabOrderPayload;

  console.log(
    `[Webhook] Menerima Order: ${orderID} (Merchant: ${partnerMerchantID})`
  );

  try {
    // ✅ LANGKAH 1: Validasi Branch DULU (Cepat & Sync)
    // Pastikan toko ada di DB kita sebelum menerima order
    const { data: branch, error: branchError } = await supabase
      .from("branches")
      .select("branch_id")
      .eq("grab_merchant_id", partnerMerchantID)
      .single();

    if (branchError || !branch) {
      console.error(
        `❌ [Webhook] Branch tidak ditemukan: ${partnerMerchantID}`
      );
      // Kirim 404 agar Grab tahu order ini gagal masuk ke POS
      return res.status(404).json({ message: "Store not found" });
    }

    // ✅ LANGKAH 2: Jika Branch Valid, Kirim 200 OK Segera
    // Ini mencegah timeout karena Grab butuh respon < 10 detik
    res.status(200).json({ message: "Order received" });

    // ✅ LANGKAH 3: Proses Berat (DB Insert/Update) di Background
    (async () => {
      try {
        const internalBranchId = branch.branch_id;

        // Cek apakah order sudah ada (Logika Upsert)
        const { data: existingOrder } = await supabase
          .from("orders")
          .select("id")
          .eq("grab_order_id", orderID)
          .single();

        let orderInternalID;

        if (existingOrder) {
          console.log(`[Background] Order ${orderID} update (Edit/Re-push).`);

          await supabase
            .from("orders")
            .update({
              status: "INCOMING",
              grab_payload_raw: grabOrderPayload,
              updated_at: new Date(),
            })
            .eq("id", existingOrder.id);

          // Hapus item lama untuk diganti yang baru (Full replace items)
          await supabase
            .from("order_items")
            .delete()
            .eq("order_id", existingOrder.id);

          orderInternalID = existingOrder.id;
        } else {
          console.log(`[Background] Order ${orderID} baru. Insert ke DB.`);

          const { data: newOrder, error: orderError } = await supabase
            .from("orders")
            .insert({
              branch_id: internalBranchId,
              status: "INCOMING",
              grab_order_id: orderID,
              grab_payload_raw: grabOrderPayload,
              scheduled_time: scheduledTime || null,
            })
            .select("id")
            .single();

          if (orderError) throw orderError;
          orderInternalID = newOrder.id;
        }

        // Simpan Item Pesanan
        if (items && items.length > 0) {
          const orderItemsData = items.map((item) => ({
            order_id: orderInternalID,
            // Simpan ID dari Grab. Frontend nanti akan handle penamaannya.
            product_id: item.id || "UNKNOWN",
            quantity: item.quantity,
          }));

          const { error: itemsError } = await supabase
            .from("order_items")
            .insert(orderItemsData);

          if (itemsError) throw itemsError;
        }

        console.log(`✅ [Background] Sukses simpan order ${orderID}`);
      } catch (err) {
        console.error(
          `❌ [Background] Gagal simpan DB untuk order ${orderID}:`,
          err
        );
      }
    })();
  } catch (error) {
    console.error(`[Webhook] Fatal Error handler:`, error);
    if (!res.headersSent) {
      res.status(500).json({ message: "Internal Server Error" });
    }
  }
};

/**
 * 2. Menerima update status pesanan dari Grab
 * PERBAIKAN: Menambahkan mapping status "COMPLETED" -> "DELIVERED"
 */
export const receiveOrderStatus = async (req, res) => {
  const { orderID, state } = req.body;

  // Response cepat agar Grab senang
  res.status(200).json({ message: "Status update received" });

  if (!orderID || !state) return;

  try {
    console.log(`[Webhook] Update Status Order ${orderID} -> ${state}`);

    // --- 🚨 PERBAIKAN PENTING: NORMALISASI STATUS ---
    // Grab Simulator/Server kadang mengirim "COMPLETED", "FAILED", dll.
    // Kita harus ubah agar sesuai dengan Frontend POS kita ("DELIVERED", "CANCELLED").

    let internalStatus = state;

    if (state === "COMPLETED") {
      internalStatus = "DELIVERED"; // Fix agar masuk tab "Order Completed"
    } else if (state === "FAILED") {
      internalStatus = "CANCELLED"; // Fix agar masuk tab "Cancellation"
    } else if (state === "DRIVER_ARRIVED") {
      // Opsional: Tetap anggap READY_FOR_PICKUP atau buat status baru
      // internalStatus = "READY_FOR_PICKUP";
    }

    // Update Database
    const { error } = await supabase
      .from("orders")
      .update({ status: internalStatus }) // <--- Gunakan status yang sudah dinormalisasi
      .eq("grab_order_id", orderID);

    if (error) throw error;
    console.log(`✅ Status DB updated: ${internalStatus} (Raw: ${state})`);
  } catch (error) {
    console.error("Error processing status update:", error);
  }
};

// --- Handler Lainnya (Standard) ---

export const handleIntegrationStatus = (req, res) => {
  const validationResult = integrationStatusSchema.safeParse(req.body);
  if (!validationResult.success)
    return res.status(400).json({ status: "fail" });

  res.status(200).json({ message: "Webhook received." });
  void processIntegrationStatus(validationResult.data);
};

export const handlePushMenu = (req, res) => {
  res.status(200).json({ message: "Menu push received." });
  void processPushedMenu(req.body);
};

export const handleMenuSyncState = async (req, res) => {
  const validationResult = menuSyncStateSchema.safeParse(req.body);
  if (!validationResult.success)
    return res.status(400).json({ status: "fail" });

  const { jobID, partnerMerchantID, status, errors } = validationResult.data;

  // Fire and forget log update
  (async () => {
    try {
      await supabase.from("menu_sync_logs").insert({
        job_id: jobID,
        partner_merchant_id: partnerMerchantID,
        status: status,
        errors: errors || null,
      });
    } catch (dbError) {
      console.error("[Menu Sync] DB Error:", dbError);
    }
  })();

  res.status(200).json({ message: "Webhook received." });
};
