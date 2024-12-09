const db = require("./db");

async function testConnection() {
  try {
    const [rows] = await db.query("SELECT 1+1 AS solution");
    console.log("Connected : ", rows[0].solution);
  } catch (error) {
    console.error("Failed:", error);
  }
}

testConnection();
