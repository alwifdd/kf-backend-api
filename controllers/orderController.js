// controllers/orderController.js
import { supabase } from "../config/supabaseClient.js";

/* --------------------------------------------------------------------------
 * 🔹 FUNGSI HELPER UNTUK KONVERSI STOK (Tidak Berubah)
 * -------------------------------------------------------------------------- */

const getConversionFactor = (modifierName) => {
  if (!modifierName) return 1;
  const name = modifierName.toLowerCase();
  if (name.includes("strip")) {
    return 10;
  }
  if (name.includes("box")) {
    return 100;
  }
  return 1;
};

/* --------------------------------------------------------------------------
 * 🔹 FUNGSI UNTUK FRONTEND POS (INTERNAL)
 * -------------------------------------------------------------------------- */

/**
 * (UPDATE) Ambil pesanan berdasarkan role DAN filter frontend:
 * - Super Admin: Bisa filter by 'area' atau 'branch_id'.
 * - Bisnis Manager: Hanya bisa filter 'branch_id' di dalam areanya.
 * - Admin Cabang: Tidak bisa filter, selalu menampilkan 'branch_id' miliknya.
 */
export const getAllOrders = async (req, res) => {
  try {
    // 1. Ambil data user yang login (dari token)
    const { role, branchId, area } = req.user;

    // 2. (BARU) Ambil data filter dari query string frontend
    const { filter_branch_id, filter_area_kota } = req.query;

    let query = supabase.from("orders").select("*, branches(*)"); // (FIX) Ambil juga data 'branches'

    // 3. (BARU) Logika Filter Bertingkat
    if (role === "admin_cabang") {
      // --- ALUR ADMIN CABANG ---
      // Abaikan semua filter, paksa pakai branchId dia
      console.log(`Filter pesanan untuk admin cabang, branchId: ${branchId}`);
      query = query.eq("branch_id", branchId);
    } else if (role === "bisnis_manager") {
      // --- ALUR BISNIS MANAGER ---
      console.log(`Filter pesanan untuk Bisnis Manager, area: ${area}`);

      // Ambil dulu semua ID cabang di area BM ini (untuk validasi & default)
      const { data: branches, error: branchError } = await supabase
        .from("branches")
        .select("branch_id")
        .eq("kota", area); // Filter berdasarkan 'kota' dari token
      if (branchError) throw branchError;

      const branchIdsInArea = branches.map((b) => b.branch_id);

      if (branchIdsInArea.length === 0) {
        console.log(`Tidak ada cabang ditemukan untuk area: ${area}`);
        return res.status(200).json([]); // Tidak ada cabang, kirim data kosong
      }

      if (filter_branch_id) {
        // Jika BM memilih 1 cabang spesifik
        const intBranchId = parseInt(filter_branch_id, 10);
        // (Security Check) Pastikan cabang itu ada di areanya
        if (branchIdsInArea.includes(intBranchId)) {
          console.log(`BM memfilter ke 1 cabang: ${intBranchId}`);
          query = query.eq("branch_id", intBranchId);
        } else {
          // Jika BM mencoba filter di luar areanya, tolak.
          console.log(
            `Error: BM di area ${area} mencoba akses cabang ${intBranchId}`
          );
          return res
            .status(403)
            .json({ message: "Anda tidak punya akses ke cabang ini." });
        }
      } else {
        // Jika BM tidak memilih (lihat semua di areanya)
        console.log(
          `BM melihat semua ${branchIdsInArea.length} cabang di areanya.`
        );
        query = query.in("branch_id", branchIdsInArea);
      }
    } else if (role === "superadmin") {
      // --- ALUR SUPER ADMIN ---
      console.log("Superadmin meminta data...");

      if (filter_branch_id) {
        // 1. Superadmin filter by 1 Cabang (prioritas)
        console.log(`Superadmin memfilter ke 1 cabang: ${filter_branch_id}`);
        query = query.eq("branch_id", filter_branch_id);
      } else if (filter_area_kota) {
        // 2. Superadmin filter by 1 Area BM
        console.log(`Superadmin memfilter ke area: ${filter_area_kota}`);
        const { data: branches, error: branchError } = await supabase
          .from("branches")
          .select("branch_id")
          .eq("kota", filter_area_kota);
        if (branchError) throw branchError;

        const branchIdsInArea = branches.map((b) => b.branch_id);
        if (branchIdsInArea.length > 0) {
          query = query.in("branch_id", branchIdsInArea);
        } else {
          // Area itu tidak punya cabang
          console.log(
            `Tidak ada cabang ditemukan untuk area (filter): ${filter_area_kota}`
          );
          return res.status(200).json([]);
        }
      } else {
        // 3. Superadmin tidak filter (lihat semua)
        console.log("Superadmin melihat semua pesanan.");
        // Tidak ada filter tambahan
      }
    } else {
      // Role tidak dikenal
      console.log(`Role tidak dikenal atau tidak valid: ${role}`);
      return res.status(403).json({ message: "Akses ditolak." });
    }

    // (Logika Lama) Tambahkan filter status jika ada (dari frontend)
    if (req.query.status) {
      query = query.eq("status", req.query.status);
    }

    query = query.order("created_at", { ascending: false });

    const { data, error } = await query;
    if (error) throw error;

    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ status: "fail", message: error.message });
  }
};

