const fs = require("fs");
const http = require("http");
const path = require("path");
const pizzip = require("pizzip");
const { formidable } = require("formidable");
const { ocrSpace } = require("ocr-space-api-wrapper");
const sharp = require("sharp");
const Docxtemplater = require("docxtemplater");
const ImageModule = require("docxtemplater-image-module-free");
const os = require("os");
const ocrApiKey = process.env.OCR_API_KEY;
let UPLOAD_DIR = path.join(os.tmpdir(),"uploads");
const PORT = process.env.PORT || 3000;
http
  .createServer(async (req, res) => {
    if (req.url === "/") {
      //HTML SERVING START
      console.log("html requested!");
      let htmlFile = fs.readFileSync("index.html");
      res.writeHead(200, { "content-type": "text/html" });
      res.end(htmlFile);
    } //HTML SERVING END
    else if (req.url === "/start") {
      //PIC UPLOADING START
      //PIC UPLOADING START
      console.log("upload requested!!");
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });

      let form = formidable({
        uploadDir: UPLOAD_DIR,
        keepExtensions: true,
        filename: (name, ext, part) => {
          return path.basename(part.originalFilename);
        },
      });
      ///////

      await new Promise((resolve, reject) => {
        form.parse(req, (err, fields, files) => {
          if (err) reject(err);
          else resolve();
        });
      });

      ////
      // form.parse(req, async (err, fields, files) => {
      //   if (err) {
      //     res.writeHead(400);
      //     return res.end("Upload errorr");
      //   }
      // });

      let finalData = await getAllData();
      insertData(finalData);
      //fs.rmSync("/project/workspace/uploads", { recursive: true, force: true });
      //fs.mkdirSync("/project/workspace/uploads", { recursive: true });
      res.writeHead(200);
      res.end();
    } 
    //PIC UPLOADING END
    else if (req.url === "/download") {
      // DOWNLOADING WORD DOC START
      console.log("download is requesteed");
      const filePath = path.join(__dirname, "outputFile.docx");

      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404, { "Content-Type": "text/plain" });
          return res.end("File not found");
        }

        res.writeHead(200, {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": 'attachment; filename="Format.docx"',
        });

        res.end(data);
        try {
          fs.unlinkSync(path.join(__dirname, "outputFile.docx"));

          console.log("File deleted successfully");
        } catch (err) {
          console.error("Error deleting file:", err);
        }
      });
    } // DOWNLOADING WORD DOC END
    else {
    }
  })
  .listen(PORT, () => {
    console.log(`Server running at http://localhost:3000/`);
  });

async function insertData(allData) {
  console.log("insert dat strarted");

  let content = fs.readFileSync("Format.docx", "binary");
  let zip = new pizzip(content);

  let imageModule = {
    getImage(picPath, tagName) {
      return fs.readFileSync(picPath);
    },
    getSize(img, picPath, tagName) {
      if (tagName == "photo1") return [600, 310];
      if (tagName == "photo2") return [264, 198];
    },
  };

  let doc = new Docxtemplater(zip, {
    modules: [new ImageModule(imageModule)],
  });

  //console.log("insert data before render");
  let pages = allData;
  //console.log(pages);

  doc.render({ pages });
  //console.log("insert data  after");

  let buffer = doc.getZip().generate({ type: "nodebuffer" });
  fs.writeFileSync("outputFile.docx", buffer);
  fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
  //console.log("Generated + uploaded pic deleted.");
}
///////////////////////////////////////////////[1]    [2]        [0]

// IMAGE PRE-PROCESSING

async function preprocessImage(inputPath) {
  await sharp(inputPath)
    //
    .extract({ left: 93, top: 0, width: 134, height: 56 })
    .resize({ width: 1200, fit: "inside" })
    .grayscale()
    .normalize()
    .sharpen()
    .png()
    .toFile(path.join(__dirname,"PROCESED.png"));

  console.log("Preprocessing completed + file deleted:");
  return path.join(__dirname,"PROCESED.png");
}

async function test(imagePath) {
  const res2 = await ocrSpace(imagePath, {
    apiKey:ocrApiKey,
  });
  let ocrData = res2.ParsedResults[0].ParsedText;
  let cleanedData = ocrData
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  let numbers = cleanedData
    .filter((v) => /\d/.test(v))
    .map((v) => Number(v.replace(/[^\d.]/g, "")));
  let sorted = [...numbers].sort((a, b) => a - b);
  let min = sorted[0];
  let medium = sorted[1];
  let max = sorted[2];

  console.log(cleanedData);
  console.log({ min, medium, max });
  //fs.unlinkSync("/project/workspace/uploads/PROCESED.png");

  return sorted;
}
//test("/project/workspace/uploads/PROCESED.png");
async function getAllData() {
  let insertDataObject = [];

  let imagesDir = UPLOAD_DIR;
  let imageArr = fs.readdirSync(imagesDir);

  imageArr.sort((a, b) => {
    let numA = Number(a.slice(3, -4));
    let numB = Number(b.slice(3, -4));
    return numA - numB;
  });
  for (let i = 0; i < imageArr.length - 1; i = i + 2) {
    let tempPathDig = fs.readFileSync(
      path.join(UPLOAD_DIR, imageArr[i])
    );

    let tempPathIr = fs.readFileSync(
      path.join(UPLOAD_DIR, imageArr[i + 1])
    );
    let processedImgPath = await preprocessImage(tempPathIr);
    let ocrDataArr = await test(processedImgPath);
    if (ocrDataArr) {
      console.log("Got OCr DATA , going on..");
      //console.log(ocrDataArr);
      let diff_temp = ocrDataArr[2] - ocrDataArr[1];
      diff_temp = diff_temp.toFixed(1);
      insertDataObject.push({
        DATE: "DAT INSERTED",
        AMB_TEMP: ocrDataArr[1],
        HOT_TEMP: ocrDataArr[2],
        COLD_TEMP: ocrDataArr[0],
        DIFF_TEMP: diff_temp,
        photo1: path.join(UPLOAD_DIR, imageArr[i + 1]),
        photo2: path.join(UPLOAD_DIR, imageArr[i]),
      });
    }
  }
  console.log("get all data completed");
  return insertDataObject;
}
