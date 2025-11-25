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
      .select("branch_id, branch_name") // Ambil branch_name juga untuk nama Section
      .eq("grab_merchant_id", partnerMerchantID)
      .single();

    if (branchError || !branch) {
      throw new Error(
        `[Menu Generation] GAGAL: Cabang dengan grab_merchant_id ${partnerMerchantID} tidak ditemukan.`
      );
    }

    const internalBranchId = branch.branch_id;
    const branchName = branch.branch_name || "General Section";

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

    // Ambil Modifier Groups
    const { data: modifierGroupsData } = await supabase
      .from("modifier_groups")
      .select(`*`)
      .in("product_id", productIds);

    const modifierGroupIds = modifierGroupsData
      ? modifierGroupsData.map((mg) => mg.id)
      : [];

    // Ambil Modifiers
    const { data: modifiersData } = await supabase
      .from("modifiers")
      .select(`*`)
      .in("modifier_group_id", modifierGroupIds);

    // Ambil Selling Times
    const { data: sellingTimesData, error: stError } = await supabase
      .from("selling_times")
      .select(`*`)
      .eq("partner_merchant_id", String(internalBranchId)); // Pastikan tipe data cocok

    if (stError) throw stError;

    // --- 4. PENYUSUNAN DATA (MAPPING) ---

    // Helper: Map Modifiers by Group ID
    const modifiersByGroupId = (modifiersData || []).reduce((acc, modifier) => {
      if (!acc[modifier.modifier_group_id])
        acc[modifier.modifier_group_id] = [];

      acc[modifier.modifier_group_id].push({
        id: modifier.id,
        name: modifier.name,
        price: modifier.price,
        availableStatus: modifier.available_status,
        // Grab kadang butuh barcode/SKU di modifier juga, opsional:
        // barcode: modifier.id
      });
      return acc;
    }, {});

    // Helper: Map Modifier Groups by Product ID
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

    // Helper: Construct Items
    const items = productsData.map((p) => ({
      id: p.products.product_id,
      name: p.products.product_name,
      description: p.products.description || "",
      price: p.products.price,
      // Logika Stok Kimia Farma: Jika opname_stock > 0, maka AVAILABLE
      availableStatus: p.opname_stock > 0 ? "AVAILABLE" : "UNAVAILABLE",
      maxStock: p.opname_stock,

      // Field internal untuk grouping (tidak dikirim ke Grab)
      _grab_category_id: p.products.grab_category_id || "CAT-DEFAULT",
      _grab_subcategory_id: p.products.grab_subcategory_id || "SUB-DEFAULT",

      modifierGroups: modifierGroupsByProductId[p.products.product_id] || [],
      photos: [], // Isi URL foto jika ada di database
    }));

    // --- 5. MENYUSUN KATEGORI (Grouping) ---
    const categoriesMap = items.reduce((acc, item) => {
      const catId = item._grab_category_id;
      const subCatId = item._grab_subcategory_id;

      // Buat Kategori jika belum ada
      if (!acc[catId]) {
        acc[catId] = {
          id: catId,
          name: catId === "CAT-OBAT" ? "Obat-obatan" : catId, // Mapping nama cantik bisa diperluas
          subCategoriesMap: {},
        };
      }

      // Buat Sub-Kategori jika belum ada
      if (!acc[catId].subCategoriesMap[subCatId]) {
        acc[catId].subCategoriesMap[subCatId] = {
          id: subCatId,
          name: subCatId === "SUB-DEFAULT" ? "Lainnya" : subCatId,
          items: [],
        };
      }

      // Bersihkan properti internal sebelum push ke items
      const { _grab_category_id, _grab_subcategory_id, ...cleanItem } = item;
      acc[catId].subCategoriesMap[subCatId].items.push(cleanItem);

      return acc;
    }, {});

    // Konversi Map ke Array 'categories' sesuai standar Grab
    const categories = Object.values(categoriesMap).map((cat) => ({
      id: cat.id,
      name: cat.name,
      subCategories: Object.values(cat.subCategoriesMap).map((sub) => ({
        id: sub.id,
        name: sub.name,
        items: sub.items,
      })),
    }));

    // --- 6. FORMAT SELLING TIMES ---
    const sellingTimes = sellingTimesData.map((st) => ({
      id: st.id,
      name: st.name,
      serviceHours: st.service_hours, // Pastikan format JSONB di DB sudah sesuai spek Grab
    }));

    // --- 7. MENYUSUN STRUCTURE FINAL (SECTION BASED) ---
    // Karena setting di Grab Portal adalah "Old Structure (Section Based)",
    // Kita harus membungkus 'categories' ke dalam 'sections'.

    // Ambil ID selling time default (jika ada), atau gunakan fallback string
    const defaultSellingTimeID = sellingTimes[0]?.id || "ST-DEFAULT";

    const sections = [
      {
        id: "SEC-MAIN",
        name: branchName, // Nama section bisa pakai nama toko
        serviceHours: {
          id: defaultSellingTimeID,
        },
        categories: categories, // Masukkan array categories yang sudah dibuat di atas
      },
    ];

    // --- 8. PAYLOAD FINAL ---
    const finalMenuPayload = {
      merchantID,
      partnerMerchantID,
      currency: { code: "IDR", symbol: "Rp", exponent: 2 },
      sellingTimes,
      // categories, // ❌ JANGAN kirim ini di root level untuk Section Based
      sections, // ✅ Kirim ini karena settingan Grab kamu "Old Structure"
    };

    // Log payload untuk debugging (Opsional, matikan di production jika terlalu besar)
    // console.log(`[Menu] Mengirim menu ke Grab: ${JSON.stringify(finalMenuPayload)}`);

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
