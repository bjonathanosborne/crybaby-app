/**
 * Generates iOS app icon (1024x1024, no alpha) from the Crybaby logo.
 * Usage: bun run scripts/generate-icon.mjs
 */
import sharp from "sharp";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const inputPath = path.join(root, "public/images/crybaby-logo-transparent.png");
const outputPath = path.join(
  root,
  "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"
);

const SIZE = 1024;
const PADDING = 80; // px padding on each side
const logoSize = SIZE - PADDING * 2; // 864px

// Load logo, resize to fit within (logoSize x logoSize) maintaining aspect ratio
const logoBuffer = await sharp(inputPath)
  .resize(logoSize, logoSize, { fit: "inside", withoutEnlargement: false })
  .toBuffer();

const logoMeta = await sharp(logoBuffer).metadata();
const logoW = logoMeta.width;
const logoH = logoMeta.height;

// Center logo on white 1024x1024 canvas
const left = Math.round((SIZE - logoW) / 2);
const top = Math.round((SIZE - logoH) / 2);

await sharp({
  create: {
    width: SIZE,
    height: SIZE,
    channels: 3,
    background: { r: 255, g: 255, b: 255 },
  },
})
  .composite([{ input: logoBuffer, left, top }])
  .png({ compressionLevel: 9 })
  .toFile(outputPath);

console.log(`✅ App icon saved to ${outputPath}`);
console.log(`   Logo placed at (${left}, ${top}), size ${logoW}x${logoH}`);
