const { Pool } = require('pg');
const dotenv = require('dotenv');
const bcrypt = require('bcrypt');
const e = require('express');

const saltRounds = 10;

dotenv.config();

// Connect to Postgres
const pool = new Pool({
    host: process.env.PGHOST,
    port: process.env.PGPORT,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    idleTimeoutMillis: 0,
    connectionTimeoutMillis: 0,
    ssl: {
        rejectUnauthorized: false
    }
});

pool.connect(err => {
    if (err) {
        console.error('connection error', err.stack);
    } else {
        console.log('connected to database');
    }
});

const adminSignup = async (req, res) => {
    try {
        console.log("adminSignup called from account-service");
        console.log(req.body);
        const { username, password, adminName } = req.body;
        // Check if username already exists
        const query1 = {
            text: 'SELECT * FROM admin_info WHERE username = $1',
            values: [username]
        };
        const result1 = await pool.query(query1);
        const user = result1.rows[0];
        if (user) {
            console.log("Username already exists");
            res.status(409).json({ message: 'Username already exists' });
            return;
        }
        // Hash password
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        const query = {
            text: 'INSERT INTO admin_info (username, password, admin_name) VALUES ($1, $2, $3)',
            values: [username, hashedPassword, adminName]
        };
        await pool.query(query);
        console.log("Admin created");
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
        const result = await pool.query(query);
        const user = result.rows[0];
        if (user) {
            const match = await bcrypt.compare(password, user.password);
            if (match) {
                console.log("Login successful");
                res.status(200).json({ message: 'Login successful' });
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

module.exports = {
    adminSignup,
    adminLogin
}
