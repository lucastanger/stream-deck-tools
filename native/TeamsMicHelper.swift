import AppKit
import ApplicationServices
import Foundation

// This executable never activates Teams or generates keystrokes.
func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success else { return nil }
    return value
}
func text(_ element: AXUIElement, _ name: String) -> String {
    attribute(element, name) as? String ?? ""
}

enum Reaction: String, CaseIterable {
    case like, love, applause, laugh, surprised
    var label: String { rawValue.capitalized }
}
// Require the complete, exact meeting picker signature, not chat reaction controls.
func isMeetingPickerLabels(_ labels: [String]) -> Bool {
    let expected = Reaction.allCases.map { $0.label }
    return expected.allSatisfy { label in labels.filter { $0 == label }.count == 1 }
}
func pickerButtons(_ element: AXUIElement) -> [Reaction: AXUIElement]? {
    guard text(element, kAXRoleAttribute) == "AXToolbar",
          let children = attribute(element, kAXChildrenAttribute) as? [AXUIElement] else { return nil }
    let buttons = children.filter { text($0, kAXRoleAttribute) == "AXButton" }.map { ($0, text($0, kAXTitleAttribute)) }
    guard isMeetingPickerLabels(buttons.map { $0.1 }) else { return nil }
    var result: [Reaction: AXUIElement] = [:]
    for reaction in Reaction.allCases {
        guard let button = buttons.first(where: { $0.1 == reaction.label })?.0 else { return nil }
        result[reaction] = button
    }
    return result
}

enum Control: String, CaseIterable {
    case microphone, camera, reaction
    var displayName: String { rawValue.capitalized }
    func classify(_ label: String) -> String? {
        switch (self, label) {
        case (.microphone, "Unmute mic"): return "muted"
        case (.microphone, "Mute mic"): return "unmuted"
        case (.camera, "Turn camera on"): return "off"
        case (.camera, "Turn camera off"): return "on"
        case (.reaction, "React"): return "ready"
        default: return nil
        }
    }
    func state(_ element: AXUIElement) -> String? {
        if self == .reaction && pickerButtons(element) != nil { return "ready" }
        guard text(element, kAXRoleAttribute) == "AXButton" else { return nil }
        let title = text(element, kAXTitleAttribute)
        return classify(title.isEmpty ? text(element, kAXDescriptionAttribute) : title)
    }
    func target(command: String, current: String) -> String? {
        guard self != .reaction else { return nil }
        let inactive = self == .microphone ? "muted" : "off"
        let active = self == .microphone ? "unmuted" : "on"
        guard [inactive, active].contains(current) else { return nil }
        switch (self, command) {
        case (_, "toggle"): return current == inactive ? active : inactive
        case (.microphone, "mute"), (.camera, "off"): return inactive
        case (.microphone, "unmute"), (.camera, "on"): return active
        default: return nil
        }
    }
}

if CommandLine.arguments.contains("--self-test") {
    precondition(Control.microphone.classify("Unmute mic") == "muted")
    precondition(Control.microphone.classify("Mute mic") == "unmuted")
    precondition(Control.microphone.classify("Mute notifications") == nil)
    precondition(Control.microphone.classify("Turn camera on") == nil)
    precondition(Control.camera.classify("Turn camera on") == "off")
    precondition(Control.camera.classify("Turn camera off") == "on")
    precondition(Control.camera.classify("Open video options") == nil)
    precondition(Control.camera.classify("Mute mic") == nil)
    precondition(Control.camera.classify("") == nil)
    precondition(Control.microphone.target(command: "mute", current: "muted") == "muted")
    precondition(Control.microphone.target(command: "toggle", current: "muted") == "unmuted")
    precondition(Control.microphone.target(command: "toggle", current: "unmuted") == "muted")
    precondition(Control.camera.target(command: "toggle", current: "off") == "on")
    precondition(Control.camera.target(command: "toggle", current: "on") == "off")
    precondition(Control.camera.target(command: "off", current: "off") == "off")
    precondition(Control.camera.target(command: "on", current: "on") == "on")
    precondition(Control.camera.target(command: "mute", current: "on") == nil)
    precondition(Control.camera.target(command: "toggle", current: "muted") == nil)
    precondition(Control.microphone.target(command: "unmute", current: "unknown") == nil)
    precondition(Control.reaction.classify("React") == "ready")
    precondition(Control.reaction.classify("More reactions") == nil)
    precondition(Control.reaction.classify("Like") == nil)
    precondition(Control.reaction.target(command: "toggle", current: "ready") == nil)
    precondition(Reaction(rawValue: "like")?.label == "Like")
    precondition(Reaction(rawValue: "unsupported") == nil)
    precondition(isMeetingPickerLabels(["Like", "Love", "Applause", "Laugh", "Surprised"]))
    precondition(!isMeetingPickerLabels(["Like", "Love", "Laugh"]))
    precondition(!isMeetingPickerLabels(["Like", "Like", "Love", "Applause", "Laugh", "Surprised"]))
    print("Native microphone, camera, and reaction self-tests passed")
    exit(0)
}

