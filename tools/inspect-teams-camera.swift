// Read-only camera-control probe. Never invokes Accessibility actions.
import AppKit
import ApplicationServices
import Foundation
func attribute(_ e: AXUIElement, _ key: String) -> CFTypeRef? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(e, key as CFString, &value) == .success else { return nil }
    return value
}
func text(_ e: AXUIElement, _ key: String) -> String { attribute(e, key) as? String ?? "" }
guard AXIsProcessTrusted() else { print("Accessibility permission required"); exit(2) }
guard let app = NSRunningApplication.runningApplications(withBundleIdentifier: "com.microsoft.teams2").first else { print("Teams not running"); exit(1) }
let root = AXUIElementCreateApplication(app.processIdentifier)
AXUIElementSetMessagingTimeout(root, 0.15)
var queue = (attribute(root, kAXWindowsAttribute) as? [AXUIElement] ?? []).map { ($0, 0) }
var seen = Set<AXUIElement>()
var index = 0
let deadline = Date().addingTimeInterval(4)
while index < queue.count && seen.count < 8000 && Date() < deadline {
    let (element, depth) = queue[index]; index += 1
    guard seen.insert(element).inserted else { continue }
    if text(element, kAXRoleAttribute) == "AXButton" {
        let title = text(element, kAXTitleAttribute)
        let description = text(element, kAXDescriptionAttribute)
        let label = "\(title) \(description)".lowercased()
        if label.contains("camera") || label.contains("video") {
            print("Camera candidate: title=\(title), description=\(description), enabled=\(String(describing: attribute(element, kAXEnabledAttribute)))")
        }
    }
    if depth < 40, let children = attribute(element, kAXChildrenAttribute) as? [AXUIElement] { queue.append(contentsOf: children.map { ($0, depth + 1) }) }
}
print("Inspected \(seen.count) elements; complete: \(index >= queue.count)")
