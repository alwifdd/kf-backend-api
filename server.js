// server.js
import express from "express";
import cors from "cors";

// Import semua routes
import productRoutes from "./routes/productRoutes.js";
import inventoryRoutes from "./routes/inventoryRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import menuRoutes from "./routes/menuRoutes.js";
import webhookRoutes from "./routes/webhookRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import branchRoutes from "./routes/branchRoutes.js"; // ✅ Tambahan baru

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ Aktifkan CORS agar frontend bisa akses API
app.use(cors());

// ✅ Simpan raw body (dibutuhkan untuk validasi signature webhook Grab)
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);

// ✅ Route dasar (cek apakah API hidup)
app.get("/", (req, res) => {
  res.send("✅ API Kimia Farma - GrabMart Simulation is running!");
});

// ✅ Daftarkan semua route API
app.use("/api/products", productRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/menu", menuRoutes);
app.use("/api/webhooks", webhookRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/branches", branchRoutes); // ✅ Tambahan baru untuk daftar cabang

// ✅ Jalankan server
app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
