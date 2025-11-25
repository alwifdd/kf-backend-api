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
    // 1. Ambil Data Branch
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

    const internalBranchId = branch.branch_id;

    // 2. Ambil Data Produk (Inventory)
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

    console.log(`[Menu] Ditemukan ${productsData.length} produk.`);

    if (productsData.length === 0) {
      console.warn(
        "[Menu] PERINGATAN: Tidak ada produk di inventaris. Menu akan kosong."
      );
    }

    // 3. Ambil Data Pendukung (Modifier & Selling Times)
    const productIds = productsData.map((p) => p.products.product_id);

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

    const { data: sellingTimesData, error: stError } = await supabase
      .from("selling_times")
      .select(`*`)
      .eq("partner_merchant_id", internalBranchId);

    if (stError) throw stError;

    // --- PENYUSUNAN ITEM ---

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
      description: p.products.description || "", // Deskripsi tidak boleh null/undefined
      price: p.products.price,
      availableStatus: p.opname_stock > 0 ? "AVAILABLE" : "UNAVAILABLE",
      maxStock: p.opname_stock,
      // Penting: Simpan properti ini untuk pengelompokan nanti
      _grab_category_id: p.products.grab_category_id || "CAT-DEFAULT",
      _grab_subcategory_id: p.products.grab_subcategory_id || "SUB-DEFAULT",
      modifierGroups: modifierGroupsByProductId[p.products.product_id] || [],
      photos: [],
    }));

    // --- MENYUSUN KATEGORI (STRUCTURE) ---
    const categoriesMap = items.reduce((acc, item) => {
      const catId = item._grab_category_id;
      const subCatId = item._grab_subcategory_id;

      if (!acc[catId]) {
        acc[catId] = {
          id: catId,
          name: catId === "HEALTH_MEDICINE" ? "Obat-obatan" : "Umum",
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

      // Clone item agar _grab_category_id tidak ikut terkirim di JSON akhir
      const { _grab_category_id, _grab_subcategory_id, ...cleanItem } = item;
      acc[catId].subCategoriesMap[subCatId].items.push(cleanItem);
      return acc;
    }, {});

    const categories = Object.values(categoriesMap).map((cat) => ({
      ...cat,
      subCategories: Object.values(cat.subCategoriesMap),
      subCategoriesMap: undefined, // Hapus helper property
    }));

    // --- FORMAT LAMA (SECTIONS) ---
    // GrabFood lama (bukan Mart) pakai 'sections' bukan 'categories'
    // Kita konversi Categories -> Sections
    const sections = Object.values(categoriesMap).map((cat) => {
      const allItemsInSection = Object.values(cat.subCategoriesMap).flatMap(
        (sub) => sub.items
      );

      // Ambil sellingTimeID dari item pertama, atau default dari DB
      const sectionSellingTimeID =
        allItemsInSection[0]?.sellingTimeID || sellingTimesData[0]?.id;

      return {
        id: cat.id,
        name: cat.name,
        serviceHours: {
          id: sectionSellingTimeID,
        },
        categories: Object.values(cat.subCategoriesMap).map((sub) => ({
          id: sub.id,
          name: sub.name,
          items: sub.items,
        })),
      };
    });

    // Format Selling Times (Jam Buka)
    const sellingTimes = sellingTimesData.map((st) => ({
      id: st.id,
      name: st.name,
      serviceHours: st.service_hours,
    }));

    // --- PAYLOAD FINAL ---
    const finalMenuPayload = {
      merchantID,
      partnerMerchantID,
      currency: { code: "IDR", symbol: "Rp", exponent: 2 },
      sellingTimes,
      categories, // Kirim format baru
      // sections,   // <-- SEMENTARA KITA MATIKAN DULU AGAR TIDAK BENTROK
    };

    // Log payload untuk debugging di Vercel Logs
    console.log(
      `[Menu] Mengirim menu ke Grab: ${JSON.stringify(finalMenuPayload)}`
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

export const updateSingleItem = async (req, res) => {
  res.status(501).json({ message: "Not implemented for live test" });
};

export const batchUpdateItems = async (req, res) => {
  res.status(501).json({ message: "Not implemented for live test" });
};
