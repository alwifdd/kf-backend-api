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
      `[Webhook] Menerima pesanan baru dengan ID: ${grabOrderPayload.orderID}`
    );

    const { orderID, partnerMerchantID, items, scheduledTime } =
      grabOrderPayload;

    // ✅ LANGKAH 1: Terjemahkan ID Grab -> ID Internal
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

    // ✅ LANGKAH 2: Gunakan ID Internal
    const internalBranchId = branch.branch_id;

    // ✅ LANGKAH 3: Simpan pesanan ke tabel orders
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

    // ✅ LANGKAH 4: Simpan item pesanan
    if (items && items.length > 0) {
      const orderItemsData = items.map((item) => ({
        order_id: newOrder.id,
        product_id: item.id,
        quantity: item.quantity,
      }));

      const { error: itemsError } = await supabase
        .from("order_items")
        .insert(orderItemsData);

      if (itemsError) throw itemsError;
    }

    console.log(
      `[Webhook] Pesanan ${orderID} (untuk cabang internal ${internalBranchId}) berhasil disimpan.`
    );
  } catch (error) {
    console.error(
      `[Webhook] GAGAL memproses pesanan ${grabOrderPayload.orderID}:`,
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
