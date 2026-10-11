// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "photos-helper",
    // Vision aesthetics scores need macOS 15.
    platforms: [.macOS(.v15)],
    products: [
        .executable(name: "photos-helper", targets: ["PhotosHelper"])
    ],
    targets: [
        .executableTarget(
            name: "PhotosHelper",
            path: "Sources/PhotosHelper",
            swiftSettings: [
                // ImageCaptureCore delegates predate Sendable annotations.
                .swiftLanguageMode(.v5)
            ]
        )
    ]
)
