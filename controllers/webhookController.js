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
 * Menerima pesanan baru dari Grab (Submit Order webhook)
 */
export const handleSubmitOrder = async (req, res) => {
  // 1. Kirim respons cepat agar Grab tidak timeout
  res.status(200).json({ message: "Order received" });

  const grabOrderPayload = req.body;
  const { orderID, partnerMerchantID, items, scheduledTime } = grabOrderPayload;

  console.log(
    `[Webhook] Memproses Order: ${orderID} (Merchant: ${partnerMerchantID})`
  );

  try {
    // ✅ LANGKAH 1: Cari Branch ID Internal
    const { data: branch, error: branchError } = await supabase
      .from("branches")
      .select("branch_id")
      .eq("grab_merchant_id", partnerMerchantID)
      .single();

    if (branchError || !branch) {
      throw new Error(`Cabang tidak ditemukan untuk ID: ${partnerMerchantID}`);
    }

    const internalBranchId = branch.branch_id;

    // ✅ LANGKAH 2: Cek apakah order sudah ada (Upsert Logic)
    const { data: existingOrder } = await supabase
      .from("orders")
      .select("id")
      .eq("grab_order_id", orderID)
      .single();

    let orderInternalID;

    if (existingOrder) {
      console.log(`[Webhook] Order ${orderID} sudah ada. Melakukan UPDATE.`);
      // Update status dan payload
      await supabase
        .from("orders")
        .update({
          status: "INCOMING",
          grab_payload_raw: grabOrderPayload,
          updated_at: new Date(),
        })
        .eq("id", existingOrder.id);

      // Hapus item lama untuk diganti yang baru
      await supabase
        .from("order_items")
        .delete()
        .eq("order_id", existingOrder.id);
      orderInternalID = existingOrder.id;
    } else {
      console.log(`[Webhook] Order ${orderID} baru. Melakukan INSERT.`);
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

    // ✅ LANGKAH 3: Simpan Item Pesanan (CRITICAL FIX)
    if (items && items.length > 0) {
      const orderItemsData = items.map((item) => ({
        order_id: orderInternalID,
        // Pastikan ID diambil dari 'id' (yang kita kirim di menuController)
        product_id: item.id || "UNKNOWN_ITEM",
        quantity: item.quantity,
        // Kita simpan harga snapshot saat order masuk (opsional, buat history)
        // Grab kirim harga total per item line (price * qty), jadi hati-hati
        // Tapi untuk POS display, kita pakai data dari grab_payload_raw di Frontend
      }));

      const { error: itemsError } = await supabase
        .from("order_items")
        .insert(orderItemsData);

      if (itemsError) throw itemsError;
    }

    console.log(`[Webhook] SUKSES! Order ${orderID} tersimpan di database.`);
  } catch (error) {
    console.error(`[Webhook] GAGAL memproses pesanan ${orderID}:`, error);
  }
};

/**
 * Menerima update status pesanan dari Grab
 */
export const receiveOrderStatus = async (req, res) => {
  const { orderID, state } = req.body;

  // Response cepat
  res.status(200).json({ message: "Status update received" });

  if (!orderID || !state) return;

  try {
    console.log(`[Webhook] Update Status Order ${orderID} -> ${state}`);

    // Mapping status Grab ke status Internal jika perlu
    // Contoh: CANCELLED -> CANCELLED, COMPLETED -> DELIVERED
    const { error } = await supabase
      .from("orders")
      .update({ status: state })
      .eq("grab_order_id", orderID);

    if (error) throw error;
  } catch (error) {
    console.error("Error processing status update:", error);
  }
};

// --- Handler Lainnya (Biarkan Saja) ---
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
  res.status(200).json({ message: "Webhook received." });
};