/**
 * Membuat pesanan OFFLINE baru dan mengurangi stok. (Tidak Berubah)
 */
export const createOrder = async (req, res) => {
  const { branch_id, items } = req.body;

  if (!branch_id || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      status: "fail",
      message: "branch_id and a non-empty items array are required.",
    });
  }

  try {
    // Cek stok dulu
    for (const item of items) {
      const { data: inventory, error } = await supabase
        .from("inventories")
        .select("opname_stock")
        .eq("branch_id", branch_id)
        .eq("product_id", item.product_id)
        .single();

      if (error || !inventory) {
        throw new Error(`Product ${item.product_id} not found at this branch.`);
      }

      if (inventory.opname_stock < item.quantity) {
        throw new Error(
          `Insufficient stock for ${item.product_id}. Only ${inventory.opname_stock} left.`
        );
      }
    }

    // Buat order
    const { data: newOrder, error: orderError } = await supabase
      .from("orders")
      .insert({ branch_id: branch_id, status: "PREPARING" })
      .select()
      .single();

    if (orderError) throw orderError;

    // Masukkan order items
    const orderItemsData = items.map((item) => ({
      order_id: newOrder.id,
      product_id: item.product_id,
      quantity: item.quantity,
    }));

    const { error: itemsError } = await supabase
      .from("order_items")
      .insert(orderItemsData);

    if (itemsError) throw itemsError;

    // Kurangi stok (memanggil fungsi DB)
    for (const item of items) {
      const { error: stockError } = await supabase.rpc("decrease_stock", {
        branch_id_input: branch_id,
        product_id_input: item.product_id,
        quantity_input: item.quantity,
      });
      if (stockError) throw stockError;
    }

    res.status(202).json({
      status: "success",
      message: "Order received and is being processed.",
      order_id: newOrder.id,
    });
  } catch (error) {
    res.status(500).json({
      status: "fail",
      message: error.message,
    });
  }
};

/**
 * Update status pesanan (internal). (Tidak Berubah)
 */
export const updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        status: "fail",
        message: "Status is required.",
      });
    }

    const { data, error } = await supabase
      .from("orders")
      .update({ status: status })
      .eq("id", orderId)
      .select()
      .single();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({
        status: "fail",
        message: `Order with ID ${orderId} not found.`,
      });
    }

    res.status(200).json({
      status: "success",
      message: `Order status updated to ${status}`,
      order: data,
    });
  } catch (error) {
    res.status(500).json({
      status: "fail",
      message: error.message,
    });
  }
};

