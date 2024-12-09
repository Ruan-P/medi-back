const express = require("express");
const axios = require("axios");
const cors = require("cors");
const dotenv = require("dotenv");
const { OAuth2Client } = require("google-auth-library");
const mariadb = require("mariadb");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const pool = mariadb.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
});

app.post("/api/auth/google", async (req, res) => {
  const { token } = req.body;
  try {
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const userId = payload["sub"];

    let conn;
    try {
      conn = await pool.getConnection();
      await conn.query(
        "INSERT INTO users (google_id, email, name) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE email = ?, name = ?",
        [userId, payload.email, payload.name, payload.email, payload.name]
      );
      res.json({
        message: "User authenticated",
        user: {
          id: userId,
          email: payload.email,
          name: payload.name,
        },
      });
    } finally {
      if (conn) conn.release();
    }
  } catch (error) {
    console.error("Error verifying Google token:", error);
    res.status(401).json({ error: "Invalid token" });
  }
});

app.post("/api/medicine/search", async (req, res) => {
  console.log("의약품 검색 : ", req.body);
  const searchTerm = {
    it_name: req.body.it_name,
    cp_name: req.body.cp_name,
  };
  const searchOpenAPI = async (term) => {
    const apiKey = process.env.GOV_DECODED_ID;
    const url = process.env.GOV_DRUG_API_LINK;
    let params = "";

    if (term.cp_name !== "") {
      params = {
        serviceKey: apiKey,
        item_name: term.it_name,
        entp_name: term.cp_name,
        type: "json",
        pageNo: 1,
        numOfRows: 3,
      };
    } else if (term.cp_name === "") {
      params = {
        serviceKey: apiKey,
        item_name: term.it_name,
        type: "json",
        pageNo: 1,
        numOfRows: 3,
      };
    }

    const response = await axios.get(url, { params });
    return response.data.body.items;
  };

  try {
    const apiResults = await searchOpenAPI(searchTerm);
    // await saveToDatabase_med(apiResults, userId, searchTerm.it_name);
    res.status(200).json({
      success: "데이터 요청 성공",
      item: apiResults,
    });
  } catch (error) {
    res.status(500).json({ error: "검색 중 오류 발생" });
  }
});

app.post("/api/medicine/save", async (req, res) => {
  console.log("의약품 데이터 추가  : ", req.body);
  const dataSet = req.body;

  const saveToDatabase_med = async (d) => {
    let conn;
    try {
      conn = await pool.getConnection();
      const query = `
      INSERT INTO drug_data (
        item_sn, drug_name, comp_name, type, item_image, class_name, google_id, al_b, al_l, al_d
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE 
        drug_name = VALUES(drug_name),
        comp_name = VALUES(comp_name),
        type = VALUES(type),
        item_image = VALUES(item_image),
        class_name = VALUES(class_name),
        google_id = VALUES(google_id),
        al_b = VALUES(al_b),
        al_l = VALUES(al_l),
        al_d = VALUES(al_d);
    `;
      const result = await conn.query(query, [
        d.item_sn,
        d.drug_name,
        d.comp_name,
        d.type,
        d.item_image,
        d.class_name,
        d.userID,
        d.al_b,
        d.al_l,
        d.al_d,
      ]);
      if (result.affectedRows == 0) {
        console.log(
          `Data not affected due to [ ${values.ITEM_SEQ} ]linked your id [ ${values.id} ] is already exists. Skipped`
        );
      }
      console.log("Data saved successfully");
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") {
      } else {
        console.error(error);
        throw error;
      }
    } finally {
      if (conn) conn.release;
    }
  };

  try {
    await saveToDatabase_med(dataSet);
    res.status(200).json({
      success: "데이터 제거 성공",
    });
  } catch (error) {
    res.status(500).json({ error: "요청이 거부됨" });
  }
});

app.post("/api/medicine/delete", async (req, res) => {
  console.log("의약품 삭제 : ", req.body);
  const userId = req.body.userId;
  const queryTerm = req.body.it_name;

  const deleteToDatabase = async (userId, queryTerm) => {
    let conn = await pool.getConnection();
    try {
      const query =
        "DELETE FROM drug_data WHERE google_id = ? AND searched_text LIKE ?";
      const result = await conn.query(query, [userId, `%${queryTerm}%`]);
      if (result.affectedRows == 0) {
        console.error("Remove Data Error", error);
      }
    } catch (error) {
      console.error("Remove Data Error : ", error);
    } finally {
      if (conn) conn.release();
    }
  };
  try {
    await deleteToDatabase(userId, queryTerm);
    res.status(200).json({
      success: "데이터 제거 성공",
    });
  } catch (error) {
    res.status(500).json({ error: "요청이 거부됨" });
  }
});

app.post("/api/medicine/status", async (req, res) => {
  console.log("의약품 조회 : ", req.body);
  const userID = req.body.userID;
  let conn;
  const getDataFromDB_med = async (id) => {
    let conn;
    conn = await pool.getConnection();
    try {
      const query =
        "SELECT drug_name, comp_name, type, class_name, item_image, al_b, al_l, al_d FROM drug_data WHERE google_id = ? ORDER BY item_sn ASC";
      const result = await conn.query(query, id);
      console.log(result);

      if (result.affectedRows == 0) {
        console.error("Data GET Error : ", error);
        throw error;
      } else if (result.length == 0) {
        const ret = "No data to fetch";
        throw ret;
      }
      return result;
    } catch (error) {
      throw error;
    } finally {
      if (conn) conn.release;
    }
  };

  try {
    const result = await getDataFromDB_med(userID);
    res.status(200).json({
      success: "데이터 요청 성공",
      items: result,
    });
  } catch (error) {
    res.status(200).json({ error: "데이터 요청 실패" });
  } finally {
    if (conn) conn.release();
  }
});

app.post("/api/profile/get", async (req, res) => {
  // console.log("프로필 조회 : ", req.body);
  const userID = req.body.userID;

  const getDataFromDB_prof = async (id) => {
    console.log(id);
    let conn;
    conn = await pool.getConnection();
    try {
      const query = "SELECT height, age, weight FROM users WHERE google_id = ?";
      const result = await conn.query(query, id);
      // console.log(result);

      return result;
    } catch (error) {
      throw error;
    } finally {
      if (conn) conn.release();
    }
  };

  try {
    const result = await getDataFromDB_prof(userID);
    console.log(result);
    res.status(200).json({
      success: "데이터 요청 성공",
      items: result,
    });
  } catch (error) {
    res.status(500).json({
      error: "데이터 요청 실패",
      items: { height: 0, age: 0, weight: 0 },
    });
  }
});

app.post("/api/profile/update", async (req, res) => {
  console.log(req.body);

  const updateProfileDB = async (terms) => {
    let conn;
    conn = await pool.getConnection();
    const values = [terms.height, terms.age, terms.weight, terms.userId];
    try {
      const query =
        "UPDATE users SET height = ?, age = ?, weight = ? WHERE google_id = ?";
      const result = await conn.query(query, values);
      return result;
    } catch (error) {
      throw error;
    } finally {
      if (conn) conn.release();
    }
  };

  try {
    const result = await updateProfileDB(req.body);
    console.log(result);
    res.status(200);
  } catch (error) {
    console.error(error);
    res.status(500);
  }
});

const PORT = 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
