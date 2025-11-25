// controllers/webhookController.js
import { supabase } from "../config/supabaseClient.js";
import { integrationStatusSchema } from "../validators/integrationStatusValidator.js";
import { menuSyncStateSchema } from "../validators/menuSyncValidator.js";

// --- Helper Functions for Background Processing ---
const processIntegrationStatus = async (statusData) => {
  console.log(
    `[Background Process] Received Integration Status for store ${statusData.storeID}`
  );
  console.log(`[Background Process] New Status: ${statusData.status}`);
};

const processPushedMenu = async (menuData) => {
  console.log(
    `[Background Process] Received a menu push from Grab for partner ID: ${menuData.partnerID}.`
  );
};

// --- Webhook Handlers ---

/**
 * Menerima pesanan baru dari Grab (Submit Order webhook)
 */
export const handleSubmitOrder = async (req, res) => {
  // 1. Kirim respons cepat ke Grab agar tidak timeout
  res
    .status(202)
    .json({ message: "Order webhook received and is being processed." });

  const grabOrderPayload = req.body;

  try {
    console.log(
      `[Webhook] Menerima pesanan dengan Grab orderID: ${grabOrderPayload.orderID}`
    );

    const { orderID, partnerMerchantID, items, scheduledTime } =
      grabOrderPayload;

    // ==============================================================
    // STEP 1 — Terjemahkan Grab Merchant ID → Internal Branch ID
    // ==============================================================
    const { data: branch, error: branchError } = await supabase
      .from("branches")
      .select("branch_id")
      .eq("grab_merchant_id", partnerMerchantID)
      .single();

    if (branchError || !branch) {
      throw new Error(
        `[Webhook] GAGAL: Cabang dengan grab_merchant_id ${partnerMerchantID} tidak ditemukan.`
      );
    }

    const internalBranchId = branch.branch_id;

    // ==============================================================
    // STEP 2 — CEK apakah order sudah ada (Handle Edit / Duplicate)
    // ==============================================================
    const { data: existingOrder } = await supabase
      .from("orders")
      .select("id")
      .eq("grab_order_id", orderID)
      .single();

    let finalInternalOrderId;

    if (existingOrder) {
      // ============================================================
      // UPDATE — ORDER SUDAH ADA → ini kemungkinan Edit Order
      // ============================================================
      console.log(`[Webhook] Order ${orderID} sudah ada → UPDATE order.`);

      await supabase
        .from("orders")
        .update({
          status: "INCOMING", // Reset supaya kasir memproses ulang
          grab_payload_raw: grabOrderPayload,
          scheduled_time: scheduledTime || null,
          updated_at: new Date(),
        })
        .eq("id", existingOrder.id);

      // Hapus item lama (Grab bisa ubah item saat edit order)
      await supabase
        .from("order_items")
        .delete()
        .eq("order_id", existingOrder.id);

      finalInternalOrderId = existingOrder.id;
    } else {
      // ============================================================
      // INSERT — ORDER BARU
      // ============================================================
      console.log(`[Webhook] Order ${orderID} baru → INSERT order.`);

      const { data: newOrder, error: orderInsertError } = await supabase
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

      if (orderInsertError) throw orderInsertError;
      finalInternalOrderId = newOrder.id;
    }

    // ==============================================================
    // STEP 3 — INSERT ITEM PESANAN BARU
    // ==============================================================
    if (items && items.length > 0) {
      const orderItemsData = items.map((item) => ({
        order_id: finalInternalOrderId,
        product_id: item.id,
        quantity: item.quantity,
      }));

      const { error: itemsError } = await supabase
        .from("order_items")
        .insert(orderItemsData);

      if (itemsError) throw itemsError;
    }

    console.log(
      `[Webhook] Pesanan ${orderID} berhasil diproses (order internal: ${finalInternalOrderId}).`
    );
  } catch (error) {
    console.error(
      `[Webhook] GAGAL memproses pesanan ${req.body?.orderID}:`,
      error
    );
  }
};

/**
 * Menerima update status pesanan dari Grab
 */
export const receiveOrderStatus = async (req, res) => {
  const { orderID, state } = req.body;

  if (!orderID || !state) {
    return res.status(400).json({ message: "orderID and state are required." });
  }

  try {
    const { data, error } = await supabase
      .from("orders")
      .update({ status: state })
      .eq("grab_order_id", orderID)
      .select()
      .single();

    if (error) throw error;

    if (!data) {
      return res
        .status(404)
        .json({ message: `Order with Grab ID ${orderID} not found.` });
    }

    console.log(`Order ${orderID} status updated to ${state} by Grab webhook.`);
    res.status(200).json({ message: "Webhook received successfully." });
  } catch (error) {
    console.error("Error processing status update:", error);
    res.status(500).json({ message: "Internal server error." });
  }
};

/**
 * Menerima status integrasi toko dari Grab
 */
export const handleIntegrationStatus = (req, res) => {
  const validationResult = integrationStatusSchema.safeParse(req.body);
  if (!validationResult.success) {
    return res
      .status(400)
      .json({ status: "fail", errors: validationResult.error.issues });
  }

  res.status(202).json({ message: "Webhook received." });
  void processIntegrationStatus(validationResult.data);
};

/**
 * Menerima data menu lengkap dari Grab saat onboarding
 */
export const handlePushMenu = (req, res) => {
  if (!req.body || Object.keys(req.body).length === 0) {
    return res
      .status(400)
      .json({ status: "fail", message: "Empty menu data received." });
  }
  res.status(202).json({ message: "Menu push received." });
  void processPushedMenu(req.body);
};

/**
 * Menerima status hasil sinkronisasi menu dari Grab dan menyimpannya ke database.
 */
export const handleMenuSyncState = async (req, res) => {
  const validationResult = menuSyncStateSchema.safeParse(req.body);
  if (!validationResult.success) {
    return res
      .status(400)
      .json({ status: "fail", errors: validationResult.error.issues });
  }

  const { jobID, partnerMerchantID, status, errors } = validationResult.data;

  try {
    const { error: dbError } = await supabase.from("menu_sync_logs").insert({
      job_id: jobID,
      partner_merchant_id: partnerMerchantID,
      status: status,
      errors: errors || null,
    });

    if (dbError) throw dbError;

    console.log(
      `[Menu Sync] Status untuk job ${jobID} (${status}) berhasil dicatat ke database.`
    );
  } catch (dbError) {
    console.error("[Menu Sync] Gagal menyimpan log ke database:", dbError);
  }

  res.status(202).json({ message: "Webhook received." });
};
