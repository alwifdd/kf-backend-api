import bcrypt from "bcrypt";
import dotenv from "dotenv";
import { supabase } from "./config/supabaseClient.js";

// --- KONFIGURASI ---
const DEFAULT_PASSWORD = "123456"; // Ganti ini dengan password default yang kamu mau
const SALT_ROUNDS = 10;
const ADMIN_ROLE = "admin_cabang";
// ---------------------

async function batchCreateAdmins() {
  console.log("Memulai skrip batch create admin...");

  try {
    // 1. Ambil semua cabang dari database
    console.log("Mengambil data semua cabang dari Supabase...");
    const { data: branches, error: branchError } = await supabase
      .from("branches")
      .select("branch_id, branch_name, kota");

    if (branchError) throw branchError;
    if (!branches || branches.length === 0) {
      console.log("Tidak ada data cabang ditemukan. Berhenti.");
      return;
    }

    console.log(`Ditemukan ${branches.length} cabang. Memproses...`);

    // 2. Buat hash password default (hanya sekali)
    console.log(
      `Membuat hash untuk password default: "${DEFAULT_PASSWORD}"...`
    );
    const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, SALT_ROUNDS);

    // 3. Siapkan data user baru untuk setiap cabang
    const newUsers = [];
    for (const branch of branches) {
      // Membuat username unik, e.g., "admin_ambon_49260"
      // Kita bersihkan nama kota agar aman untuk username
      const cleanKota = branch.kota.toLowerCase().replace(/[^a-z0-9]/g, "");
      const username = `admin_${cleanKota}_${branch.branch_id}`;

      const newUser = {
        username: username,
        password: hashedPassword,
        role: ADMIN_ROLE,
        branch_id: branch.branch_id,
      };

      newUsers.push(newUser);
    }

    console.log(`Siap memasukkan ${newUsers.length} admin cabang baru...`);

    // 4. Masukkan semua user baru ke tabel 'users' dalam satu batch
    const { error: insertError } = await supabase
      .from("users")
      .insert(newUsers);

    if (insertError) {
      console.error("Gagal memasukkan data user:", insertError.message);
      // Cek jika error-nya karena username duplikat
      if (insertError.message.includes("duplicate key")) {
        console.error(
          "Error: Kemungkinan skrip ini sudah pernah dijalankan. Ada username duplikat."
        );
      }
      throw insertError;
    }

    console.log(
      `\n✅ BERHASIL! ${newUsers.length} akun admin cabang telah dibuat.`
    );
    console.log(`Password default untuk semua akun: "${DEFAULT_PASSWORD}"`);
  } catch (error) {
    console.error("\n❌ Terjadi kesalahan:", error.message);
  }
}

// Panggil fungsi utamanya
batchCreateAdmins();
