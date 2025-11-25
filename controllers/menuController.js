// controllers/menuController.js
import { supabase } from "../config/supabaseClient.js";

/**
 * Webhook Menu: Mengambil data dari DB. Jika kosong, kirim Dummy agar Simulator Grab Sukses.
 */
export const getMartMenu = async (req, res) => {
  const { partnerMerchantID, merchantID } = req.query;

  console.log(`[Menu] Request dari Grab. PartnerID: ${partnerMerchantID}`);

  try {
    // --- STEP 1: COBA AMBIL DATA ASLI DARI DB ---
    let internalBranchId = null;
    let branchName = "Kimia Farma";
    let productsData = [];
    let sellingTimesData = [];

    // Cari Branch ID Internal
    const { data: branch } = await supabase
      .from("branches")
      .select("branch_id, branch_name")
      .eq("grab_merchant_id", partnerMerchantID)
      .single();

    if (branch) {
      internalBranchId = branch.branch_id;
      branchName = branch.branch_name;

      // Ambil Produk
      const { data: products } = await supabase
        .from("inventories")
        .select(
          `
          opname_stock,
          products (
            product_id, product_name, price, description,
            grab_category_id, grab_subcategory_id
          )
        `
        )
        .eq("branch_id", internalBranchId);

      productsData = products || [];

      // Ambil Selling Times
      const { data: st } = await supabase
        .from("selling_times")
        .select("*")
        .eq("partner_merchant_id", String(internalBranchId));
      sellingTimesData = st || [];
    }

    // --- STEP 2: LOGIKA FALLBACK (JIKA DATA KOSONG/ERROR) ---
    // Jika Inventory Kosong, KITA PAKAI DUMMY DATA AGAR GRAB TIDAK ERROR
    if (productsData.length === 0) {
      console.warn(
        "[Menu] ⚠️ Data Kosong/Branch tidak ketemu. Mengirim MENU DUMMY."
      );

      // Dummy Selling Time
      sellingTimesData = [
        {
          id: "ST-DUMMY",
          name: "24 Jam",
          serviceHours: {
            mon: { openPeriodType: "OpenAllDay" },
            tue: { openPeriodType: "OpenAllDay" },
            wed: { openPeriodType: "OpenAllDay" },
            thu: { openPeriodType: "OpenAllDay" },
            fri: { openPeriodType: "OpenAllDay" },
            sat: { openPeriodType: "OpenAllDay" },
            sun: { openPeriodType: "OpenAllDay" },
          },
        },
      ];

      // Dummy Products (Pura-pura ada barang)
      productsData = [
        {
          opname_stock: 100,
          products: {
            product_id: "DUMMY-01",
            product_name: "Paracetamol 500mg (Tes)",
            price: 500000,
            description: "Obat pereda nyeri",
            grab_category_id: "CAT-OBAT",
            grab_subcategory_id: "SUB-OBAT-BEBAS",
          },
        },
      ];
    }

    // --- STEP 3: MAPPING DATA (DB atau DUMMY) KE FORMAT GRAB ---

    // 3a. Mapping Items
    const items = productsData.map((p) => ({
      id: String(p.products.product_id),
      name: p.products.product_name || "Item Tanpa Nama",
      description: p.products.description || "Deskripsi obat",
      price: Math.floor(Number(p.products.price) || 0), // Pastikan Integer
      availableStatus: p.opname_stock > 0 ? "AVAILABLE" : "UNAVAILABLE",
      maxStock: Math.floor(Number(p.opname_stock) || 0),
      photos: [],
      // Internal grouping fields
      _cat: p.products.grab_category_id || "CAT-UMUM",
      _sub: p.products.grab_subcategory_id || "SUB-LAINNYA",
    }));

    // 3b. Grouping Categories
    const categoriesMap = items.reduce((acc, item) => {
      const catId = item._cat;
      const subId = item._sub;

      if (!acc[catId])
        acc[catId] = { id: catId, name: catId, subCategoriesMap: {} };
      if (!acc[catId].subCategoriesMap[subId])
        acc[catId].subCategoriesMap[subId] = {
          id: subId,
          name: subId,
          items: [],
        };

      const { _cat, _sub, ...cleanItem } = item;
      acc[catId].subCategoriesMap[subId].items.push(cleanItem);
      return acc;
    }, {});

    const categories = Object.values(categoriesMap).map((cat) => ({
      id: cat.id,
      name: cat.name,
      subCategories: Object.values(cat.subCategoriesMap).map((sub) => ({
        id: sub.id,
        name: sub.name,
        items: sub.items,
      })),
    }));

    // 3c. Format Selling Times
    const sellingTimes = sellingTimesData.map((st) => ({
      id: st.id,
      name: st.name,
      serviceHours: st.service_hours,
    }));

    // Ambil ID selling time pertama untuk section
    const defaultST = sellingTimes[0]?.id || "ST-DUMMY";

    // --- STEP 4: BUNGKUS KE SECTIONS (WAJIB UTK OLD STRUCTURE) ---
    const sections = [
      {
        id: "SEC-MAIN",
        name: branchName || "Produk Utama",
        serviceHours: { id: defaultST },
        categories: categories,
      },
    ];

    // --- STEP 5: KIRIM RESPONSE ---
    const finalPayload = {
      merchantID,
      partnerMerchantID,
      currency: { code: "IDR", symbol: "Rp", exponent: 2 },
      sellingTimes,
      sections, // ✅ INI YANG DITUNGGU GRAB
    };

    res.status(200).json(finalPayload);
  } catch (error) {
    console.error("[Menu Error]", error);
    res
      .status(500)
      .json({ message: "Internal Server Error: " + error.message });
  }
};

export const updateSingleItem = async (req, res) => res.status(501).send();
export const batchUpdateItems = async (req, res) => res.status(501).send();
