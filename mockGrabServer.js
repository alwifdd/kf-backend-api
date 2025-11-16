// mockGrabServer.js
import express from "express";

const app = express();
const PORT = 8080; // Kita jalankan di port yang berbeda (8080)

app.use(express.json());

// Endpoint palsu untuk Mark Order Ready
app.post("/partner/v1/orders/mark", (req, res) => {
  console.log("--- MOCK GRAB SERVER ---");
  console.log("Menerima panggilan untuk 'Mark Order Ready'!");
  console.log("Body Request:", req.body);
  console.log("Status: SUKSES");
  console.log("------------------------\n");
  res.status(204).send();
});

// Endpoint palsu untuk Check Order Cancellable
app.get("/partner/v1/order/cancelable", (req, res) => {
  console.log("--- MOCK GRAB SERVER ---");
  console.log("Menerima panggilan untuk 'Check Order Cancellable'!");

  const mockResponse = {
    cancelAble: true,
    cancelReasons: [
      { code: "1001", reason: "Items are unavailable" },
      { code: "1002", reason: "I have too many orders now" },
      { code: "1003", reason: "My shop is closed" },
    ],
  };

  console.log("Mengirim respons:", mockResponse);
  console.log("------------------------\n");
  res.status(200).json(mockResponse);
});

// Endpoint palsu untuk Cancel Order
app.put("/partner/v1/order/cancel", (req, res) => {
  console.log("--- MOCK GRAB SERVER ---");
  console.log("Menerima panggilan untuk 'Cancel Order'!");
  console.log("Body Request:", req.body);

  if (!req.body.cancelCode) {
    console.log("Status: GAGAL - cancelCode tidak ada.");
    return res
      .status(400)
      .json({ message: "Bad Request: cancelCode missing." });
  }

  console.log("Status: SUKSES");
  console.log("------------------------\n");
  res.status(200).json({ message: "Order cancellation request received." });
});

// ✅ TAMBAHKAN ENDPOINT BARU INI
// Endpoint palsu untuk List Mart Categories
app.get("/partner/v1/menu/categories", (req, res) => {
  console.log("--- MOCK GRAB SERVER ---");
  console.log("Menerima panggilan untuk 'List Mart Categories'!");

  // Data kategori DUMMY
  const mockCategoriesResponse = {
    categories: [
      {
        id: "CAT-OBAT",
        name: "Obat-obatan",
        subCategories: [
          { id: "SUB-OBAT-RESEP", name: "Obat Resep" },
          { id: "SUB-OBAT-BEBAS", name: "Obat Bebas" },
          { id: "SUB-OBAT-FLU", name: "Obat Flu & Batuk" },
        ],
      },
      {
        id: "CAT-VITAMIN",
        name: "Vitamin & Suplemen",
        subCategories: [
          { id: "SUB-VITAMIN-DEWASA", name: "Vitamin Dewasa" },
          { id: "SUB-VITAMIN-ANAK", name: "Vitamin Anak" },
        ],
      },
      {
        id: "CAT-ALKES",
        name: "Alat Kesehatan",
        subCategories: [
          { id: "SUB-ALKES-P3K", name: "P3K (Kotak Obat, Plester)" },
          { id: "SUB-ALKES-DIAGNOSTIK", name: "Alat Diagnostik" },
        ],
      },
    ],
  };

  console.log("Mengirim respons kategori dummy...");
  console.log("------------------------\n");
  res.status(200).json(mockCategoriesResponse);
});

// Endpoint palsu untuk Update Menu Record (satu item)
app.put("/partner/v1/menu", (req, res) => {
  console.log("--- MOCK GRAB SERVER ---");
  console.log("Menerima panggilan untuk 'Update Menu Record' (satu item)!");
  console.log("Body Request:", req.body);
  console.log("Status: SUKSES");
  console.log("------------------------\n");
  res.status(204).send();
});

// --- ENDPOINT UNTUK BATCH UPDATE DENGAN LOGIKA PENGECEKAN ---
app.put("/partner/v1/batch/menu", (req, res) => {
  console.log("--- MOCK GRAB SERVER ---");
  console.log("Menerima panggilan untuk 'Batch Update Menu'!");

  const items = req.body.menuEntities;

  if (!items || !Array.isArray(items)) {
    return res.status(400).json({ message: "Invalid parameter" });
  }

  // Periksa aturan maksimum 200 item
  if (items.length > 200) {
    console.log(`Status: GAGAL - Terlalu banyak item (${items.length})`);
    console.log("------------------------\n");
    // Sesuai dokumentasi, kirim error 400
    return res
      .status(400)
      .json({ message: "Batch update menu support at most 200 items" });
  }

  console.log(`Status: SUKSES - Menerima ${items.length} item untuk diupdate.`);
  console.log("------------------------\n");
  res.status(200).json({ status: "success" });
});

app.listen(PORT, () => {
  console.log(`[Mock Grab Server] berjalan di http://localhost:${PORT}`);
});
