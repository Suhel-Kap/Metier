require('dotenv').config();
const express = require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const mongoose = require("mongoose");
const passport = require("passport");
const passportLocalMongoose = require("passport-local-mongoose");
const session = require("express-session");
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const findOrCreate = require('mongoose-findorcreate');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

const app = express();

app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(session({
    secret: 'Our little secret.',
    resave: false,
    saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

// Connect to database

mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true, useCreateIndex: true });

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: "demo",
        allowedFormats: ["jpg", "png"],
        transformation: [{ width: 500, height: 500, crop: "limit" }]
    }
});
const parser = multer({ storage: storage });

// Schemas

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        sparse: true
    },
    name: {
        firstName: { type: String },
        lastName: { type: String }
    },
    googleId: { type: String, unique: true, sparse: true, required: true },
    username: { type: String, unique: true, sparse: true, required: true },
    contactInfo: {
        phoneNumber: { type: Number, unique: true, sparse: true },
        address: { type: String },
        zipcode: { type: String },
        DOB: { type: Date }
    },
    registrationComplete: Boolean,
    isSeller: Boolean,
    userAdded: { type: Date, default: Date.now },
    sellerInfo: {
        organisationName: { type: String },
        address: { type: String },
        zipcode: { type: String },
        email: { type: String },
        phoneNumber: { type: Number },
        website: { type: String },
        socialMediaHandle: {
            facebook: { type: String },
            twitter: { type: String },
            instagram: { type: String },
            linkedIn: { type: String }
        },
        employmentHistory: {
            type: String
        },
        typeOfBusiness: {
            type: String
        }
    }
});


const productSchema = new mongoose.Schema({
    productName: String,
    stock: Number,
    price: Number,
    description: String,
    seller: String,
    image: String,
    review: [String]
});

userSchema.plugin(passportLocalMongoose);
userSchema.plugin(findOrCreate);

// Configure Mongoose models

const User = mongoose.model("User", userSchema);
const Product = mongoose.model("Product", productSchema);

// Setup login and registration

passport.use(User.createStrategy());

passport.serializeUser(function (user, done) {
    done(null, user.id);
});

passport.deserializeUser(function (id, done) {
    User.findById(id, function (err, user) {
        done(err, user);
    });
});


passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "http://localhost:3000/auth/google/complete-registration",
    userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo"
},
    function (accessToken, refreshToken, profile, cb) {
        User.findOrCreate({
            email: profile.emails[0].value, googleId: profile.id, username: profile.emails[0].value
        }, function (err, user) {
            return cb(err, user);
        });
    }
));

app.get('/auth/google',
    passport.authenticate('google', { scope: ['profile', 'email'] })
);

// post registration redirect 

app.get("/auth/google/complete-registration",
    passport.authenticate('google', { failureRedirect: '/login' }),
    function (req, res) {
        // find the user by name and redirect accordingly
        // Successful authentication, redirect to complete registration.
        res.redirect('/complete-registration');
    });

// complete registration route after redirect from registration page

app
    .route('/complete-registration')
    .get((req, res) => {

        if (req.isAuthenticated()) {
            // console.log(req.user);
            // console.log("Complete Registration");
            if (req.user.registrationComplete === false || req.user.registrationComplete === undefined) { 
                // is user has not completed registration, send him to complete registration
                // console.log("User has not completed registration");
                res.render("complete-registration");
            } else { // if user has completed registration, send him to shop page
                res.redirect('/shop');
            }
        } else {
            res.redirect("/login");
        }
    })
    .post((req, res) => {
        const firstName = req.body.firstName;
        const lastName = req.body.lastName;
        const email = req.body.email;
        const address = req.body.address;
        const zipcode = req.body.zipcode;
        const phoneNumber = req.body.phoneNumber;
        const DOB = req.body.DOB;
        const isSeller = req.body.isSeller;
        User.findById(req.user.id, (err, foundUser) => {
            if (err) {
                console.log(err);
                res.send("Error");
            } else {
                if (foundUser) {
                    foundUser.name.firstName = firstName;
                    foundUser.name.lastName = lastName;
                    foundUser.contactInfo.email = email;
                    foundUser.contactInfo.phoneNumber = phoneNumber;
                    foundUser.contactInfo.address = address;
                    foundUser.contactInfo.zipcode = zipcode;
                    foundUser.contactInfo.DOB = DOB;
                    foundUser.isSeller = isSeller;
                    foundUser.registrationComplete = true;
                    foundUser.markModified('name');
                    foundUser.save(() => {
                        if (isSeller === "true") {
                            // if user is a seller then complete seller information
                            res.redirect("/complete-seller-registration");
                            // res.send(foundUser);
                        } else {
                            // user is not a seller then redirect to shop page

                            res.redirect("/shop");
                        }
                    })
                    // console.log(foundUser);
                }
            }
        })
    });

