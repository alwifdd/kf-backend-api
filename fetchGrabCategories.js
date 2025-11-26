// fetchGrabCategories.js
import dotenv from "dotenv";
dotenv.config();

// --- KONFIGURASI URL ---
// Kita coba URL Production karena kamu pakai Client ID Production
// Dokumentasi Hal 45: GET /partner/v1/menu/categories
const GRAB_AUTH_URL = "https://partner-api.grab.com/grabid/v1/oauth2/token";
const GRAB_CAT_URL =
  "https://partner-api.grab.com/grabmart-sandbox/partner/v1/menu/categories?countryCode=ID";

const getGrabToken = async () => {
  console.log("1. Meminta Token...");
  const response = await fetch(GRAB_AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      // Pastikan variabel .env ini benar-benar ada isinya
      client_id:
        process.env.GRAB_CLIENT_ID_PRODUCTION || process.env.GRAB_CLIENT_ID,
      client_secret:
        process.env.GRAB_CLIENT_SECRET_PRODUCTION ||
        process.env.GRAB_CLIENT_SECRET,
      grant_type: "client_credentials",
      scope: "mart.partner_api",
    }),
  });

  const text = await response.text();
  console.log("   Status Token:", response.status);

  if (!response.ok) {
    throw new Error(`Gagal dapat token: ${text}`);
  }

  const data = JSON.parse(text);
  return data.access_token;
};

const fetchCategories = async () => {
  try {
    const token = await getGrabToken();
    console.log("   Token berhasil didapat.");

    console.log("2. Mengambil Daftar Kategori ke:", GRAB_CAT_URL);
    const response = await fetch(GRAB_CAT_URL, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    console.log("   Status Response:", response.status);
    const text = await response.text(); // Ambil teks mentah dulu
    console.log("   Isi Response:", text || "(KOSONG)");

    if (response.ok && text) {
      const data = JSON.parse(text);
      console.log("\n✅ DAFTAR KATEGORI DITEMUKAN:");
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.log("\n❌ GAGAL MENGAMBIL KATEGORI.");
      console.log("Coba cek apakah Token Production bisa akses URL Sandbox?");
    }
  } catch (error) {
    console.error("\n❌ ERROR:", error.message);
  }
};

fetchCategories();
