// controllers/branchController.js
import { supabase } from "../config/supabaseClient.js";

/**
 * (UPDATE) Ambil daftar cabang berdasarkan role:
 * - Super Admin: Ambil semua.
 * - Bisnis Manager: Ambil semua cabang dari 'area_kota' dia.
 * - Admin Cabang: (Seharusnya tidak memanggil ini, tapi kita amankan)
 */
export const getAllBranches = async (req, res) => {
  try {
    // Middleware 'protect' sudah ada di rute ini (akan kita tambahkan)
    const { role, area } = req.user;

    let query = supabase.from("branches").select("*");

    if (role === "bisnis_manager" && area) {
      // --- ALUR BISNIS MANAGER ---
      console.log(`Filter cabang untuk Bisnis Manager, area: ${area}`);
      query = query.eq("kota", area); // <-- Filter cabang berdasarkan 'kota'
    } else if (role === "superadmin") {
      // --- ALUR SUPER ADMIN ---
      console.log("Superadmin meminta data, tampilkan semua cabang.");
      // Tidak ada filter
    } else {
      // Role lain (seperti Admin Cabang) tidak seharusnya mengambil semua cabang
      console.log(`Role ${role} tidak diizinkan mengambil semua cabang.`);
      return res.status(403).json({ message: "Akses ditolak." });
    }

    // Urutkan berdasarkan kota
    query = query.order("kota");

    const { data, error } = await query;
    if (error) throw error;

    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/* =====================================================
  TAMBAHAN BARU UNTUK FILTER SUPERADMIN
=====================================================
*/

/**
 * [BARU] [Super Admin] Mengambil daftar semua Bisnis Manager.
 * Kita ambil dari tabel 'users' yang rolenya 'bisnis_manager'.
 */
export const getListBMs = async (req, res) => {
  // Hanya Super Admin yang boleh akses ini
  if (req.user.role !== "superadmin") {
    console.log(`Akses ditolak: role ${req.user.role} mencoba ambil list BM`);
    return res.status(403).json({ message: "Akses ditolak." });
  }

  try {
    console.log("Superadmin mengambil daftar Bisnis Manager...");
    const { data, error } = await supabase
      .from("users")
      .select("id, username, area_kota")
      .eq("role", "bisnis_manager")
      .not("area_kota", "is", null) // (FIX) Pastikan BM punya area_kota
      .order("area_kota", { ascending: true });

    if (error) throw error;

    console.log(`Ditemukan ${data.length} Bisnis Manager.`);
    res.status(200).json(data);
  } catch (error) {
    console.error("Gagal mengambil list BM:", error.message);
    res.status(500).json({ message: error.message });
  }
};

/**
 * [BARU] [Super Admin] Mengambil daftar cabang berdasarkan Area (Kota).
 * Ini dipakai untuk dropdown kedua Super Admin (setelah BM dipilih).
 */
export const getBranchesByArea = async (req, res) => {
  // Hanya Super Admin yang boleh akses ini
  if (req.user.role !== "superadmin") {
    return res.status(403).json({ message: "Akses ditolak." });
  }

  const { area } = req.query; // e.g., ?area=Ambon

  if (!area) {
    return res
      .status(400)
      .json({ message: "Parameter 'area' (kota) dibutuhkan." });
  }

  try {
    console.log(`Superadmin mengambil cabang untuk area: ${area}`);
    const { data, error } = await supabase
      .from("branches")
      .select("branch_id, branch_name, kota")
      .eq("kota", area)
      .order("branch_name", { ascending: true });

    if (error) throw error;

    console.log(`Ditemukan ${data.length} cabang di ${area}.`);
    res.status(200).json(data);
  } catch (error) {
    console.error(`Gagal mengambil cabang by area (${area}):`, error.message);
    res.status(500).json({ message: error.message });
  }
};
