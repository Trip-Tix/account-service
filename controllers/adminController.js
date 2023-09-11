const dotenv = require("dotenv");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const amqp = require("amqplib");
const accountPool = require("../config/accountDB.js");
const busPool = require("../config/busDB.js");
const airPool = require("../config/airDB.js");
const trainPool = require("../config/trainDB.js");

const saltRounds = 10;

dotenv.config();

const secretKey = process.env.SECRETKEY;

async function publishAdminCreatedMessage(adminData) {
  const connection = await amqp.connect(
    "amqps://gfzmtwux:Qzlyr2WTcNas33k8M6TJt0ylPDnPLKLI@rat.rmq2.cloudamqp.com/gfzmtwux"
  );
  const channel = await connection.createChannel();

  const exchangeName = "admin_events"; // Choose a meaningful name for the exchange
  await channel.assertExchange(exchangeName, "fanout", { durable: false });

  const message = JSON.stringify(adminData);
  channel.publish(exchangeName, "", Buffer.from(message));
  console.log("Admin creation message published:", adminData);

  setTimeout(() => {
    connection.close();
  }, 500); // Close the connection after a short delay
}

const testRabbitMQ = async (req, res) => {
  try {
    console.log("testRabbitMQ called from account-service");
    const adminData = {
      username: "admin1",
      adminName: "Admin 1",
      adminRole: "Super Admin",
    };
    publishAdminCreatedMessage(adminData);
    res.status(200).json({ message: "Message published" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: error.message });
  }
};

const adminApproval = async (req, res) => {
  try {
    console.log("adminApproval called from account-service");
    accountPool.query("BEGIN");
    busPool.query("BEGIN");
    const { adminId, adminRole, companyName } = req.body;
    // Get the admin role id
    const adminRoleQuery = {
      text: "SELECT admin_role_id FROM admin_role_info WHERE admin_role_name = $1",
      values: [adminRole],
    };
    const adminRoleResult = await accountPool.query(adminRoleQuery);
    const adminRoleId = adminRoleResult.rows[0].admin_role_id;
    // Update admin role
    const adminQuery = {
      text: "UPDATE admin_info SET admin_role_id = $1, status = 1 WHERE admin_id = $2",
      values: [adminRoleId, adminId],
    };
    await accountPool.query(adminQuery);
    console.log("Admin role updated");

    // TODO: Add company name
    res.status(200).json({ message: "Admin approved" });
  } catch (error) {
    accountPool.query("ROLLBACK");
    busPool.query("ROLLBACK");
    console.log(error);
    res.status(500).json({ message: error.message });
  } finally {
    accountPool.query("COMMIT");
    busPool.query("COMMIT");
  }
};

const adminSignup = async (req, res) => {
  try {
    // Begin transaction
    accountPool.query("BEGIN");
    busPool.query("BEGIN");
    console.log("adminSignup called from account-service");
    console.log(req.body);
    const { username, password, adminName, adminRole, companyName, email } = req.body;
    // Check if username already exists
    const query1 = {
      text: "SELECT * FROM admin_info WHERE username = $1",
      values: [username],
    };

    const result1 = await accountPool.query(query1);
    const user = result1.rows[0];
    if (user) {
      console.log("Admin username already exists");
      res.status(409).json({ message: "Username already exists" });
      return;
    }
    // Get the admin role id
    const query2 = {
      text: "SELECT admin_role_id FROM admin_role_info WHERE admin_role_name = $1",
      values: [adminRole],
    };
    const adminRoleResult = await accountPool.query(query2);
    const adminRoleId = adminRoleResult.rows[0].admin_role_id;

    // Hash password
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const query = {
      text: "INSERT INTO admin_info (username, password, admin_name, admin_role_id, email) VALUES ($1, $2, $3, $4, $5)",
      values: [username, hashedPassword, adminName, adminRoleId, email],
    };
    await accountPool.query(query);
    console.log("Admin created");

    // Publish admin created message
    const adminData = {
      username,
      adminName,
      adminRole,
    };
    //publishAdminCreatedMessage(adminData);
    res.status(200).json({ message: "Admin created" });
  } catch (error) {
    // Rollback transaction
    accountPool.query("ROLLBACK");
    busPool.query("ROLLBACK");
    console.log(error);
    res.status(500).json({ message: error.message });
  } finally {
    // Commit transaction
    accountPool.query("COMMIT");
    busPool.query("COMMIT");
  }
};

