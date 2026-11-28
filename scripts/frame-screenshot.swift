#!/usr/bin/env swift
// Frames a store screenshot as docs/store/screenshots.md §2 says: a plain #F4F6F1 canvas, the
// caption in Space Grotesk Bold near the top, an optional second line in Inter, and the
// screenshot below at 80 % of the width with rounded corners. The PNG has no alpha channel.
//
//   swift scripts/frame-screenshot.swift <in.png> <out.png> <width> <height> "Caption" ["Second line"]
//
// Fonts come from the app's own packages in node_modules (@expo-google-fonts).
import AppKit
import CoreText
import ImageIO

let args = CommandLine.arguments
guard args.count >= 6, let width = Int(args[3]), let height = Int(args[4]) else {
  FileHandle.standardError.write("usage: frame-screenshot.swift in out width height caption [line2]\n".data(using: .utf8)!)
  exit(2)
}
let (input, output, caption) = (args[1], args[2], args[5])
let second = args.count > 6 ? args[6] : nil

let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
for path in [
  "node_modules/@expo-google-fonts/space-grotesk/700Bold/SpaceGrotesk_700Bold.ttf",
  "node_modules/@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf",
] {
  CTFontManagerRegisterFontsForURL(root.appendingPathComponent(path) as CFURL, .process, nil)
}

func color(_ hex: Int) -> NSColor {
  NSColor(
    srgbRed: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255,
    blue: CGFloat(hex & 0xFF) / 255, alpha: 1)
}

// 32 bits per pixel with the fourth byte unused: Quartz has no 24-bit context, and this one
// writes a PNG without an alpha channel, which the stores ask for.
guard let shot = NSImage(contentsOfFile: input),
  let cg = CGContext(
    data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
    space: CGColorSpace(name: CGColorSpace.sRGB)!,
    bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)
else {
  FileHandle.standardError.write("cannot read \(input)\n".data(using: .utf8)!)
  exit(1)
}

let W = CGFloat(width), H = CGFloat(height)
let scale = W / 1320  // sizes below are for the 1320-wide App Store canvas
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(cgContext: cg, flipped: false)

color(0xF4F6F1).setFill()
NSRect(x: 0, y: 0, width: W, height: H).fill()

// The screenshot: 80 % of the width, at the bottom, rounded.
let shotW = W * 0.8
let shotH = shotW * shot.size.height / shot.size.width
let shotRect = NSRect(x: (W - shotW) / 2, y: 70 * scale, width: shotW, height: shotH)
let corner = 64 * scale
NSGraphicsContext.saveGraphicsState()
NSBezierPath(roundedRect: shotRect, xRadius: corner, yRadius: corner).addClip()
shot.draw(in: shotRect)
NSGraphicsContext.restoreGraphicsState()
color(0xC9D2C4).setStroke()
let edge = NSBezierPath(roundedRect: shotRect, xRadius: corner, yRadius: corner)
edge.lineWidth = 3 * scale
edge.stroke()

// The caption, centred in the space above.
let centred = NSMutableParagraphStyle()
centred.alignment = .center
let titleFont = NSFont(name: "SpaceGrotesk-Bold", size: 92 * scale) ?? .boldSystemFont(ofSize: 92 * scale)
let lineFont = NSFont(name: "Inter-Regular", size: 52 * scale) ?? .systemFont(ofSize: 52 * scale)
let text = NSMutableAttributedString(
  string: caption,
  attributes: [.font: titleFont, .foregroundColor: color(0x16211B), .paragraphStyle: centred])
if let second {
  text.append(
    NSAttributedString(
      string: "\n" + second,
      attributes: [.font: lineFont, .foregroundColor: color(0x4A5A50), .paragraphStyle: centred]))
}
let top = shotRect.maxY
let box = NSRect(x: 90 * scale, y: top, width: W - 180 * scale, height: H - top)
let needed = text.boundingRect(with: box.size, options: [.usesLineFragmentOrigin]).height
text.draw(
  with: NSRect(x: box.minX, y: top + (box.height - needed) / 2, width: box.width, height: needed),
  options: [.usesLineFragmentOrigin])

NSGraphicsContext.restoreGraphicsState()
guard let image = cg.makeImage(),
  let dest = CGImageDestinationCreateWithURL(
    URL(fileURLWithPath: output) as CFURL, "public.png" as CFString, 1, nil)
else { exit(1) }
CGImageDestinationAddImage(dest, image, nil)
exit(CGImageDestinationFinalize(dest) ? 0 : 1)
