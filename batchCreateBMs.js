import bcrypt from "bcrypt";
import dotenv from "dotenv";
import { supabase } from "./config/supabaseClient.js";

// --- KONFIGURASI ---
const DEFAULT_PASSWORD = "bm_password_123"; // Ganti ini dengan password default yang kamu mau
const SALT_ROUNDS = 10;
const BM_ROLE = "bisnis_manager";
// ---------------------

/**
 * Fungsi ini akan mengambil semua KOTA UNIK dari tabel 'branches'
 */
async function getUniqueCities() {
  console.log("Mengambil daftar kota unik dari tabel 'branches'...");

  // Kita menggunakan 'rpc' (Remote Procedure Call) untuk memanggil fungsi SQL 'DISTINCT'
  const { data, error } = await supabase.rpc("get_unique_cities");

  if (error) {
    console.error("Error saat mengambil kota unik:", error.message);
    // Fallback jika fungsi 'get_unique_cities' belum ada
    if (error.message.includes("does not exist")) {
      console.log(
        "Fungsi 'get_unique_cities' tidak ditemukan. Membuat query manual..."
      );
      const { data: manualData, error: manualError } = await supabase
        .from("branches")
        .select("kota");

      if (manualError) throw manualError;

      // Buat daftar unik secara manual
      const uniqueCities = [
        ...new Set(manualData.map((branch) => branch.kota)),
      ];
      return uniqueCities.filter((city) => city != null); // Filter null
    }
    throw error;
  }

  // Data dari RPC adalah array of objects, e.g., [{ "kota": "Ambon" }, { "kota": "Balikpapan" }]
  const cities = data.map((item) => item.kota).filter((city) => city != null); // Filter null
  return cities;
}

/**
 * Fungsi utama untuk membuat semua BM
 */
async function batchCreateBMs() {
  console.log("Memulai skrip batch create Bisnis Manager...");

  try {
    // 1. Ambil semua kota unik
    const uniqueCities = await getUniqueCities();

    if (!uniqueCities || uniqueCities.length === 0) {
      console.log("Tidak ada data kota ditemukan. Berhenti.");
      return;
    }

    console.log(`Ditemukan ${uniqueCities.length} kota unik. Memproses...`);
    console.log(uniqueCities.join(", ")); // Tampilkan daftar kota

    // 2. Buat hash password default (hanya sekali)
    console.log(
      `Membuat hash untuk password default: "${DEFAULT_PASSWORD}"...`
    );
    const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, SALT_ROUNDS);

    // 3. Siapkan data user baru untuk setiap kota
    const newBMUsers = [];
    for (const city of uniqueCities) {
      // Membuat username unik, e.g., "bm_ambon"
      const cleanCity = city.toLowerCase().replace(/[^a-z0-9]/g, "");
      const username = `bm_${cleanCity}`;

      const newUser = {
        username: username,
        password: hashedPassword,
        role: BM_ROLE,
        branch_id: null, // BM tidak terikat 1 cabang
        area_kota: city, // Tautkan ke area kota
      };

      newBMUsers.push(newUser);
    }

    console.log(`Siap memasukkan ${newBMUsers.length} Bisnis Manager baru...`);

    // 4. Masukkan semua user baru ke tabel 'users' dalam satu batch
    const { error: insertError } = await supabase
      .from("users")
      .insert(newBMUsers);

    if (insertError) {
      console.error("Gagal memasukkan data user:", insertError.message);
      if (insertError.message.includes("duplicate key")) {
        console.error(
          "Error: Kemungkinan skrip ini sudah pernah dijalankan. Ada username duplikat."
        );
      }
      throw insertError;
    }

    console.log(
      `\n✅ BERHASIL! ${newBMUsers.length} akun Bisnis Manager telah dibuat.`
    );
    console.log(`Password default untuk semua akun: "${DEFAULT_PASSWORD}"`);
  } catch (error) {
    console.error("\n❌ Terjadi kesalahan:", error.message);
  }
}

// Panggil fungsi utamanya
batchCreateBMs();
