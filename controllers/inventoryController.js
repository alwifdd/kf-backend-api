// controllers/inventoryController.js
import { supabase } from "../config/supabaseClient.js";

export const getInventoryByBranch = async (req, res) => {
  try {
    // 1. Ambil ID cabang dari parameter URL
    const { branch_id } = req.params;

    // 2. Lakukan query ke Supabase
    const { data, error } = await supabase
      .from("inventories")
      .select(
        `
        opname_stock, 
        products (
          product_id,
          product_name,
          price
        )
      `
      )
      .eq("branch_id", branch_id); // Di mana branch_id-nya cocok

    if (error) throw error;

    // 3. Kirim data yang ditemukan sebagai respons
    res.status(200).json({
      status: "success",
      branch_id: branch_id,
      data: data,
    });
  } catch (error) {
    res.status(500).json({
      status: "fail",
      message: error.message,
    });
  }
};