/* --------------------------------------------------------------------------
 * 🔹 FUNGSI AKSI (Dipanggil dari POS, memanggil API Grab) (Tidak Berubah)
 * -------------------------------------------------------------------------- */

/**
 * 1. TERIMA PESANAN (INCOMING -> PREPARING)
 */
export const acceptOrder = async (req, res) => {
  const { orderId } = req.params; // Ini adalah grab_order_id

  try {
    // 1. Ambil data pesanan
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("branch_id, grab_payload_raw")
      .eq("grab_order_id", orderId)
      .single();

    if (orderError || !order) {
      return res.status(404).json({ message: `Order ${orderId} not found.` });
    }

    // 2. Ambil 'items' dari payload mentah
    const items = order.grab_payload_raw.items;
    if (!items || items.length === 0) {
      throw new Error(`Tidak ada item di pesanan ${orderId}.`);
    }

    // 3. Loop setiap item dan kurangi stok DENGAN LOGIKA KONVERSI
    for (const item of items) {
      let conversionFactor = 1;
      if (item.modifiers && item.modifiers.length > 0) {
        const modifierName = item.modifiers[0].name;
        conversionFactor = getConversionFactor(modifierName);
        console.log(
          `[Stok] Modifier terdeteksi: "${modifierName}". Faktor konversi: ${conversionFactor}`
        );
      }
      const totalQuantityToDecrease = item.quantity * conversionFactor;
      console.log(
        `[Stok] Mengurangi stok ${item.id} di cabang ${order.branch_id} sebanyak ${totalQuantityToDecrease} (tablet)`
      );

      // 4. Panggil fungsi 'decrease_stock' di database
      const { error: stockError } = await supabase.rpc("decrease_stock", {
        branch_id_input: order.branch_id,
        product_id_input: item.id,
        quantity_input: totalQuantityToDecrease,
      });

      if (stockError) {
        throw stockError; // Jika stok tidak cukup, RPC akan mengembalikan error
      }
    }

    // 5. Jika semua stok berhasil dikurangi, update status pesanan
    const { data: updatedOrder, error: updateError } = await supabase
      .from("orders")
      .update({ status: "PREPARING" })
      .eq("grab_order_id", orderId)
      .select()
      .single();

    if (updateError) throw updateError;

    console.log(
      `Pesanan ${orderId} diterima. Stok dikurangi, status jadi PREPARING.`
    );
    res.status(200).json(updatedOrder);
  } catch (error) {
    console.error(`Gagal menerima pesanan ${orderId}:`, error);
    res
      .status(500)
      .json({ message: `Gagal menerima pesanan: ${error.message}` });
  }
};

/**
 * 2. TOLAK PESANAN (INCOMING -> REJECTED)
 */
export const rejectOrder = async (req, res) => {
  const { orderId } = req.params;
  try {
    const { data: updatedOrder, error } = await supabase
      .from("orders")
      .update({ status: "REJECTED" })
      .eq("grab_order_id", orderId)
      .select()
      .single();
    if (error) throw error;
    console.log(`Pesanan ${orderId} ditolak.`);
    res.status(200).json(updatedOrder);
  } catch (error) {
    console.error(`Gagal menolak pesanan ${orderId}:`, error);
    res.status(500).json({ message: "Gagal menolak pesanan." });
  }
};

/**
 * 3. SIAPKAN PESANAN (PREPARING -> READY_FOR_PICKUP)
 */
