const cors = require("cors");
const express = require("express");
const app = express();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
require("dotenv").config();
const mongodb = require("mongodb");
const bodyparser = require("body-parser");
const mongoclient = mongodb.MongoClient;
const url = process.env.DB_URL;
const shortid = require("shortid");

app.use(cors());

app.use(bodyparser.json());

/*API for populating the url in the collection*/
app.post("/shrink-url", authenticateNavigation, async (request, response) => {
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
app.put("/shrink-url", authenticateNavigation, async (request, response) => {
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
app.post("/get-original-url", authenticateNavigation, async (request, response) => {
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
        client = await mongoclient.connect(url, { useUnifiedTopology: true });

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

            var emailReg = request.body.email;


            var mailoptions = {
                from: `bhswaroopkumar@gmail.com`,
                to: `${emailReg}`,
                subject: `User Activation Mail from URL Shortner`,
                html: `<div>Please click the below link to activate your account <br>                     <a href="https://swaroop-url-shortner.netlify.app/auth.html">Click Me</a></div>`,
            };
            var transporter = nodemailer.createTransport({
                service: "gmail",
                auth: {
                    user: "bhswaroopkumar@gmail.com",
                    pass: process.env.MAILPASSWORD,
                },
            });
            transporter.sendMail(mailoptions, (err, info) => {
                if (err) {
                    console.log(err);
                } else {
                    console.log("email sent" + info.response);
                }
            });


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
                var token = jwt.sign({ email: request.body.email }, process.env.JWT_SECRET, { expiresIn: 600 });
                response.json({
                    message: "success",
                    email: request.body.email,
                    token: token
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

/*sample route*/
app.get("/", (request, response) => { response.send("sample route") })


function authenticateNavigation(request, response, next) {
    if (request.headers.authorization) {
        jwt.verify(
            request.headers.authorization,
            process.env.JWT_SECRET,
            (err, decode) => {
                if (decode) {
                    if (request.body.email == decode.email) next();
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

/*forgot password api*/
app.post("/user/forgotpassword", async (request, response) => {
    var client = await mongoclient.connect(url, { useUnifiedTopology: true });
    var db = client.db("URL_SHORTNER");
    var data = await db
        .collection("USER")
        .findOne({ email: request.body.email });
    let registeredEmail = request.body.email;

    if (data && data.activated == true) {
        let registeredToken = jwt.sign(
            { email: request.body.email },
            process.env.JWT_SECRET,
            { expiresIn: 600 }
        );

        var transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: "bhswaroopkumar@gmail.com",
                pass: process.env.MAILPASSWORD,
            },
        });
        var mailoptions = {
            from: `bhswaroopkumar@gmail.com`,
            to: `${registeredEmail}`,
            subject: `Update Password link from url shortner`,
            html: `<div>Please click the below link to change password.<br>
                  <a href="https://swaroop-url-shortner.netlify.app/updateauthenticate.html">click me</a></div>`,
        };
        transporter.sendMail(mailoptions, (err, info) => {
            if (err) {
                console.log(err);
            } else {
                console.log("email sent" + info.response);
            }
        });
        client.close();
        response.json({
            message: "User Present",
            email: request.body.email,
            token: registeredToken,
        });
    } else {
        client.close();
        response.json({
            message: "User not registered",
        });
    }
});

/*Update password api*/
app.put("/user/changepassword", async (request, response) => {
    var client = await mongoclient.connect(url, { useUnifiedTopology: true });
    var db = client.db("URL_SHORTNER");
    var data = await db
        .collection("USER")
        .findOne({ email: request.body.email });
    if (data && data.activated == true) {
        var salt = await bcrypt.genSalt(10);
        var newEncryptedPasswod = await bcrypt.hash(request.body.password, salt);
        var cursor = await db
            .collection("USER")
            .updateOne(
                { email: request.body.email },
                { $set: { password: newEncryptedPasswod } }
            );
        response.json({
            message: "Password updated",
        });
    } else {
        response.json({
            message: "User not registered or Account is not activated",
        });
    }
});


app.get("/user/changepassword/:email", async (request, response) => {
    var client = await mongoclient.connect(url, { useUnifiedTopology: true });
    var db = client.db("URL_SHORTNER");
    var data = await db
        .collection("USER")
        .findOne({ email: request.params.email });
    if (data && data.activated == true) {
        response.json({
            message: "Authenticated",
        });
    } else {
        response.json({
            message: "Account not activated or Email is not registered",
        });
    }
});


var port = process.env.PORT || 3000;
app.listen(port);
