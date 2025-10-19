'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Upload, Download, Trash2, Eye, EyeOff } from 'lucide-react';

type OperationType = 'blur' | 'pixelate' | 'fill';
type BlurStrength = 'low' | 'medium' | 'high';
type PixelateSize = 6 | 12 | 24;

interface Region {
  id: string;
  type: OperationType;
  coords: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  strength?: BlurStrength;
  blockSize?: PixelateSize;
  color?: string;
}

interface APIRegion {
  type: OperationType;
  coords: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  strength?: BlurStrength;
  blockSize?: PixelateSize;
  color?: string;
}

export function ImageRedactor() {
  const [image, setImage] = useState<string | null>(null);
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  const [regions, setRegions] = useState<Region[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentRegion, setCurrentRegion] = useState<Partial<Region> | null>(null);
  const [selectedOperation, setSelectedOperation] = useState<OperationType>('blur');
  const [blurStrength, setBlurStrength] = useState<BlurStrength>('high');
  const [pixelateSize, setPixelateSize] = useState<PixelateSize>(12);
  const [fillColor, setFillColor] = useState('#000000');
  const [processing, setProcessing] = useState(false);
  const [redactedImage, setRedactedImage] = useState<string | null>(null);
  const [showRegions, setShowRegions] = useState(true);
  const [apiUrl, setApiUrl] = useState('http://localhost:3000/v1/redact/base64');

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Load image and draw on canvas
  useEffect(() => {
    if (image && canvasRef.current && imageRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      const img = imageRef.current;

      img.onload = () => {
        // Set canvas size to match image
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });

        // Draw image
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
        ctx?.drawImage(img, 0, 0);

        // Draw regions
        if (showRegions) {
          drawRegions(ctx);
        }
      };

      // Trigger load if image is already cached
      if (img.complete) {
        img.onload(null as any);
      }
    }
  }, [image, regions, showRegions]);

  const drawRegions = (ctx: CanvasRenderingContext2D | null) => {
    if (!ctx) return;

    regions.forEach((region) => {
      ctx.strokeStyle = region.type === 'blur' ? '#3b82f6' : region.type === 'pixelate' ? '#a855f7' : '#ef4444';
      ctx.lineWidth = 3;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(region.coords.x, region.coords.y, region.coords.width, region.coords.height);

      // Fill with semi-transparent color
      ctx.fillStyle = region.type === 'blur' ? 'rgba(59, 130, 246, 0.2)' :
                       region.type === 'pixelate' ? 'rgba(168, 85, 247, 0.2)' :
                       'rgba(239, 68, 68, 0.2)';
      ctx.fillRect(region.coords.x, region.coords.y, region.coords.width, region.coords.height);
      ctx.setLineDash([]);
    });

    // Draw current region being drawn
    if (currentRegion && currentRegion.coords) {
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(
        currentRegion.coords.x,
        currentRegion.coords.y,
        currentRegion.coords.width,
        currentRegion.coords.height
      );
      ctx.setLineDash([]);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setImage(event.target?.result as string);
        setRegions([]);
        setRedactedImage(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const getCanvasCoordinates = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (redactedImage) return; // Don't allow drawing on redacted image

    const pos = getCanvasCoordinates(e);
    setIsDrawing(true);
    setStartPos(pos);
    setCurrentRegion({
      type: selectedOperation,
      coords: { x: pos.x, y: pos.y, width: 0, height: 0 },
    });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !currentRegion) return;

    const pos = getCanvasCoordinates(e);
    const width = pos.x - startPos.x;
    const height = pos.y - startPos.y;

    // Calculate the top-left corner and dimensions
    // If width/height is negative, we're dragging left/up, so use current position as origin
    const x = Math.min(startPos.x, pos.x);
    const y = Math.min(startPos.y, pos.y);
    const w = Math.abs(width);
    const h = Math.abs(height);

    setCurrentRegion({
      ...currentRegion,
      coords: {
        x,
        y,
        width: w,
        height: h,
      },
    });

    // Redraw canvas
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const img = imageRef.current;
    if (ctx && img) {
      ctx.clearRect(0, 0, canvas!.width, canvas!.height);
      ctx.drawImage(img, 0, 0);
      if (showRegions) {
        drawRegions(ctx);
      }
    }
  };

  const handleMouseUp = () => {
    if (!isDrawing || !currentRegion || !currentRegion.coords) return;

    // Only add if region has meaningful size
    if (currentRegion.coords.width > 5 && currentRegion.coords.height > 5) {
      const newRegion: Region = {
        id: Date.now().toString(),
        type: selectedOperation,
        coords: currentRegion.coords,
        ...(selectedOperation === 'blur' && { strength: blurStrength }),
        ...(selectedOperation === 'pixelate' && { blockSize: pixelateSize }),
        ...(selectedOperation === 'fill' && { color: fillColor }),
      };

      setRegions([...regions, newRegion]);
    }

    setIsDrawing(false);
    setCurrentRegion(null);
  };

  const deleteRegion = (id: string) => {
    setRegions(regions.filter((r) => r.id !== id));
  };

  const clearAllRegions = () => {
    setRegions([]);
    setRedactedImage(null);
  };

  const processImage = async () => {
    if (!image || regions.length === 0) return;

    setProcessing(true);
    try {
      // Convert data URL to base64 (remove data:image/png;base64, prefix)
      const base64Image = image.split(',')[1];

      // Prepare regions for API
      const apiRegions: APIRegion[] = regions.map((region) => ({
        type: region.type,
        coords: region.coords,
        ...(region.strength && { strength: region.strength }),
        ...(region.blockSize && { blockSize: region.blockSize }),
        ...(region.color && { color: region.color }),
      }));

      const payload = {
        image: base64Image,
        regions: apiRegions,
        output: {
          format: 'jpeg' as const,
          quality: 90,
        },
      };

      console.log('Sending request to:', apiUrl);
      console.log('Payload:', JSON.stringify(payload, null, 2));

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to process image');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setRedactedImage(url);
    } catch (error) {
      console.error('Error processing image:', error);
      alert(error instanceof Error ? error.message : 'Failed to process image');
    } finally {
      setProcessing(false);
    }
  };

  const downloadImage = () => {
    if (!redactedImage) return;

    const link = document.createElement('a');
    link.href = redactedImage;
    link.download = `redacted-${Date.now()}.jpg`;
    link.click();
  };

  const resetAll = () => {
    setImage(null);
    setRegions([]);
    setRedactedImage(null);
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Image Redaction Tool</h1>
        <p className="text-muted-foreground">
          Upload an image, select regions to redact, and download the processed result
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Panel - Controls */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Controls</CardTitle>
            <CardDescription>Upload and configure redaction settings</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Upload */}
            <div>
              <Label htmlFor="image-upload">Upload Image</Label>
              <div className="mt-2">
                <Input
                  id="image-upload"
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="cursor-pointer"
                />
              </div>
            </div>

            {/* API URL */}
            <div>
              <Label htmlFor="api-url">API Endpoint</Label>
              <Input
                id="api-url"
                type="text"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                className="mt-2"
              />
            </div>

            {image && (
              <>
                {/* Operation Type */}
                <div>
                  <Label>Redaction Type</Label>
                  <Tabs value={selectedOperation} onValueChange={(v) => setSelectedOperation(v as OperationType)} className="mt-2">
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value="blur">Blur</TabsTrigger>
                      <TabsTrigger value="pixelate">Pixelate</TabsTrigger>
                      <TabsTrigger value="fill">Fill</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>

                {/* Operation-specific settings */}
                {selectedOperation === 'blur' && (
                  <div>
                    <Label>Blur Strength</Label>
                    <Select value={blurStrength} onValueChange={(v) => setBlurStrength(v as BlurStrength)}>
                      <SelectTrigger className="mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {selectedOperation === 'pixelate' && (
                  <div>
                    <Label>Block Size</Label>
                    <Select value={pixelateSize.toString()} onValueChange={(v) => setPixelateSize(Number(v) as PixelateSize)}>
                      <SelectTrigger className="mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="6">Small (6px)</SelectItem>
                        <SelectItem value="12">Medium (12px)</SelectItem>
                        <SelectItem value="24">Large (24px)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {selectedOperation === 'fill' && (
                  <div>
                    <Label htmlFor="fill-color">Fill Color</Label>
                    <div className="flex gap-2 mt-2">
                      <Input
                        id="fill-color"
                        type="color"
                        value={fillColor}
                        onChange={(e) => setFillColor(e.target.value)}
                        className="w-16 h-10 p-1 cursor-pointer"
                      />
                      <Input
                        type="text"
                        value={fillColor}
                        onChange={(e) => setFillColor(e.target.value)}
                        className="flex-1"
                      />
                    </div>
                  </div>
                )}

                {/* Region List */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>Regions ({regions.length})</Label>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowRegions(!showRegions)}
                      title={showRegions ? 'Hide regions' : 'Show regions'}
                    >
                      {showRegions ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </Button>
                  </div>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {regions.map((region, idx) => (
                      <div
                        key={region.id}
                        className="flex items-center justify-between p-3 bg-secondary rounded-lg"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={region.type === 'blur' ? 'default' : region.type === 'pixelate' ? 'secondary' : 'destructive'}
                            >
                              {region.type}
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                              {Math.round(region.coords.width)}×{Math.round(region.coords.height)}
                            </span>
                          </div>
                          {region.strength && (
                            <p className="text-xs text-muted-foreground mt-1">Strength: {region.strength}</p>
                          )}
                          {region.blockSize && (
                            <p className="text-xs text-muted-foreground mt-1">Block: {region.blockSize}px</p>
                          )}
                          {region.color && (
                            <div className="flex items-center gap-2 mt-1">
                              <div className="w-4 h-4 rounded border" style={{ backgroundColor: region.color }} />
                              <p className="text-xs text-muted-foreground">{region.color}</p>
                            </div>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteRegion(region.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="space-y-2">
                  <Button
                    className="w-full"
                    onClick={processImage}
                    disabled={regions.length === 0 || processing}
                  >
                    {processing ? 'Processing...' : 'Process Image'}
                  </Button>
                  {redactedImage && (
                    <Button
                      className="w-full"
                      variant="outline"
                      onClick={downloadImage}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Download Redacted Image
                    </Button>
                  )}
                  <Button
                    className="w-full"
                    variant="destructive"
                    onClick={clearAllRegions}
                  >
                    Clear All Regions
                  </Button>
                  {image && (
                    <Button
                      className="w-full"
                      variant="outline"
                      onClick={resetAll}
                    >
                      Reset All
                    </Button>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Right Panel - Image Canvas */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>
              {redactedImage ? 'Redacted Image' : 'Original Image'}
            </CardTitle>
            <CardDescription>
              {!image && 'Upload an image to get started'}
              {image && !redactedImage && 'Click and drag to select regions to redact'}
              {redactedImage && 'Download your redacted image using the button on the left'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!image && (
              <div className="flex items-center justify-center h-96 bg-muted rounded-lg border-2 border-dashed">
                <div className="text-center">
                  <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No image uploaded</p>
                </div>
              </div>
            )}

            {image && !redactedImage && (
              <div className="relative overflow-auto max-h-[600px] border rounded-lg">
                <canvas
                  ref={canvasRef}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                  className="max-w-full cursor-crosshair"
                  style={{ display: 'block' }}
                />
                <img
                  ref={imageRef}
                  src={image}
                  alt="Original"
                  style={{ display: 'none' }}
                />
              </div>
            )}

            {redactedImage && (
              <div className="relative overflow-auto max-h-[600px] border rounded-lg">
                <img
                  src={redactedImage}
                  alt="Redacted"
                  className="max-w-full"
                />
              </div>
            )}

            {imageDimensions.width > 0 && (
              <p className="text-xs text-muted-foreground mt-2">
                Image dimensions: {imageDimensions.width} × {imageDimensions.height} px
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
