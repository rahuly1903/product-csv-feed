const express = require("express");
const shopifyAPI = require("shopify-node-api");
const bodyParser = require("body-parser");
const cors = require("cors");
const cron = require("node-cron");
const nodemailer = require("nodemailer");
// const path = require("path");

require("dotenv").config();
const app = express();
const port = process.env.PORT || 4000;
const fs = require("fs");
let product_csv_data;

app.use(express.static("public"));
app.use(bodyParser.urlencoded({ limit: "50mb", extended: false }));
app.use(bodyParser.json({ limit: "50mb" }));
app.use(cors());

// create reusable transporter object using the default SMTP transport
const transporter = nodemailer.createTransport({
  port: 465, // true for 465, false for other ports
  host: "smtp.gmail.com",
  auth: {
    user: process.env.EMAIL,
    pass: process.env.PASSWORD,
  },
  secure: true,
});

const mailData = {
  from: process.env.EMAIL, // sender address
  to: process.env.RECEIVER, // list of receivers
  subject: "કેમ છો ભાઈ - EDFJ CSV",
  text: "",
  html: `<b>EDFJ CSV is updated. </b>`,
};

var Shopify = new shopifyAPI({
  shop: process.env.SHOP, // MYSHOP.myshopify.com
  shopify_api_key: process.env.SHOPIFY_API_KEY, // Your API key
  access_token: process.env.ACCESS_TOKEN, // Your API password
});

app.get("/", (req, res) => {
  res.send({ msg: "Welcome to Homepage" });
});
app.get("/send-mail", (req, res) => {
  transporter.sendMail(mailData, function (err, info) {
    if (err) {
      res.send({ msg: `Error in sending Mail - ${err}` });
    } else {
      res.send({ msg: `mail send successfully` });
    }
  });
});

app.get("/csv/product.csv", (req, res) => {
  const csvFilePath = "./public/csv/products.csv";
  res.download(csvFilePath, "products.csv", (err) => {
    if (err) {
      console.error("Error downloading the file", err);
      res.status(500).send("Could not download the file");
    }

    // Remove the file after sending it
    fs.unlink(csvFilePath, (err) => {
      if (err) {
        console.error("Error deleting the file", err);
      }
    });
  });
});

app.get("/csv-single-update", function (req, res) {
  const body = `Rahul,Yadav,2023`;
  fs.writeFileSync("./public/csv/products.csv", body);
  res.send({ msg: `CSV updated successfully.` });
});

function cronMail() {
  transporter.sendMail(mailData, function (err, info) {
    if (err) {
      console.log("Mail sent error");
    } else {
      console.log("mail send successfully");
    }
  });
}

function getProduct(count, data_count, since_id = 0) {
  console.log("data_count", count, data_count);
  const getProducts = new Promise((resolve, reject) => {
    Shopify.get(
      `/admin/products.json?limit=100&&since_id=${since_id}`,
      function (err, data, headers) {
        // console.log(headers); // Headers returned from request
        if (err) return reject(err);
        resolve({ data, headers });
      }
    );
  });

  getProducts
    .then(({ data }) => {
      let since_id;
      data.products.forEach((product) => {
        product.variants.forEach((variant) => {
          product_csv_data += `${variant?.sku},${variant?.id},${
            variant?.product_id
          },${product?.title}-${
            variant.title
          },"",https://www.enchantedfinejewelry.com/products/${
            product?.handle
          },${product?.image?.src},${
            variant.compare_at_price === null
              ? variant?.price
              : variant.compare_at_price
          },${variant?.price} USD,${variant?.inventory_quantity},${
            variant.inventory_quantity !== 0 ? "In Stock" : "Out of Stock"
          }\n`;
        });
        count++;
        since_id = product.id;
      });
      console.log("count", count, data_count);
      if (count <= data_count) {
        getProduct(count, data_count, since_id);
      } else {
        try {
          fs.writeFileSync("./public/csv/products.csv", product_csv_data);
        } catch (e) {
          console.log(e);
        }
        res.send({ msg: `CSV updated successfully.` });
      }
      //
    })
    .catch((err) => {
      console.log(err);
    });
}
function getAllProducts(all_product_count) {
  let count = 0;
  getProduct(count, all_product_count);
}
function updateProductCsv() {
  product_csv_data =
    "sku,variant id,product id,title,description,product url,image url,original price,sale price,quantity,quantity status\n";
  Shopify.get(`/admin/products/count.json`, function (err, data, headers) {
    console.log(data.count);
    getAllProducts(data.count);
  });
  cronMail();
}

// Schedule the task to run every 4 hours
// cron.schedule("0 */1 * * *", updateProductCsv);

app.post("/csv-update", (req, res) => {
  updateProductCsv();
});
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
