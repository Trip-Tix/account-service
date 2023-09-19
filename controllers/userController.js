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
            }

            // For train
            const trainTicketInfoQuery = {
                text: 'SELECT * FROM ticket_info WHERE user_id = $1',
                values: [userId]
            };
            const trainTicketInfoResult = await trainPool.query(trainTicketInfoQuery);
            const trainTicketInfo = trainTicketInfoResult.rows;
            console.log(trainTicketInfo);

            for (let i = 0; i < trainTicketInfo.length; i++) {
                const trainTicket = trainTicketInfo[i];

                const trainScheduleId = trainTicket.train_schedule_id;
                const trainCoachId = trainTicket.coach_id;
                const trainInfoQuery = {
                    text: `SELECT train_schedule_info.unique_train_id, train_schedule_info.departure_time,
                    train_schedule_info.schedule_date, train_schedule_info.train_id, train_services.train_company_name 
                    FROM train_schedule_info
                    INNER JOIN train_services ON train_schedule_info.train_id = train_services.train_id
                    WHERE train_schedule_info.train_schedule_id = $1`,
                    values: [trainScheduleId]
                };
                const trainInfoResult = await trainPool.query(trainInfoQuery);
                const trainInfo = trainInfoResult.rows[0];
                console.log(trainInfo);

                // Get coach name
                const coachInfoQuery = {
                    text: 'SELECT coach_name FROM coach_info WHERE coach_id = $1',
                    values: [trainCoachId]
                };
                const coachInfoResult = await trainPool.query(coachInfoQuery);
                const coachInfo = coachInfoResult.rows[0];
                console.log(coachInfo);

                trainInfo.coach_name = coachInfo.coach_name;

                trainTicket.trainInfo = trainInfo;

                const journeyDate = new Date(trainInfo.schedule_date);
                // Check if journey date is passed
                const today = new Date();
                const todayDate = today.toISOString().split('T')[0];
                if (journeyDate < todayDate) {
                    trainTicket.isJourneyDatePassed = true;
                } else {
                    trainTicket.isJourneyDatePassed = false;
                }

            }

            const trainQueueTicketInfoQuery = {
                text: 'SELECT * FROM ticket_queue WHERE user_id = $1',
                values: [userId]
            };
            const trainQueueTicketInfoResult = await trainPool.query(trainQueueTicketInfoQuery);
            const trainQueueTicketInfo = trainQueueTicketInfoResult.rows;
            console.log(trainQueueTicketInfo);

            for (let i = 0; i < trainQueueTicketInfo.length; i++) {
                const trainTicket = trainQueueTicketInfo[i];
                const trainScheduleId = trainTicket.train_schedule_id;
                const trainCoachId = trainTicket.coach_id;
                const trainInfoQuery = {
                    text: `SELECT train_schedule_info.unique_train_id, train_schedule_info.departure_time,
                    train_schedule_info.schedule_date, train_schedule_info.train_id, train_services.train_company_name 
                    FROM train_schedule_info
                    INNER JOIN train_services ON train_schedule_info.train_id = train_services.train_id
                    WHERE train_schedule_info.train_schedule_id = $1`,
                    values: [trainScheduleId]
                };
                const trainInfoResult = await trainPool.query(trainInfoQuery);
                const trainInfo = trainInfoResult.rows[0];
                console.log(trainInfo);

                // Get coach name
                const coachInfoQuery = {
                    text: 'SELECT coach_name FROM coach_info WHERE coach_id = $1',
                    values: [trainCoachId]
                };
                const coachInfoResult = await trainPool.query(coachInfoQuery);
                const coachInfo = coachInfoResult.rows[0];
                console.log(coachInfo);

                trainInfo.coach_name = coachInfo.coach_name;

                trainTicket.trainInfo = trainInfo;
            }

            // For air
            const airTicketInfoQuery = {
                text: 'SELECT * FROM ticket_info WHERE user_id = $1',
                values: [userId]
            };
            const airTicketInfoResult = await airPool.query(airTicketInfoQuery);    
            const airTicketInfo = airTicketInfoResult.rows;
            console.log(airTicketInfo);

            for (let i = 0; i < airTicketInfo.length; i++) {
                const airTicket = airTicketInfo[i];

                const airScheduleId = airTicket.air_schedule_id;
                const airClassId = airTicket.class_id;

                const airInfoQuery = {
                    text: `SELECT air_schedule_info.unique_air_id, air_schedule_info.departure_time,
                    air_schedule_info.schedule_date, air_schedule_info.air_company_id, air_services.air_company_name 
                    FROM air_schedule_info
                    INNER JOIN air_services ON air_schedule_info.air_company_id = air_services.air_company_id
                    WHERE air_schedule_info.air_schedule_id = $1`,
                    values: [airScheduleId]
                };
                const airInfoResult = await airPool.query(airInfoQuery);
                const airInfo = airInfoResult.rows[0];
                console.log(airInfo);

                // Get class name
                const classInfoQuery = {
                    text: 'SELECT class_name FROM class_info WHERE class_id = $1',
                    values: [airClassId]
                };
                const classInfoResult = await airPool.query(classInfoQuery);
                const classInfo = classInfoResult.rows[0];
                console.log(classInfo);

                airInfo.class_name = classInfo.class_name;

                airTicket.airInfo = airInfo;

                const journeyDate = new Date(airInfo.schedule_date);
                // Check if journey date is passed
                const today = new Date();
                const todayDate = today.toISOString().split('T')[0];
                if (journeyDate < todayDate) {
                    airTicket.isJourneyDatePassed = true;
                } else {
                    airTicket.isJourneyDatePassed = false;
                }

            }

            const airQueueTicketInfoQuery = {
                text: 'SELECT * FROM ticket_queue WHERE user_id = $1',
                values: [userId]
            };
            const airQueueTicketInfoResult = await airPool.query(airQueueTicketInfoQuery);
            const airQueueTicketInfo = airQueueTicketInfoResult.rows;
            console.log(airQueueTicketInfo);

            for (let i = 0; i < airQueueTicketInfo.length; i++) {
                const airTicket = airQueueTicketInfo[i];

                const airScheduleId = airTicket.air_schedule_id;
                const airClassId = airTicket.class_id;

                const airInfoQuery = {
                    text: `SELECT air_schedule_info.unique_air_id, air_schedule_info.departure_time,
                    air_schedule_info.schedule_date, air_schedule_info.air_company_id, air_services.air_company_name 
                    FROM air_schedule_info
                    INNER JOIN air_services ON air_schedule_info.air_company_id = air_services.air_company_id
                    WHERE air_schedule_info.air_schedule_id = $1`,
                    values: [airScheduleId]
                };
                const airInfoResult = await airPool.query(airInfoQuery);
                const airInfo = airInfoResult.rows[0];
                console.log(airInfo);

                // Get class name
                const classInfoQuery = {
                    text: 'SELECT class_name FROM class_info WHERE class_id = $1',
                    values: [airClassId]
                };
                const classInfoResult = await airPool.query(classInfoQuery);
                const classInfo = classInfoResult.rows[0];
                console.log(classInfo);

                airInfo.class_name = classInfo.class_name;

                airTicket.airInfo = airInfo;
            }

            res.status(200).json({ busTicketInfo, busQueueTicketInfo, trainTicketInfo, trainQueueTicketInfo, airTicketInfo, airQueueTicketInfo });
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