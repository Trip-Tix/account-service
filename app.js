const express = require('express');
const dotenv = require('dotenv');
const router = require('./routes/routes');

dotenv.config();

const port = process.env.PORT;

const app = express();

app.use(express.json());
app.use('/', router);

app.listen(port, () => {
    console.log(`Account service listening on port ${port}`);
});