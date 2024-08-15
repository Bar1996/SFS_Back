const express = require("express");
const app = express();
const cors = require("cors");
app.use(cors());
const bodyParser = require("body-parser");
const dotenv = require("dotenv").config();
const { db } = require("./firebaseConfig.js");

const authRoute = require("./src/routes/auth_route.js");
const fileRoute = require("./src/routes/file_route.js");

const initApp = () => {
  const promise = new Promise(async (resolve, reject) => {
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: true }));
    app.use("/auth", authRoute);
    app.use("/files", fileRoute);
    resolve(app);
  });
  return promise;
};

module.exports = initApp;