export const markOrderAsReady = async (req, res) => {
  const { orderId } = req.params;
  try {
    console.log(`Mencoba menandai pesanan ${orderId} sebagai siap...`);
    const requestBody = { orderID: orderId, markStatus: 1 };
    const response = await fetch(
      "http://localhost:8080/partner/v1/orders/mark",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      }
    );
    if (!response.ok) throw new Error("Panggilan ke mock server Grab gagal.");
    await supabase
      .from("orders")
      .update({ status: "READY_FOR_PICKUP" })
      .eq("grab_order_id", orderId);
    console.log(`Pesanan ${orderId} berhasil ditandai siap.`);
    res.status(200).json({ message: `Order ${orderId} marked as ready.` });
  } catch (error) {
    console.error("Gagal menandai pesanan:", error);
    res.status(500).json({ message: "Internal server error." });
  }
};

/**
 * 4. CEK PEMBATALAN
 */
export const checkCancellationEligibility = async (req, res) => {
  const { orderId } = req.params;
  try {
    console.log(`Mengecek apakah pesanan ${orderId} bisa dibatalkan...`);
    const response = await fetch(
      `http://localhost:8080/partner/v1/order/cancelable?orderID=${orderId}`
    );
    if (!response.ok) throw new Error("Panggilan ke mock server Grab gagal.");
    const data = await response.json();
    console.log(`Pesanan ${orderId} bisa dibatalkan.`);
    res.status(200).json(data);
  } catch (error) {
    console.error("Gagal mengecek status pembatalan:", error);
    res.status(500).json({ message: "Internal server error." });
  }
};

/**
 * 5. BATALKAN PESANAN (-> CANCELLED)
 */
export const cancelOrder = async (req, res) => {
  const { orderId } = req.params;
  const { cancelCode } = req.body;

  if (!cancelCode) {
    return res.status(400).json({ message: "cancelCode is required." });
  }

  try {
    console.log(
      `Mencoba membatalkan pesanan ${orderId} dengan alasan kode: ${cancelCode}`
    );

    // 1. Panggil API Grab (Mock Server)
    const requestBody = {
      orderID: orderId,
      merchantID: "GRAB_ID_SIMulasi",
      cancelCode: cancelCode,
    };
    const response = await fetch(
      "http://localhost:8080/partner/v1/order/cancel",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      }
    );
    if (!response.ok) {
      throw new Error("Panggilan pembatalan ke mock server Grab gagal.");
    }

    // 2. Logika Restock
    const { data: orderData, error: orderError } = await supabase
      .from("orders")
      .select("id, branch_id, grab_payload_raw")
      .eq("grab_order_id", orderId)
      .single();
    if (orderError || !orderData)
      throw new Error(`Order ${orderId} not found.`);

    // 3. Ambil items dari payload mentah
    const itemsToRestock = orderData.grab_payload_raw.items;

    // 4. Loop item dan restock DENGAN KONVERSI
    if (itemsToRestock && itemsToRestock.length > 0) {
      for (const item of itemsToRestock) {
        let conversionFactor = 1;
        if (item.modifiers && item.modifiers.length > 0) {
          const modifierName = item.modifiers[0].name;
          conversionFactor = getConversionFactor(modifierName);
        }
        const totalQuantityToIncrease = item.quantity * conversionFactor;
        console.log(
          `[Restock] Mengembalikan stok ${item.id} ke cabang ${orderData.branch_id} sebanyak ${totalQuantityToIncrease} (tablet)`
        );
        // Panggil fungsi 'increase_stock' di database
        const { error: stockError } = await supabase.rpc("increase_stock", {
          branch_id_input: orderData.branch_id,
          product_id_input: item.id,
          quantity_input: totalQuantityToIncrease,
        });
        if (stockError) throw stockError;
      }
    }

    // 5. Update status di database LOKAL
    await supabase
      .from("orders")
      .update({ status: "CANCELLED" })
      .eq("grab_order_id", orderId);

    console.log(
      `Pesanan ${orderId} berhasil dibatalkan dan stok dikembalikan.`
    );
    res.status(200).json({
      message: `Order ${orderId} has been cancelled and stock restored.`,
    });
  } catch (error) {
    console.error("Gagal membatalkan pesanan:", error);
    res.status(500).json({ message: "Internal server error." });
  }
};
