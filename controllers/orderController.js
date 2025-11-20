// controllers/orderController.js
import { supabase } from "../config/supabaseClient.js";

// --- KONFIGURASI GRAB STAGING ---
const GRAB_API_BASE_URL = "https://partner-api.grab.com/grabmart-sandbox";
const GRAB_AUTH_URL = "https://partner-api.grab.com/grabid/v1/oauth2/token";

/* --------------------------------------------------------------------------
 * 🔹 FUNGSI HELPER: Ambil Token OAuth dari Grab (Otomatis)
 * -------------------------------------------------------------------------- */
const getGrabToken = async () => {
  try {
    console.log("Meminta Access Token ke Grab Staging...");
    const response = await fetch(GRAB_AUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.GRAB_CLIENT_ID,
        client_secret: process.env.GRAB_CLIENT_SECRET,
        grant_type: "client_credentials",
        scope: "mart.partner_api", // Scope untuk GrabMart
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(`Gagal dapat token Grab: ${JSON.stringify(data)}`);
    }

    console.log("Berhasil dapat Token Grab!");
    return data.access_token;
  } catch (error) {
    console.error("Error Auth Grab:", error);
    throw error;
  }
};

/* --------------------------------------------------------------------------
 * 🔹 FUNGSI HELPER UNTUK KONVERSI STOK (Tidak Berubah)
 * -------------------------------------------------------------------------- */
const getConversionFactor = (modifierName) => {
  if (!modifierName) return 1;
  const name = modifierName.toLowerCase();
  if (name.includes("strip")) return 10;
  if (name.includes("box")) return 100;
  return 1;
};

/* --------------------------------------------------------------------------
 * 🔹 FUNGSI UNTUK FRONTEND POS (INTERNAL)
 * -------------------------------------------------------------------------- */

export const getAllOrders = async (req, res) => {
  try {
    const { role, branchId, area } = req.user;
    const { filter_branch_id, filter_area_kota } = req.query;

    let query = supabase.from("orders").select("*, branches(*)");

    if (role === "admin_cabang") {
      query = query.eq("branch_id", branchId);
    } else if (role === "bisnis_manager") {
      const { data: branches, error: branchError } = await supabase
        .from("branches")
        .select("branch_id")
        .eq("kota", area);
      if (branchError) throw branchError;

      const branchIdsInArea = branches.map((b) => b.branch_id);
      if (branchIdsInArea.length === 0) return res.status(200).json([]);

      if (filter_branch_id) {
        const intBranchId = parseInt(filter_branch_id, 10);
        if (branchIdsInArea.includes(intBranchId)) {
          query = query.eq("branch_id", intBranchId);
        } else {
          return res
            .status(403)
            .json({ message: "Anda tidak punya akses ke cabang ini." });
        }
      } else {
        query = query.in("branch_id", branchIdsInArea);
      }
    } else if (role === "superadmin") {
      if (filter_branch_id) {
        query = query.eq("branch_id", filter_branch_id);
      } else if (filter_area_kota) {
        const { data: branches } = await supabase
          .from("branches")
          .select("branch_id")
          .eq("kota", filter_area_kota);

        const branchIdsInArea = branches
          ? branches.map((b) => b.branch_id)
          : [];
        if (branchIdsInArea.length > 0) {
          query = query.in("branch_id", branchIdsInArea);
        } else {
          return res.status(200).json([]);
        }
      }
    } else {
      return res.status(403).json({ message: "Akses ditolak." });
    }

    query = query.order("created_at", { ascending: false });
    const { data, error } = await query;
    if (error) throw error;

    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ status: "fail", message: error.message });
  }
};

export const createOrder = async (req, res) => {
  const { branch_id, items } = req.body;
  if (!branch_id || !items || !Array.isArray(items)) {
    return res.status(400).json({ status: "fail", message: "Invalid data." });
  }

  try {
    // Cek stok
    for (const item of items) {
      const { data: inventory } = await supabase
        .from("inventories")
        .select("opname_stock")
        .eq("branch_id", branch_id)
        .eq("product_id", item.product_id)
        .single();

      if (!inventory || inventory.opname_stock < item.quantity) {
        throw new Error(`Stok tidak cukup untuk ${item.product_id}`);
      }
    }

    const { data: newOrder, error: orderError } = await supabase
      .from("orders")
      .insert({ branch_id: branch_id, status: "PREPARING" })
      .select()
      .single();
    if (orderError) throw orderError;

    const orderItemsData = items.map((item) => ({
      order_id: newOrder.id,
      product_id: item.product_id,
      quantity: item.quantity,
    }));
    await supabase.from("order_items").insert(orderItemsData);

    for (const item of items) {
      await supabase.rpc("decrease_stock", {
        branch_id_input: branch_id,
        product_id_input: item.product_id,
        quantity_input: item.quantity,
      });
    }

    res.status(202).json({ status: "success", order_id: newOrder.id });
  } catch (error) {
    res.status(500).json({ status: "fail", message: error.message });
  }
};

export const updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;
    const { data, error } = await supabase
      .from("orders")
      .update({ status: status })
      .eq("id", orderId)
      .select()
      .single();

    if (error) throw error;
    if (!data)
      return res
        .status(404)
        .json({ status: "fail", message: "Order not found." });

    res.status(200).json({ status: "success", order: data });
  } catch (error) {
    res.status(500).json({ status: "fail", message: error.message });
  }
};

