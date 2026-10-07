import Foundation
import ImageCaptureCore

struct ThumbnailResult: Encodable {
    let id: String
    let path: String?
    let error: String?
}

enum Thumbnails {
    private static let timeout: TimeInterval = 120

    /// Writes a JPEG thumbnail per item to `<dir>/<folder>/<name>.jpg`.
    /// Existing files are reused, so repeat calls only fetch what is new.
    /// All requests go out at once; the device answers them in parallel.
    static func fetch(ids: [String], from files: [ICCameraFile], to dir: URL, maxPixels: Int) -> [ThumbnailResult] {
        let index = Dictionary(files.map { (Catalog.id(of: $0), $0) }, uniquingKeysWith: { first, _ in first })
        var results: [String: ThumbnailResult] = [:]
        var pending = 0

        for id in ids {
            guard let file = index[id] else {
                results[id] = ThumbnailResult(id: id, path: nil, error: "not found on device")
                continue
            }
            let target = dir.appendingPathComponent(id + ".jpg")
            if FileManager.default.fileExists(atPath: target.path) {
                results[id] = ThumbnailResult(id: id, path: target.path, error: nil)
                continue
            }
            pending += 1
            file.requestThumbnailData(options: [.imageSourceThumbnailMaxPixelSize: maxPixels]) { data, error in
                // Completion runs on an arbitrary queue; hop to main for state.
                DispatchQueue.main.async {
                    pending -= 1
                    results[id] = write(data, error, to: target, id: id)
                }
            }
        }

        RunLoop.main.spin(until: Date().addingTimeInterval(timeout)) { pending == 0 }
        return ids.map { results[$0] ?? ThumbnailResult(id: $0, path: nil, error: "timed out") }
    }

    private static func write(_ data: Data?, _ error: Error?, to target: URL, id: String) -> ThumbnailResult {
        guard let data, error == nil else {
            return ThumbnailResult(id: id, path: nil, error: "\(error.map { "\($0)" } ?? "no data")")
        }
        do {
            try FileManager.default.createDirectory(
                at: target.deletingLastPathComponent(), withIntermediateDirectories: true
            )
            try data.write(to: target, options: .atomic)
            return ThumbnailResult(id: id, path: target.path, error: nil)
        } catch {
            return ThumbnailResult(id: id, path: nil, error: "\(error)")
        }
    }
}
