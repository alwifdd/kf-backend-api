// controllers/menuController.js
import { supabase } from "../config/supabaseClient.js";

/**
 * Webhook yang dipanggil oleh Grab untuk mengambil struktur menu lengkap dari sebuah outlet.
 */
export const getMartMenu = async (req, res) => {
  const { partnerMerchantID, merchantID } = req.query;

  console.log(`[Menu] Permintaan menu untuk PartnerID: ${partnerMerchantID}`);

  if (!partnerMerchantID) {
    return res
      .status(400)
      .json({ message: "Query parameter 'partnerMerchantID' is required." });
  }

  try {
    // ✅ LANGKAH 1: Terjemahkan ID Grab -> ID Internal
    const { data: branch, error: branchError } = await supabase
      .from("branches")
      .select("branch_id")
      .eq("grab_merchant_id", partnerMerchantID)
      .single();

    if (branchError || !branch) {
      throw new Error(
        `[Menu Generation] GAGAL: Cabang dengan grab_merchant_id ${partnerMerchantID} tidak ditemukan.`
      );
    }

    // ✅ LANGKAH 2: Gunakan ID Internal kita
    const internalBranchId = branch.branch_id;

    // ✅ LANGKAH 3: Ambil data inventaris berdasarkan ID internal
    const { data: productsData, error: productsError } = await supabase
      .from("inventories")
      .select(
        `
        opname_stock,
        products (
          product_id,
          product_name,
          price,
          description,
          grab_category_id,
          grab_subcategory_id,
          selling_time_id
        )
      `
      )
      .eq("branch_id", internalBranchId);

    if (productsError) throw productsError;

    console.log(`[Menu] Ditemukan ${productsData.length} produk di database.`);

    const productIds = productsData.map((p) => p.products.product_id);

    // Ambil data modifier (jika ada)
    const { data: modifierGroupsData } = await supabase
      .from("modifier_groups")
      .select(`*`)
      .in("product_id", productIds);

    const modifierGroupIds = modifierGroupsData
      ? modifierGroupsData.map((mg) => mg.id)
      : [];

    const { data: modifiersData } = await supabase
      .from("modifiers")
      .select(`*`)
      .in("modifier_group_id", modifierGroupIds);

    // Ambil Selling Times (Jam Buka)
    const { data: sellingTimesData, error: stError } = await supabase
      .from("selling_times")
      .select(`*`)
      .eq("partner_merchant_id", internalBranchId);

    if (stError) throw stError;

    // --- LOGIKA PENYUSUNAN MENU ---

    const modifiersByGroupId = (modifiersData || []).reduce((acc, modifier) => {
      if (!acc[modifier.modifier_group_id])
        acc[modifier.modifier_group_id] = [];
      acc[modifier.modifier_group_id].push({
        id: modifier.id,
        name: modifier.name,
        price: modifier.price,
        availableStatus: modifier.available_status,
      });
      return acc;
    }, {});

    const modifierGroupsByProductId = (modifierGroupsData || []).reduce(
      (acc, group) => {
        if (!acc[group.product_id]) acc[group.product_id] = [];
        acc[group.product_id].push({
          id: group.id,
          name: group.name,
          selectionRangeMin: group.selection_range_min,
          selectionRangeMax: group.selection_range_max,
          modifiers: modifiersByGroupId[group.id] || [],
        });
        return acc;
      },
      {}
    );

    const items = productsData.map((p) => ({
      id: p.products.product_id,
      name: p.products.product_name,
      description: p.products.description,
      price: p.products.price,
      availableStatus: p.opname_stock > 0 ? "AVAILABLE" : "UNAVAILABLE",
      maxStock: p.opname_stock,
      sellingTimeID: p.products.selling_time_id, // Pastikan ini tidak null di DB
      _grab_category_id: p.products.grab_category_id || "CAT-DEFAULT",
      _grab_subcategory_id: p.products.grab_subcategory_id || "SUB-DEFAULT",
      modifierGroups: modifierGroupsByProductId[p.products.product_id] || [],
      photos: [], // Grab kadang butuh array photos walau kosong
    }));

    // --- FORMAT 1: CATEGORIES (Untuk GrabMart / New Structure) ---
    const categoriesMap = items.reduce((acc, item) => {
      const catId = item._grab_category_id;
      const subCatId = item._grab_subcategory_id;

      if (!acc[catId]) {
        acc[catId] = {
          id: catId,
          name: catId === "HEALTH_MEDICINE" ? "Obat-obatan" : "Umum", // Nama cantik
          subCategoriesMap: {},
        };
      }

      if (!acc[catId].subCategoriesMap[subCatId]) {
        acc[catId].subCategoriesMap[subCatId] = {
          id: subCatId,
          name: subCatId === "SUB-DEFAULT" ? "Lainnya" : subCatId,
          items: [],
        };
      }

      // Bersihkan property internal sebelum masuk ke array items
      const cleanItem = { ...item };
      delete cleanItem._grab_category_id;
      delete cleanItem._grab_subcategory_id;

      acc[catId].subCategoriesMap[subCatId].items.push(cleanItem);
      return acc;
    }, {});

    const categories = Object.values(categoriesMap).map((cat) => ({
      ...cat,
      subCategories: Object.values(cat.subCategoriesMap),
      subCategoriesMap: undefined,
    }));

    // --- FORMAT 2: SECTIONS (Untuk GrabFood / Old Structure) ---
    // Kita "gepengkan" kategori -> section.
    // Semua item dalam satu kategori akan masuk ke satu section.
    const sections = Object.values(categoriesMap).map((cat) => {
      // Gabungkan semua item dari semua subkategori
      const allItemsInSection = Object.values(cat.subCategoriesMap).flatMap(
        (sub) => sub.items
      );

      // Cari ID Selling Time pertama yang valid untuk section ini
      const defaultSellingTime = sellingTimesData[0]?.id;

      return {
        id: cat.id,
        name: cat.name,
        serviceHours: {
          // GrabFood butuh serviceHours di level section
          // Kita pakai ID dari selling_times kita
          id: defaultSellingTime,
        },
        items: allItemsInSection,
      };
    });

    const sellingTimes = (sellingTimesData || []).map((st) => ({
      id: st.id,
      name: st.name,
      serviceHours: st.service_hours,
      // Hapus utc_start/end time jika bikin bingung Grab, tapi biasanya aman
    }));

    const finalMenuPayload = {
      merchantID,
      partnerMerchantID,
      currency: { code: "IDR", symbol: "Rp", exponent: 2 },
      sellingTimes,
      categories, // Format Baru
      sections, // Format Lama (Ini yang diminta Grab sekarang)
    };

    console.log(
      `[Menu] Menu berhasil disusun. Mengirim ${sections.length} sections.`
    );
    res.status(200).json(finalMenuPayload);
  } catch (error) {
    console.error(
      `[Menu Generation Error] for partnerMerchantID ${partnerMerchantID}:`,
      error
    );
    res
      .status(500)
      .json({ message: "An error occurred while building the menu." });
  }
};

