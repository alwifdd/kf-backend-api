// controllers/productController.js
import { supabase } from "../config/supabaseClient.js";

export const getAllProducts = async (req, res) => {
  try {
    const { data, error } = await supabase.from("products").select("*");

    if (error) throw error;

    res.status(200).json({
      status: "success",
      data: data,
    });
  } catch (error) {
    res.status(500).json({
      status: "fail",
      message: error.message,
    });
  }
};
