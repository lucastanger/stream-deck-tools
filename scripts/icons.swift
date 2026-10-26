import AppKit
import Foundation
let output = CommandLine.arguments[1]
try FileManager.default.createDirectory(atPath: output, withIntermediateDirectories: true)
func icon(_ name: String, size: Int, color: NSColor, slash: Bool = false, transparent: Bool = false, camera: Bool = false, reaction: Bool = false) throws {
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    let context = NSGraphicsContext(bitmapImageRep: rep)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = context
    let scale = CGFloat(size) / 72
    context.cgContext.scaleBy(x: scale, y: scale)
    if !transparent {
        NSColor(calibratedWhite: 0.08, alpha: 1).setFill()
        NSBezierPath(roundedRect: NSRect(x: 0, y: 0, width: 72, height: 72), xRadius: 9, yRadius: 9).fill()
    }
    color.setFill()
    color.setStroke()
    if reaction {
        let face = NSBezierPath(ovalIn: NSRect(x: 19, y: 25, width: 34, height: 34))
        face.lineWidth = 3; face.stroke()
        NSBezierPath(ovalIn: NSRect(x: 27, y: 45, width: 4, height: 4)).fill()
        NSBezierPath(ovalIn: NSRect(x: 41, y: 45, width: 4, height: 4)).fill()
        let smile = NSBezierPath()
        smile.lineWidth = 3; smile.lineCapStyle = .round
        smile.move(to: NSPoint(x: 27, y: 38))
        smile.curve(to: NSPoint(x: 45, y: 38), controlPoint1: NSPoint(x: 31, y: 29), controlPoint2: NSPoint(x: 41, y: 29))
        smile.stroke()
    } else if camera {
        NSBezierPath(roundedRect: NSRect(x: 17, y: 29, width: 27, height: 27), xRadius: 4, yRadius: 4).fill()
        let lens = NSBezierPath()
        lens.move(to: NSPoint(x: 46, y: 47))
        lens.line(to: NSPoint(x: 57, y: 54))
        lens.line(to: NSPoint(x: 57, y: 31))
        lens.line(to: NSPoint(x: 46, y: 38))
        lens.close(); lens.fill()
    } else {
        NSBezierPath(roundedRect: NSRect(x: 29, y: 33, width: 14, height: 26), xRadius: 7, yRadius: 7).fill()
        let arc = NSBezierPath()
        arc.lineWidth = 3
        arc.lineCapStyle = .round
        arc.move(to: NSPoint(x: 23, y: 43))
        arc.line(to: NSPoint(x: 23, y: 37))
        arc.curve(to: NSPoint(x: 49, y: 37), controlPoint1: NSPoint(x: 23, y: 20), controlPoint2: NSPoint(x: 49, y: 20))
        arc.line(to: NSPoint(x: 49, y: 43))
        arc.move(to: NSPoint(x: 36, y: 25)); arc.line(to: NSPoint(x: 36, y: 20))
        arc.move(to: NSPoint(x: 29, y: 20)); arc.line(to: NSPoint(x: 43, y: 20))
        arc.stroke()
    }
    if slash {
        let line = NSBezierPath()
        line.lineWidth = 4; line.lineCapStyle = .round
        line.move(to: NSPoint(x: 20, y: 58)); line.line(to: NSPoint(x: 52, y: 25)); line.stroke()
    }
    NSGraphicsContext.restoreGraphicsState()
    let data = rep.representation(using: .png, properties: [:])!
    try data.write(to: URL(fileURLWithPath: output).appendingPathComponent(name + ".png"))
}
let styles: [(String, NSColor, Bool)] = [
    ("mic-muted", NSColor(calibratedRed: 1, green: 0.28, blue: 0.3, alpha: 1), true),
    ("mic-live", NSColor(calibratedRed: 0.2, green: 0.9, blue: 0.48, alpha: 1), false),
    ("mic-unknown", NSColor(calibratedWhite: 0.55, alpha: 1), true),
    ("mic-blocked", NSColor(calibratedRed: 1, green: 0.7, blue: 0.15, alpha: 1), true),
    ("plugin", .white, false),
    ("camera-off", NSColor(calibratedRed: 1, green: 0.28, blue: 0.3, alpha: 1), true),
    ("camera-on", NSColor(calibratedRed: 0.2, green: 0.9, blue: 0.48, alpha: 1), false),
    ("camera-unknown", NSColor(calibratedWhite: 0.55, alpha: 1), true),
    ("camera-blocked", NSColor(calibratedRed: 1, green: 0.7, blue: 0.15, alpha: 1), true),
    ("reaction-ready", NSColor(calibratedRed: 0.25, green: 0.65, blue: 1, alpha: 1), false),
    ("reaction-unknown", NSColor(calibratedWhite: 0.55, alpha: 1), false),
    ("reaction-blocked", NSColor(calibratedRed: 1, green: 0.7, blue: 0.15, alpha: 1), false)
]
for (name, color, slash) in styles {
    try icon(name, size: 72, color: color, slash: slash, camera: name.hasPrefix("camera-"), reaction: name.hasPrefix("reaction-"))
    try icon(name + "@2x", size: 144, color: color, slash: slash, camera: name.hasPrefix("camera-"), reaction: name.hasPrefix("reaction-"))
}
for (name, size) in [("category", 28), ("action", 20), ("camera-action", 20), ("reaction-action", 20)] {
    try icon(name, size: size, color: .white, transparent: true, camera: name.hasPrefix("camera-"), reaction: name.hasPrefix("reaction-"))
    try icon(name + "@2x", size: size * 2, color: .white, transparent: true, camera: name.hasPrefix("camera-"), reaction: name.hasPrefix("reaction-"))
}
