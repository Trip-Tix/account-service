const dotenv = require('dotenv');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const amqp = require('amqplib')
const accountPool = require('../config/accountDB.js');

const saltRounds = 10;

dotenv.config();

const secretKey = process.env.SECRETKEY;

async function publishAdminCreatedMessage(adminData) {
    const connection = await amqp.connect('amqp://rabbitmq:@triptix-rabbitmq-service:5672');
    const channel = await connection.createChannel();

    const exchangeName = 'admin_events'; // Choose a meaningful name for the exchange
    await channel.assertExchange(exchangeName, 'fanout', { durable: false });

    const message = JSON.stringify(adminData);
    channel.publish(exchangeName, '', Buffer.from(message));

    setTimeout(() => {
        connection.close();
    }, 500); // Close the connection after a short delay
}

const adminSignup = async (req, res) => {
    try {
        console.log("adminSignup called from account-service");
        console.log(req.body);
        const { username, password, adminName, adminRole } = req.body;
        // Check if username already exists
        const query1 = {
            text: 'SELECT * FROM admin_info WHERE username = $1',
            values: [username]
        };

        const result1 = await accountPool.query(query1);
        const user = result1.rows[0];
        if (user) {
            console.log("Admin username already exists");
            res.status(409).json({ message: 'Username already exists' });
            return;
        }
        // Get the admin role id
        const query2 = {
            text: 'SELECT admin_role_id FROM admin_role_info WHERE admin_role_name = $1',
            values: [adminRole]
        };
        const adminRoleResult = await accountPool.query(query2);
        const adminRoleId = adminRoleResult.rows[0].admin_role_id;
        
        // Hash password
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        const query = {
            text: 'INSERT INTO admin_info (username, password, admin_name, admin_role_id) VALUES ($1, $2, $3, $4)',
            values: [username, hashedPassword, adminName, adminRoleId]
        };
        await accountPool.query(query);
        console.log("Admin created");
        // Publish admin created message
        const adminData = {
            username,
            adminName,
            adminRole
        };
        //publishAdminCreatedMessage(adminData);
        res.status(200).json({ message: 'Admin created' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

const adminLogin = async (req, res) => {
    try {
        console.log("adminLogin called from account-service");
        console.log(req.body);
        const { username, password } = req.body;
        const query = {
            text: 'SELECT * FROM admin_info WHERE username = $1',
            values: [username]
        };
        const result = await accountPool.query(query);
        const user = result.rows[0];
        if (user) {
            const match = await bcrypt.compare(password, user.password);
            if (match) {
                console.log("Admin login successful");
                const token = jwt.sign({ username }, secretKey, { expiresIn: '24h' });
                // Get the admin role
                const query1 = {
                    text: 'SELECT admin_role_name FROM admin_role_info WHERE admin_role_id = $1',
                    values: [user.admin_role_id]
                };
                const result1 = await accountPool.query(query1);
                const adminRole = result1.rows[0].admin_role_name;

                res.status(200).json({ message: 'Admin login successful', token, adminRole });
            } else {
                console.log("Invalid credentials");
                res.status(401).json({ message: 'Invalid credentials' });
            }
        } else {
            console.log("Invalid credentials");
            res.status(401).json({ message: 'Invalid credentials' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

const adminLogout = async (req, res) => {
    try {
        console.log("adminLogout called from account-service");
        console.log(req.body);
        res.status(200).json({ message: 'Logout successful' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

const addAdminRoleInfo = async (req, res) => {
    try {
        console.log("addAdminRoleInfo called from account-service");
        console.log(req.body);
        const { adminRole } = req.body;
        // Check if admin role already exists
        const query1 = {
            text: 'SELECT * FROM admin_role_info WHERE admin_role_name = $1',
            values: [adminRole]
        };
        const result1 = await accountPool.query(query1);
        const adminRoleInfo = result1.rows[0];
        if (adminRoleInfo) {
            console.log("Admin role info already exists");
            res.status(409).json({ message: 'Admin role info already exists' });
            return;
        }

        const query = {
            text: 'INSERT INTO admin_role_info (admin_role_name) VALUES ($1)',
            values: [adminRole]
        };
        await accountPool.query(query);
        console.log("Admin role info added");
        res.status(200).json({ message: 'Admin role info added' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}


module.exports = {
    adminSignup,
    adminLogin,
    addAdminRoleInfo,
    adminLogout
}
