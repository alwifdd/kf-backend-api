// controllers/menuController.js
import { supabase } from "../config/supabaseClient.js";

/**
 * Webhook yang dipanggil oleh Grab untuk mengambil struktur menu lengkap dari sebuah outlet.
 */
export const getMartMenu = async (req, res) => {
  const { partnerMerchantID, merchantID } = req.query;

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

    const productIds = productsData.map((p) => p.products.product_id);

    const { data: modifierGroupsData, error: mgError } = await supabase
      .from("modifier_groups")
      .select(`*`)
      .in("product_id", productIds);
    if (mgError) throw mgError;

    const modifierGroupIds = modifierGroupsData.map((mg) => mg.id);

    const { data: modifiersData, error: mError } = await supabase
      .from("modifiers")
      .select(`*`)
      .in("modifier_group_id", modifierGroupIds);
    if (mError) throw mError;

    // ⬇️ --- PERBAIKANNYA DI SINI ---
    const { data: sellingTimesData, error: stError } = await supabase
      .from("selling_times")
      .select(`*`) // <-- Ini yang ditambahkan
      .eq("partner_merchant_id", internalBranchId);
    if (stError) throw stError;
    // ⬆️ --- AKHIR DARI PERBAIKAN ---

    const modifiersByGroupId = modifiersData.reduce((acc, modifier) => {
      if (!acc[modifier.modifier_group_id]) {
        acc[modifier.modifier_group_id] = [];
      }
      acc[modifier.modifier_group_id].push({
        id: modifier.id,
        name: modifier.name,
        price: modifier.price,
        availableStatus: modifier.available_status,
      });
      return acc;
    }, {});

    const modifierGroupsByProductId = modifierGroupsData.reduce(
      (acc, group) => {
        if (!acc[group.product_id]) {
          acc[group.product_id] = [];
        }
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
      sellingTimeID: p.products.selling_time_id,
      _grab_category_id: p.products.grab_category_id,
      _grab_subcategory_id: p.products.grab_subcategory_id,
      modifierGroups: modifierGroupsByProductId[p.products.product_id] || [],
    }));

    const categoriesMap = items.reduce((acc, item) => {
      const catId = item._grab_category_id || "uncategorized";
      const subCatId = item._grab_subcategory_id || "uncategorized";

      if (!acc[catId]) {
        acc[catId] = {
          id: catId,
          name: "Nama Kategori dari Grab",
          subCategoriesMap: {},
        };
      }

      if (!acc[catId].subCategoriesMap[subCatId]) {
        acc[catId].subCategoriesMap[subCatId] = {
          id: subCatId,
          name: "Nama Subkategori dari Grab",
          items: [],
        };
      }

      delete item._grab_category_id;
      delete item._grab_subcategory_id;

      acc[catId].subCategoriesMap[subCatId].items.push(item);
      return acc;
    }, {});

    const categories = Object.values(categoriesMap).map((cat) => ({
      ...cat,
      subCategories: Object.values(cat.subCategoriesMap),
      subCategoriesMap: undefined,
    }));

    const sellingTimes = sellingTimesData.map((st) => ({
      id: st.id,
      name: st.name,
      serviceHours: st.service_hours,
      startTime: st.utc_start_time,
      endTime: st.utc_end_time,
    }));

    const finalMenuPayload = {
      merchantID,
      partnerMerchantID,
      currency: { code: "IDR", symbol: "Rp", exponent: 2 },
      sellingTimes,
      categories,
    };

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
      await supabase
        .from("products")
        .update({ price })
        .eq("product_id", itemId);
    }

    if (maxStock !== undefined) {
      await supabase
        .from("inventories")
        .update({ opname_stock: maxStock })
        .eq("product_id", itemId)
        .eq("branch_id", branchId);
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

    if (!response.ok)
      throw new Error("Panggilan update ke mock server Grab gagal.");

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
        await supabase
          .from("products")
          .update({ price: item.price })
          .eq("product_id", item.product_id);
      }

      if (item.maxStock !== undefined) {
        await supabase
          .from("inventories")
          .update({ opname_stock: item.maxStock })
          .eq("product_id", item.product_id)
          .eq("branch_id", branchId);
      }
    }

    console.log("Batch update ke Grab & database lokal berhasil.");
    res.status(200).json({ message: "Batch update processed successfully." });
  } catch (error) {
    console.error("Gagal melakukan batch update:", error);
    res.status(500).json({ message: error.message });
  }
};
