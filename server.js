const express = require("express");
const cors = require("cors");
const sharp = require("sharp");
require("dotenv").config();

const { GoogleGenAI } = require("@google/genai");

const gemini = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

console.log("server.js started");

const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.static("public"));

function normalizePixabayImage(img) {
  return {
    id: `pixabay-${img.id}`,
    source: "Pixabay",
    title: img.tags || "Pixabay image",
    tags: img.tags || "",
    width: img.imageWidth,
    height: img.imageHeight,
    thumb: img.previewURL || img.webformatURL || img.largeImageURL || "",
    preview: img.webformatURL || img.previewURL || img.largeImageURL || "",
    download: img.largeImageURL || img.webformatURL || img.previewURL || "",
    author: img.user || "Pixabay User",
    pageUrl: img.pageURL || ""
  };
}

function normalizePexelsImage(photo) {
  return {
    id: `pexels-${photo.id}`,
    source: "Pexels",
    title: photo.alt || "Pexels image",
    tags: photo.alt || "",
    width: photo.width,
    height: photo.height,
    thumb: photo.src?.medium || photo.src?.large || "",
    preview: photo.src?.large || photo.src?.medium || "",
    download: photo.src?.large2x || photo.src?.large || photo.src?.original || "",
    author: photo.photographer || "Pexels Photographer",
    pageUrl: photo.url || ""
  };
}

function dedupeImages(images) {
  const seen = new Set();
  return images.filter((img) => {
    const key = img.download || img.preview || img.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function searchPixabay({
  keyword,
  category = "",
  min_width = 0,
  min_height = 0,
  per_page = 6,
  orientation = "all"
}) {
  if (!process.env.PIXABAY_KEY) {
    throw new Error("Missing PIXABAY_KEY in .env file");
  }

  const url = new URL("https://pixabay.com/api/");
  url.searchParams.set("key", process.env.PIXABAY_KEY);
  url.searchParams.set("q", keyword.trim());
  url.searchParams.set("image_type", "photo");
  url.searchParams.set("per_page", Math.min(Number(per_page) || 6, 20));
  url.searchParams.set("safesearch", "true");
  url.searchParams.set("editors_choice", "true");
  url.searchParams.set("order", "popular");

  if (category) url.searchParams.set("category", category);
  if (Number(min_width) > 0) url.searchParams.set("min_width", Number(min_width));
  if (Number(min_height) > 0) url.searchParams.set("min_height", Number(min_height));
  if (orientation && orientation !== "all") {
    url.searchParams.set("orientation", orientation);
  }

  const response = await fetch(url);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Pixabay API failed: ${errorText}`);
  }

  const data = await response.json();
  return (data.hits || []).map(normalizePixabayImage);
}

async function searchPexels({
  keyword,
  per_page = 6,
  orientation = "all"
}) {
  if (!process.env.PEXELS_KEY) {
    throw new Error("Missing PEXELS_KEY in .env file");
  }

  const url = new URL("https://api.pexels.com/v1/search");
  url.searchParams.set("query", keyword.trim());
  url.searchParams.set("per_page", Math.min(Number(per_page) || 6, 20));

  if (orientation && orientation !== "all") {
    const pexelsOrientation =
      orientation === "horizontal"
        ? "landscape"
        : orientation === "vertical"
        ? "portrait"
        : "";
    if (pexelsOrientation) {
      url.searchParams.set("orientation", pexelsOrientation);
    }
  }

  const response = await fetch(url, {
    headers: {
      Authorization: process.env.PEXELS_KEY
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Pexels API failed: ${errorText}`);
  }

  const data = await response.json();
  return (data.photos || []).map(normalizePexelsImage);
}

app.get("/api/search/pixabay", async (req, res) => {
  try {
    const { keyword = "" } = req.query;
    if (!keyword.trim()) {
      return res.status(400).json({ error: "Keyword is required" });
    }

    const images = await searchPixabay(req.query);
    res.json({ source: "Pixabay", images });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || "Pixabay search failed" });
  }
});

