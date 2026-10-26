// Read-only Teams Accessibility probe. Never activates apps or invokes actions.
import AppKit
import ApplicationServices
import Foundation

func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success else { return nil }
    return value
}
func text(_ element: AXUIElement, _ name: String) -> String {
    attribute(element, name) as? String ?? ""
}

guard AXIsProcessTrusted() else {
    print("Accessibility permission is not available to this helper. No permission prompt was requested.")
    exit(2)
}
guard let app = NSRunningApplication.runningApplications(withBundleIdentifier: "com.microsoft.teams2").first else {
    print("Teams is not running.")
    exit(1)
}
let root = AXUIElementCreateApplication(app.processIdentifier)
AXUIElementSetMessagingTimeout(root, 0.3)
let windows = attribute(root, kAXWindowsAttribute) as? [AXUIElement] ?? []
print("Teams windows: \(windows.count); foreground: \(app.isActive)")
var queue = windows.map { ($0, 0) }
var visited = Set<AXUIElement>()
var index = 0
var matches = 0
let deadline = Date().addingTimeInterval(15)
let terms = ["mute", "microphone", "mikro", "stumm"]
while index < queue.count && visited.count < 1500 && Date() < deadline {
    let (element, depth) = queue[index]
    index += 1
    guard visited.insert(element).inserted else { continue }
    let role = text(element, kAXRoleAttribute)
    if ["AXButton", "AXCheckBox", "AXMenuButton", "AXSwitch"].contains(role) {
        let title = text(element, kAXTitleAttribute)
        let description = text(element, kAXDescriptionAttribute)
        let identifier = text(element, kAXIdentifierAttribute)
        let metadata = "\(title) \(description) \(identifier)".lowercased()
        if terms.contains(where: metadata.contains) {
            matches += 1
            print("Control: role=\(role), title=\(title), description=\(description), identifier=\(identifier)")
            if let value = attribute(element, kAXValueAttribute) { print("  value: \(value)") }
            if let enabled = attribute(element, kAXEnabledAttribute) { print("  enabled: \(enabled)") }
            var actions: CFArray?
            if AXUIElementCopyActionNames(element, &actions) == .success, let actions {
                print("  available actions (not invoked): \(actions)")
            }
        }
    }
    if depth < 30, let children = attribute(element, kAXChildrenAttribute) as? [AXUIElement] {
        queue.append(contentsOf: children.prefix(500).map { ($0, depth + 1) })
    }
}
print("Inspected \(visited.count) elements; matching controls: \(matches); traversal complete: \(index >= queue.count)")
