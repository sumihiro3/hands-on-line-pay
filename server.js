"use strict";

require("dotenv").config();

const app = require("express")();
const debug = require("debug")("line-pay:root");

app.listen(process.env.PORT || 5000, () => {
    debug(`server is listening to ${process.env.PORT || 5000}...`);
});

const botRouter = require("./router/bot");
app.use("/bot", botRouter);