const adminLogin = async (req, res) => {
  try {
    console.log("adminLogin called from account-service");
    console.log(req.body);
    const { username, password } = req.body;
    const query = {
      text: "SELECT * FROM admin_info WHERE username = $1 AND status = 1",
      values: [username],
    };
    const result = await accountPool.query(query);
    const user = result.rows[0];
    if (user) {
      const match = await bcrypt.compare(password, user.password);
      if (match) {
        console.log("Admin login successful");
        const token = jwt.sign({ username }, secretKey, { expiresIn: "24h" });
        // Get the admin role
        const query1 = {
          text: "SELECT admin_role_name FROM admin_role_info WHERE admin_role_id = $1",
          values: [user.admin_role_id],
        };
        const result1 = await accountPool.query(query1);
        const adminRole = result1.rows[0].admin_role_name;

        let companyName = "";
        let companyId = "";

        if (adminRole === "ADMIN") {
        } 
        else if (adminRole === "BUS") {
          // Get the bus company name
          const busCompanyNameQuery = {
            text: "SELECT bus_company_name, bus_id FROM bus_services WHERE admin_id = $1",
            values: [user.admin_id],
          };
          const busCompanyNameResult = await busPool.query(busCompanyNameQuery);
          companyName = busCompanyNameResult.rows[0].bus_company_name;
          companyId = busCompanyNameResult.rows[0].bus_id;
        } else if (adminRole === "AIR") {
            // Get the air company name
            const airCompanyNameQuery = {
                text: "SELECT air_company_name, air_company_id FROM air_services WHERE admin_id = $1",
                values: [user.admin_id],
            };
            const airCompanyNameResult = await airPool.query(airCompanyNameQuery);
            companyName = airCompanyNameResult.rows[0].air_company_name;
            companyId = airCompanyNameResult.rows[0].air_id;
        } else if (adminRole === "TRAIN") {
            // Get the train company name
            const trainCompanyNameQuery = {
                text: "SELECT train_company_name, train_id FROM train_services WHERE admin_id = $1",
                values: [user.admin_id],
            };
            const trainCompanyNameResult = await trainPool.query(trainCompanyNameQuery);
            companyName = trainCompanyNameResult.rows[0].train_company_name;
            companyId = trainCompanyNameResult.rows[0].train_id;
        }
        console.log(companyName);

        res.status(200).json({
          message: "Admin login successful",
          token,
          adminRole,
          companyName: companyName,
          companyId: companyId,
          adminInfo: user
        });
      } else {
        console.log("Invalid credentials");
        res.status(401).json({ message: "Invalid credentials" });
      }
    } else {
      console.log("Invalid credentials");
      res.status(401).json({ message: "Invalid credentials" });
    }
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: error.message });
  }
};

const addAdminRoleInfo = async (req, res) => {
  try {
    console.log("addAdminRoleInfo called from account-service");
    console.log(req.body);
    const { adminRole } = req.body;
    // Check if admin role already exists
    const query1 = {
      text: "SELECT * FROM admin_role_info WHERE admin_role_name = $1",
      values: [adminRole],
    };
    const result1 = await accountPool.query(query1);
    const adminRoleInfo = result1.rows[0];
    if (adminRoleInfo) {
      console.log("Admin role info already exists");
      res.status(409).json({ message: "Admin role info already exists" });
      return;
    }

    const query = {
      text: "INSERT INTO admin_role_info (admin_role_name) VALUES ($1)",
      values: [adminRole],
    };
    await accountPool.query(query);
    console.log("Admin role info added");
    res.status(200).json({ message: "Admin role info added" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const allAdminInfo = async (req, res) => {
    // get the token
    // console.log(req)
    const {token, username} = req.body;
    // const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ message: 'No token provided' });
    }

    // verify the token
    console.log("token", token)
    console.log("secretKey", secretKey)
    jwt.verify(token, secretKey, async (err, decoded) => {
        if (err) {
            console.log("Unauthorized access");
            res.status(401).json({ message: 'Unauthorized access: invalid token' });
        } else {
            try {
                console.log("getCoachInfo called from bus-service");
                const query = {
                    text: 'SELECT * FROM admin_info WHERE username <> $1',
                    values: [username],
                };
                const result = await busPool.query(query);
                const adminInfo = result.rows;
                // console.log(adminInfo);

                for (let i = 0; i < adminInfo.length; i++) {
                    const adminRoleQuery = {
                        text: 'SELECT admin_role_name FROM admin_role_info WHERE admin_role_id = $1',
                        values: [adminInfo[i].admin_role_id],
                    };
                    const adminRoleResult = await busPool.query(adminRoleQuery);
                    adminInfo[i].admin_role_name = adminRoleResult.rows[0].admin_role_name;
                }

                res.status(200).json(adminInfo);
            } catch (error) {
                res.status(500).json({ message: error.message });
            }
        }
    });
}


module.exports = {
  adminSignup,
  adminLogin,
  addAdminRoleInfo,
  adminApproval,
  testRabbitMQ,
  allAdminInfo
};
