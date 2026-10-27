// Extracts evenly spaced frames from a video as JPEGs, using Apple's AVFoundation (no installs needed on macOS).
// Usage: swift scripts/extract-frames.swift <video> <output-folder> <count>
import AVFoundation
import Foundation
import ImageIO
import UniformTypeIdentifiers

let args = CommandLine.arguments
guard args.count == 4, let count = Int(args[3]), count > 0 else {
  FileHandle.standardError.write("usage: extract-frames.swift <video> <output-folder> <count>\n".data(using: .utf8)!)
  exit(2)
}
let asset = AVURLAsset(url: URL(fileURLWithPath: args[1]))
let outDir = URL(fileURLWithPath: args[2], isDirectory: true)
let seconds = CMTimeGetSeconds(asset.duration)
guard seconds.isFinite, seconds > 0 else {
  FileHandle.standardError.write("could not read the video (is it a .mov/.mp4?)\n".data(using: .utf8)!)
  exit(1)
}
let generator = AVAssetImageGenerator(asset: asset)
generator.appliesPreferredTrackTransform = true          // keep the phone's orientation
generator.maximumSize = CGSize(width: 2048, height: 2048)
generator.requestedTimeToleranceBefore = .zero
generator.requestedTimeToleranceAfter = .zero

// Skip the first and last 10% (where the recording starts and stops), spread the rest evenly.
let start = seconds * 0.1, span = seconds * 0.8
for i in 0..<count {
  let t = count == 1 ? seconds / 2 : start + span * Double(i) / Double(count - 1)
  do {
    let image = try generator.copyCGImage(at: CMTime(seconds: t, preferredTimescale: 600), actualTime: nil)
    let url = outDir.appendingPathComponent("face-\(i + 1).jpg")
    guard let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.jpeg.identifier as CFString, 1, nil) else { exit(1) }
    CGImageDestinationAddImage(dest, image, [kCGImageDestinationLossyCompressionQuality: 0.92] as CFDictionary)
    if !CGImageDestinationFinalize(dest) { exit(1) }
    print("face-\(i + 1).jpg at \(String(format: "%.1f", t))s (\(image.width)x\(image.height))")
  } catch {
    FileHandle.standardError.write("frame at \(t)s failed: \(error.localizedDescription)\n".data(using: .utf8)!)
    exit(1)
  }
}
