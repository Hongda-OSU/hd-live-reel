import Foundation
import ImageCaptureCore

struct DurationResult: Encodable {
    let id: String
    let seconds: Double?
    let error: String?
}

/// Video lengths without downloading the videos. ImageCaptureCore reports
/// 0 for a Live Photo's video, so each is read from its own header: the
/// box headers up to `moov`, then `moov` itself (about 15 KB, at the end
/// of an iPhone MOV), whose `mvhd` holds the length.
enum Durations {
    private static let timeout: TimeInterval = 60

    /// Lengths in seconds for picker items: a Live Photo's paired video, or
    /// the video itself. All requests go out at once, like thumbnails.
    static func fetch(ids: [String], from files: [ICCameraFile]) -> [DurationResult] {
        let index = Dictionary(files.map { (Catalog.id(of: $0), $0) }, uniquingKeysWith: { first, _ in first })
        var results: [String: DurationResult] = [:]
        var pending = 0

        for id in ids {
            guard let item = index[id] else {
                results[id] = DurationResult(id: id, seconds: nil, error: "not found on device")
                continue
            }
            guard let movie = item.uti == "public.movie" ? item : Catalog.pairedVideo(of: item) else {
                results[id] = DurationResult(id: id, seconds: nil, error: "no video")
                continue
            }
            pending += 1
            MovieHeader.duration(of: movie) { seconds, error in
                // Completion runs on an arbitrary queue; hop to main for state.
                DispatchQueue.main.async {
                    pending -= 1
                    results[id] = DurationResult(id: id, seconds: seconds, error: error)
                }
            }
        }

        RunLoop.main.spin(until: Date().addingTimeInterval(timeout)) { pending == 0 }
        return ids.map { results[$0] ?? DurationResult(id: $0, seconds: nil, error: "timed out") }
    }
}

enum MovieHeader {
    typealias Done = (Double?, String?) -> Void

    static func duration(of file: ICCameraFile, done: @escaping Done) {
        walk(file, from: 0, done: done)
    }

    /// Reads the box header at `offset`; moves on to the next box until it
    /// finds `moov`, then reads that whole box.
    private static func walk(_ file: ICCameraFile, from offset: Int64, done: @escaping Done) {
        guard offset + 8 <= file.fileSize else { return done(nil, "no moov box") }
        file.requestReadData(atOffset: off_t(offset), length: 16) { data, error in
            guard let data, data.count >= 8 else { return done(nil, error.map { "\($0)" } ?? "short read") }
            let bytes = [UInt8](data)
            var size = Int64(read(bytes, at: 0, count: 4))
            if size == 1 && bytes.count >= 16 { size = Int64(read(bytes, at: 8, count: 8)) }
            if size == 0 { size = file.fileSize - offset }
            guard size >= 8 else { return done(nil, "bad box at \(offset)") }
            if String(decoding: bytes[4..<8], as: UTF8.self) != "moov" {
                return walk(file, from: offset + size, done: done)
            }
            file.requestReadData(atOffset: off_t(offset), length: off_t(size)) { moov, error in
                guard let moov else { return done(nil, error.map { "\($0)" } ?? "no moov data") }
                if let seconds = movieLength(in: [UInt8](moov)) {
                    done(seconds, nil)
                } else {
                    done(nil, "no mvhd")
                }
            }
        }
    }

    /// Length from the `mvhd` box: duration over timescale. Version 1 uses
    /// 64-bit times, version 0 32-bit ones.
    static func movieLength(in moov: [UInt8]) -> Double? {
        let tag = Array("mvhd".utf8)
        guard let at = (0...max(0, moov.count - 4)).first(where: { Array(moov[$0..<$0 + 4]) == tag }) else {
            return nil
        }
        let body = at + 4
        guard body < moov.count else { return nil }
        let wide = moov[body] == 1
        let timescaleAt = body + 4 + (wide ? 16 : 8)
        let durationAt = timescaleAt + 4
        guard durationAt + (wide ? 8 : 4) <= moov.count else { return nil }
        let timescale = read(moov, at: timescaleAt, count: 4)
        let duration = read(moov, at: durationAt, count: wide ? 8 : 4)
        return timescale > 0 ? Double(duration) / Double(timescale) : nil
    }

    /// A big-endian unsigned integer of `count` bytes.
    private static func read(_ bytes: [UInt8], at offset: Int, count: Int) -> UInt64 {
        bytes[offset..<offset + count].reduce(0) { $0 << 8 | UInt64($1) }
    }
}
