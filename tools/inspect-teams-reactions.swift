// Diagnostic: default read-only. --open-picker opens the exact React button only.
// Never presses a reaction or hand control. Only logs allowlisted control labels.
import AppKit
import ApplicationServices
import Foundation
func attribute(_ e: AXUIElement, _ key: String) -> CFTypeRef? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(e, key as CFString, &value) == .success else { return nil }
    return value
}
func text(_ e: AXUIElement, _ key: String) -> String { attribute(e, key) as? String ?? "" }
func descendants(_ root: AXUIElement) -> [AXUIElement] {
    var queue = [root], seen = Set<AXUIElement>(), result: [AXUIElement] = []
    var index = 0
    let deadline = Date().addingTimeInterval(3)
    while index < queue.count && seen.count < 8000 && Date() < deadline {
        let e = queue[index]; index += 1
        guard seen.insert(e).inserted else { continue }; result.append(e)
        if let children = attribute(e, kAXChildrenAttribute) as? [AXUIElement] { queue += children }
    }
    return result
}
func actions(_ e: AXUIElement) -> [String] {
    var result: CFArray?
    AXUIElementCopyActionNames(e, &result)
    return result as? [String] ?? []
}
guard AXIsProcessTrusted() else { print("Accessibility permission required"); exit(2) }
guard let app = NSRunningApplication.runningApplications(withBundleIdentifier: "com.microsoft.teams2").first else { exit(1) }
let root = AXUIElementCreateApplication(app.processIdentifier)
AXUIElementSetMessagingTimeout(root, 0.15)
func windows() -> [AXUIElement] { attribute(root, kAXWindowsAttribute) as? [AXUIElement] ?? [] }
if CommandLine.arguments.contains("--open-picker") {
    let buttons = windows().flatMap(descendants).filter { text($0, kAXRoleAttribute) == "AXButton" && text($0, kAXTitleAttribute) == "React" }
    guard buttons.count == 1, let react = buttons.first else { print("No unique React button"); exit(1) }
    guard AXUIElementPerformAction(react, kAXPressAction as CFString) == .success else { print("Cannot open picker"); exit(1) }
    Thread.sleep(forTimeInterval: 0.4)
}
let labels = ["React", "Like", "Love", "Applause", "Laugh", "Surprised", "Raise", "Lower", "Raise hand", "Lower hand", "Close", "Close reactions"]
for (index, window) in windows().enumerated() {
    print("Window \(index): role=\(text(window, kAXRoleAttribute)), subrole=\(text(window, kAXSubroleAttribute)), actions=\(actions(window))")
    for e in descendants(window) {
        let title = text(e, kAXTitleAttribute)
        if text(e, kAXRoleAttribute) == "AXButton" && labels.contains(title) {
            print("  button=\(title), enabled=\(String(describing: attribute(e, kAXEnabledAttribute)))")
            var parent = e
            for _ in 0..<5 {
                print("    ancestor role=\(text(parent, kAXRoleAttribute)), actions=\(actions(parent))")
                guard let value = attribute(parent, kAXParentAttribute) else { break }
                parent = value as! AXUIElement
            }
        }
    }
}
