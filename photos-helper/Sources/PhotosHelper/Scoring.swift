import Foundation
import Vision

struct ScoreResult: Encodable {
    let path: String
    /// Apple's overall aesthetics score, -1 (poor) to 1 (great).
    let aesthetics: Float?
    /// Screenshots, receipts, documents and other "utility" pictures.
    let utility: Bool?
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
                featurePrint: print.results?.first.flatMap(floats),
                error: nil
            )
        } catch {
            return ScoreResult(
                path: path, aesthetics: nil, utility: nil, featurePrint: nil, error: "\(error)"
            )
        }
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
