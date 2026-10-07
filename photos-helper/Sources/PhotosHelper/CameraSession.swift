import Foundation
import ImageCaptureCore

struct HelperError: Error, CustomStringConvertible {
    let description: String
    init(_ description: String) { self.description = description }
}

/// An open session on one camera device. Use `open` before reading files.
final class CameraSession: NSObject, ICCameraDeviceDelegate {
    let camera: ICCameraDevice
    private var ready = false
    private var openError: Error?

    init(camera: ICCameraDevice) {
        self.camera = camera
    }

    /// Opens the session and waits until the device has sent its full catalog.
    func open(timeout: TimeInterval) throws {
        camera.delegate = self
        let deadline = Date().addingTimeInterval(timeout)

        // An unlocked iPhone still reports "passcode locked" on the first
        // request; that request is what makes it lift the restriction, so
        // wait for the restriction to clear and try once more.
        for attempt in 1...2 {
            openError = nil
            camera.requestOpenSession()
            RunLoop.main.spin(until: deadline) { self.ready || self.openError != nil }
            guard let error = openError else { break }

            if attempt == 1 && Self.isPasscodeLocked(error) {
                RunLoop.main.spin(until: min(deadline, Date().addingTimeInterval(3))) {
                    !self.camera.isAccessRestrictedAppleDevice
                }
                if !camera.isAccessRestrictedAppleDevice { continue }
            }
            if Self.isPasscodeLocked(error) {
                throw HelperError("iPhone is locked; unlock it and try again")
            }
            throw HelperError("could not open session: \(error)")
        }
        guard ready else {
            throw HelperError("timed out waiting for the device catalog")
        }
    }

    private static func isPasscodeLocked(_ error: Error) -> Bool {
        let error = error as NSError
        // ICReturnDeviceIsPasscodeLocked in ImageCaptureConstants.h
        return error.domain == ICErrorDomain && error.code == -9943
    }

    func close() {
        camera.requestCloseSession()
    }

    var files: [ICCameraFile] {
        (camera.mediaFiles ?? []).compactMap { $0 as? ICCameraFile }
    }

    // MARK: ICDeviceDelegate

    func device(_ device: ICDevice, didOpenSessionWithError error: Error?) {
        if let error { openError = error }
    }

    func device(_ device: ICDevice, didCloseSessionWithError error: Error?) {}

    func didRemove(_ device: ICDevice) {
        openError = HelperError("device was disconnected")
    }

    // MARK: ICCameraDeviceDelegate

    func deviceDidBecomeReady(withCompleteContentCatalog device: ICCameraDevice) {
        ready = true
    }

    func cameraDevice(_ camera: ICCameraDevice, didAdd items: [ICCameraItem]) {}
    func cameraDevice(_ camera: ICCameraDevice, didRemove items: [ICCameraItem]) {}
    func cameraDevice(_ camera: ICCameraDevice, didReceiveThumbnail thumbnail: CGImage?, for item: ICCameraItem, error: Error?) {}
    func cameraDevice(_ camera: ICCameraDevice, didReceiveMetadata metadata: [AnyHashable: Any]?, for item: ICCameraItem, error: Error?) {}
    func cameraDevice(_ camera: ICCameraDevice, didRenameItems items: [ICCameraItem]) {}
    func cameraDeviceDidChangeCapability(_ camera: ICCameraDevice) {}
    func cameraDevice(_ camera: ICCameraDevice, didReceivePTPEvent eventData: Data) {}
    func cameraDeviceDidRemoveAccessRestriction(_ device: ICDevice) {}
    func cameraDeviceDidEnableAccessRestriction(_ device: ICDevice) {}
}
