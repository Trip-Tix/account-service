const dotenv = require('dotenv');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const accountPool = require('../config/accountDB.js');
const busPool = require('../config/busDB.js');

const saltRounds = 10;

dotenv.config();

const secretKey = process.env.SECRETKEY;

const userSignup = async (req, res) => {
    try {
        // Begin transaction
        accountPool.query('BEGIN');
        console.log("userSignup called from account-service");
        console.log(req.body);
        const { username, password, fullName, email, mobile, nationalId, birthCertificate } = req.body;
        // Check if username already exists
        const query1 = {
            text: 'SELECT * FROM user_info WHERE username = $1 OR email = $2 OR mobile = $3 OR national_id = $4 OR birth_certificate = $5',
            values: [username, email, mobile, nationalId, birthCertificate]
        };

        const result1 = await accountPool.query(query1);
        const user = result1.rows[0];
        if (user) {
            console.log("User username already exists");
            res.status(409).json({ message: 'User already exists' });
            return;
        }
        // Hash password
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        const query = {
            text: 'INSERT INTO user_info(username, password, full_name, national_id, birth_certificate, email, mobile) VALUES($1, $2, $3, $4, $5, $6, $7)',
            values: [username, hashedPassword, fullName, nationalId, birthCertificate, email, mobile]
        };
        await accountPool.query(query);
        // Commit transaction
        await accountPool.query('COMMIT');
        res.status(201).json({ message: 'User created successfully' });
    } catch (err) {
        // Rollback transaction
        await accountPool.query('ROLLBACK');
        console.log(err);
        res.status(500).json({ message: 'Internal server error' });
    }
}

const userLogin = async (req, res) => {
    try {
        console.log("userLogin called from account-service");
        console.log(req.body);
        const { username, password } = req.body;
        // Check if username exists
        const query = {
            text: 'SELECT * FROM user_info WHERE username = $1',
            values: [username]
        };
        const result = await accountPool.query(query);
        const user = result.rows[0];
        if (!user) {
            console.log("User not found");
            res.status(404).json({ message: 'User not found' });
            return;
        }
        // Check if password is correct
        const isPasswordCorrect = await bcrypt.compare(password, user.password);
        if (!isPasswordCorrect) {
            console.log("Incorrect password");
            res.status(401).json({ message: 'Incorrect password' });
            return;
        }
        // Generate access token
        const accessToken = jwt.sign({ username: user.username }, secretKey, { expiresIn: '1h' });
        // Remove password from user object
        delete user.password;
        res.status(200).json({ user, accessToken: accessToken });
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: 'Internal server error' });
    }
}

module.exports = {
    userSignup,
    userLogin
}