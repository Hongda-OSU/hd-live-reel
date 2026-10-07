import Foundation
import ImageCaptureCore

// Command-line helper called by the Rust core. Writes JSON to stdout and
// human-readable errors to stderr.

struct DeviceInfo: Encodable {
    let id: String
    let name: String
    let productKind: String
    let transportType: String
    let accessRestricted: Bool

    init(_ camera: ICCameraDevice) {
        id = camera.uuidString ?? ""
        name = camera.name ?? ""
        productKind = camera.productKind ?? ""
        transportType = camera.transportType ?? ""
        accessRestricted = camera.isAccessRestrictedAppleDevice
    }
}

func printJSON<T: Encodable>(_ value: T) {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
    encoder.dateEncodingStrategy = .iso8601
    let data = try! encoder.encode(value)
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data("\n".utf8))
}

func fail(_ message: String, code: Int32 = 1) -> Never {
    FileHandle.standardError.write(Data("photos-helper: \(message)\n".utf8))
    exit(code)
}

/// Opens a session on the first connected device and runs `body` with it.
func withSession(_ body: (CameraSession) -> Void) {
    let browser = DeviceBrowser()
    defer { browser.stop() }
    guard let camera = browser.discover(timeout: 5).first else {
        fail("no device found")
    }
    let session = CameraSession(camera: camera)
    do {
        try session.open(timeout: 120)
    } catch {
        fail("\(error)")
    }
    defer { session.close() }
    body(session)
}

let usage = """
usage: photos-helper list-devices
       photos-helper list
       photos-helper download <id>... --to <dir>
       photos-helper thumbnails <id>... --to <dir> [--size <pixels>]
"""

/// Splits "<id>... --to <dir> [--size <n>]" into its parts.
func parseBatch(_ rest: [String]) -> (ids: [String], dir: URL, size: Int?) {
    var ids = rest
    var options: [String: String] = [:]
    for flag in ["--to", "--size"] {
        if let i = ids.firstIndex(of: flag) {
            guard i + 1 < ids.count else { fail(usage, code: 64) }
            options[flag] = ids[i + 1]
            ids.removeSubrange(i...i + 1)
        }
    }
    guard let dir = options["--to"], !ids.isEmpty else {
        fail(usage, code: 64)
    }
    let size = options["--size"].map { Int($0) ?? { fail(usage, code: 64) }() }
    return (ids, URL(fileURLWithPath: dir, isDirectory: true), size)
}

let args = Array(CommandLine.arguments.dropFirst())

switch args.first {
case "list-devices":
    let browser = DeviceBrowser()
    let cameras = browser.discover(timeout: 5)
    printJSON(cameras.map(DeviceInfo.init))
    browser.stop()
case "list":
    withSession { session in
        printJSON(Catalog.items(from: session.files))
    }
case "download":
    let batch = parseBatch(Array(args.dropFirst()))
    withSession { session in
        printJSON(Downloader.download(ids: batch.ids, from: session.files, to: batch.dir))
    }
case "thumbnails":
    let batch = parseBatch(Array(args.dropFirst()))
    withSession { session in
        printJSON(Thumbnails.fetch(
            ids: batch.ids, from: session.files, to: batch.dir, maxPixels: batch.size ?? 320
        ))
    }
case "-h", "--help":
    print(usage)
default:
    fail(usage, code: 64)
}