// Complete seller registration

app
    .route('/complete-seller-registration')
    .get((req, res) => {
        if (req.isAuthenticated()) {
            console.log("Complete Seller Registration");
            res.render("complete-seller-registration");
        } else {
            res.redirect("/login");
        }
    })
    .post((req, res) => {
        const organisationName = req.body.organisationName;
        const facebook = req.body.facebook;
        const twitter = req.body.twitter;
        const instagram = req.body.instagram;
        const linkedIn = req.body.linkedIn;
        const typeOfBusiness = req.body.typeOfBusiness;
        const employmentHistory = req.body.employmentHistory;
        const address = req.body.address;
        const zipcode = req.body.zipcode;
        const phoneNumber = req.body.phoneNumber;
        const website = req.body.website;
        const email = req.body.email;
        User.findById(req.user.id, (err, foundUser) => {
            if (err) {
                console.log(err);
                res.send("Error");
            } else {
                console.log(foundUser);
                if (foundUser) {
                    foundUser.sellerInfo.organisationName = organisationName;
                    foundUser.sellerInfo.socialMediaHandle.facebook = facebook;
                    foundUser.sellerInfo.socialMediaHandle.twitter = twitter;
                    foundUser.sellerInfo.socialMediaHandle.instagram = instagram;
                    foundUser.sellerInfo.socialMediaHandle.linkedIn = linkedIn;
                    foundUser.sellerInfo.typeOfBusiness = typeOfBusiness;
                    foundUser.sellerInfo.employmentHistory = employmentHistory;
                    foundUser.sellerInfo.address = address;
                    foundUser.sellerInfo.zipcode = zipcode;
                    foundUser.sellerInfo.phoneNumber = phoneNumber;
                    foundUser.sellerInfo.website = website;
                    foundUser.sellerInfo.email = email;
                    foundUser.markModified('sellerInfo');
                    foundUser.save(() => {
                        // redirect to payment page but leave it for now
                        res.send("Complete Seller Registration");
                    })
                }
                console.log(foundUser);
            }
        })
    });

app
    .route("/upload-product")
    .get((req, res) => {
        if (req.isAuthenticated()) {
            console.log(req.user.isSeller);
            if (req.user.isSeller === true) {
                res.render("upload-product");
            }
        } else {
            res.redirect("/login");
        }
    })
    .post(parser.single('image'), (req, res) => {
        // const image = req.file.path;
        // console.log(req.file.path);        
        // res.json(req.file); // to see what is returned to you

        Product.create({
            image: req.file.path,
            productName: req.body.productName,
            stock: req.body.stock,
            price: req.body.price,
            description: req.body.description,
            sellerId: req.user.id
        })
            .then(product => {
                console.log(product);
                res.redirect("/shop");
            })
            .catch(err => {
                console.log(err);
            });
    });

app
    .route('/')
    .get((req, res) => {
        res.render("home");
    });

app
    .route("/login")
    .get((req, res) => {
        res.render("login");
    });


app
    .route("/shop")
    .get((req, res) => {
        res.render("shop");
    });

app.get("/logout", (req, res) => {
    req.logout();
    res.redirect("/login");
})





app.listen(3000, (err) => {
    if (err) {
        console.log(err);
    } else {
        console.log("Server started on port 3000");
    }
})