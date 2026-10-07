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
"""

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
    var ids = Array(args.dropFirst())
    guard let flag = ids.firstIndex(of: "--to"), flag + 1 < ids.count else {
        fail(usage, code: 64)
    }
    let dir = URL(fileURLWithPath: ids[flag + 1], isDirectory: true)
    ids.removeSubrange(flag...flag + 1)
    guard !ids.isEmpty else {
        fail(usage, code: 64)
    }
    withSession { session in
        printJSON(Downloader.download(ids: ids, from: session.files, to: dir))
    }
case "-h", "--help":
    print(usage)
default:
    fail(usage, code: 64)
}
