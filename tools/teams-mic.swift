// Prototype for English-language Teams. No foreground activation or keyboard shortcuts.
// Default is read-only. Only the explicit `mute` command can press a control.
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
func state(_ element: AXUIElement) -> String? {
    guard text(element, kAXRoleAttribute) == "AXButton" else { return nil }
    let title = text(element, kAXTitleAttribute)
    let label = title.isEmpty ? text(element, kAXDescriptionAttribute) : title
    switch label {
    case "Unmute mic": return "muted"
    case "Mute mic": return "unmuted"
    default: return nil
    }
}
func fail(_ message: String, code: Int32 = 1) -> Never {
    print(message)
    exit(code)
}
let command = CommandLine.arguments.dropFirst().first ?? "status"
guard CommandLine.arguments.count <= 2, ["status", "mute"].contains(command) else {
    fail("Usage: teams-mic [status|mute]", code: 64)
}
guard AXIsProcessTrusted() else {
    fail("unknown: Accessibility permission required. Enable the launching app (e.g. Terminal) in System Settings > Privacy & Security > Accessibility.", code: 2)
}
guard let app = NSRunningApplication.runningApplications(withBundleIdentifier: "com.microsoft.teams2").first else {
    fail("unknown: Teams is not running.")
}
let root = AXUIElementCreateApplication(app.processIdentifier)
AXUIElementSetMessagingTimeout(root, 0.2)
let windows = attribute(root, kAXWindowsAttribute) as? [AXUIElement] ?? []
var queue = windows.map { ($0, 0) }
var visited = Set<AXUIElement>()
var index = 0
var controls: [AXUIElement] = []
let deadline = Date().addingTimeInterval(12)
// Read control labels only; never log conversation contents or window titles.
// Once a microphone button is found, do not descend into that button.
while index < queue.count && visited.count < 8000 && Date() < deadline {
    let (element, depth) = queue[index]
    index += 1
    guard visited.insert(element).inserted else { continue }
    if state(element) != nil {
        controls.append(element)
        continue
    }
    if depth < 40, let children = attribute(element, kAXChildrenAttribute) as? [AXUIElement] {
        queue.append(contentsOf: children.map { ($0, depth + 1) })
    }
}
// Status may report observed controls even if the bounded scan is incomplete.
if command == "status" {
    guard !controls.isEmpty else { fail("unknown: No microphone control found within scan limits.") }
    for control in controls { print(state(control) ?? "unknown") }
    if index < queue.count { print("Note: scan limit reached; additional controls may exist.") }
    exit(0)
}
// Mutation requires an unambiguous, completed scan. Never guess or retry a press.
guard index >= queue.count else {
    fail("No action taken: scan limit reached, so microphone control uniqueness could not be verified.")
}
guard controls.count == 1, let control = controls.first else {
    fail("No action taken: expected exactly one microphone control, found \(controls.count).")
}
guard let before = state(control) else { fail("No action taken: control state is unknown.") }
if before == "muted" { print("muted (already muted; no action taken)"); exit(0) }
guard let enabled = attribute(control, kAXEnabledAttribute) as? NSNumber, enabled.boolValue else {
    fail("No action taken: microphone control is disabled or unavailable.")
}
// Recheck immediately before the sole press. Accessibility has no atomic set-mute operation.
guard state(control) == "unmuted" else { fail("No action taken: state changed; rerun status.") }
let result = AXUIElementPerformAction(control, kAXPressAction as CFString)
guard result == .success else { fail("Press failed (AX error \(result.rawValue)); check Teams before retrying.") }
let confirmationDeadline = Date().addingTimeInterval(3)
repeat {
    if state(control) == "muted" { print("muted (confirmed by Teams)"); exit(0) }
    Thread.sleep(forTimeInterval: 0.1)
} while Date() < confirmationDeadline
fail("Press sent once, but mute could not be confirmed. Check Teams manually; no automatic retry was attempted.")