/**
 * Mengupdate detail satu item (harga/stok) di database lokal
 * dan mengirim notifikasi update ke Grab (via mock server).
 */
export const updateSingleItem = async (req, res) => {
  const { itemId } = req.params;
  const { price, maxStock, branchId } = req.body;

  if (!branchId && maxStock !== undefined) {
    return res
      .status(400)
      .json({ message: "branchId is required when updating stock." });
  }

  try {
    if (price !== undefined) {
      const { error: updateProductError } = await supabase
        .from("products")
        .update({ price })
        .eq("product_id", itemId);

      if (updateProductError) {
        throw updateProductError;
      }
    }

    if (maxStock !== undefined) {
      const { error: updateInventoryError } = await supabase
        .from("inventories")
        .update({ opname_stock: maxStock })
        .eq("product_id", itemId)
        .eq("branch_id", branchId);

      if (updateInventoryError) {
        throw updateInventoryError;
      }
    }

    const requestBodyToGrab = {
      merchantID: "GRAB_ID_SIMULASI",
      field: "ITEM",
      id: itemId,
      price,
      maxStock,
      availableStatus:
        maxStock !== undefined
          ? maxStock > 0
            ? "AVAILABLE"
            : "UNAVAILABLE"
          : undefined,
    };

    const response = await fetch("http://localhost:8080/partner/v1/menu", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBodyToGrab),
    });

    if (!response.ok) {
      throw new Error("Panggilan update ke mock server Grab gagal.");
    }

    res.status(200).json({ message: `Item ${itemId} updated successfully.` });
  } catch (error) {
    console.error(`Gagal mengupdate item ${itemId}:`, error);
    res.status(500).json({ message: "Internal server error." });
  }
};

/**
 * Melakukan batch update ke mock server Grab.
 */
export const batchUpdateItems = async (req, res) => {
  const { items, branchId } = req.body;

  if (!items || !Array.isArray(items) || !branchId) {
    return res
      .status(400)
      .json({ message: "A list of items and branchId are required." });
  }

  if (items.length > 200) {
    return res
      .status(500)
      .json({ message: "Batch update menu support at most 200 items" });
  }

  try {
    const requestBodyToGrab = {
      merchantID: "GRAB_ID_SIMULASI",
      field: "ITEM",
      menuEntities: items.map((item) => ({
        id: item.product_id,
        price: item.price,
        maxStock: item.maxStock,
        availableStatus: item.maxStock > 0 ? "AVAILABLE" : "UNAVAILABLE",
      })),
    };

    const response = await fetch(
      "http://localhost:8080/partner/v1/batch/menu",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBodyToGrab),
      }
    );

    const responseData = await response.json();

    if (!response.ok) {
      throw new Error(
        responseData.message ||
          "Panggilan batch update ke mock server Grab gagal."
      );
    }

    for (const item of items) {
      if (item.price !== undefined) {
        const { error: updateProductError } = await supabase
          .from("products")
          .update({ price: item.price })
          .eq("product_id", item.product_id);

        if (updateProductError) throw updateProductError;
      }

      if (item.maxStock !== undefined) {
        const { error: updateInventoryError } = await supabase
          .from("inventories")
          .update({ opname_stock: item.maxStock })
          .eq("product_id", item.product_id)
          .eq("branch_id", branchId);

        if (updateInventoryError) throw updateInventoryError;
      }
    }

    console.log("Batch update ke Grab & database lokal berhasil.");
    res.status(200).json({ message: "Batch update processed successfully." });
  } catch (error) {
    console.error("Gagal melakukan batch update:", error);
    res.status(500).json({ message: error.message });
  }
};
