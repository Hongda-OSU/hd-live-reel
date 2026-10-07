import Foundation
import ImageCaptureCore

struct DownloadResult: Encodable {
    let id: String
    let path: String?
    /// Local path of the paired Live Photo video.
    let videoPath: String?
    let error: String?
}

enum Downloader {
    private static let perFileTimeout: TimeInterval = 300

    /// Copies each item (and its Live Photo video) to `<dir>/<folder>/<name>`.
    /// Failures are reported per item so one bad file does not sink the batch.
    static func download(ids: [String], from files: [ICCameraFile], to dir: URL) -> [DownloadResult] {
        let index = Dictionary(files.map { (Catalog.id(of: $0), $0) }, uniquingKeysWith: { first, _ in first })
        return ids.map { id in
            guard let file = index[id] else {
                return DownloadResult(id: id, path: nil, videoPath: nil, error: "not found on device")
            }
            do {
                let path = try fetch(file, to: dir)
                let videoPath = try Catalog.pairedVideo(of: file).map { try fetch($0, to: dir) }
                return DownloadResult(id: id, path: path, videoPath: videoPath, error: nil)
            } catch {
                return DownloadResult(id: id, path: nil, videoPath: nil, error: "\(error)")
            }
        }
    }

    private static func fetch(_ file: ICCameraFile, to dir: URL) throws -> String {
        let folder = dir.appendingPathComponent(file.parentFolder?.name ?? "", isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)

        let name = file.name ?? ""
        // The .overwrite option is ignored for iPhones (a repeat download
        // becomes "IMG_0001 1.HEIC"), so clear the target ourselves.
        let target = folder.appendingPathComponent(name)
        if FileManager.default.fileExists(atPath: target.path) {
            try FileManager.default.removeItem(at: target)
        }

        var finished = false
        var savedName: String?
        var failure: Error?
        file.requestDownload(options: [.downloadsDirectoryURL: folder]) { name, error in
            // Hop to main so the spinning run loop sees the result.
            DispatchQueue.main.async {
                savedName = name
                failure = error
                finished = true
            }
        }
        RunLoop.main.spin(until: Date().addingTimeInterval(perFileTimeout)) { finished }

        if let failure {
            throw HelperError("\(name): download failed: \(failure)")
        }
        guard finished, let savedName else {
            throw HelperError("\(name): download timed out")
        }

        let url = savedName.hasPrefix("/")
            ? URL(fileURLWithPath: savedName)
            : folder.appendingPathComponent(savedName)
        let size = (try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? NSNumber)?.int64Value
        // With "Optimize iPhone Storage" the full original may be in iCloud
        // only, and the device hands over something smaller.
        guard size == file.fileSize else {
            throw HelperError(
                "\(name): got \(size ?? -1) of \(file.fileSize) bytes; the original may be in iCloud only, open it on the iPhone first"
            )
        }
        return url.path
    }
}