app.get("/api/search/pexels", async (req, res) => {
  try {
    const { keyword = "" } = req.query;
    if (!keyword.trim()) {
      return res.status(400).json({ error: "Keyword is required" });
    }

    const images = await searchPexels(req.query);
    res.json({ source: "Pexels", images });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || "Pexels search failed" });
  }
});

app.get("/api/search/all", async (req, res) => {
  try {
    const { keyword = "" } = req.query;
    if (!keyword.trim()) {
      return res.status(400).json({ error: "Keyword is required" });
    }

    const results = await Promise.allSettled([
      searchPixabay(req.query),
      searchPexels(req.query)
    ]);

    const pixabayImages =
  results[0].status === "fulfilled" ? results[0].value : [];
const pexelsImages =
  results[1].status === "fulfilled" ? results[1].value : [];

const status = {
  pixabay: {
    ok: results[0].status === "fulfilled",
    count: pixabayImages.length,
    error: results[0].status === "rejected" ? (results[0].reason?.message || "Unknown error") : ""
  },
  pexels: {
    ok: results[1].status === "fulfilled",
    count: pexelsImages.length,
    error: results[1].status === "rejected" ? (results[1].reason?.message || "Unknown error") : ""
  }
};

const images = dedupeImages([...pixabayImages, ...pexelsImages])
  .sort((a, b) => {
    return (b.width * b.height) - (a.width * a.height);
  })
  .slice(0, Number(req.query.per_page) || 12);

res.json({
  source: "All Sources",
  images,
  status
});
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || "Multi-source search failed" });
  }
});
async function processImage({ imageUrl, previewUrl = "", width, height, format = "jpg" }) {
  const allowedFormats = ["jpg", "jpeg", "png", "webp"];
  const outputFormat = String(format).toLowerCase();

  if (!allowedFormats.includes(outputFormat)) {
    throw new Error("Unsupported format");
  }

  async function fetchImageBuffer(urlToFetch) {
    const response = await fetch(urlToFetch, {
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "image/*,*/*;q=0.8",
        "Referer": "http://localhost:3000/"
      }
    });

    if (!response.ok) {
      throw new Error(`Remote fetch failed with status ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      throw new Error("Remote URL did not return an image");
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  let inputBuffer;

  try {
    inputBuffer = await fetchImageBuffer(imageUrl);
  } catch (error) {
    if (previewUrl) {
      inputBuffer = await fetchImageBuffer(previewUrl);
    } else {
      throw error;
    }
  }

  let transformer = sharp(inputBuffer);

  const resizeWidth = Number(width) || null;
  const resizeHeight = Number(height) || null;

  if (resizeWidth || resizeHeight) {
transformer = transformer.resize(resizeWidth, resizeHeight, {
  fit: "cover",
  position: "centre"
});
  }

  let outputBuffer;
  let contentType = "image/jpeg";
  let extension = "jpg";

  if (outputFormat === "png") {
    outputBuffer = await transformer.png().toBuffer();
    contentType = "image/png";
    extension = "png";
  } else if (outputFormat === "webp") {
    outputBuffer = await transformer.webp({ quality: 90 }).toBuffer();
    contentType = "image/webp";
    extension = "webp";
  } else {
    outputBuffer = await transformer.jpeg({ quality: 90 }).toBuffer();
    contentType = "image/jpeg";
    extension = "jpg";
  }

  return { outputBuffer, contentType, extension };
}
app.get("/api/convert", async (req, res) => {
  try {
    const { imageUrl, previewUrl = "", width, height, format = "jpg", filename = "image" } = req.query;

    if (!imageUrl && !previewUrl) {
      return res.status(400).json({ error: "imageUrl or previewUrl is required" });
    }

    const allowedFormats = ["jpg", "jpeg", "png", "webp"];
    const outputFormat = String(format).toLowerCase();

    if (!allowedFormats.includes(outputFormat)) {
      return res.status(400).json({ error: "Unsupported format" });
    }

    async function fetchImageBuffer(urlToFetch) {
      const response = await fetch(urlToFetch, {
        redirect: "follow",
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Accept": "image/*,*/*;q=0.8",
          "Referer": "http://localhost:3000/"
        }
      });

      if (!response.ok) {
        throw new Error(`Remote fetch failed with status ${response.status}`);
      }

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.startsWith("image/")) {
        throw new Error("Remote URL did not return an image");
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }

    let inputBuffer;

    try {
      inputBuffer = await fetchImageBuffer(imageUrl);
    } catch (error) {
      if (previewUrl) {
        inputBuffer = await fetchImageBuffer(previewUrl);
      } else {
        throw error;
      }
    }

    let transformer = sharp(inputBuffer);

    const resizeWidth = Number(width) || null;
    const resizeHeight = Number(height) || null;

    if (resizeWidth || resizeHeight) {
  transformer = transformer.resize(resizeWidth, resizeHeight, {
    fit: "cover"
  });
}

    let outputBuffer;
    let contentType = "image/jpeg";
    let extension = "jpg";

    if (outputFormat === "png") {
      outputBuffer = await transformer.png().toBuffer();
      contentType = "image/png";
      extension = "png";
    } else if (outputFormat === "webp") {
      outputBuffer = await transformer.webp({ quality: 90 }).toBuffer();
      contentType = "image/webp";
      extension = "webp";
    } else {
      outputBuffer = await transformer.jpeg({ quality: 90 }).toBuffer();
      contentType = "image/jpeg";
      extension = "jpg";
    }
const safeFilename = String(filename)
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "") || "image";
    res.setHeader("Content-Type", contentType);
    res.setHeader(
  "Content-Disposition",
  `attachment; filename="${safeFilename}.${extension}"`
);

    res.send(outputBuffer);
  } catch (error) {
    console.error("Convert route error:", error);
    res.status(500).json({
      error: "Could not download source image",
      details: error.message
    });
  }
});

app.get("/api/preview-convert", async (req, res) => {
  try {
    const { imageUrl = "", previewUrl = "", width, height, format = "jpg" } = req.query;

    if (!imageUrl && !previewUrl) {
      return res.status(400).json({ error: "imageUrl or previewUrl is required" });
    }

    const { outputBuffer, contentType } = await processImage({
      imageUrl: previewUrl || imageUrl,
      previewUrl: "",
      width,
      height,
      format
    });

    res.setHeader("Content-Type", contentType);
    res.send(outputBuffer);
  } catch (error) {
    console.error("Preview route error:", error);
    res.status(500).json({
      error: "Preview generation failed",
      details: error.message
    });
  }
});
app.post("/api/generate-image", async (req, res) => {
  try {
    const {
      prompt = "",
      width = 1024,
      height = 1024,
      count = 1
    } = req.body || {};

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "Missing GEMINI_API_KEY in .env file" });
    }

    if (!prompt.trim()) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    const safeCount = Math.max(1, Math.min(Number(count) || 1, 2));

    const aspectRatio =
      Number(width) > Number(height)
        ? "16:9"
        : Number(width) < Number(height)
        ? "9:16"
        : "1:1";

    const generated = [];

    for (let i = 0; i < safeCount; i += 1) {
      const response = await gemini.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: prompt,
        config: {
          responseModalities: ["Image"],
          imageConfig: {
            aspectRatio
          }
        }
      });

      const parts = response?.candidates?.[0]?.content?.parts || [];

      for (const part of parts) {
        if (part.inlineData?.data) {
          generated.push({
            source: "Gemini",
            mimeType: part.inlineData.mimeType || "image/png",
            data: part.inlineData.data
          });
        }
      }
    }

    if (!generated.length) {
      return res.status(500).json({
        error: "No image returned by Gemini",
        details: "The response did not include inline image data."
      });
    }

    res.json({ images: generated });
  } catch (error) {
    console.error("Gemini generate error:", error);
    res.status(500).json({
      error: "Gemini image generation failed",
      details: error.message
    });
  }
});
app.get("/api/image-proxy", async (req, res) => {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({ error: "Image url is required" });
    }

    const response = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "image/*,*/*;q=0.8",
        "Referer": "http://localhost:3000/"
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Remote image fetch failed with status ${response.status}`
      });
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(buffer);
  } catch (error) {
    console.error("Image proxy error:", error);
    res.status(500).json({
      error: "Image proxy failed",
      details: error.message
    });
  }
});
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
