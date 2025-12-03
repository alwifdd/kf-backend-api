// controllers/menuController.js
import { supabase } from "../config/supabaseClient.js";

export const getMartMenu = async (req, res) => {
  const { partnerMerchantID, merchantID } = req.query;

  console.log(`[Menu] Request masuk. PartnerID: ${partnerMerchantID}`);

  try {
    // 1. Cari Branch ID Internal
    const { data: branch } = await supabase
      .from("branches")
      .select("branch_id, branch_name")
      .eq("grab_merchant_id", partnerMerchantID)
      .single();

    // Fallback jika branch tidak ketemu (untuk testing)
    const internalBranchId = branch ? branch.branch_id : null;
    const branchName = branch ? branch.branch_name : "Apotek Kimia Farma";

    // 2. Ambil Data Produk (Inventory)
    let productsData = [];
    if (internalBranchId) {
      const { data } = await supabase
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
      productsData = data || [];
    }

    // 3. Ambil Selling Times dari DB
    let dbSellingTimes = [];
    if (internalBranchId) {
      const { data } = await supabase
        .from("selling_times")
        .select("*")
        .eq("partner_merchant_id", String(internalBranchId));
      dbSellingTimes = data || [];
    }

    // --- LOGIKA MAPPING & FIXING DATA ---

    // A. FIX SELLING TIMES (Wajib Ada)
    let finalSellingTimes = [];
    if (dbSellingTimes && dbSellingTimes.length > 0) {
      finalSellingTimes = dbSellingTimes.map((st) => ({
        id: st.id,
        name: st.name,
        serviceHours: st.service_hours,
      }));
    } else {
      // Default 24 Jam jika belum diset
      finalSellingTimes = [
        {
          id: "ST-DEFAULT",
          name: "Buka 24 Jam",
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
    }

    // Ambil ID selling time pertama sebagai default untuk item
    const defaultSellingTimeID = finalSellingTimes[0].id;

    // B. FIX ITEMS MAPPING
    let items = [];
    if (productsData && productsData.length > 0) {
      items = productsData.map((p) => ({
        id: String(p.products.product_id),
        name: p.products.product_name || "Item Tanpa Nama",
        description: p.products.description || "Deskripsi obat",

        // ⚠️ HARGA MINOR UNIT (IDR Exponent 2 -> Harga x 100)
        price: Math.floor((Number(p.products.price) || 0) * 100),

        availableStatus: p.opname_stock > 0 ? "AVAILABLE" : "UNAVAILABLE",
        maxStock: Math.floor(Number(p.opname_stock) || 0),
        photos: [], // Isi URL foto jika ada di DB

        // Default Kategori Resmi Grab (Fallback ID)
        // Sebaiknya pastikan grab_category_id di DB sudah terisi ID valid dari Grab
        _cat: p.products.grab_category_id || "IDITEDP20220629083236010281",
        _sub: p.products.grab_subcategory_id || "IDITEDP20220701092521017633",

        sellingTimeID: defaultSellingTimeID,
      }));
    } else {
      // DUMMY ITEM (Jika inventory kosong)
      items = [
        {
          id: "DUMMY-01",
          name: "Paracetamol (Contoh)",
          description: "Item contoh untuk testing integrasi",
          price: 500000, // Rp 5.000
          availableStatus: "AVAILABLE",
          maxStock: 100,
          photos: [],
          _cat: "IDITEDP20220629083236010281",
          _sub: "IDITEDP20220701092521017633",
          sellingTimeID: defaultSellingTimeID,
        },
      ];
    }

    // C. GROUPING CATEGORIES & SUBCATEGORIES
    const categoriesMap = items.reduce((acc, item) => {
      const catId = item._cat;
      const subId = item._sub;

      // Inisialisasi Kategori jika belum ada
      if (!acc[catId]) {
        acc[catId] = {
          id: catId,
          name: "Category Name (Update DB)", // Sebaiknya ambil nama kategori dari tabel master
          subCategoriesMap: {},
        };
      }

      // Inisialisasi Subkategori jika belum ada
      if (!acc[catId].subCategoriesMap[subId]) {
        acc[catId].subCategoriesMap[subId] = {
          id: subId,
          name: "Subcategory Name (Update DB)", // Sebaiknya ambil nama subkategori dari tabel master
          items: [],
        };
      }

      // Bersihkan properti helper (_cat, _sub) sebelum push ke items
      const { _cat, _sub, ...cleanItem } = item;
      acc[catId].subCategoriesMap[subId].items.push(cleanItem);

      return acc;
    }, {});

    // Transform Map ke Array sesuai struktur Grab
    const categories = Object.values(categoriesMap).map((cat) => ({
      id: cat.id,
      name: cat.name, // Nama kategori (bisa disesuaikan jika ada mapping nama)
      subCategories: Object.values(cat.subCategoriesMap).map((sub) => ({
        id: sub.id,
        name: sub.name, // Nama subkategori
        items: sub.items,
      })),
    }));

    // --- FINAL RESPONSE (Format Baru: Item Selling Time Menu) ---
    // Struktur 'sections' sudah dihapus karena deprecated.
    const finalPayload = {
      merchantID,
      partnerMerchantID,
      currency: { code: "IDR", symbol: "Rp", exponent: 2 },
      sellingTimes: finalSellingTimes,
      categories: categories, // <-- Langsung di root object
    };

    res.status(200).json(finalPayload);
  } catch (error) {
    console.error("[Menu Error]", error);
    res.status(500).json({ message: error.message });
  }
};

// Placeholder fungsi update (belum diimplementasikan penuh)
export const updateSingleItem = async (req, res) => res.status(200).json({});
export const batchUpdateItems = async (req, res) => res.status(200).json({});
