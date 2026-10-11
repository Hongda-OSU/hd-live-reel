import Foundation
import ImageIO
import Vision

struct ScoreResult: Encodable {
    let path: String
    /// Apple's overall aesthetics score, -1 (poor) to 1 (great).
    let aesthetics: Float?
    /// Screenshots, receipts, documents and other "utility" pictures.
    let utility: Bool?
    /// Mean brightness change between neighbouring pixels of a small grey
    /// copy; near 0 for an empty sky, which Vision still scores well.
    let detail: Float?
    /// Vision's image feature print; the Euclidean distance between two is
    /// small for near-identical pictures.
    let featurePrint: [Float]?
    let error: String?
}

enum Scoring {
    /// Scores each image file (thumbnails are enough), several at a time.
    static func score(paths: [String]) -> [ScoreResult] {
        var results = [ScoreResult?](repeating: nil, count: paths.count)
        let lock = NSLock()
        DispatchQueue.concurrentPerform(iterations: paths.count) { i in
            let result = score(path: paths[i])
            lock.withLock { results[i] = result }
        }
        return results.map { $0! }
    }

    private static func score(path: String) -> ScoreResult {
        let aesthetics = VNCalculateImageAestheticsScoresRequest()
        let print = VNGenerateImageFeaturePrintRequest()
        do {
            try VNImageRequestHandler(url: URL(fileURLWithPath: path)).perform([aesthetics, print])
            let scores = aesthetics.results?.first
            return ScoreResult(
                path: path,
                aesthetics: scores?.overallScore,
                utility: scores?.isUtility,
                detail: detail(of: URL(fileURLWithPath: path)),
                featurePrint: print.results?.first.flatMap(floats),
                error: nil
            )
        } catch {
            return ScoreResult(
                path: path, aesthetics: nil, utility: nil, detail: nil, featurePrint: nil,
                error: "\(error)"
            )
        }
    }

    private static let detailSide = 96

    private static func detail(of url: URL) -> Float? {
        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
            let image = CGImageSourceCreateImageAtIndex(source, 0, nil)
        else { return nil }
        let scale = Double(detailSide) / Double(max(image.width, image.height))
        let width = max(2, Int(Double(image.width) * scale))
        let height = max(2, Int(Double(image.height) * scale))
        var grey = [UInt8](repeating: 0, count: width * height)
        let drawn = grey.withUnsafeMutableBytes { buffer -> Bool in
            guard
                let context = CGContext(
                    data: buffer.baseAddress, width: width, height: height, bitsPerComponent: 8,
                    bytesPerRow: width, space: CGColorSpaceCreateDeviceGray(),
                    bitmapInfo: CGImageAlphaInfo.none.rawValue)
            else { return false }
            context.interpolationQuality = .high
            context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
            return true
        }
        guard drawn else { return nil }
        var total = 0
        for y in 0..<height - 1 {
            for x in 0..<width - 1 {
                let here = Int(grey[y * width + x])
                total += abs(here - Int(grey[y * width + x + 1]))
                total += abs(here - Int(grey[(y + 1) * width + x]))
            }
        }
        return Float(total) / Float((width - 1) * (height - 1))
    }

    private static func floats(_ observation: VNFeaturePrintObservation) -> [Float]? {
        let data = observation.data
        switch observation.elementType {
        case .float:
            return data.withUnsafeBytes { Array($0.bindMemory(to: Float.self)) }
        case .double:
            return data.withUnsafeBytes { $0.bindMemory(to: Double.self).map(Float.init) }
        default:
            return nil
        }
    }
}