final class Helper {
    var controls: [Control: AXUIElement] = [:]
    var controlWindows: [Control: AXUIElement] = [:]
    var reasons: [Control: String] = [:]
    var processID: pid_t?
    var cachedWindows: [AXUIElement] = []
    var lastScan = Date.distantPast
    var timer: Timer?

    func emit(_ payload: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys]) else { return }
        FileHandle.standardOutput.write(data)
        FileHandle.standardOutput.write(Data([10]))
    }
    func report(_ kind: Control, state: String = "unknown", reason: String = "", enabled: Bool = false, requestID: String? = nil, error: String? = nil) {
        var payload: [String: Any] = ["event": "state", "control": kind.rawValue, "state": state, "reason": reason, "enabled": enabled]
        if let requestID { payload["requestID"] = requestID }
        if let error { payload["error"] = error }
        emit(payload)
    }
    func invalidate(_ reason: String) {
        controls.removeAll()
        controlWindows.removeAll()
        for kind in Control.allCases { reasons[kind] = reason }
        lastScan = .distantPast
    }
    func scan(_ app: NSRunningApplication, windows: [AXUIElement]) {
        controls.removeAll()
        controlWindows.removeAll()
        processID = app.processIdentifier
        cachedWindows = windows
        lastScan = Date()
        var queue = windows.map { ($0, 0, $0) }
        var seen = Set<AXUIElement>()
        var index = 0
        var found: [Control: [(AXUIElement, AXUIElement)]] = [:]
        var complete = true
        let deadline = Date().addingTimeInterval(3)
        while index < queue.count && seen.count < 8000 && Date() < deadline {
            let (element, depth, window) = queue[index]
            index += 1
            guard seen.insert(element).inserted else { continue }
            if text(element, kAXRoleAttribute) == "AXButton" {
                let title = text(element, kAXTitleAttribute)
                let label = title.isEmpty ? text(element, kAXDescriptionAttribute) : title
                if let kind = Control.allCases.first(where: { $0.classify(label) != nil }) {
                    found[kind, default: []].append((element, window))
                    continue
                }
            } else if pickerButtons(element) != nil {
                found[.reaction, default: []].append((element, window))
                continue
            }
            if let children = attribute(element, kAXChildrenAttribute) as? [AXUIElement], !children.isEmpty {
                if depth < 40 { queue.append(contentsOf: children.map { ($0, depth + 1, window) }) }
                else { complete = false }
            }
        }
        for kind in Control.allCases {
            guard complete && index >= queue.count else { reasons[kind] = "Accessibility scan limit reached"; continue }
            let matches = found[kind] ?? []
            guard matches.count == 1 else {
                reasons[kind] = matches.isEmpty ? "No accessible meeting \(kind.rawValue) control" : "Multiple \(kind.rawValue) controls; refusing to guess"
                continue
            }
            controls[kind] = matches[0].0
            controlWindows[kind] = matches[0].1
            reasons[kind] = ""
        }
    }
    func current(_ kind: Control, force: Bool = false) -> (String, Bool) {
        guard AXIsProcessTrusted() else { invalidate("Accessibility permission required"); return ("unknown", false) }
        guard let app = NSRunningApplication.runningApplications(withBundleIdentifier: "com.microsoft.teams2").first else {
            invalidate("Teams is not running"); return ("unknown", false)
        }
        let root = AXUIElementCreateApplication(app.processIdentifier)
        AXUIElementSetMessagingTimeout(root, 0.15)
        guard let windows = attribute(root, kAXWindowsAttribute) as? [AXUIElement] else {
            invalidate("Teams windows are inaccessible"); return ("unknown", false)
        }
        if force || app.processIdentifier != processID || windows != cachedWindows || Date().timeIntervalSince(lastScan) > 3 {
            scan(app, windows: windows)
        }
        guard let control = controls[kind], let state = kind.state(control) else {
            controls[kind] = nil
            if (reasons[kind] ?? "").isEmpty { reasons[kind] = "\(kind.displayName) control is unavailable" }
            return ("unknown", false)
        }
        let enabled = (attribute(control, kAXEnabledAttribute) as? NSNumber)?.boolValue ?? false
        reasons[kind] = enabled ? "" : "Teams \(kind.rawValue) control is disabled"
        return (state, enabled)
    }
    func poll() {
        for kind in Control.allCases {
            let (state, enabled) = current(kind)
            report(kind, state: state, reason: reasons[kind] ?? "", enabled: enabled)
        }
    }
    func sendReaction(_ reaction: Reaction, requestID: String?) {
        let (before, enabled) = current(.reaction, force: true)
        guard before == "ready", enabled, let source = controls[.reaction], let window = controlWindows[.reaction] else {
            report(.reaction, reason: reasons[.reaction] ?? "Picker unavailable", requestID: requestID, error: "No reaction pressed")
            return
        }
        if pickerButtons(source) == nil {
            // Only the exact, uniquely found meeting React button is opened once.
            guard Control.reaction.state(source) == "ready",
                  AXUIElementPerformAction(source, kAXPressAction as CFString) == .success else {
                report(.reaction, reason: "Cannot open meeting reaction picker", requestID: requestID, error: "No reaction pressed")
                return
            }
        }
        let deadline = Date().addingTimeInterval(2)
        repeat {
            _ = current(.reaction, force: true)
            if let toolbar = controls[.reaction], let toolbarWindow = controlWindows[.reaction],
               CFEqual(window, toolbarWindow), let buttons = pickerButtons(toolbar), let button = buttons[reaction] {
                guard text(button, kAXRoleAttribute) == "AXButton", text(button, kAXTitleAttribute) == reaction.label,
                      (attribute(button, kAXEnabledAttribute) as? NSNumber)?.boolValue == true else {
                    report(.reaction, reason: "Selected reaction is disabled", requestID: requestID, error: "No reaction pressed")
                    return
                }
                // One press only. Accessibility can confirm dispatch, not meeting delivery.
                let result = AXUIElementPerformAction(button, kAXPressAction as CFString)
                controls[.reaction] = nil
                lastScan = .distantPast
                guard result == .success else {
                    report(.reaction, reason: "Check Teams before retrying", requestID: requestID, error: "Reaction press failed: \(result.rawValue); no retry")
                    return
                }
                let (state, available) = current(.reaction, force: true)
                var payload: [String: Any] = ["event": "state", "control": "reaction", "state": state, "enabled": available,
                    "reason": "Reaction control pressed; delivery is not independently confirmed", "result": "pressed"]
                if let requestID { payload["requestID"] = requestID }
                emit(payload)
                return
            }
            Thread.sleep(forTimeInterval: 0.08)
        } while Date() < deadline
        // Leave the picker alone on failure; never press a guessed control or retry.
        report(.reaction, reason: "Meeting picker not uniquely identified in the same window. It may remain open.", requestID: requestID, error: "No reaction pressed")
    }
    func handle(_ message: [String: Any]) {
        let command = message["command"] as? String ?? ""
        let id = message["requestID"] as? String
        // Missing control preserves the microphone-only protocol for old clients.
        guard let kind = Control(rawValue: message["control"] as? String ?? "microphone") else {
            emit(["event": "error", "error": "Unsupported control; no action taken"])
            return
        }
        if command == "permission" {
            // Request only after an explicit setup-panel click, never on startup.
            let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
            _ = AXIsProcessTrustedWithOptions(options)
            poll()
            return
        }
        if kind == .reaction && command == "react" {
            guard let value = message["reaction"] as? String, let reaction = Reaction(rawValue: value) else {
                report(.reaction, requestID: id, error: "Unsupported reaction; no picker opened")
                return
            }
            sendReaction(reaction, requestID: id)
            return
        }
        let (before, enabled) = current(kind, force: true)
        if command == "status" { report(kind, state: before, reason: reasons[kind] ?? "", enabled: enabled, requestID: id); return }
        guard let target = kind.target(command: command, current: before) else {
            report(kind, state: before, reason: reasons[kind] ?? "", enabled: enabled, requestID: id, error: "Control unavailable or unsupported command")
            return
        }
        if before == target { report(kind, state: before, enabled: enabled, requestID: id); return }
        guard enabled, let control = controls[kind], kind.state(control) == before else {
            report(kind, reason: "State changed or control disabled", requestID: id, error: "No action taken")
            return
        }
        // AXPress is a toggle, not an atomic set operation: never retry a press.
        let result = AXUIElementPerformAction(control, kAXPressAction as CFString)
        guard result == .success else {
            controls[kind] = nil
            report(kind, reason: "Check Teams manually", requestID: id, error: "AXPress failed: \(result.rawValue)")
            return
        }
        let deadline = Date().addingTimeInterval(2)
        repeat {
            if kind.state(control) == target {
                report(kind, state: target, enabled: true, requestID: id)
                return
            }
            Thread.sleep(forTimeInterval: 0.08)
        } while Date() < deadline
        controls[kind] = nil
        report(kind, reason: "Press sent once; result not confirmed. Check Teams.", requestID: id, error: "Confirmation timed out; no retry")
    }
    func run() {
        poll()
        timer = Timer.scheduledTimer(withTimeInterval: 0.75, repeats: true) { [weak self] _ in self?.poll() }
        DispatchQueue.global(qos: .utility).async {
            while let line = readLine() {
                guard line.utf8.count < 4096, let data = line.data(using: .utf8),
                      let message = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { continue }
                DispatchQueue.main.async { self.handle(message) }
            }
            DispatchQueue.main.async { exit(0) }
        }
        RunLoop.main.run()
    }
}

let helper = Helper()
if CommandLine.arguments.contains("--status") { helper.poll() }
else if CommandLine.arguments.contains("--daemon") { helper.run() }
else {
    print("Usage: TeamsMicHelper --daemon | --status | --self-test")
    exit(64)
}
