import Foundation
import ImageCaptureCore

/// Finds cameras (including iPhones) connected over USB.
final class DeviceBrowser: NSObject, ICDeviceBrowserDelegate {
    /// iPhones can be added just after the "enumerated" callback, so keep
    /// listening until no device has appeared for this long.
    private static let settleTime: TimeInterval = 0.5

    private let browser = ICDeviceBrowser()
    private var cameras: [ICCameraDevice] = []
    private var enumerated = false
    private var lastChange = Date()

    /// Spins the main run loop until enumeration settles or `timeout` passes.
    /// Keep the browser alive (and not stopped) while using the returned
    /// devices: stopping it removes them.
    func discover(timeout: TimeInterval) -> [ICCameraDevice] {
        browser.delegate = self
        browser.browsedDeviceTypeMask = ICDeviceTypeMask(
            rawValue: ICDeviceTypeMask.camera.rawValue | ICDeviceLocationTypeMask.local.rawValue
        )!
        browser.start()
        RunLoop.main.spin(until: Date().addingTimeInterval(timeout)) {
            self.enumerated && Date().timeIntervalSince(self.lastChange) > Self.settleTime
        }
        return cameras
    }

    func stop() {
        browser.stop()
    }

    func deviceBrowser(_ browser: ICDeviceBrowser, didAdd device: ICDevice, moreComing: Bool) {
        if let camera = device as? ICCameraDevice {
            cameras.append(camera)
        }
        lastChange = Date()
    }

    func deviceBrowser(_ browser: ICDeviceBrowser, didRemove device: ICDevice, moreGoing: Bool) {
        cameras.removeAll { $0 === device }
        lastChange = Date()
    }

    func deviceBrowserDidEnumerateLocalDevices(_ browser: ICDeviceBrowser) {
        enumerated = true
        lastChange = Date()
    }
}

extension RunLoop {
    /// Runs the loop in short slices until `done` returns true or `deadline` passes.
    func spin(until deadline: Date, done: () -> Bool) {
        while !done() && Date() < deadline {
            run(mode: .default, before: min(deadline, Date().addingTimeInterval(0.05)))
        }
    }
}
