const cors = require("cors");
const express = require("express");
const app = express();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const mongodb = require("mongodb");
const bodyparser = require("body-parser");
const mongoclient = mongodb.MongoClient;
const url = process.env.DB_URL;
const shortid = require("shortid");

app.use(cors());
app.use(bodyparser.json());

/*API for populating the url in the collection*/
app.post("/shrink-url", async (request, response) => {
    let client;
    try {
        client = await mongoclient.connect(url);
        var db = client.db("URL_SHORTNER");
        request.body.tinyUrl = `https://tinyurl.${shortid.generate(6)}`;
        request.body.clicked = 0;
        var cursor = await db
            .collection("URL")
            .find({
                $and: [{ originalUrl: request.body.originalUrl }, { email: request.body.email }],
            })
            .count();
        if (cursor) {
            response.json({
                message: "URL is already shrinked",
            });
            client.close();
        } else {
            await db.collection("URL").insertOne(request.body);
            response.json({
                message: "Data Inserted",
            });
            client.close();
        }
    } catch (error) {
        if (client) client.close();
        console.log(error);
    }
});

/*API to increment the number of clicks*/
app.put("/shrink-url", async (request, response) => {
    let client;
    try {
        client = await mongoclient.connect(url);
        var db = client.db("URL_SHORTNER");
        var result = await db
            .collection("URL")
            .findOne({ originalUrl: request.body.originalUrl });

        if (result) {
            var cursor = await db
                .collection("URL")
                .updateOne(
                    { email: request.body.email, originalUrl: request.body.originalUrl },
                    { $inc: { clicked: 1 } }
                );

            client.close();
            response.json({
                message: "Updated",
            });
        } else {
            client.close();
            response.json({
                message: "Data not found",
            });
        }
    } catch (error) {
        if (client) client.close();
        console.log(error);
    }
});

/*API for displaying the data based on user*/
app.post("/get-original-url", async (request, response) => {
    let client;
    try {
        client = await mongoclient.connect(url);
        var db = client.db("URL_SHORTNER");
        var cursor = await db
            .collection("URL")
            .find({ email: request.body.email })
            .toArray();
        response.json(cursor);
        client.close();
    } catch (error) {
        if (client) client.close();
        console.log(error);
    }
});

/*API for registering users*/
app.post("/users/register", async (request, response) => {
    let client;
    try {
        client = await mongoclient.connect(url);

        var db = client.db("URL_SHORTNER");
        var cursor = await db
            .collection("USER")
            .find({ email: request.body.email })
            .count();

        if (cursor == 1) {
            client.close();
            response.json({
                message: "Email id exists",
            });
        } else {
            var salt = await bcrypt.genSalt(10);
            var encryptedPassword = await bcrypt.hash(request.body.password, salt);
            request.body.password = encryptedPassword;
            request.body.activated = false;
            var insertCursor = await db.collection("USER").insertOne(request.body);
            var token = jwt.sign({ email: request.body.email }, process.env.JWT_SECRET);
            client.close();
            response.json({
                message: "User registered",
                token,
            });
        }
    } catch (error) {
        if (client) client.close();
        console.log('catch block' + error)
    }
});

/*API for token validation*/
app.put("/users/auth/:email", authenticate, async (request, response) => {
    let client;
    try {
        client = await mongoclient.connect(url);
        var db = client.db("URL_SHORTNER");
        var cursor = await db
            .collection("USER")
            .find({ $and: [{ email: request.params.email }, { activated: true }] })
            .count();
        if (cursor == 1) {
            response.json({
                message: "User already activated",
            });
        } else {
            var cursor = await db
                .collection("USER")
                .updateOne({ email: request.params.email }, { $set: { activated: true } });
            response.json({
                message: "User Activated",
            });
        }
    } catch (error) {
        if (client) client.close();
    }
});

//function to authenticate the user
function authenticate(request, response, next) {
    if (request.headers.authorization) {
        jwt.verify(
            request.headers.authorization,
            process.env.JWT_SECRET,
            (err, decode) => {
                if (decode) {
                    if (request.params.email == decode.email) next();
                    else {
                        response.json({
                            message: "Not Authorized",
                        });
                    }
                } else {
                    response.json({
                        message: "Invalid Token",
                    });
                }
            }
        );
    } else {
        response.json({
            message: "Token not available",
        });
    }
}

/*API for user login*/
app.post("/login", async (request, response) => {
    let client;
    try {
        client = await mongoclient.connect(url);
        var db = client.db("URL_SHORTNER");
        var user = await db
            .collection("USER")
            .findOne({ email: request.body.email });
        if (user && user.activated == true) {
            var isMatch = await bcrypt.compare(request.body.password, user.password);
            if (isMatch) {
                response.json({
                    message: "success",
                    email: request.body.email,
                });
            } else {
                response.json({
                    message: "Username and password mismatch",
                });
            }
        } else {
            response.json({
                message: "Not a Registered User",
            });
        }
    } catch (error) {
        if (client) client.close();
    }
});


var port = process.env.PORT || 3000;
app.listen(port);