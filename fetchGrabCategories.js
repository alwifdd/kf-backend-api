// fetchGrabCategories.js
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

// 1. Setup Environment & Klien
dotenv.config();
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ✅ INI PERUBAHANNYA: Kita panggil mock server kita sendiri
const MOCK_GRAB_DOMAIN = "http://localhost:8080";
const COUNTRY_CODE = "ID"; // Tetap digunakan untuk query (meski mock server mengabaikannya)

/**
 * Fungsi untuk mengambil data kategori dari MOCK SERVER Grab
 */
async function fetchCategories() {
  console.log(`Mengambil kategori dari MOCK SERVER: ${MOCK_GRAB_DOMAIN}...`);

  // ✅ Panggil mock server, BUKAN server Grab asli
  // Kita tidak perlu token auth karena mock server kita tidak memerlukannya
  const response = await fetch(
    `${MOCK_GRAB_DOMAIN}/partner/v1/menu/categories?countryCode=${COUNTRY_CODE}`
  );

  const data = await response.json();
  if (!response.ok) {
    throw new Error("Gagal mengambil kategori dari MOCK SERVER.");
  }

  console.log(
    `Berhasil mendapat ${data.categories.length} kategori utama (dari mock).`
  );
  return data.categories;
}

/**
 * Fungsi untuk menyimpan kategori ke Supabase (FUNGSI INI SAMA, TIDAK BERUBAH)
 */
async function saveToSupabase(categories) {
  console.log("Menyimpan ke Supabase...");

  let allSubCategories = [];

  // 1. Siapkan data kategori utama
  const mainCategoriesData = categories.map((cat) => {
    // 2. Sambil looping, kumpulkan semua subkategori
    if (cat.subCategories && cat.subCategories.length > 0) {
      const subCats = cat.subCategories.map((sub) => ({
        id: sub.id,
        name: sub.name,
        category_id: cat.id, // Buat relasi ke kategori utamanya
      }));
      allSubCategories.push(...subCats);
    }

    return {
      id: cat.id,
      name: cat.name,
    };
  });

  // 3. Simpan kategori utama ke tabel 'grab_categories'
  console.log("Menghapus data kategori lama...");
  await supabase.from("grab_subcategories").delete().neq("id", "dummy"); // Hapus semua subkategori
  await supabase.from("grab_categories").delete().neq("id", "dummy"); // Hapus semua kategori utama

  console.log("Menyimpan kategori utama baru...");
  const { error: catError } = await supabase
    .from("grab_categories")
    .insert(mainCategoriesData);

  if (catError) throw catError;
  console.log(
    `Berhasil menyimpan ${mainCategoriesData.length} kategori utama.`
  );

  // 4. Simpan semua subkategori ke tabel 'grab_subcategories'
  console.log("Menyimpan subkategori baru...");
  const { error: subCatError } = await supabase
    .from("grab_subcategories")
    .insert(allSubCategories);

  if (subCatError) throw subCatError;
  console.log(`Berhasil menyimpan ${allSubCategories.length} subkategori.`);
}

// --- FUNGSI UTAMA UNTUK MENJALANKAN SKRIP ---
async function runSync() {
  try {
    // ✅ Tidak perlu ambil token lagi
    const categories = await fetchCategories();
    await saveToSupabase(categories);
    console.log("\n✅ Sinkronisasi Kategori Grab (dari Mock Server) Selesai!");
  } catch (error) {
    console.error("\n❌ GAGAL:", error.message);
  }
}

runSync();
