// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "photos-helper",
    platforms: [.macOS(.v14)],
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