/* --------------------------------------------------------------------------
 * 🔹 FUNGSI AKSI (Dipanggil dari POS, memanggil API Grab ASLI)
 * -------------------------------------------------------------------------- */

export const acceptOrder = async (req, res) => {
  const { orderId } = req.params;
  try {
    const { data: order } = await supabase
      .from("orders")
      .select("branch_id, grab_payload_raw")
      .eq("grab_order_id", orderId)
      .single();

    if (!order) return res.status(404).json({ message: "Order not found." });

    const items = order.grab_payload_raw.items;
    for (const item of items) {
      let conversionFactor = 1;
      if (item.modifiers && item.modifiers.length > 0) {
        const modifierName = item.modifiers[0].name;
        conversionFactor = getConversionFactor(modifierName);
      }
      const totalQty = item.quantity * conversionFactor;

      await supabase.rpc("decrease_stock", {
        branch_id_input: order.branch_id,
        product_id_input: item.id,
        quantity_input: totalQty,
      });
    }

    const { data: updatedOrder } = await supabase
      .from("orders")
      .update({ status: "PREPARING" })
      .eq("grab_order_id", orderId)
      .select()
      .single();

    res.status(200).json(updatedOrder);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const rejectOrder = async (req, res) => {
  const { orderId } = req.params;
  try {
    const { data: updatedOrder } = await supabase
      .from("orders")
      .update({ status: "REJECTED" })
      .eq("grab_order_id", orderId)
      .select()
      .single();
    res.status(200).json(updatedOrder);
  } catch (error) {
    res.status(500).json({ message: "Gagal menolak pesanan." });
  }
};

/**
 * 3. SIAPKAN PESANAN (Mark Order Ready ke Grab Staging)
 */
export const markOrderAsReady = async (req, res) => {
  const { orderId } = req.params;
  try {
    console.log(`Menandai pesanan ${orderId} siap di Grab Staging...`);

    // 1. Dapatkan Token
    const token = await getGrabToken();

    // 2. Panggil API Grab Staging
    const response = await fetch(
      `${GRAB_API_BASE_URL}/partner/v1/orders/mark`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`, // Pakai token asli
        },
        body: JSON.stringify({
          orderID: orderId,
          markStatus: 1,
        }),
      }
    );

    if (!response.ok) {
      const errData = await response.text();
      throw new Error(`Grab API Error: ${errData}`);
    }

    // 3. Update Database Lokal
    await supabase
      .from("orders")
      .update({ status: "READY_FOR_PICKUP" })
      .eq("grab_order_id", orderId);

    console.log(`Pesanan ${orderId} berhasil ditandai siap di Grab & DB.`);
    res.status(200).json({ message: `Order ${orderId} marked as ready.` });
  } catch (error) {
    console.error("Gagal menandai pesanan:", error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * 4. CEK PEMBATALAN (Ke Grab Staging)
 */
export const checkCancellationEligibility = async (req, res) => {
  const { orderId } = req.params;
  try {
    const token = await getGrabToken();

    const response = await fetch(
      `${GRAB_API_BASE_URL}/partner/v1/order/cancelable?orderID=${orderId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      // Jika order dummy (tidak ada di grab), return dummy true agar tidak error di UI
      console.log(
        "Order tidak ditemukan di Grab (mungkin order tes), return dummy true."
      );
      return res.status(200).json({ cancelAble: true, cancelReasons: [] });
    }

    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    console.error("Gagal cek pembatalan:", error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * 5. BATALKAN PESANAN (Ke Grab Staging)
 */
export const cancelOrder = async (req, res) => {
  const { orderId } = req.params;
  const { cancelCode } = req.body;

  if (!cancelCode)
    return res.status(400).json({ message: "cancelCode required." });

  try {
    console.log(`Membatalkan pesanan ${orderId} di Grab Staging...`);

    const token = await getGrabToken();

    // 1. Panggil API Grab
    // (Kita gunakan ID Merchant dummy/default karena di body request butuh merchantID)
    const merchantID = "grabfood-merchant-id";

    const response = await fetch(
      `${GRAB_API_BASE_URL}/partner/v1/order/cancel`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          orderID: orderId,
          merchantID: merchantID,
          cancelCode: cancelCode,
        }),
      }
    );

    // Kalau gagal batalkan di Grab (misal karena order tes lokal), kita log aja tapi lanjut restock
    if (!response.ok) {
      console.warn(
        "Gagal cancel di Grab (mungkin order tes), lanjut restock lokal."
      );
    }

    // 2. Restock Stok
    const { data: orderData } = await supabase
      .from("orders")
      .select("id, branch_id, grab_payload_raw")
      .eq("grab_order_id", orderId)
      .single();

    if (orderData) {
      const items = orderData.grab_payload_raw.items;
      for (const item of items) {
        let factor = 1;
        if (item.modifiers?.[0])
          factor = getConversionFactor(item.modifiers[0].name);

        await supabase.rpc("increase_stock", {
          branch_id_input: orderData.branch_id,
          product_id_input: item.id,
          quantity_input: item.quantity * factor,
        });
      }
    }

    // 3. Update DB Lokal
    await supabase
      .from("orders")
      .update({ status: "CANCELLED" })
      .eq("grab_order_id", orderId);

    res.status(200).json({ message: "Order cancelled and stock restored." });
  } catch (error) {
    console.error("Gagal membatalkan pesanan:", error);
    res.status(500).json({ message: error.message });
  }
};
