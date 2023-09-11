const dotenv = require('dotenv');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const accountPool = require('../config/accountDB.js');
const busPool = require('../config/busDB.js');
const airPool = require('../config/airDB.js');
const trainPool = require('../config/trainDB.js');

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
            res.status(401).json({ message: 'User not found' });
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

const userTicketHistory = async (req, res) => {
    // verify token
    const { token, userId } = req.body;
    if (!token) {
        console.log("Token not found");
        res.status(401).json({ message: 'Token not found' });
        return;
    }
    jwt.verify(token, secretKey, async (err, decoded) => {
        if (err) {
            console.log(err);
            res.status(401).json({ message: 'Invalid token' });
            return;
        }
        
        try {
            console.log("userTicketHistory called from account-service");
            console.log(req.body);

            // For bus
            const busTicketInfoQuery = {
                text: 'SELECT * FROM ticket_info WHERE user_id = $1',
                values: [userId]
            };
            const busTicketInfoResult = await busPool.query(busTicketInfoQuery);
            const busTicketInfo = busTicketInfoResult.rows;
            console.log(busTicketInfo);

            for (let i = 0; i < busTicketInfo.length; i++) {
                const ticket = busTicketInfo[i];

                const busScheduleId = ticket.bus_schedule_id;
                const busInfoQuery = {
                    text: `SELECT bus_schedule_info.unique_bus_id, bus_schedule_info.departure_time, 
                    bus_schedule_info.schedule_date, bus_schedule_info.bus_id, bus_services.bus_company_name, 
                    bus_coach_details.coach_id, bus_coach_details.brand_name_id, coach_info.coach_name, 
                    brand_name_info.brand_name  
                    FROM bus_schedule_info 
                    INNER JOIN bus_services ON bus_schedule_info.bus_id = bus_services.bus_id 
                    INNER JOIN bus_coach_details ON bus_schedule_info.unique_bus_id = bus_coach_details.unique_bus_id 
                    INNER JOIN coach_info ON bus_coach_details.coach_id = coach_info.coach_id 
                    INNER JOIN brand_name_info ON bus_coach_details.brand_name_id = brand_name_info.brand_name_id 
                    WHERE bus_schedule_info.bus_schedule_id = $1`,
                    values: [busScheduleId]
                };
                const busInfoResult = await busPool.query(busInfoQuery);
                const busInfo = busInfoResult.rows[0];
                console.log(busInfo);

                ticket.busInfo = busInfo;

                const journeyDate = new Date(busInfo.schedule_date);
                // Check if journey date is passed
                const today = new Date();
                const todayDate = today.toISOString().split('T')[0];
                if (journeyDate < todayDate) {
                    ticket.isJourneyDatePassed = true;
                } else {
                    ticket.isJourneyDatePassed = false;
                }

            }

            const busQueueTicketInfoQuery = {
                text: 'SELECT * FROM ticket_queue WHERE user_id = $1',
                values: [userId]
            };
            const busQueueTicketInfoResult = await busPool.query(busQueueTicketInfoQuery);
            const busQueueTicketInfo = busQueueTicketInfoResult.rows;
            console.log(busQueueTicketInfo);

            for (let i = 0; i < busQueueTicketInfo.length; i++) {
                const ticket = busQueueTicketInfo[i];
                const busScheduleId = ticket.bus_schedule_id;
                const busInfoQuery = {
                    text: `SELECT bus_schedule_info.unique_bus_id, bus_schedule_info.departure_time,
                    bus_schedule_info.schedule_date, bus_schedule_info.bus_id, bus_services.bus_company_name,
                    bus_coach_details.coach_id, bus_coach_details.brand_name_id, coach_info.coach_name,
                    brand_name_info.brand_name
                    FROM bus_schedule_info
                    INNER JOIN bus_services ON bus_schedule_info.bus_id = bus_services.bus_id
                    INNER JOIN bus_coach_details ON bus_schedule_info.unique_bus_id = bus_coach_details.unique_bus_id
                    INNER JOIN coach_info ON bus_coach_details.coach_id = coach_info.coach_id
                    INNER JOIN brand_name_info ON bus_coach_details.brand_name_id = brand_name_info.brand_name_id
                    WHERE bus_schedule_info.bus_schedule_id = $1`,
                    values: [busScheduleId]
                };
                const busInfoResult = await busPool.query(busInfoQuery);
                const busInfo = busInfoResult.rows[0];
                console.log(busInfo);

                ticket.busInfo = busInfo;



            // For air

            // TODO: Add air ticket info to ticket object
            // TODO: Add air info to ticket object
            
            // TODO: Add train ticket info to ticket object
            // TODO: Add train info to ticket object
            }

            res.status(200).json({ busTicketInfo, busQueueTicketInfo });
        } catch (err) {
            console.log(err);
            res.status(500).json({ message: 'Internal server error' });
        }
    });
}

const getUserCountOfAllUsers = async (req, res) => {
    try {
        
        // Query the user_info table to count distinct user_id
        const countUsersQuery = {
            text: 'SELECT COUNT(DISTINCT user_id) FROM user_info',
        };
        const countResult = await accountPool.query(countUsersQuery);
        const totalCount = countResult.rows[0].count;
        console.log("Total users:", totalCount);
        
        res.status(200).json({ totalUniqueBuses: totalCount });
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: error.message });
    }
}
module.exports = {
    userSignup,
    userLogin,
    userTicketHistory,
    getUserCountOfAllUsers,
}