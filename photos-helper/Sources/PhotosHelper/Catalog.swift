import Foundation
import ImageCaptureCore

/// One file on the device, addressed by "<folder>/<name>", which is unique
/// and stable across sessions (ImageCaptureCore's UUIDs are not unique).
struct FileRef: Encodable {
    let id: String
    let name: String
    let size: Int64

    init(_ file: ICCameraItem) {
        id = Catalog.id(of: file)
        name = file.name ?? ""
        size = (file as? ICCameraFile)?.fileSize ?? 0
    }
}

/// A photo, video or Live Photo as shown in the picker.
struct MediaItem: Encodable {
    enum Kind: String, Encodable {
        case photo, video, livePhoto
    }

    let id: String
    let kind: Kind
    let name: String
    let size: Int64
    let createdAt: Date?
    /// The paired video of a Live Photo.
    let video: FileRef?
}

enum Catalog {
    static func id(of item: ICCameraItem) -> String {
        "\(item.parentFolder?.name ?? "")/\(item.name ?? "")"
    }

    /// The Live Photo video among a photo's sidecars, if any.
    static func pairedVideo(of photo: ICCameraFile) -> ICCameraFile? {
        (photo.sidecarFiles ?? [])
            .compactMap { $0 as? ICCameraFile }
            .first { $0.uti == "public.movie" || $0.name?.uppercased().hasSuffix(".MOV") == true }
    }

    /// Builds picker items, newest first. Live Photo videos come from the
    /// photo's sidecar files; `.AAE` edit sidecars are ignored.
    static func items(from files: [ICCameraFile]) -> [MediaItem] {
        files.compactMap { file -> MediaItem? in
            switch file.uti {
            case "public.image":
                let video = pairedVideo(of: file)
                return MediaItem(
                    id: id(of: file),
                    kind: video == nil ? .photo : .livePhoto,
                    name: file.name ?? "",
                    size: file.fileSize,
                    createdAt: file.creationDate,
                    video: video.map(FileRef.init)
                )
            case "public.movie":
                return MediaItem(
                    id: id(of: file),
                    kind: .video,
                    name: file.name ?? "",
                    size: file.fileSize,
                    createdAt: file.creationDate,
                    video: nil
                )
            default:
                return nil
            }
        }
        .sorted { ($0.createdAt ?? .distantPast) > ($1.createdAt ?? .distantPast) }
    }
}
