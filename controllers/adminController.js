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
        console.log("adminSignup called");
        console.log(req.body);
        const { username, password, adminName } = req.body;
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        const query = {
            text: 'INSERT INTO admin_info (username, password, admin_name) VALUES ($1, $2, $3)',
            values: [username, hashedPassword, adminName]
        };
        await pool.query(query);
        res.status(200).json({ message: 'Admin created' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

const adminLogin = async (req, res) => {
    try {
        console.log("adminLogin called");
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
                res.status(200).json({ message: 'Login successful' });
            } else {
                res.status(401).json({ message: 'Invalid credentials' });
            }
        } else {
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