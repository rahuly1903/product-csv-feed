const express = require("express");
const shopifyAPI = require("shopify-node-api");
const bodyParser = require("body-parser");
const cors = require("cors");
const nodemailer = require("nodemailer");
const AWS = require("aws-sdk");
const s3 = new AWS.S3();
const fs = require("@cyclic.sh/s3fs")(process.env.BUCKET_NAME);

require("dotenv").config();
const app = express();
const port = process.env.PORT || 4000;
// const fs = require("fs");

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
  subject: "કેમ છો ભાઈ",
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

app.get("/csv/products.csv", async (req, res) => {
  let filename = req.path.slice(1);

  try {
    let s3File = await s3
      .getObject({
        Bucket: process.env.BUCKET_NAME,
        Key: process.env.FILE_NAME,
      })
      .promise();

    res.set("Content-type", s3File.ContentType);
    res.send(s3File.Body).end();
  } catch (error) {
    if (error.code === "NoSuchKey") {
      console.log(`No such key ${filename}`);
      res.sendStatus(404).end();
    } else {
      console.log(error);
      res.sendStatus(500).end();
    }
  }
});

app.post("/csv-single-update", function (req, res) {
  const body = `Rahul,Yadav,2023`;
  s3.putObject({
    Bucket: process.env.BUCKET_NAME,
    Body: body,
    Key: process.env.FILE_NAME,
  })
    .promise()
    .then((data) => {
      console.log(data);
      console.log(`Upload succeeded - `, data);
      res.send({ msg: `CSV updated in S3 bucket successfully.` });
    })
    .catch((err) => {
      console.log("Upload failed:", err);
    });
});

app.post("/csv-update", (req, res) => {
  const c1 = performance.now();
  let count = 0;
  function getProduct(data_count, since_id = 0) {
    console.log(data_count, count, since_id);
    const getProducts = new Promise((resolve, reject) => {
      Shopify.get(
        `/admin/products.json?limit=250&&since_id=${since_id}`,
        function (err, data, headers) {
          // console.log(headers); // Headers returned from request
          if (err) return reject(err);
          resolve({ data });
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
                ? variant?.price + " USD"
                : variant.compare_at_price + " USD"
            },${variant?.price} USD,${variant?.inventory_quantity},${
              variant.inventory_quantity !== 0 ? "In Stock" : "Out of Stock"
            }\n`;
          });
          count++;
          since_id = product.id;
        });
        // if (count <= data_count) {
        if (count < data_count) {
          getProduct(data_count, since_id);
        } else {
          try {
            // fs.writeFileSync("./public/csv/products.csv", product_csv_data);
            s3.putObject({
              Bucket: process.env.BUCKET_NAME,
              Body: product_csv_data,
              Key: process.env.FILE_NAME,
            })
              .promise()
              .then((data) => {
                console.log(`Upload succeeded - `, data);
                const c2 = performance.now();
                console.log(c2 - c1);
                res.send({ msg: `CSV updated in S3 bucket successfully.` });
              })
              .catch((err) => {
                console.log("Upload failed:", err);
                res.send({ msg: `CSV updated in S3 bucket failed.` });
              });
          } catch (e) {
            res.send({ msg: `Error in processing S3 bucket data.` });
          }
        }
      })
      .catch((err) => {
        res.send({ msg: `Error in Fetching Shopify data.` });
      });
  }

  function updateProductCsv() {
    product_csv_data =
      "sku,variant id,product id,title,description,product url,image url,original price,sale price,quantity,quantity status\n";
    Shopify.get(`/admin/products/count.json`, function (err, data, headers) {
      getProduct(data.count);
    });
  }
  updateProductCsv();
});
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
