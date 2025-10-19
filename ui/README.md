# Image Redaction UI

A modern, user-friendly web interface for redacting sensitive information from images using Next.js, TypeScript, and shadcn/ui.

## Features

- 🖼️ **Image Upload** - Drag and drop or browse to upload images
- 🎨 **Interactive Selection** - Click and drag to select regions on the image
- 🔧 **Multiple Operations**:
  - **Blur** - Low, Medium, or High strength
  - **Pixelate** - Small (6px), Medium (12px), or Large (24px) blocks
  - **Fill** - Solid color with custom hex color picker
- 📝 **Region Management** - View, edit, and delete selected regions
- 👁️ **Toggle Visibility** - Show/hide region overlays
- 🚀 **Real-time Processing** - Instant redaction via API
- 💾 **Download** - Save redacted images as JPEG

## Getting Started

### Prerequisites

- Node.js 18+ 
- The Image Redaction API running on `http://localhost:3000`

### Installation

```bash
cd ui
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:3001](http://localhost:3001) in your browser.

## How to Use

1. **Upload an Image** - Click "Choose File" or drag an image
2. **Select Redaction Type** - Choose Blur, Pixelate, or Fill
3. **Draw Regions** - Click and drag on the image to select areas
4. **Process Image** - Click "Process Image" to send to the API
5. **Download** - Click "Download Redacted Image" to save

## Tech Stack

- **Framework**: Next.js 15
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: shadcn/ui
- **Icons**: Lucide React
