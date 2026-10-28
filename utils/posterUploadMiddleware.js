const multer = require("multer");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 1.5 * 1024 * 1024 // 1.5 MB
  }
}).single("poster");

/**
 * Middleware that parses multipart/form-data poster uploads BEFORE CSRF verification.
 * Populates req.body (including req.body._csrf) and req.file into memory.
 * Captures file size limit errors gracefully so CSRF validation and form error display succeed.
 */
function multipartPosterParser(req, res, next) {
  const contentType = req.headers["content-type"] || "";
  if (!contentType.includes("multipart/form-data")) {
    return next();
  }

  upload(req, res, (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        req.fileValidationError = "File is too large. Event poster must be under 1.5 MB.";
      } else {
        req.fileValidationError = `Upload error: ${err.message}`;
      }
    }
    next();
  });
}

module.exports = {
  multipartPosterParser
};

