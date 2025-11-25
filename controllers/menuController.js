// controllers/menuController.js

// KITA TIDAK IMPORT SUPABASE DULU AGAR TIDAK ADA ERROR KONEKSI
// import { supabase } from "../config/supabaseClient.js";

export const getMartMenu = async (req, res) => {
  const { partnerMerchantID, merchantID } = req.query;

  console.log(`[FORCE DUMMY] Request Menu untuk: ${partnerMerchantID}`);

  // 1. DATA STATIS (HARDCODED)
  // Ini persis format yang diminta Grab (Old Structure / Section Based)

  const hardcodedResponse = {
    merchantID: merchantID || "MERCHANT-ERR",
    partnerMerchantID: partnerMerchantID || "KFA1",
    currency: {
      code: "IDR",
      symbol: "Rp",
      exponent: 2,
    },
    sellingTimes: [
      {
        id: "ST-24JAM",
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
    ],
    sections: [
      {
        id: "SEC-UTAMA",
        name: "Produk Apotek (Tes)",
        serviceHours: {
          id: "ST-24JAM",
        },
        categories: [
          {
            id: "CAT-OBAT",
            name: "Obat-obatan",
            subCategories: [
              {
                id: "SUB-OBAT-BEBAS",
                name: "Obat Bebas",
                items: [
                  {
                    id: "ITEM-TEST-01",
                    name: "Paracetamol 500mg",
                    description: "Pereda nyeri",
                    price: 500000, // Rp 5.000
                    availableStatus: "AVAILABLE",
                    maxStock: 100,
                    photos: [],
                    modifierGroups: [],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  // Kirim langsung
  res.status(200).json(hardcodedResponse);
};

// Placeholder handler agar tidak error saat di-import di routes
export const updateSingleItem = async (req, res) => res.status(200).json({});
export const batchUpdateItems = async (req, res) => res.status(200).json({});
